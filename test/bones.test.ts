import { describe, expect, test } from 'bun:test'
import { roll, fnv1a, mulberry32 } from '../src/buddy.ts'
import { RARITIES, RARITY_FLOOR, RARITY_WEIGHTS, SPECIES, EYES, HATS, STAT_NAMES } from '../src/types.ts'

describe('bones: roll()', () => {
  test('is deterministic for the same seed', () => {
    expect(roll('abc')).toEqual(roll('abc'))
  })

  test('differs for a one-character change in the seed', () => {
    expect(roll('abc')).not.toEqual(roll('abd'))
  })

  test('rarity frequencies over 10k seeds land within 2 points of 60/25/10/4/1', () => {
    const counts: Record<string, number> = {}
    const N = 10_000
    for (let i = 0; i < N; i++) {
      const r = roll(`seed-${i}`).bones.rarity
      counts[r] = (counts[r] ?? 0) + 1
    }
    for (const rarity of RARITIES) {
      const pct = ((counts[rarity] ?? 0) / N) * 100
      expect(Math.abs(pct - RARITY_WEIGHTS[rarity])).toBeLessThanOrEqual(2)
    }
  })

  test('every species, eye and hat is reachable', () => {
    const species = new Set<string>()
    const eyes = new Set<string>()
    const hats = new Set<string>()
    for (let i = 0; i < 5000; i++) {
      const b = roll(`reach-${i}`).bones
      species.add(b.species)
      eyes.add(b.eye)
      hats.add(b.hat)
    }
    expect(species.size).toBe(SPECIES.length)
    expect(eyes.size).toBe(EYES.length)
    expect(hats.size).toBe(HATS.length)
  })

  test('commons never wear hats', () => {
    for (let i = 0; i < 3000; i++) {
      const b = roll(`hat-${i}`).bones
      if (b.rarity === 'common') expect(b.hat).toBe('none')
    }
  })

  // SPEC §7 says "exactly one stat <= floor+5". The original algorithm (which §4 says to
  // port exactly) scatters the non-peak, non-dump stats over floor..floor+39, so a scattered
  // stat can also land <= floor+5. What the algorithm does guarantee, and what we test:
  // exactly one peak >= floor+50, the dump stat <= floor+4, and nothing but the dump below floor.
  test('stats: one peak >= floor+50, a dump <= floor+5, only the dump below floor, all in 1..100', () => {
    for (let i = 0; i < 5000; i++) {
      const { rarity, stats } = roll(`stats-${i}`).bones
      const floor = RARITY_FLOOR[rarity]
      const values = STAT_NAMES.map(n => stats[n])
      for (const v of values) {
        expect(v).toBeGreaterThanOrEqual(1)
        expect(v).toBeLessThanOrEqual(100)
        expect(Number.isInteger(v)).toBe(true)
      }
      expect(values.filter(v => v >= floor + 50).length).toBe(1)
      expect(values.filter(v => v <= floor + 5).length).toBeGreaterThanOrEqual(1)
      expect(values.filter(v => v < floor).length).toBeLessThanOrEqual(1)
    }
  })

  test('shiny is rare (about 1%)', () => {
    let shiny = 0
    for (let i = 0; i < 10_000; i++) if (roll(`shiny-${i}`).bones.shiny) shiny++
    expect(shiny).toBeGreaterThan(40)
    expect(shiny).toBeLessThan(200)
  })

  test('inspirationSeed is a non-negative integer below 1e9', () => {
    const s = roll('abc').inspirationSeed
    expect(Number.isInteger(s)).toBe(true)
    expect(s).toBeGreaterThanOrEqual(0)
    expect(s).toBeLessThan(1e9)
  })
})

describe('bones: primitives', () => {
  test('mulberry32 is deterministic and in [0,1)', () => {
    const a = mulberry32(42)
    const b = mulberry32(42)
    for (let i = 0; i < 100; i++) {
      const x = a()
      expect(x).toBe(b())
      expect(x).toBeGreaterThanOrEqual(0)
      expect(x).toBeLessThan(1)
    }
  })

  test('fnv1a matches the published 32-bit test vectors', () => {
    expect(fnv1a('')).toBe(0x811c9dc5)
    expect(fnv1a('a')).toBe(0xe40c292c)
    expect(fnv1a('foobar')).toBe(0xbf9cf968)
  })
})
