import { describe, expect, test } from 'bun:test'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ROOT, makeHome, runCli, stubClaude, writeCompanion, writeState, waitFor, writeTranscript, readState } from './helpers.ts'

function hookInput(h: { home: string }, extra: Record<string, unknown>) {
  const transcript = writeTranscript(h as never, [{ type: 'user', message: { role: 'user', content: 'hello' } }])
  return JSON.stringify({
    session_id: 's-1',
    transcript_path: transcript,
    cwd: h.home,
    ...extra,
  })
}

describe('hooks.json', () => {
  const cfg = JSON.parse(readFileSync(join(ROOT, 'hooks', 'hooks.json'), 'utf8'))
  test('registers PostToolUse(Bash), Stop and UserPromptSubmit', () => {
    expect(cfg.hooks.PostToolUse[0].matcher).toBe('Bash')
    expect(cfg.hooks.Stop).toBeDefined()
    expect(cfg.hooks.UserPromptSubmit).toBeDefined()
  })
  test('every hook command calls the plugin binary and cannot exit non-zero', () => {
    for (const event of ['PostToolUse', 'Stop', 'UserPromptSubmit']) {
      for (const group of cfg.hooks[event]) {
        for (const hk of group.hooks) {
          expect(hk.type).toBe('command')
          expect(hk.command).toContain('${CLAUDE_PLUGIN_ROOT}/bin/buddy')
          expect(hk.command).toContain('|| true')
        }
      }
    }
  })
})

describe('hook stop', () => {
  // SPEC §6.1 / §7: the model call is stubbed to sleep 10s; the hook must still return fast.
  test('wall time under 200ms with the model stubbed to sleep 10s, and the detached child runs', async () => {
    const h = makeHome()
    writeCompanion(h)
    const bin = stubClaude(h, 'late quip', 10)
    const r = runCli(['hook', 'stop'], h, {
      env: { BUDDY_CLAUDE_BIN: bin },
      stdin: hookInput(h, { hook_event_name: 'Stop' }),
    })
    expect(r.code).toBe(0)
    expect(r.stdout).toBe('')
    expect(r.ms).toBeLessThan(200)
    // proves the detached react actually started and reached the model call
    expect(await waitFor(() => existsSync(h.marker), 4000)).toBe(true)
  })

  test('inside a buddy child session the hook does nothing', async () => {
    const h = makeHome()
    writeCompanion(h)
    const bin = stubClaude(h, 'x')
    const r = runCli(['hook', 'stop'], h, {
      env: { BUDDY_CLAUDE_BIN: bin, CLAUDE_BUDDY_CHILD: '1' },
      stdin: hookInput(h, { hook_event_name: 'Stop' }),
    })
    expect(r.code).toBe(0)
    expect(await waitFor(() => existsSync(h.marker), 700)).toBe(false)
  })

  test('garbage or empty stdin still exits 0 quickly', () => {
    const h = makeHome()
    for (const event of ['stop', 'post-tool-use', 'user-prompt-submit']) {
      for (const stdin of ['', '{nope', 'null', '[]']) {
        const r = runCli(['hook', event], h, { stdin })
        expect(r.code).toBe(0)
        expect(r.ms).toBeLessThan(1000)
      }
    }
  })
})

describe('hook post-tool-use', () => {
  test('failing test output spawns react test-fail', async () => {
    const h = makeHome()
    writeCompanion(h)
    const bin = stubClaude(h, 'called it')
    writeState(h, { spokeAt: Date.now() - 5000, reaction: 'old', recent: [] })
    const r = runCli(['hook', 'post-tool-use'], h, {
      env: { BUDDY_CLAUDE_BIN: bin },
      stdin: hookInput(h, {
        hook_event_name: 'PostToolUse',
        tool_name: 'Bash',
        tool_input: { command: 'bun test' },
        tool_response: { stdout: 'Tests: 2 failed, 10 passed', stderr: '', interrupted: false },
      }),
    })
    expect(r.code).toBe(0)
    expect(await waitFor(() => readState(h).reason === 'test-fail', 4000)).toBe(true)
  })

  test('benign output spawns nothing', async () => {
    const h = makeHome()
    writeCompanion(h)
    const bin = stubClaude(h, 'x')
    runCli(['hook', 'post-tool-use'], h, {
      env: { BUDDY_CLAUDE_BIN: bin },
      stdin: hookInput(h, {
        hook_event_name: 'PostToolUse',
        tool_name: 'Bash',
        tool_input: { command: 'ls' },
        tool_response: { stdout: 'README.md\nsrc', stderr: '' },
      }),
    })
    expect(await waitFor(() => existsSync(h.marker), 700)).toBe(false)
  })

  test('string tool_response is scanned too', async () => {
    const h = makeHome()
    writeCompanion(h)
    const bin = stubClaude(h, 'x')
    runCli(['hook', 'post-tool-use'], h, {
      env: { BUDDY_CLAUDE_BIN: bin },
      stdin: hookInput(h, { hook_event_name: 'PostToolUse', tool_name: 'Bash', tool_response: 'fatal: bad object' }),
    })
    expect(await waitFor(() => readState(h).reason === 'error', 4000)).toBe(true)
  })
})

describe('hook user-prompt-submit', () => {
  test('name inside another word (Crumble for Crumb) does not trigger addressed', async () => {
    const h = makeHome()
    writeCompanion(h, 'Crumb')
    const bin = stubClaude(h, 'x')
    const r = runCli(['hook', 'user-prompt-submit'], h, {
      env: { BUDDY_CLAUDE_BIN: bin },
      stdin: hookInput(h, { hook_event_name: 'UserPromptSubmit', prompt: 'make me an apple Crumble recipe' }),
    })
    expect(r.code).toBe(0)
    expect(r.stdout).toBe('')
    expect(await waitFor(() => existsSync(h.marker), 700)).toBe(false)
  })

  test('addressing by name spawns react addressed and injects the intro context', async () => {
    const h = makeHome()
    writeCompanion(h, 'Crumb')
    const bin = stubClaude(h, 'I heard that')
    const r = runCli(['hook', 'user-prompt-submit'], h, {
      env: { BUDDY_CLAUDE_BIN: bin },
      stdin: hookInput(h, { hook_event_name: 'UserPromptSubmit', prompt: 'Crumb, is this a good idea?' }),
    })
    expect(r.code).toBe(0)
    expect(r.ms).toBeLessThan(200)
    const out = JSON.parse(r.stdout)
    expect(out.hookSpecificOutput.hookEventName).toBe('UserPromptSubmit')
    const ctx: string = out.hookSpecificOutput.additionalContext
    expect(ctx).toContain('Crumb')
    expect(ctx.toLowerCase()).toContain('one line')
    expect(await waitFor(() => readState(h).reason === 'addressed', 4000)).toBe(true)
    // the addressed quip sees the prompt even though it is not in the transcript yet
    expect(readFileSync(h.marker + '.stdin', 'utf8')).toContain('is this a good idea')
  })

  test('muted companion: no context, no reaction', async () => {
    const h = makeHome()
    writeCompanion(h, 'Crumb')
    writeState(h, { muted: true, recent: [] })
    const bin = stubClaude(h, 'x')
    const r = runCli(['hook', 'user-prompt-submit'], h, {
      env: { BUDDY_CLAUDE_BIN: bin },
      stdin: hookInput(h, { hook_event_name: 'UserPromptSubmit', prompt: 'Crumb?' }),
    })
    expect(r.stdout).toBe('')
    expect(await waitFor(() => existsSync(h.marker), 700)).toBe(false)
  })
})
