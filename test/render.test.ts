import { describe, expect, test } from 'bun:test'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  displayWidth,
  stripAnsi,
  renderBuddy,
  bubbleState,
  frameAt,
  wrapText,
  roll,
  type Companion,
  type State,
  DIM,
} from '../src/buddy.ts'
import { SPECIES, EYES, HATS } from '../src/types.ts'
import { makeHome, runCli, writeCompanion, writeState } from './helpers.ts'

const QUIP_90 = 'x'.repeat(10) + ' the build is green and I am deeply suspicious of it, as is tradition, ok'
const T0 = 1_750_000_000_000

function companion(over: Partial<Companion> = {}): Companion {
  return {
    ...roll('render-fixture').bones,
    name: 'Crumb',
    personality: 'Suspicious of semicolons.',
    hatchedAt: T0 - 86_400_000,
    ...over,
  }
}

describe('displayWidth', () => {
  test('ascii counts one per char', () => expect(displayWidth('hello')).toBe(5))
  test('stars, sparkles and box drawing are one column each', () => {
    expect(displayWidth('★★★')).toBe(3)
    expect(displayWidth('✦')).toBe(1)
    expect(displayWidth('╭──╮')).toBe(4)
    expect(displayWidth('·×◉°♥')).toBe(5)
  })
  test('emoji and CJK are two columns', () => {
    expect(displayWidth('🦆')).toBe(2)
    expect(displayWidth('猫')).toBe(2)
    expect(displayWidth('a🦆b')).toBe(4)
  })
  test('ANSI escapes are zero width', () => {
    expect(displayWidth('\x1b[1;35m★★\x1b[0m')).toBe(2)
    expect(stripAnsi('\x1b[2mhi\x1b[0m')).toBe('hi')
  })
  test('combining marks and variation selectors are zero width', () => {
    expect(displayWidth('é')).toBe(1)
    expect(displayWidth('☺︎')).toBe(1)
  })
})

describe('wrapText', () => {
  test('wraps on words at the given width', () => {
    const lines = wrapText('the quick brown fox jumps over the lazy dog again and again', 30)
    for (const l of lines) expect(displayWidth(l)).toBeLessThanOrEqual(30)
    expect(lines.join(' ')).toBe('the quick brown fox jumps over the lazy dog again and again')
  })
  test('hard-splits a word longer than the width', () => {
    const lines = wrapText('a'.repeat(70), 30)
    expect(lines.length).toBe(3)
    for (const l of lines) expect(displayWidth(l)).toBeLessThanOrEqual(30)
  })
})

describe('frameAt: idle sequence from the wall clock', () => {
  test('uses floor(now/1000) mod 15', () => {
    const base = 1_000_000 * 15 * 1000 // tick index 0
    expect(frameAt(base, false)).toEqual({ frame: 0, blink: false })
    expect(frameAt(base + 4000, false)).toEqual({ frame: 1, blink: false })
    expect(frameAt(base + 8000, false)).toEqual({ frame: 0, blink: true })
    expect(frameAt(base + 11_000, false)).toEqual({ frame: 2, blink: false })
    expect(frameAt(base + 11_999, false)).toEqual({ frame: 2, blink: false })
    expect(frameAt(base + 15_000, false)).toEqual({ frame: 0, blink: false })
  })
  test('excited (speaking or petted) cycles every frame', () => {
    const base = 1_000_000 * 15 * 1000
    const seen = new Set([0, 1, 2].map(i => frameAt(base + i * 1000, true).frame))
    expect(seen.size).toBe(3)
  })
})

describe('bubble lifetime', () => {
  const state: State = { reaction: 'hello there', spokeAt: T0, recent: [] }
  test('shown bright before 7s, dim from 7s, gone at 10s', () => {
    expect(bubbleState(state, T0 + 1000)).toBe('bright')
    expect(bubbleState(state, T0 + 7500)).toBe('dim')
    expect(bubbleState(state, T0 + 9900)).toBe('dim')
    expect(bubbleState(state, T0 + 10_100)).toBe('hidden')
  })
  test('no reaction means hidden', () => {
    expect(bubbleState({ recent: [] }, T0)).toBe('hidden')
  })

  for (const sprite of ['compact', 'full'] as const) {
    test(`${sprite}: quip visible at +9.9s, hidden at +10.1s, dim at +7.5s`, () => {
      const c = companion({ rarity: 'rare' })
      const s: State = { reaction: 'that is the third retry', spokeAt: T0, recent: [] }
      const at = (dt: number) => renderBuddy({ companion: c, state: s, config: { sprite }, now: T0 + dt, columns: 140 })
      expect(stripAnsi(at(9900))).toContain('third retry')
      expect(stripAnsi(at(10_100))).not.toContain('third retry')
      expect(at(7500)).toContain(DIM)
      // bright phase: the quip is not wrapped in DIM
      const bright = at(2000)
      const idx = bright.indexOf('third')
      expect(idx).toBeGreaterThan(-1)
      expect(bright.slice(Math.max(0, bright.lastIndexOf('\x1b[', idx)), idx).includes(DIM)).toBe(false)
    })
  }
})

describe('renderBuddy layout', () => {
  test('compact wide: one line, face name quip, right-aligned to COLUMNS exactly', () => {
    const c = companion()
    const out = renderBuddy({
      companion: c,
      state: { reaction: 'nice', spokeAt: T0, recent: [] },
      config: { sprite: 'compact' },
      now: T0 + 1000,
      columns: 120,
    })
    expect(out.split('\n').length).toBe(1)
    expect(displayWidth(out)).toBe(120)
    const plain = stripAnsi(out).trim()
    expect(plain).toContain('Crumb')
    expect(plain.endsWith('nice')).toBe(true)
  })

  test('narrow (<100): quip truncated to 40 with an ellipsis and no name', () => {
    const out = renderBuddy({
      companion: companion(),
      state: { reaction: QUIP_90, spokeAt: T0, recent: [] },
      config: { sprite: 'full' },
      now: T0 + 1000,
      columns: 80,
    })
    expect(out.split('\n').length).toBe(1)
    const plain = stripAnsi(out)
    expect(plain).not.toContain('Crumb')
    expect(plain).toContain('…')
    const quipPart = plain.slice(plain.indexOf('"') + 1, plain.lastIndexOf('"'))
    expect(displayWidth(quipPart)).toBeLessThanOrEqual(40)
  })

  test('narrow and silent: face and name', () => {
    const plain = stripAnsi(
      renderBuddy({ companion: companion(), state: { recent: [] }, config: { sprite: 'compact' }, now: T0, columns: 80 }),
    )
    expect(plain).toContain('Crumb')
  })

  test('full: five lines, sprite flush right, bubble beside it when speaking', () => {
    const out = renderBuddy({
      companion: companion(),
      state: { reaction: 'that is the third retry. bold.', spokeAt: T0, recent: [] },
      config: { sprite: 'full' },
      now: T0 + 1000,
      columns: 140,
    })
    const lines = out.split('\n')
    expect(lines.length).toBe(5)
    for (const l of lines) expect(displayWidth(l)).toBe(140)
    const plain = stripAnsi(out)
    expect(plain).toContain('╭')
    expect(plain).toContain('╯')
    expect(plain).toContain('third retry')
  })

  test('full and silent: five lines and the name with rarity stars', () => {
    const out = renderBuddy({ companion: companion(), state: { recent: [] }, config: { sprite: 'full' }, now: T0, columns: 140 })
    expect(out.split('\n').length).toBe(5)
    expect(stripAnsi(out)).toContain('Crumb')
    expect(stripAnsi(out)).toContain('★')
  })

  test('hearts for 2.5s after pettedAt, then gone', () => {
    const c = companion()
    for (const sprite of ['compact', 'full'] as const) {
      const at = (dt: number) =>
        stripAnsi(renderBuddy({ companion: c, state: { pettedAt: T0, recent: [] }, config: { sprite }, now: T0 + dt, columns: 140 }))
      expect(at(500)).toContain('♥')
      expect(at(2400)).toContain('♥')
      expect(at(2600)).not.toContain('♥')
    }
  })

  test('blink replaces the eye with a dash', () => {
    const c = companion({ eye: '◉', species: 'owl', hat: 'none' })
    const base = 1_000_000 * 15 * 1000
    const blink = stripAnsi(renderBuddy({ companion: c, state: { recent: [] }, config: { sprite: 'full' }, now: base + 8000, columns: 140 }))
    const open = stripAnsi(renderBuddy({ companion: c, state: { recent: [] }, config: { sprite: 'full' }, now: base, columns: 140 }))
    expect(open).toContain('◉')
    expect(blink).not.toContain('◉')
  })

  test('colour by rarity; shiny adds bold', () => {
    const r = (rarity: Companion['rarity'], shiny = false) =>
      renderBuddy({ companion: companion({ rarity, shiny }), state: { recent: [] }, config: { sprite: 'compact' }, now: T0, columns: 120 })
    expect(r('common')).toContain('\x1b[2m')
    expect(r('uncommon')).toContain('\x1b[32m')
    expect(r('rare')).toContain('\x1b[34m')
    expect(r('epic')).toContain('\x1b[35m')
    expect(r('legendary')).toContain('\x1b[33m')
    expect(r('epic', true)).toContain('\x1b[1m')
  })

  // SPEC §7: never wider than COLUMNS, over every species, hat and eye, with a 90-char quip.
  test('never emits a line wider than COLUMNS (80 and 140, every species x hat x eye)', () => {
    const states: Array<{ state: State; dt: number }> = [
      { state: { recent: [] }, dt: 0 },
      { state: { reaction: QUIP_90, spokeAt: T0, recent: [] }, dt: 1000 },
      { state: { reaction: QUIP_90, spokeAt: T0, recent: [] }, dt: 8000 },
      { state: { reaction: QUIP_90, spokeAt: T0, pettedAt: T0, recent: [] }, dt: 500 },
      { state: { reaction: '猫猫猫 🦆🦆 wide chars everywhere 猫猫猫猫猫猫猫猫猫猫猫猫猫猫猫猫猫猫猫', spokeAt: T0, recent: [] }, dt: 1000 },
    ]
    let checked = 0
    for (const species of SPECIES)
      for (const hat of HATS)
        for (const eye of EYES)
          for (const columns of [80, 140])
            for (const sprite of ['compact', 'full'] as const)
              for (const { state, dt } of states)
                for (const tick of [0, 4, 8, 11]) {
                  const c = companion({ species, hat, eye, name: 'Fourteenchars!' })
                  const out = renderBuddy({ companion: c, state, config: { sprite }, now: T0 + dt + tick * 1000, columns })
                  for (const line of out.split('\n')) expect(displayWidth(line)).toBeLessThanOrEqual(columns)
                  checked++
                }
    expect(checked).toBe(18 * 8 * 6 * 2 * 2 * 5 * 4)
  })

  test('absurdly narrow terminals still never overflow', () => {
    for (const columns of [10, 20, 30]) {
      const out = renderBuddy({
        companion: companion(),
        state: { reaction: QUIP_90, spokeAt: T0, recent: [] },
        config: { sprite: 'full' },
        now: T0 + 1000,
        columns,
      })
      for (const line of out.split('\n')) expect(displayWidth(line)).toBeLessThanOrEqual(columns)
    }
  })
})

describe('buddy render (CLI)', () => {
  test('no companion.json prints zero bytes and exits 0', () => {
    const h = makeHome()
    const r = runCli(['render'], h)
    expect(r.code).toBe(0)
    expect(r.stdout).toBe('')
  })

  test('muted prints zero bytes', () => {
    const h = makeHome()
    writeCompanion(h)
    writeState(h, { muted: true, recent: [] })
    const r = runCli(['render'], h)
    expect(r.code).toBe(0)
    expect(r.stdout).toBe('')
  })

  test('with a companion prints one line no wider than COLUMNS', () => {
    const h = makeHome()
    writeCompanion(h)
    const r = runCli(['render'], h, { env: { COLUMNS: '120' } })
    expect(r.code).toBe(0)
    const lines = r.stdout.replace(/\n$/, '').split('\n')
    expect(lines.length).toBe(1)
    expect(displayWidth(lines[0]!)).toBeLessThanOrEqual(120)
    expect(stripAnsi(r.stdout)).toContain('Crumb')
  })

  test('missing COLUMNS falls back to 80', () => {
    const h = makeHome()
    writeCompanion(h)
    const r = runCli(['render'], h, { env: { COLUMNS: '' } })
    expect(displayWidth(r.stdout.replace(/\n$/, ''))).toBeLessThanOrEqual(80)
  })

  test('config sprite=full switches to five lines on a wide terminal', () => {
    const h = makeHome()
    writeCompanion(h)
    expect(runCli(['config', 'sprite=full'], h).code).toBe(0)
    const r = runCli(['render'], h, { env: { COLUMNS: '140' } })
    expect(r.stdout.replace(/\n$/, '').split('\n').length).toBe(5)
  })

  test('corrupt state.json still renders the companion (no crash)', () => {
    const h = makeHome()
    writeCompanion(h)
    writeFileSync(join(h.cfg, 'state.json'), '{not json')
    const r = runCli(['render'], h)
    expect(r.code).toBe(0)
    expect(stripAnsi(r.stdout)).toContain('Crumb')
  })

  test('unreadable Claude config prints nothing rather than a different creature', () => {
    const h = makeHome()
    writeCompanion(h)
    writeFileSync(join(h.home, '.claude.json'), '{"oauthAccount": {"accountU')
    const r = runCli(['render'], h)
    expect(r.code).toBe(0)
    expect(r.stdout).toBe('')
  })
})
