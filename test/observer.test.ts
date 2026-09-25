import { describe, expect, test } from 'bun:test'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { detectReason, isAddressed, parseTranscript, shouldSkip, sanitizeQuip, buildQuipPrompt, roll } from '../src/buddy.ts'
import { makeHome, runCli, stubClaude, writeCompanion, writeState, readState, logLines, writeTranscript } from './helpers.ts'

describe('detectReason', () => {
  test('test-fail patterns', () => {
    expect(detectReason('Tests: 3 failed, 12 passed')).toBe('test-fail')
    expect(detectReason('1 failing')).toBe('test-fail')
    expect(detectReason('some tests failed')).toBe('test-fail')
    expect(detectReason('ok\nFAIL src/a.test.ts\n')).toBe('test-fail')
    expect(detectReason('  ✗ adds numbers ')).toBe('test-fail')
    expect(detectReason('  ✘ adds numbers ')).toBe('test-fail')
  })

  test('zero failed is not a failure', () => {
    expect(detectReason('Tests: 0 failed, 12 passed')).toBe(null)
  })

  test('test-fail wins over error when both appear', () => {
    expect(detectReason('error: assertion\n2 failed')).toBe('test-fail')
  })

  test('error patterns', () => {
    expect(detectReason('error: cannot find module')).toBe('error')
    expect(detectReason('Unhandled Exception in thread')).toBe('error')
    expect(detectReason('Traceback (most recent call last):')).toBe('error')
    expect(detectReason("thread 'main' panicked at src/main.rs")).toBe('error')
    expect(detectReason('fatal: not a git repository')).toBe('error')
    expect(detectReason('process finished with exit code 2')).toBe('error')
    expect(detectReason('exit code 0')).toBe(null)
  })

  // SPEC §7: the original did not try to be clever about string literals. Neither do we.
  test('"error:" inside a string literal still counts as error (deliberately naive)', () => {
    expect(detectReason('const msg = "error: this is just a string"')).toBe('error')
  })

  test('large-diff: more than 80 changed lines in a unified diff', () => {
    const diff = (n: number) =>
      ['diff --git a/x b/x', '--- a/x', '+++ b/x', '@@ -1,1 +1,1 @@', ...Array.from({ length: n }, (_, i) => (i % 2 ? `+add ${i}` : `-del ${i}`))].join('\n')
    expect(detectReason(diff(81))).toBe('large-diff')
    expect(detectReason(diff(80))).toBe(null)
  })

  test('plus-prefixed lines without a diff header are not a diff', () => {
    expect(detectReason(Array.from({ length: 200 }, () => '+ bullet').join('\n'))).toBe(null)
  })

  test('benign output and empty input give null', () => {
    expect(detectReason('all good, 14 passed')).toBe(null)
    expect(detectReason('')).toBe(null)
  })
})

describe('isAddressed', () => {
  test('whole-word match, case-insensitive', () => {
    expect(isAddressed('hey Crumb, what do you think?', 'Crumb')).toBe(true)
    expect(isAddressed('crumb?', 'Crumb')).toBe(true)
    expect(isAddressed("is that Crumb's fault", 'Crumb')).toBe(true)
  })
  test('name inside another word does not count', () => {
    expect(isAddressed('Crumble is my favourite dessert', 'Crumb')).toBe(false)
    expect(isAddressed('breadcrumb trail', 'Crumb')).toBe(false)
    expect(isAddressed('Crumb_1 is a variable', 'Crumb')).toBe(false)
  })
  test('regex metacharacters in names are literal', () => {
    expect(isAddressed('hi Mr.Pip', 'Mr.Pip')).toBe(true)
    expect(isAddressed('hi MrxPip', 'Mr.Pip')).toBe(false)
  })
})

describe('shouldSkip (throttle)', () => {
  const now = 1_750_000_000_000
  test('turn within 30s of the last quip is skipped', () => {
    expect(shouldSkip({ spokeAt: now - 10_000, recent: [] }, 'turn', now)).toBe(true)
    expect(shouldSkip({ spokeAt: now - 31_000, recent: [] }, 'turn', now)).toBe(false)
  })
  test('turn within 30s of an in-flight attempt is skipped', () => {
    expect(shouldSkip({ attemptAt: now - 5_000, recent: [] }, 'turn', now)).toBe(true)
  })
  test('other reasons bypass the throttle', () => {
    for (const r of ['test-fail', 'error', 'large-diff', 'addressed', 'hatch', 'pet'] as const)
      expect(shouldSkip({ spokeAt: now - 10_000, recent: [] }, r, now)).toBe(false)
  })
  test('muted skips everything', () => {
    expect(shouldSkip({ muted: true, recent: [] }, 'addressed', now)).toBe(true)
  })
})

describe('sanitizeQuip', () => {
  test('keeps one line, strips quotes, caps at 90', () => {
    expect(sanitizeQuip('"hello there"\nsecond line')).toBe('hello there')
    expect(sanitizeQuip('  \n  hi  ')).toBe('hi')
    const long = sanitizeQuip('word '.repeat(40))!
    expect(long.length).toBeLessThanOrEqual(90)
  })
  test('removes emoji', () => {
    expect(sanitizeQuip('nice 🦆 work')).toBe('nice work')
  })
  test('empty becomes null', () => {
    expect(sanitizeQuip('')).toBe(null)
    expect(sanitizeQuip('   \n ')).toBe(null)
  })
})

function transcriptFixture() {
  const lines: object[] = [
    { type: 'user', isMeta: true, message: { role: 'user', content: 'meta noise' } },
    { type: 'user', message: { role: 'user', content: 'please fix the flaky test' } },
    {
      type: 'assistant',
      message: {
        role: 'assistant',
        content: [
          { type: 'thinking', thinking: 'hmm' },
          { type: 'text', text: 'Looking at it now.' },
          { type: 'tool_use', id: 't1', name: 'Edit', input: { file_path: '/repo/src/a.ts' } },
        ],
      },
    },
    { type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't1', content: 'edited' }] } },
    {
      type: 'assistant',
      message: {
        role: 'assistant',
        content: [
          { type: 'tool_use', id: 't2', name: 'Write', input: { file_path: '/repo/src/b.ts' } },
          { type: 'tool_use', id: 't3', name: 'MultiEdit', input: { file_path: '/repo/src/a.ts' } },
          { type: 'tool_use', id: 't4', name: 'Bash', input: { command: 'bun test' } },
        ],
      },
    },
    {
      type: 'user',
      message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't4', content: [{ type: 'text', text: 'x'.repeat(2000) + 'TAIL' }] }] },
    },
    { type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: 'Z'.repeat(500) }] } },
    'not json at all',
  ]
  return lines
}

describe('parseTranscript', () => {
  const text = transcriptFixture()
    .map(l => (typeof l === 'string' ? l : JSON.stringify(l)))
    .join('\n')
  const t = parseTranscript(text)

  test('turns: user/assistant text only, meta and tool results skipped, 300 char cap', () => {
    expect(t.turns[0]).toBe('user: please fix the flaky test')
    expect(t.turns[1]).toBe('claude: Looking at it now.')
    expect(t.turns.length).toBe(3)
    expect(t.turns[2]!.length).toBeLessThanOrEqual('claude: '.length + 300)
    expect(t.turns.join('\n')).not.toContain('meta noise')
  })

  test('tool output: last 1000 chars of the newest tool_result', () => {
    expect(t.toolOutput.length).toBe(1000)
    expect(t.toolOutput.endsWith('TAIL')).toBe(true)
  })

  test('files edited: Edit/Write/MultiEdit, distinct, most recent first', () => {
    expect(t.filesEdited).toEqual(['/repo/src/a.ts', '/repo/src/b.ts'])
  })

  test('last assistant message, first 300 chars', () => {
    expect(t.lastAssistant).toBe('Z'.repeat(300))
  })

  test('only the last 12 text turns are kept', () => {
    const many = Array.from({ length: 30 }, (_, i) => JSON.stringify({ type: 'user', message: { role: 'user', content: `msg ${i}` } })).join('\n')
    const p = parseTranscript(many)
    expect(p.turns.length).toBe(12)
    expect(p.turns[11]).toBe('user: msg 29')
  })

  test('files edited caps at 8', () => {
    const many = Array.from({ length: 20 }, (_, i) =>
      JSON.stringify({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'tool_use', name: 'Edit', input: { file_path: `/f${i}` } }] } }),
    ).join('\n')
    const p = parseTranscript(many)
    expect(p.filesEdited.length).toBe(8)
    expect(p.filesEdited[0]).toBe('/f19')
  })
})

describe('buildQuipPrompt', () => {
  test('carries the rules, the stats, the reason, recent quips and the context', () => {
    const bones = roll('prompt').bones
    const { system, user } = buildQuipPrompt({
      companion: { ...bones, name: 'Crumb', personality: 'Dry as toast.', hatchedAt: 0 },
      reason: 'test-fail',
      addressed: false,
      recent: ['said this before'],
      transcript: 'user: hi',
      toolOutput: '3 failed',
      context: 'project: demo\nbranch: main',
    })
    const all = system + '\n' + user
    expect(all).toContain('Crumb')
    expect(all).toContain('Dry as toast.')
    expect(all).toContain('90')
    expect(all).toContain('DEBUGGING')
    expect(all).toContain('SNARK')
    expect(all).toContain('test-fail')
    expect(all).toContain('said this before')
    expect(all).toContain('project: demo')
    expect(all).toContain('3 failed')
    expect(all.toLowerCase()).toContain('emoji')
  })
})

describe('buddy react (CLI)', () => {
  function setup() {
    const h = makeHome()
    writeCompanion(h)
    const bin = stubClaude(h, 'the stub has spoken')
    const transcript = writeTranscript(h, transcriptFixture().filter(l => typeof l !== 'string') as object[])
    return { h, bin, transcript }
  }

  test('react turn 10s after a previous quip is a no-op', () => {
    const { h, bin, transcript } = setup()
    const before = { reaction: 'old', spokeAt: Date.now() - 10_000, reason: 'turn', recent: ['old'] }
    writeState(h, before)
    const r = runCli(['react', 'turn', '--transcript', transcript], h, { env: { BUDDY_CLAUDE_BIN: bin } })
    expect(r.code).toBe(0)
    expect(existsSync(h.marker)).toBe(false)
    expect(readState(h).reaction).toBe('old')
  })

  test('react test-fail 10s after a previous quip is not throttled', () => {
    const { h, bin, transcript } = setup()
    writeState(h, { reaction: 'old', spokeAt: Date.now() - 10_000, reason: 'turn', recent: ['old'] })
    const r = runCli(['react', 'test-fail', '--transcript', transcript], h, { env: { BUDDY_CLAUDE_BIN: bin } })
    expect(r.code).toBe(0)
    expect(existsSync(h.marker)).toBe(true)
    const s = readState(h)
    expect(s.reaction).toBe('the stub has spoken')
    expect(s.reason).toBe('test-fail')
    expect(Math.abs(Date.now() - (s.spokeAt as number))).toBeLessThan(10_000)
    expect(s.recent).toEqual(['old', 'the stub has spoken'])
  })

  test('recent keeps at most 3', () => {
    const { h, bin, transcript } = setup()
    writeState(h, { recent: ['a', 'b', 'c'] })
    runCli(['react', 'error', '--transcript', transcript], h, { env: { BUDDY_CLAUDE_BIN: bin } })
    expect(readState(h).recent).toEqual(['b', 'c', 'the stub has spoken'])
  })

  test('the model gets safe-mode flags, sonnet, and a prompt with the context summary', () => {
    const { h, bin, transcript } = setup()
    const proj = join(h.home, 'proj')
    mkdirSync(proj)
    writeFileSync(join(proj, 'package.json'), JSON.stringify({ name: 'demo-proj' }))
    runCli(['react', 'error', '--transcript', transcript, '--cwd', proj], h, { env: { BUDDY_CLAUDE_BIN: bin } })
    const argv = readFileSync(h.marker, 'utf8')
    for (const flag of ['-p', '--safe-mode', '--model', 'sonnet', '--output-format', 'text', '--no-session-persistence'])
      expect(argv.split('\n')).toContain(flag)
    const stdin = readFileSync(h.marker + '.stdin', 'utf8')
    expect(stdin).toContain('demo-proj')
    expect(stdin).toContain('src/a.ts')
    expect(stdin).toContain('please fix the flaky test')
  })

  test('a transcript_path that does not exist logs one line and exits 0', () => {
    const { h, bin } = setup()
    const r = runCli(['react', 'turn', '--transcript', join(h.home, 'nope.jsonl')], h, { env: { BUDDY_CLAUDE_BIN: bin } })
    expect(r.code).toBe(0)
    const lines = logLines(h)
    expect(lines.length).toBe(1)
    const entry = JSON.parse(lines[0]!)
    expect(entry.event).toBe('transcript_missing')
    expect(typeof entry.ts).toBe('string')
    expect(existsSync(h.marker)).toBe(false)
  })

  test('a failing model call logs one line, exits 0, keeps the old reaction', () => {
    const h = makeHome()
    writeCompanion(h)
    const bin = stubClaude(h, 'boom', 0, 1)
    writeState(h, { reaction: 'old', spokeAt: 1, recent: [] })
    const r = runCli(['react', 'error'], h, { env: { BUDDY_CLAUDE_BIN: bin } })
    expect(r.code).toBe(0)
    expect(logLines(h).length).toBe(1)
    expect(JSON.parse(logLines(h)[0]!).event).toBe('model_failed')
    expect(readState(h).reaction).toBe('old')
  })

  test('a hung model call is killed at the timeout and logged', () => {
    const h = makeHome()
    writeCompanion(h)
    const bin = stubClaude(h, 'late', 20)
    const r = runCli(['react', 'error'], h, { env: { BUDDY_CLAUDE_BIN: bin, BUDDY_TIMEOUT_MS: '400' } })
    expect(r.code).toBe(0)
    expect(r.ms).toBeLessThan(5000)
    expect(JSON.parse(logLines(h)[0]!).event).toBe('model_timeout')
  })

  test('missing claude binary is logged, not thrown', () => {
    const h = makeHome()
    writeCompanion(h)
    const r = runCli(['react', 'error'], h, { env: { BUDDY_CLAUDE_BIN: join(h.home, 'does-not-exist') } })
    expect(r.code).toBe(0)
    expect(logLines(h).length).toBe(1)
  })

  test('muted: no model call', () => {
    const { h, bin } = setup()
    writeState(h, { muted: true, recent: [] })
    runCli(['react', 'addressed'], h, { env: { BUDDY_CLAUDE_BIN: bin } })
    expect(existsSync(h.marker)).toBe(false)
  })

  test('no companion: no model call, exit 0', () => {
    const h = makeHome()
    const bin = stubClaude(h, 'x')
    const r = runCli(['react', 'error'], h, { env: { BUDDY_CLAUDE_BIN: bin } })
    expect(r.code).toBe(0)
    expect(existsSync(h.marker)).toBe(false)
  })

  test('unknown reason exits 0 and logs', () => {
    const { h, bin } = setup()
    const r = runCli(['react', 'nonsense'], h, { env: { BUDDY_CLAUDE_BIN: bin } })
    expect(r.code).toBe(0)
    expect(existsSync(h.marker)).toBe(false)
    expect(logLines(h).length).toBe(1)
  })
})
