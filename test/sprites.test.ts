import { describe, expect, test } from 'bun:test'
import { BODIES, HAT_LINES, renderSprite, renderFace, INSPIRATION_WORDS, FALLBACK_NAMES } from '../src/sprites.ts'
import { SPECIES, EYES, HATS } from '../src/types.ts'
import { displayWidth, roll } from '../src/buddy.ts'

const withEye = (row: string, eye = '·') => row.replaceAll('{E}', eye)

describe('sprite data', () => {
  test('every species has exactly 3 frames of 5 rows', () => {
    for (const s of SPECIES) {
      const frames = BODIES[s]
      expect(frames.length).toBe(3)
      for (const f of frames) expect(f.length).toBe(5)
    }
  })

  test('every row is exactly 12 columns once {E} becomes one eye', () => {
    for (const s of SPECIES) {
      for (const f of BODIES[s]) {
        for (const row of f) {
          for (const eye of EYES) expect(displayWidth(withEye(row, eye))).toBe(12)
        }
      }
    }
  })

  test('row 0 is the hat slot: blank in frames 0 and 1', () => {
    for (const s of SPECIES) {
      expect(BODIES[s][0]![0]!.trim()).toBe('')
      expect(BODIES[s][1]![0]!.trim()).toBe('')
    }
  })

  test('every frame shows at least one eye', () => {
    for (const s of SPECIES) for (const f of BODIES[s]) expect(f.join('').includes('{E}')).toBe(true)
  })

  test('frames are not all identical (there is a fidget)', () => {
    for (const s of SPECIES) {
      const [a, b, c] = BODIES[s].map(f => f.join('\n'))
      expect(a === b && b === c).toBe(false)
    }
  })

  test('every hat line is 12 columns and non-blank except none', () => {
    for (const h of HATS) {
      if (h === 'none') {
        expect(HAT_LINES[h]).toBe('')
        continue
      }
      expect(displayWidth(HAT_LINES[h])).toBe(12)
      expect(HAT_LINES[h].trim().length).toBeGreaterThan(0)
    }
  })

  test('art is plain: no tabs, no backticks, no emoji', () => {
    const all = [...SPECIES.flatMap(s => BODIES[s].flat()), ...Object.values(HAT_LINES)].join('')
    expect(all.includes('\t')).toBe(false)
    expect(all.includes('`')).toBe(false)
    expect(/\p{Extended_Pictographic}/u.test(all)).toBe(false)
  })
})

describe('renderSprite / renderFace', () => {
  test('renderSprite always returns 5 rows of 12 columns', () => {
    for (let i = 0; i < 400; i++) {
      const { bones } = roll(`sprite-${i}`)
      for (let frame = 0; frame < 3; frame++) {
        const rows = renderSprite(bones, frame)
        expect(rows.length).toBe(5)
        for (const r of rows) expect(displayWidth(r)).toBe(12)
        expect(rows.join('').includes('{E}')).toBe(false)
      }
    }
  })

  test('a hat fills row 0 on resting frames', () => {
    const bones = { ...roll('x').bones, hat: 'wizard' as const }
    expect(renderSprite(bones, 0)[0]).toBe(HAT_LINES.wizard)
  })

  test('faces are short, include the eye, and are distinct per species', () => {
    const faces = new Set<string>()
    for (const s of SPECIES) {
      const face = renderFace({ ...roll('f').bones, species: s, eye: '◉' })
      expect(face.includes('◉')).toBe(true)
      expect(displayWidth(face)).toBeLessThanOrEqual(9)
      faces.add(face)
    }
    expect(faces.size).toBe(SPECIES.length)
  })
})

describe('word lists', () => {
  test('150 distinct inspiration words', () => {
    expect(INSPIRATION_WORDS.length).toBe(150)
    expect(new Set(INSPIRATION_WORDS).size).toBe(150)
  })

  test('fallback names are the spec six', () => {
    expect([...FALLBACK_NAMES]).toEqual(['Crumpet', 'Soup', 'Pickle', 'Biscuit', 'Moth', 'Gravy'])
  })
})
