// Data tables shared by the roller, the renderer and the prompts.
// The names and weights match the April 2026 companion so the same account
// hatches the same creature. Everything drawn or written lives in sprites.ts.

export const RARITIES = ['common', 'uncommon', 'rare', 'epic', 'legendary'] as const
export type Rarity = (typeof RARITIES)[number]

export const SPECIES = [
  'duck',
  'goose',
  'blob',
  'cat',
  'dragon',
  'octopus',
  'owl',
  'penguin',
  'turtle',
  'snail',
  'ghost',
  'axolotl',
  'capybara',
  'cactus',
  'robot',
  'rabbit',
  'mushroom',
  'chonk',
] as const
export type Species = (typeof SPECIES)[number]

export const EYES = ['·', '✦', '×', '◉', '@', '°'] as const
export type Eye = (typeof EYES)[number]

export const HATS = ['none', 'crown', 'tophat', 'propeller', 'halo', 'wizard', 'beanie', 'tinyduck'] as const
export type Hat = (typeof HATS)[number]

export const STAT_NAMES = ['DEBUGGING', 'PATIENCE', 'CHAOS', 'WISDOM', 'SNARK'] as const
export type StatName = (typeof STAT_NAMES)[number]

export const RARITY_WEIGHTS: Record<Rarity, number> = {
  common: 60,
  uncommon: 25,
  rare: 10,
  epic: 4,
  legendary: 1,
}

/** Base for every stat. Rarer creatures start higher. */
export const RARITY_FLOOR: Record<Rarity, number> = {
  common: 5,
  uncommon: 15,
  rare: 25,
  epic: 35,
  legendary: 50,
}

export const RARITY_STARS: Record<Rarity, string> = {
  common: '★',
  uncommon: '★★',
  rare: '★★★',
  epic: '★★★★',
  legendary: '★★★★★',
}

/** SGR codes: common dim, uncommon green, rare blue, epic magenta, legendary yellow. */
export const RARITY_SGR: Record<Rarity, string> = {
  common: '2',
  uncommon: '32',
  rare: '34',
  epic: '35',
  legendary: '33',
}

/** Derived from the account id on every read. Never stored. */
export type Bones = {
  rarity: Rarity
  species: Species
  eye: Eye
  hat: Hat
  shiny: boolean
  stats: Record<StatName, number>
}

/** Model-generated, stored in companion.json with hatchedAt. */
export type Soul = {
  name: string
  personality: string
}

export type StoredCompanion = Soul & { hatchedAt: number }

export type Companion = Bones & StoredCompanion

export const REASONS = ['turn', 'test-fail', 'error', 'large-diff', 'addressed', 'hatch', 'pet'] as const
export type Reason = (typeof REASONS)[number]

export type State = {
  reaction?: string
  spokeAt?: number
  /** Set when a model call starts, so concurrent turn hooks throttle against it. */
  attemptAt?: number
  reason?: Reason
  pettedAt?: number
  muted?: boolean
  recent: string[]
}

export type Config = {
  sprite: 'compact' | 'full'
}
