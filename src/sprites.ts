// Original art for claude-buddy. Drawn for this repo; not derived from any other sprite set.
//
// Each species has 3 frames of 5 rows, 12 columns wide once `{E}` becomes a single eye glyph.
// Row 0 is the hat slot: blank in frames 0 and 1; frame 2 may borrow it (smoke, a flower, a spark),
// in which case the hat steps aside for that one frame.
// Rows are written without trailing spaces and padded to 12 at load time.

import type { Bones, Eye, Hat, Species } from './types.ts'

const W = 12
const r = String.raw

const RAW: Record<Species, string[][]> = {
  duck: [
    ['', '     __', '  ___({E} >', r`  \ ~  /`, '   ^^ ^^'],
    ['', '     __', '  ___({E} >', r` ~\ ~  /`, '   ^^ ^^'],
    ['', '     __', '  ___({E} =', r`  \  ~ /`, '  ^^  ^^'],
  ],
  goose: [
    ['', '   ({E}>', '    )', ' __/ \\', r`(____/`],
    ['', '   ,({E}>', '    )', ' __/ \\', r`(____/`],
    ['', '   ({E}=', '    )', ' __/ \\', r`(____/~`],
  ],
  blob: [
    ['', '   .---.', '  ( {E} {E} )', '  (  ~  )', "   '---'"],
    ['', '  .-----.', ' (  {E} {E}  )', ' (   ~   )', "  '-----'"],
    ['', '    .-.', '   ({E} {E})', '   ( ~ )', "    '-'"],
  ],
  cat: [
    ['', r`  |\___/|`, '  ( {E} {E} )', '  =( t )=', '   (")(")'],
    ['', r`  |\___/|`, '  ( {E} {E} )', '  =( t )=', '   (")(")~'],
    ['', r`  |\___/|`, '  ( {E} {E} )', '  =( o )=', '   (")(")'],
  ],
  dragon: [
    ['', r`  ^\  /^`, ' ( {E}  {E} )', ' (  ww  )~~', r`  \_/\_/`],
    ['', r`  ^\  /^`, ' ( {E}  {E} )', ' (  ww  )~^', r`  \_/\_/`],
    ['   ~ ~ ~', r`  ^\  /^`, ' ( {E}  {E} )', ' (  WW  )~~', r`  \_/\_/`],
  ],
  octopus: [
    ['', '  .-"""-.', ' ( {E}   {E} )', ' (   o   )', ' /\\/\\/\\/\\/\\'],
    ['', '  .-"""-.', ' ( {E}   {E} )', ' (   o   )', r` \/\/\/\/\/`],
    ['', '  .-"""-.', ' ( {E}   {E} )', ' (   O   )', r` |/|\|/|\|`],
  ],
  owl: [
    ['', '   ,_____,', '  [ {E} v {E} ]', '  [  ~~~  ]', '    "   "'],
    ['', '   ,_____,', '  [ {E} v {E} ]', '  [  ~~~  ]>', '    "   "'],
    ['', '   ,_____,', '  [ {E} v {E} ]', ' <[  ~~~  ]', '    "   "'],
  ],
  penguin: [
    ['', '    ,--,', '   |{E}>{E}|', '  /|    |\\', '   _|  |_'],
    ['', '    ,--,', '   |{E}>{E}|', r`  \|    |/`, '   _|  |_'],
    ['', '    ,--,', '   |{E}>{E}|', '  /|    |\\', r`  _/    \_`],
  ],
  turtle: [
    ['', '   _____', r`  /#####\({E})`, ' |_______|', '  U U  U U'],
    ['', '   _____', r`  /#####\({E})`, ' |_______|', ' U U  U U'],
    ['', '   _____', r`  /#####\ ({E}`, ' |_______|', '  U U  U U'],
  ],
  snail: [
    ['', '        {E} {E}', '  .--.   | |', ' ( @  )__/ /', " '--------'"],
    ['', '       {E} {E}', '  .--.  / /', ' ( @  )__/ /', " '--------'"],
    ['', '        {E} {E}', '  .--.   | |', ' ( @  )__/ /', "~'--------'"],
  ],
  ghost: [
    ['', '   .-"-.', '  / {E} {E} \\', '  |  o  |', r`  |/\/\/|`],
    ['', '   .-"-.', '  / {E} {E} \\', '  |  O  |', r`  |\/\/\|`],
    ['   .-"-.', '  / {E} {E} \\', '  |  o  |', r`  |/\/\/|`, ''],
  ],
  axolotl: [
    ['', r` ~\ .--. /~`, '  ({E}    {E})', '   (  u  )~~', '    "  "'],
    ['', r` ~/ .--. \~`, '  ({E}    {E})', '   (  u  )~~', '    "  "'],
    ['', r` ~\ .--. /~`, '  ({E}    {E})', '   (  u  )_~', '    "  "'],
  ],
  capybara: [
    ['', '  v______v', ' |  {E}  {E}  |', ' |  (__)  |', " '-UU--UU-'"],
    ['', '  v______,', ' |  {E}  {E}  |', ' |  (__)  |', " '-UU--UU-'"],
    ['', '  v______v', ' |  {E}  {E}  |', ' |  (__) ~|', " '-UU-UU--'"],
  ],
  cactus: [
    ['', '    ,---,', r` |\ |{E} {E}| /|`, r`  \_| ~ |_/`, '   _|___|_'],
    ['', '    ,---,', r` |  |{E} {E}|  |`, r` \__| ~ |__/`, '   _|___|_'],
    ['     *', '    ,---,', r` |\ |{E} {E}| /|`, r`  \_| ~ |_/`, '   _|___|_'],
  ],
  robot: [
    ['', '    _T_', '  [ {E}_{E} ]', ' -|[###]|-', '   d   b'],
    ['', '    _T_', '  [ {E}_{E} ]', ' =|[###]|=', '   d   b'],
    ['     *', '    _T_', '  [ {E}_{E} ]', ' -|[#.#]|-', '   d   b'],
  ],
  rabbit: [
    ['', '   /)  (\\', '  ( {E} . {E} )', '   (  x  )', '   (_) (_)'],
    ['', r`   /)  /)`, '  ( {E} . {E} )', '   (  x  )', '   (_) (_)'],
    ['', '   /)  (\\', '  ( {E} . {E} )', '   (  X  )', '  (_)  (_)'],
  ],
  mushroom: [
    ['', '  .-o--O-.', ' (___o__o__)', '    |{E} {E}|', '    |___|'],
    ['', '  .-o--O-.', ' (___o__o__)', '    |{E} {E}|', '   _|___|_'],
    ["  '  .  '", '  .-o--O-.', ' (___o__o__)', '    |{E} {E}|', '    |___|'],
  ],
  chonk: [
    ['', ' .--------.', '(  {E}    {E}  )', '(    --    )', " '-U----U-'"],
    ['', ' .--------.', '(  {E}    {E}  )', '(    ~~    )', " '-U----U-'"],
    ['', ' .--------.', '(  {E}    {E}  )', '(    --    )', " '--U--U--'"],
  ],
}

function pad(row: string): string {
  const width = row.replaceAll('{E}', 'e').length
  return width >= W ? row : row + ' '.repeat(W - width)
}

export const BODIES: Record<Species, string[][]> = Object.fromEntries(
  Object.entries(RAW).map(([species, frames]) => [species, frames.map(f => f.map(pad))]),
) as Record<Species, string[][]>

export const HAT_LINES: Record<Hat, string> = {
  none: '',
  crown: pad(r`   _/\/\/\_`),
  tophat: pad('   _|##|_'),
  propeller: pad('    =-o-='),
  halo: pad('    .~~~.'),
  wizard: pad(r`     _/*\_`),
  beanie: pad('    ,===,'),
  tinyduck: pad('     _o<'),
}

/** Always five rows of twelve columns, so the status line never changes height. */
export function renderSprite(bones: Pick<Bones, 'species' | 'eye' | 'hat'>, frame = 0): string[] {
  const frames = BODIES[bones.species]
  const rows = frames[frame % frames.length]!.map(line => line.replaceAll('{E}', bones.eye))
  if (bones.hat !== 'none' && !rows[0]!.trim()) rows[0] = HAT_LINES[bones.hat]
  return rows
}

/** One-line face for compact mode. */
export function renderFace(bones: Pick<Bones, 'species' | 'eye'>): string {
  const e: Eye = bones.eye
  switch (bones.species) {
    case 'duck':
      return `(${e} >`
    case 'goose':
      return `~(${e}>`
    case 'blob':
      return `(${e}~${e})`
    case 'cat':
      return `(${e} t ${e})`
    case 'dragon':
      return `<${e}ww${e}>`
    case 'octopus':
      return `(${e}o${e})~~`
    case 'owl':
      return `[${e}v${e}]`
    case 'penguin':
      return `|${e}>${e}|`
    case 'turtle':
      return `#(${e})`
    case 'snail':
      return `@~${e}`
    case 'ghost':
      return `{${e}O${e}}`
    case 'axolotl':
      return `~(${e}u${e})~`
    case 'capybara':
      return `n(${e}..${e})n`
    case 'cactus':
      return r`\|${e}${e}|/`
    case 'robot':
      return `[${e}=${e}]`
    case 'rabbit':
      return `/)${e}.${e}(\\`
    case 'mushroom':
      return `o{${e} ${e}}o`
    case 'chonk':
      return `(${e}--${e})`
  }
}

/** Loose anchors for the hatch prompt. Four are picked per creature. */
export const INSPIRATION_WORDS = [
  'amber', 'anvil', 'attic', 'bramble', 'brass', 'breeze', 'bristle', 'bubble', 'cabbage', 'candle',
  'caramel', 'cinder', 'clover', 'cobble', 'comet', 'copper', 'crayon', 'crumble', 'crystal', 'cupboard',
  'dandelion', 'dapple', 'doodle', 'drizzle', 'dumpling', 'dusk', 'ember', 'fennel', 'fiddle', 'flannel',
  'flint', 'fog', 'fossil', 'fudge', 'gadget', 'garnet', 'gherkin', 'ginger', 'glimmer', 'gravel',
  'gumdrop', 'hazel', 'hiccup', 'honey', 'husk', 'inkwell', 'jam', 'jingle', 'juniper', 'kettle',
  'kiln', 'kumquat', 'lantern', 'lemon', 'lichen', 'lint', 'lobster', 'lullaby', 'maple', 'marble',
  'meadow', 'mitten', 'moss', 'muffin', 'murmur', 'mustard', 'nectar', 'nettle', 'noodle', 'nutmeg',
  'oat', 'olive', 'orbit', 'paprika', 'parsnip', 'pebble', 'pepper', 'pewter', 'pinecone', 'pistachio',
  'plum', 'pocket', 'porridge', 'pretzel', 'puddle', 'quartz', 'quill', 'quince', 'radish', 'raisin',
  'ramble', 'relic', 'riddle', 'rust', 'saffron', 'sage', 'sardine', 'scone', 'sesame', 'shingle',
  'sizzle', 'slate', 'sleet', 'smudge', 'sorrel', 'spindle', 'squall', 'static', 'sundial', 'syrup',
  'taffy', 'teacup', 'thimble', 'thistle', 'thunder', 'tinder', 'toffee', 'trinket', 'truffle', 'tumble',
  'turnip', 'twig', 'umber', 'velvet', 'vinegar', 'waffle', 'walnut', 'whisker', 'widget', 'willow',
  'wobble', 'yarn', 'yonder', 'zephyr', 'zest', 'zinc', 'acorn', 'basil', 'button', 'cobweb',
  'doorknob', 'eggshell', 'feather', 'gazebo', 'hammock', 'igloo', 'kazoo', 'lagoon', 'nimbus', 'rhubarb',
] as const

/** Used when the hatch model call fails. */
export const FALLBACK_NAMES = ['Crumpet', 'Soup', 'Pickle', 'Biscuit', 'Moth', 'Gravy'] as const
