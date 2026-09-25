import { chmodSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

export const ROOT = resolve(import.meta.dir, '..')
export const ENTRY = join(ROOT, 'src', 'buddy.ts')

export type Home = {
  home: string
  cfg: string
  marker: string
}

/** A throwaway $HOME with a Claude config holding a fixed account id. */
export function makeHome(accountUuid = 'test-account-0001'): Home {
  const home = mkdtempSync(join(tmpdir(), 'buddy-test-'))
  const cfg = join(home, '.config', 'claude-buddy')
  mkdirSync(cfg, { recursive: true })
  writeFileSync(join(home, '.claude.json'), JSON.stringify({ oauthAccount: { accountUuid } }))
  return { home, cfg, marker: join(home, 'model-called') }
}

export function writeCompanion(h: Home, name = 'Crumb', personality = 'Suspicious of semicolons.'): void {
  writeFileSync(join(h.cfg, 'companion.json'), JSON.stringify({ name, personality, hatchedAt: 1_700_000_000_000 }))
}

export function writeState(h: Home, state: Record<string, unknown>): void {
  writeFileSync(join(h.cfg, 'state.json'), JSON.stringify(state))
}

export function readState(h: Home): Record<string, unknown> {
  const p = join(h.cfg, 'state.json')
  return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : {}
}

export function logLines(h: Home): string[] {
  const p = join(h.cfg, 'buddy.log')
  if (!existsSync(p)) return []
  return readFileSync(p, 'utf8').split('\n').filter(Boolean)
}

/**
 * A fake `claude` binary. It records its argv to the marker file, optionally
 * sleeps, then prints `output`. Lets tests observe whether a model call happened
 * without spending anything.
 */
export function stubClaude(h: Home, output: string, sleepSeconds = 0, exitCode = 0): string {
  const path = join(h.home, 'fake-claude')
  const script = [
    '#!/bin/sh',
    `printf '%s\\n' "$@" > "${h.marker}"`,
    `cat > "${h.marker}.stdin"`,
    sleepSeconds > 0 ? `sleep ${sleepSeconds}` : '',
    `cat <<'__OUT__'`,
    output,
    '__OUT__',
    `exit ${exitCode}`,
  ].join('\n')
  writeFileSync(path, script)
  chmodSync(path, 0o755)
  return path
}

export type RunResult = { code: number; stdout: string; stderr: string; ms: number }

export function runCli(
  args: string[],
  h: Home,
  opts: { env?: Record<string, string>; stdin?: string } = {},
): RunResult {
  const t0 = performance.now()
  const proc = Bun.spawnSync([process.execPath, ENTRY, ...args], {
    cwd: ROOT,
    env: {
      PATH: process.env.PATH ?? '/usr/bin:/bin',
      HOME: h.home,
      COLUMNS: '120',
      ...opts.env,
    },
    stdin: opts.stdin === undefined ? 'ignore' : new TextEncoder().encode(opts.stdin),
    stdout: 'pipe',
    stderr: 'pipe',
  })
  return {
    code: proc.exitCode ?? -1,
    stdout: proc.stdout.toString(),
    stderr: proc.stderr.toString(),
    ms: performance.now() - t0,
  }
}

export async function waitFor(pred: () => boolean, timeoutMs = 3000): Promise<boolean> {
  const end = Date.now() + timeoutMs
  while (Date.now() < end) {
    if (pred()) return true
    await Bun.sleep(25)
  }
  return pred()
}

/** Minimal transcript JSONL in the shape Claude Code writes. */
export function writeTranscript(h: Home, lines: object[]): string {
  const p = join(h.home, 'transcript.jsonl')
  writeFileSync(p, lines.map(l => JSON.stringify(l)).join('\n') + '\n')
  return p
}
