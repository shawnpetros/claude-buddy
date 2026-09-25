import { describe, expect, test } from 'bun:test'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { stripAnsi } from '../src/buddy.ts'
import { makeHome, runCli, stubClaude, writeCompanion, readState, logLines, callLines } from './helpers.ts'

// The measured minimal flag set: about 740 context tokens per call on the operator's machine,
// against 307k for a plain `claude -p`. Any flag dropped from here silently multiplies cost.
const MINIMAL_FLAGS = [
  '-p',
  '--model',
  'sonnet',
  '--output-format',
  'json',
  '--no-session-persistence',
  '--safe-mode',
  '--tools',
  '--strict-mcp-config',
  '--disable-slash-commands',
  '--setting-sources',
  '--system-prompt',
]

const JSON_OK = JSON.stringify({
  type: 'result',
  subtype: 'success',
  is_error: false,
  result: 'json quip here',
  total_cost_usd: 0.0012,
  usage: { input_tokens: 740, output_tokens: 18, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
})

const AUTH_FAIL = JSON.stringify({
  type: 'result',
  is_error: true,
  result: 'Failed to authenticate. API Error: 401 {"type":"error"}',
  total_cost_usd: 0,
})

function argvOf(marker: string): string[] {
  return readFileSync(marker, 'utf8').replace(/\n$/, '').split('\n')
}

function valueAfter(argv: string[], flag: string): string | undefined {
  const i = argv.indexOf(flag)
  return i >= 0 ? argv[i + 1] : undefined
}

function setup(output = JSON_OK, exitCode = 0) {
  const h = makeHome()
  writeCompanion(h)
  const bin = stubClaude(h, output, 0, exitCode)
  return { h, bin }
}

describe('model call flags', () => {
  test('react uses the measured minimal flag set with empty tools and setting sources', () => {
    const { h, bin } = setup()
    runCli(['react', 'error'], h, { env: { BUDDY_CLAUDE_BIN: bin } })
    const argv = argvOf(h.marker)
    for (const f of MINIMAL_FLAGS) expect(argv).toContain(f)
    expect(valueAfter(argv, '--tools')).toBe('')
    expect(valueAfter(argv, '--setting-sources')).toBe('')
    expect(valueAfter(argv, '--output-format')).toBe('json')
    expect(argv).not.toContain('--bare')
  })

  test('the whole buddy prompt is the system prompt; stdin carries only the payload', () => {
    const { h, bin } = setup()
    runCli(['react', 'error'], h, { env: { BUDDY_CLAUDE_BIN: bin } })
    // The stub writes one argument per line, so a multi-line system prompt spans several lines.
    const argvText = readFileSync(h.marker, 'utf8')
    expect(argvText).toContain('You are Crumb')
    expect(argvText).toContain('Hard limit 90')
    const stdin = readFileSync(h.marker + '.stdin', 'utf8')
    expect(stdin).toContain('reason: error')
    expect(stdin).not.toContain('Hard limit')
  })

  test('hatch uses the same minimal flags plus a json schema', () => {
    const h = makeHome()
    const bin = stubClaude(h, JSON.stringify({ structured_output: { name: 'Pith', personality: 'x' }, total_cost_usd: 0.01 }))
    runCli(['hatch'], h, { env: { BUDDY_CLAUDE_BIN: bin, CLAUDE_BUDDY_NO_SPAWN: '1' } })
    const argv = argvOf(h.marker)
    for (const f of MINIMAL_FLAGS) expect(argv).toContain(f)
    expect(argv).toContain('--json-schema')
  })
})

describe('json result parsing and cost telemetry', () => {
  test('.result becomes the quip', () => {
    const { h, bin } = setup()
    runCli(['react', 'error'], h, { env: { BUDDY_CLAUDE_BIN: bin } })
    expect(readState(h).reaction).toBe('json quip here')
  })

  test('every call logs usage and total_cost_usd, and a success is not a failure', () => {
    const { h, bin } = setup()
    runCli(['react', 'error'], h, { env: { BUDDY_CLAUDE_BIN: bin } })
    const calls = callLines(h)
    expect(calls.length).toBe(1)
    expect(calls[0]!.total_cost_usd).toBe(0.0012)
    expect((calls[0]!.usage as Record<string, number>).input_tokens).toBe(740)
    expect(calls[0]!.purpose).toBe('react:error')
    expect(logLines(h)).toEqual([])
  })

  test('status shows the last call cost and running total, and not a success as a failure', () => {
    const { h, bin } = setup()
    runCli(['react', 'error'], h, { env: { BUDDY_CLAUDE_BIN: bin } })
    runCli(['react', 'test-fail'], h, { env: { BUDDY_CLAUDE_BIN: bin } })
    const out = stripAnsi(runCli(['status'], h).stdout)
    expect(out).toContain('$0.0012')
    expect(out).toContain('$0.0024')
    expect(out).toContain('740')
    expect(out).not.toContain('last failure')
  })

  test('is_error in the JSON is a failure even with exit 0', () => {
    const { h, bin } = setup(JSON.stringify({ is_error: true, result: 'overloaded' }))
    writeFileSync(join(h.cfg, 'state.json'), JSON.stringify({ reaction: 'old', recent: [] }))
    runCli(['react', 'error'], h, { env: { BUDDY_CLAUDE_BIN: bin } })
    expect(readState(h).reaction).toBe('old')
    expect(JSON.parse(logLines(h)[0]!).event).toBe('model_failed')
  })
})

describe('auth failures', () => {
  test('"Failed to authenticate" is logged as auth_failed and status says to log in', () => {
    const { h, bin } = setup(AUTH_FAIL, 1)
    runCli(['react', 'error'], h, { env: { BUDDY_CLAUDE_BIN: bin } })
    expect(JSON.parse(logLines(h)[0]!).event).toBe('auth_failed')
    const out = stripAnsi(runCli(['status'], h).stdout)
    expect(out).toContain('run: claude login')
  })

  test('with config_dir set, the login hint names that directory', () => {
    const { h, bin } = setup(AUTH_FAIL, 1)
    runCli(['config', 'config_dir=/tmp/lean-claude'], h)
    runCli(['react', 'error'], h, { env: { BUDDY_CLAUDE_BIN: bin } })
    const out = stripAnsi(runCli(['status'], h).stdout)
    expect(out).toContain('run: CLAUDE_CONFIG_DIR=/tmp/lean-claude claude login')
  })

  test('a later successful call clears the login hint', () => {
    const h = makeHome()
    writeCompanion(h)
    runCli(['react', 'error'], h, { env: { BUDDY_CLAUDE_BIN: stubClaude(h, AUTH_FAIL, 0, 1) } })
    runCli(['react', 'error'], h, { env: { BUDDY_CLAUDE_BIN: stubClaude(h, JSON_OK) } })
    expect(stripAnsi(runCli(['status'], h).stdout)).not.toContain('claude login')
  })
})

describe('config config_dir', () => {
  test('default: the child inherits no override and status says default', () => {
    const { h, bin } = setup()
    runCli(['react', 'error'], h, { env: { BUDDY_CLAUDE_BIN: bin } })
    expect(readFileSync(h.marker + '.env', 'utf8').trim()).toBe('|')
    expect(stripAnsi(runCli(['status'], h).stdout)).toContain('config dir: default')
  })

  test('set: every child runs with CLAUDE_CONFIG_DIR and status shows the path', () => {
    const { h, bin } = setup()
    expect(runCli(['config', 'config_dir=/tmp/lean-claude'], h).code).toBe(0)
    runCli(['react', 'error'], h, { env: { BUDDY_CLAUDE_BIN: bin } })
    expect(readFileSync(h.marker + '.env', 'utf8').trim()).toBe('|/tmp/lean-claude')
    expect(stripAnsi(runCli(['status'], h).stdout)).toContain('config dir: /tmp/lean-claude')
  })

  test('~ expands to HOME', () => {
    const { h } = setup()
    runCli(['config', 'config_dir=~/.claude-lean'], h)
    expect(JSON.parse(readFileSync(join(h.cfg, 'config.json'), 'utf8')).config_dir).toBe(join(h.home, '.claude-lean'))
  })

  test('empty value resets to default', () => {
    const { h } = setup()
    runCli(['config', 'config_dir=/tmp/x'], h)
    expect(runCli(['config', 'config_dir='], h).code).toBe(0)
    expect(stripAnsi(runCli(['status'], h).stdout)).toContain('config dir: default')
  })

  test('the setting does not change which account seeds the bones', () => {
    const { h } = setup()
    const before = stripAnsi(runCli(['status'], h).stdout).split('\n')[0]
    runCli(['config', 'config_dir=/tmp/elsewhere'], h)
    expect(stripAnsi(runCli(['status'], h).stdout).split('\n')[0]).toBe(before)
  })
})

describe('config auth=apikey', () => {
  test('switches to --bare, drops --safe-mode, and passes the key from the environment', () => {
    const { h, bin } = setup()
    expect(runCli(['config', 'auth=apikey'], h).code).toBe(0)
    runCli(['react', 'error'], h, { env: { BUDDY_CLAUDE_BIN: bin, ANTHROPIC_API_KEY: 'sk-test-123' } })
    const argv = argvOf(h.marker)
    expect(argv).toContain('--bare')
    expect(argv).not.toContain('--safe-mode')
    expect(argv).toContain('--no-session-persistence')
    expect(readFileSync(h.marker + '.env', 'utf8').trim()).toBe('sk-test-123|')
  })

  test('BUDDY_ANTHROPIC_API_KEY wins, so the main session can stay on the subscription', () => {
    const { h, bin } = setup()
    runCli(['config', 'auth=apikey'], h)
    runCli(['react', 'error'], h, { env: { BUDDY_CLAUDE_BIN: bin, BUDDY_ANTHROPIC_API_KEY: 'sk-buddy-only' } })
    expect(readFileSync(h.marker + '.env', 'utf8').trim()).toBe('sk-buddy-only|')
  })

  test('no key in the environment: no call, one log line', () => {
    const { h, bin } = setup()
    runCli(['config', 'auth=apikey'], h)
    const r = runCli(['react', 'error'], h, { env: { BUDDY_CLAUDE_BIN: bin } })
    expect(r.code).toBe(0)
    expect(existsSync(h.marker)).toBe(false)
    expect(JSON.parse(logLines(h)[0]!).event).toBe('apikey_missing')
  })

  test('subscription mode never passes an API key to the child', () => {
    const { h, bin } = setup()
    runCli(['react', 'error'], h, { env: { BUDDY_CLAUDE_BIN: bin, BUDDY_ANTHROPIC_API_KEY: 'sk-should-not-leak' } })
    expect(readFileSync(h.marker + '.env', 'utf8').trim()).toBe('|')
  })

  test('status shows the auth mode; bad values are rejected', () => {
    const { h } = setup()
    expect(stripAnsi(runCli(['status'], h).stdout)).toContain('auth: subscription')
    runCli(['config', 'auth=apikey'], h)
    expect(stripAnsi(runCli(['status'], h).stdout)).toContain('auth: apikey')
    expect(runCli(['config', 'auth=magic'], h).code).not.toBe(0)
    expect(runCli(['config', 'auth=subscription'], h).code).toBe(0)
  })
})

describe('status and config help wording', () => {
  test('status prints "last quip: N tokens, $X" from the newest react call', () => {
    const { h, bin } = setup()
    runCli(['react', 'error'], h, { env: { BUDDY_CLAUDE_BIN: bin } })
    expect(stripAnsi(runCli(['status'], h).stdout)).toContain('last quip: 740 tokens, $0.0012')
  })

  test('config --help lists sprite, auth and config_dir and exits 0', () => {
    const h = makeHome()
    const r = runCli(['config', '--help'], h)
    expect(r.code).toBe(0)
    for (const s of ['sprite=compact|full', 'auth=subscription|apikey', 'config_dir=<path>', '--bare', 'CLAUDE_CONFIG_DIR'])
      expect(r.stdout).toContain(s)
  })
})
