<!-- internal -->
# claude-buddy — personal plugin spec

Status: draft, 2026-09-24. Personal tooling, large-scope rules apply, not client rules.
Owner of invariants, trade-off calls, adversarial tests, review: Shawn.
Owner of implementation: an agent, after the tests in §7 exist.

## 0. Goal

Bring back the April 2026 `/buddy` companion for one user, on a current Claude Code
(2.1.28x), as a plugin plus a status-line segment. It must:

- hatch a deterministic creature (species, rarity, eye, hat, stats, name, personality),
- sit at the bottom-right of the TUI,
- say things about what you are doing, unprompted and occasionally, and answer when
  addressed by name,
- cost nothing to have around when it is quiet.

Not a goal: byte-for-byte parity, fullscreen bubble overlay, telemetry.

## 1. What the original did (source of truth)

Read before building. Leaked TS source: `~/projects-archive/claude-code-nirholas/src/buddy/`
(`types.ts`, `companion.ts`, `sprites.ts`, `CompanionSprite.tsx`, `prompt.ts`).
Minified 2.1.94 bundle with the missing `commands/buddy` logic lives in this job's tmp dir
(`~/.claude/jobs/a5940077/tmp/v2.1.94/package/cli.js`; search `buddy_react`, `buddy_companion`).
Copy it somewhere durable before the job is deleted.

Facts that shape this spec:

| Original | Mechanism | Rebuild |
|---|---|---|
| Placement | Ink component, row sibling of PromptInput, `alignItems: flex-end` | Status line row(s), right-padded to `COLUMNS` |
| Idle animation | 500ms tick, IDLE_SEQUENCE of 15 steps (rest / fidget / blink) | `refreshInterval` tick, 1s minimum, same sequence |
| Bubble | 10s show, last 3s dimmed, 30-col wrap, rounded border | Same timings, driven by state-file `spokeAt` |
| Bones | `mulberry32(hash(userId + "friend-2026-401"))` | Identical algorithm, seed = oauth accountUuid |
| Soul | One model call, JSON schema `{name ≤14, personality}`, temp 1, 4 inspiration words | Same prompt, via `claude -p --output-format json` |
| Quips | Server endpoint `buddy_react`; client sent last 12 turns, tool-output tail, reason, last 3 quips, addressed flag; 30s throttle | Local prompt (§5), Stop + PostToolUse hooks, same payload shape and throttle |
| Triggers | `test-fail`, `error`, `large-diff` (>80 changed lines), `addressed`, `turn`, `hatch`, `pet` | Same regexes, same reason codes |
| Main-model courtesy | Attachment telling Claude a companion exists and to stay out of its way when addressed | `UserPromptSubmit` hook `additionalContext` with the same text |
| Mute / pet | `/buddy off`, `/buddy on`, `/buddy pet` (hearts 2.5s) | Skill `/buddy:buddy <pet|off|on|status>` |

Licence note: the sprite art and prompts are Anthropic's. This plugin is personal, never
published. Species table and prompts get re-typed by hand from the source, not copied as
files, so nothing under `projects-archive` is a build input.

## 2. Architecture

```
~/.claude/plugins/local/claude-buddy/
  .claude-plugin/plugin.json
  hooks/hooks.json                 # Stop, PostToolUse, UserPromptSubmit
  skills/buddy/SKILL.md            # /buddy:buddy  (pet | off | on | status | rehatch)
  bin/buddy                        # single executable, subcommands below
~/.config/claude-buddy/
  companion.json                   # soul + hatchedAt (bones regenerated on read)
  state.json                       # reaction, spokeAt, reason, pettedAt, muted, recent[]
  buddy.log                        # failure telemetry, one JSON line per event
~/.config/starship.toml            # [custom.buddy] module rendered by cship
```

Status line stays on `cship`. Plugins cannot ship `statusLine` config and cship is already
there, so the buddy is one Starship custom module:

```toml
[custom.buddy]
command = "buddy render"
when = "test -f ~/.config/claude-buddy/companion.json"
format = "$output"
shell = ["sh"]
```

plus `statusLine.refreshInterval = 1` in the user settings file, set by `buddy install`
after showing the diff.

`bin/buddy` subcommands:

| Subcommand | Called by | Does |
|---|---|---|
| `hatch` | skill | roll bones, call model for soul, write companion.json, fire `hatch` reaction |
| `render` | starship custom module | read state, compute frame from wall clock, print 1 or 5 lines right-padded to `$COLUMNS` |
| `react <reason>` | Stop / PostToolUse hooks | build payload from `transcript_path`, apply throttle, call model, write state |
| `pet` | skill | set `pettedAt`, fire `pet` reaction |
| `mute` / `unmute` / `status` | skill | flip flag / print card |
| `install` | user, once | write starship module, set refreshInterval, register hooks; diff first |

## 3. Rendering

Two modes, chosen by `COLUMNS`, mirroring the original's `MIN_COLS_FOR_FULL_SPRITE = 100`.

**Wide (≥100 cols), default `compact`:** one row, right-aligned: `face  name  quip`.
`buddy config sprite=full` enables the original layout, 5-line sprite with the bubble
beside it, at the cost of 5 rows under the input:

```
                                              ╭──────────────────────────────╮     __
                                              │ that's the third retry. bold. │─ <(· )___
                                              ╰──────────────────────────────╯    (  ._>
                                                                                   `--´
                                                                                  Crumb ★★
```

**Narrow (<100 cols):** one line, quip truncated to 40 chars with `…`, name replaced by face.

Right alignment is padding: `pad = COLUMNS - displayWidth(line)`, width-aware (`✦`, `★`,
box-drawing are 1 col; emoji 2). ANSI colour by rarity, same mapping as `RARITY_COLORS`.

Frame selection has no timer of its own. `render` derives the frame from
`floor(now / 1000) mod 15` into `IDLE_SEQUENCE`. Blink at index 8. Hearts for 2.5s after
`pettedAt`.

Bubble lifetime: shown while `now - spokeAt < 10s`; dim colour in the last 3s; hidden after.
The status line re-renders every second, so this needs no long-lived process.

## 4. Hatch

Bones: port `roll()` exactly (mulberry32, FNV-1a fallback hash, salt `friend-2026-401`,
rarity weights 60/25/10/4/1, stat floors 5/15/25/35/50, one peak one dump stat, hat only
above common, shiny 1%). Seed = `oauthAccount.accountUuid` from the Claude config file,
else `userID`, else `anon`. Bones are never stored.

Soul: the surviving system prompt (2.1.94 bundle, variable `ngY`) plus the user message
`Generate a companion.\nRarity: …\nSpecies: …\nStats: …\nInspiration words: w1, w2, w3, w4`.
Inspiration words: 4 picked by LCG from `inspirationSeed` out of the 150-word list.
Model call: `claude -p --model claude-sonnet-4-6 --output-format json` with schema
`{name: string 1..14, personality: string}`. Hatch is rare and quality matters, so Sonnet.
Fallback names if the call fails: `Crumpet, Soup, Pickle, Biscuit, Moth, Gravy`.

## 5. Quips (the part that says shit)

Hooks:

- `PostToolUse` (matcher `Bash`): scan tool output for the original regexes.
  `test-fail`: `/\b[1-9]\d* (failed|failing)\b|\btests? failed\b|^FAIL(ED)?\b| ✗ | ✘ /im`
  `error`: `/\berror:|\bexception\b|\btraceback\b|\bpanicked at\b|\bfatal:|exit code [1-9]/i`
  `large-diff`: unified diff with >80 changed lines.
  Any hit spawns `buddy react <reason>` detached and returns immediately.
- `Stop`: spawns `buddy react turn` detached. Throttled: skipped if the last quip was under
  30s ago, unless reason is not `turn`.
- `UserPromptSubmit`: if the prompt contains the companion's name as a whole word, spawns
  `buddy react addressed` and returns `additionalContext` with the companion intro text
  (the "you're not Crumb, stay out of the way" paragraph from `prompt.ts`).

Payload (same shape the client sent the dead endpoint): name, personality, species, rarity,
stats, last 12 user/assistant turns truncated to 300 chars each from `transcript_path`,
last 1000 chars of tool output, reason, last 3 quips, addressed flag.

Prompt (ours; the original's never shipped in the client):

```
You are {name}, a {rarity} {species} that lives in a developer's terminal.
Personality: {personality}. Stats: DEBUGGING {d} PATIENCE {p} CHAOS {c} WISDOM {w} SNARK {s}.
You watch them work and occasionally react in ONE short line, max 90 characters.
Reason you're speaking now: {reason}. Recent things you said (don't repeat): {recent}.
If addressed=true, answer them directly, in character. Otherwise comment on the transcript.
No emoji. No advice unless WISDOM > 60. Higher SNARK = drier. Output the line only.
```

Model: `claude -p --model claude-sonnet-4-6`, 12s timeout, small max_tokens. Uses the
subscription, no API key. This is the one place the original's "won't count toward your
usage" promise is not kept; at two calls a minute worst case it is noise, but it is a cost.
If it ever matters, swap to the Messages API with Haiku 4.5 behind a config flag.

Latency: the Stop hook must not block the turn. `react` runs detached; the quip appears on
the next 1-second status-line tick, typically 3 to 5 seconds after the turn ends. Fine for
a pet, and the reason `refreshInterval` is required.

## 6. Invariants (each carries its scar)

1. **Hooks never block and never fail the turn.** Every hook exits 0 within 200ms; model
   calls happen in a detached child. Scar: a synchronous hook adds seconds to every Stop.
2. **Bones are pure.** Same account id gives the same creature on every machine and after
   every edit of companion.json. Scar: the original stored only the soul for exactly this
   reason; stored bones let a user edit their way to a legendary and break on renames.
3. **Render is pure and fast.** `buddy render` reads two files, does no network, returns
   under 30ms, and prints zero bytes when there is no companion or it is muted. Scar: the
   status line runs every second; a slow module lags the whole footer.
4. **Width is measured, not counted.** Padding uses display width. Scar: `★★★` and `✦` are
   1 col each but multibyte; naive length pushes the sprite off the right edge.
5. **Throttle survives crashes.** `spokeAt` lives in state.json, not process memory. Scar:
   the original kept it in a module variable; a hook is a fresh process every time.
6. **Silent failure is a bug.** Every failed model call, parse error, or missing transcript
   writes one JSON line to buddy.log. `buddy status` shows the last failure. Scar: standing
   rule, no silent failures in anything that runs unattended.
7. **Never writes the settings file without showing the diff.** `install` prints, then asks.

## 7. Adversarial tests (write before the agent writes code)

- `roll("abc")` twice equals; `roll("abc")` ≠ `roll("abd")`; over 10k seeds rarity
  frequencies land within 2 points of 60/25/10/4/1.
- Stats: exactly one stat ≥ floor+50, exactly one ≤ floor+5, all in 1..100.
- `render` with `COLUMNS=80` and `COLUMNS=140` never emits a line wider than COLUMNS
  (measured with a width function, over every species, hat, eye, and a 90-char quip).
- `render` with no companion.json prints zero bytes.
- `render` at t = spokeAt+9.9s shows the quip, at +10.1s hides it, at +7.5s uses dim colour.
- `react turn` 10s after a previous quip is a no-op; `react test-fail` 10s after is not.
- `react` with a transcript_path that does not exist logs one line and exits 0.
- Stop hook wall time under 200ms with the model call stubbed to sleep 10s.
- `UserPromptSubmit` with the name inside another word (`Crumble` for `Crumb`) does not
  trigger `addressed`.
- Tool output containing `error:` inside a string literal still counts as `error`. The
  original did not try to be clever; keep it that way and note it.

## 8. Decisions for Shawn before dispatch

- [ ] Language for `bin/buddy`: Rust (matches cship, single binary) or TS on bun (ports the
      leaked code nearly verbatim). Recommendation: TS on bun, one file; port speed wins.
- [ ] Default sprite mode: `compact` (1 row) or `full` (5 rows). Recommendation: compact.
- [ ] Quip model: subscription via `claude -p` (recommended) or API key + Haiku 4.5.
- [ ] Should `addressed` also shorten Claude's own reply? The original only asked politely
      via the intro text. Recommendation: same, nothing enforced.

## 9. Out of scope, deliberately

Fullscreen floating bubble, footer keyboard navigation to the sprite, telemetry, species
renames, the April-only date gate, publishing the plugin anywhere.

## 10. Decisions taken 2026-09-24 (sane defaults, Shawn away)

- Language: TypeScript on bun, `src/buddy.ts` compiled with `bun build --compile` to `bin/buddy`, plus a `bun run` dev path.
- Default sprite mode: `compact` (one row). `full` available via config.
- Quip and hatch model: `claude -p --model sonnet` (alias, tracks latest Sonnet). Subscription, no API key.
- Placement: cship `lines` gains a second entry `$custom.buddy`; the module right-pads to `$COLUMNS`.
- **Context summary for quips (Shawn's ask):** every `react` call builds a short "what's going on" block in
  addition to the transcript tail: project name (package.json / Cargo.toml / pyproject / dir name), git branch,
  last 3 commits one-line, files touched this session (Edit/Write/MultiEdit tool_use inputs in the transcript,
  last 8 distinct paths), and the last assistant message's first 300 chars. This is what the original's
  `hatch` context did (package.json + git log) extended to every quip.
- **Art and prompts are original.** Same 18 species, same rarity tiers, hats, eyes, stat names, but every
  sprite is drawn fresh for this repo and every prompt is written fresh. Nothing from Anthropic's leaked
  source is copied, so the repo can be public. The leaked source is reference for behaviour only.
- GitHub: private repo `shawnpetros/claude-buddy` created by the job, pushed on branch `initial`; Shawn
  flips visibility and merges after reading.
- Marketing: README with banner (OpenAI image API via Codex-era key), a rendered terminal screenshot,
  a 20-second asciinema-style GIF if cheap, badges, install one-liner.
