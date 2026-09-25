import { describe, expect, test } from 'bun:test'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { stripAnsi } from '../src/buddy.ts'
import { FALLBACK_NAMES } from '../src/sprites.ts'
import { makeHome, runCli, stubClaude, writeCompanion, writeState, readState, logLines, waitFor } from './helpers.ts'

const SOUL_JSON = JSON.stringify({
  type: 'result',
  result: '{"name":"Pith","personality":"Counts brackets out loud."}',
  structured_output: { name: 'Pith', personality: 'Counts brackets out loud.' },
})

describe('buddy hatch', () => {
  test('stores only soul + hatchedAt, using structured_output', () => {
    const h = makeHome()
    const bin = stubClaude(h, SOUL_JSON)
    const r = runCli(['hatch'], h, { env: { BUDDY_CLAUDE_BIN: bin } })
    expect(r.code).toBe(0)
    const stored = JSON.parse(readFileSync(join(h.cfg, 'companion.json'), 'utf8'))
    expect(Object.keys(stored).sort()).toEqual(['hatchedAt', 'name', 'personality'])
    expect(stored.name).toBe('Pith')
    expect(stripAnsi(r.stdout)).toContain('Pith')
  })

  test('asks sonnet with a json schema and the inspiration words', async () => {
    const h = makeHome()
    const bin = stubClaude(h, SOUL_JSON)
    runCli(['hatch'], h, { env: { BUDDY_CLAUDE_BIN: bin, CLAUDE_BUDDY_NO_SPAWN: '1' } })
    const argv = readFileSync(h.marker, 'utf8').split('\n')
    expect(argv).toContain('--json-schema')
    expect(argv).toContain('sonnet')
    expect(argv).toContain('--safe-mode')
    expect(readFileSync(h.marker + '.stdin', 'utf8')).toContain('Inspiration words:')
  })

  test('falls back to parsing result text when structured_output is absent', () => {
    const h = makeHome()
    const bin = stubClaude(h, JSON.stringify({ type: 'result', result: 'Sure! {"name":"Zed","personality":"Hums."}' }))
    runCli(['hatch'], h, { env: { BUDDY_CLAUDE_BIN: bin, CLAUDE_BUDDY_NO_SPAWN: '1' } })
    expect(JSON.parse(readFileSync(join(h.cfg, 'companion.json'), 'utf8')).name).toBe('Zed')
  })

  test('a failed model call uses a fallback name and logs it', () => {
    const h = makeHome()
    const bin = stubClaude(h, 'nope', 0, 1)
    const r = runCli(['hatch'], h, { env: { BUDDY_CLAUDE_BIN: bin, CLAUDE_BUDDY_NO_SPAWN: '1' } })
    expect(r.code).toBe(0)
    const stored = JSON.parse(readFileSync(join(h.cfg, 'companion.json'), 'utf8'))
    expect(FALLBACK_NAMES as readonly string[]).toContain(stored.name)
    expect(logLines(h).length).toBeGreaterThanOrEqual(1)
  })

  test('names over 14 chars are rejected in favour of a fallback', () => {
    const h = makeHome()
    const bin = stubClaude(h, JSON.stringify({ structured_output: { name: 'Bartholomewington', personality: 'x' } }))
    runCli(['hatch'], h, { env: { BUDDY_CLAUDE_BIN: bin, CLAUDE_BUDDY_NO_SPAWN: '1' } })
    const stored = JSON.parse(readFileSync(join(h.cfg, 'companion.json'), 'utf8'))
    expect(FALLBACK_NAMES as readonly string[]).toContain(stored.name)
  })

  test('hatch with an existing companion does not overwrite it', () => {
    const h = makeHome()
    writeCompanion(h, 'Crumb')
    const bin = stubClaude(h, SOUL_JSON)
    runCli(['hatch'], h, { env: { BUDDY_CLAUDE_BIN: bin, CLAUDE_BUDDY_NO_SPAWN: '1' } })
    expect(JSON.parse(readFileSync(join(h.cfg, 'companion.json'), 'utf8')).name).toBe('Crumb')
  })

  test('rehatch replaces the soul', () => {
    const h = makeHome()
    writeCompanion(h, 'Crumb')
    const bin = stubClaude(h, SOUL_JSON)
    runCli(['rehatch'], h, { env: { BUDDY_CLAUDE_BIN: bin, CLAUDE_BUDDY_NO_SPAWN: '1' } })
    expect(JSON.parse(readFileSync(join(h.cfg, 'companion.json'), 'utf8')).name).toBe('Pith')
  })

  test('hatch fires a detached hatch reaction', async () => {
    const h = makeHome()
    const bin = stubClaude(h, SOUL_JSON)
    runCli(['hatch'], h, { env: { BUDDY_CLAUDE_BIN: bin } })
    expect(await waitFor(() => readState(h).reason === 'hatch', 5000)).toBe(true)
  })

  test('bones come from the account id: same id, same species on a fresh machine', () => {
    const a = makeHome('same-account')
    const b = makeHome('same-account')
    writeCompanion(a)
    writeCompanion(b)
    const sa = stripAnsi(runCli(['status'], a).stdout)
    const sb = stripAnsi(runCli(['status'], b).stdout)
    expect(sa).toBe(sb)
  })

  test('editing companion.json cannot change the bones', () => {
    const h = makeHome()
    writeFileSync(
      join(h.cfg, 'companion.json'),
      JSON.stringify({ name: 'Crumb', personality: 'x', hatchedAt: 1, rarity: 'legendary', species: 'dragon', shiny: true }),
    )
    const edited = stripAnsi(runCli(['status'], h).stdout)
    writeCompanion(h, 'Crumb', 'x')
    const clean = stripAnsi(runCli(['status'], h).stdout)
    const firstLine = (s: string) => s.split('\n').find(l => l.includes('Crumb'))
    expect(firstLine(edited)).toBe(firstLine(clean))
  })
})

describe('pet / mute / unmute / status / config', () => {
  test('pet sets pettedAt and fires a pet reaction', async () => {
    const h = makeHome()
    writeCompanion(h)
    const bin = stubClaude(h, 'purr')
    const r = runCli(['pet'], h, { env: { BUDDY_CLAUDE_BIN: bin } })
    expect(r.code).toBe(0)
    expect(Math.abs(Date.now() - (readState(h).pettedAt as number))).toBeLessThan(5000)
    expect(stripAnsi(r.stdout)).toContain('♥')
    expect(await waitFor(() => readState(h).reason === 'pet', 5000)).toBe(true)
  })

  test('mute then unmute flips the flag and render follows', () => {
    const h = makeHome()
    writeCompanion(h)
    runCli(['mute'], h)
    expect(readState(h).muted).toBe(true)
    expect(runCli(['render'], h).stdout).toBe('')
    runCli(['unmute'], h)
    expect(readState(h).muted).toBe(false)
    expect(runCli(['render'], h).stdout.length).toBeGreaterThan(0)
  })

  test('status shows the card and the last failure', () => {
    const h = makeHome()
    writeCompanion(h, 'Crumb', 'Suspicious of semicolons.')
    writeFileSync(join(h.cfg, 'buddy.log'), JSON.stringify({ ts: '2026-09-24T00:00:00Z', event: 'model_failed', error: 'kaboom' }) + '\n')
    const out = stripAnsi(runCli(['status'], h).stdout)
    expect(out).toContain('Crumb')
    expect(out).toContain('Suspicious of semicolons.')
    for (const s of ['DEBUGGING', 'PATIENCE', 'CHAOS', 'WISDOM', 'SNARK']) expect(out).toContain(s)
    expect(out).toContain('kaboom')
  })

  test('status without a companion says so and exits 0', () => {
    const h = makeHome()
    const r = runCli(['status'], h)
    expect(r.code).toBe(0)
    expect(stripAnsi(r.stdout).toLowerCase()).toContain('no companion')
  })

  test('config validates keys and values', () => {
    const h = makeHome()
    expect(runCli(['config', 'sprite=full'], h).code).toBe(0)
    expect(JSON.parse(readFileSync(join(h.cfg, 'config.json'), 'utf8')).sprite).toBe('full')
    expect(runCli(['config', 'sprite=huge'], h).code).not.toBe(0)
    expect(runCli(['config', 'colour=red'], h).code).not.toBe(0)
    expect(runCli(['config', 'nonsense'], h).code).not.toBe(0)
  })

  test('unknown subcommand prints usage and exits non-zero', () => {
    const h = makeHome()
    const r = runCli(['frobnicate'], h)
    expect(r.code).not.toBe(0)
    expect(r.stdout + r.stderr).toContain('usage')
  })

  test('state writes are atomic: no temp files left behind', () => {
    const h = makeHome()
    writeCompanion(h)
    runCli(['mute'], h)
    runCli(['unmute'], h)
    const { readdirSync } = require('node:fs')
    expect((readdirSync(h.cfg) as string[]).filter((f: string) => f.includes('.tmp'))).toEqual([])
    expect(existsSync(join(h.cfg, 'state.json'))).toBe(true)
  })

  test('state survives an unrelated corrupt write (react does not throw)', () => {
    const h = makeHome()
    writeCompanion(h)
    writeFileSync(join(h.cfg, 'state.json'), 'garbage')
    const bin = stubClaude(h, 'fresh start')
    const r = runCli(['react', 'error'], h, { env: { BUDDY_CLAUDE_BIN: bin } })
    expect(r.code).toBe(0)
    expect(readState(h).reaction).toBe('fresh start')
  })

  test('mute works without a prior state file', () => {
    const h = makeHome()
    writeCompanion(h)
    writeState(h, { recent: [] })
    expect(runCli(['mute'], h).code).toBe(0)
  })
})
