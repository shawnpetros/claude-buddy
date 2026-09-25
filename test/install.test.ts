import { describe, expect, test } from 'bun:test'
import { existsSync, lstatSync, mkdirSync, readFileSync, readlinkSync, writeFileSync, chmodSync, realpathSync } from 'node:fs'
import { join } from 'node:path'
import { ROOT, makeHome, runCli, type Home } from './helpers.ts'

const STARSHIP = `# my prompt
[git_branch]
format = '$branch '

[custom.model]
command = 'echo hi'
format  = '$output'
`
const CSHIP = `# cship config
[cship]
lines = ["$directory$git_branch$custom.model"]
`
const SETTINGS = { model: 'opus', statusLine: { type: 'command', command: 'cship' } }

function fixture(): Home & { fakeBin: string } {
  const h = makeHome()
  mkdirSync(join(h.home, '.claude'), { recursive: true })
  writeFileSync(join(h.home, '.config', 'starship.toml'), STARSHIP)
  writeFileSync(join(h.home, '.config', 'cship.toml'), CSHIP)
  writeFileSync(join(h.home, '.claude', 'settings.json'), JSON.stringify(SETTINGS, null, 2) + '\n')
  const fakeBin = join(h.home, 'built-buddy')
  writeFileSync(fakeBin, '#!/bin/sh\necho fake\n')
  chmodSync(fakeBin, 0o755)
  return { ...h, fakeBin }
}

const read = (h: Home, ...p: string[]) => readFileSync(join(h.home, ...p), 'utf8')

describe('buddy install', () => {
  test('without --yes and without a TTY: prints the diff, writes nothing', () => {
    const h = fixture()
    const r = runCli(['install'], h, { env: { BUDDY_BINARY: h.fakeBin } })
    expect(r.code).toBe(0)
    expect(r.stdout).toContain('starship.toml')
    expect(r.stdout).toContain('cship.toml')
    expect(r.stdout).toContain('settings.json')
    expect(r.stdout).toContain('+[custom.buddy]')
    expect(r.stdout).toContain('refreshInterval')
    expect(r.stdout).toContain('--yes')
    expect(read(h, '.config', 'starship.toml')).toBe(STARSHIP)
    expect(read(h, '.config', 'cship.toml')).toBe(CSHIP)
    expect(JSON.parse(read(h, '.claude', 'settings.json'))).toEqual(SETTINGS)
    expect(existsSync(join(h.home, '.local', 'bin', 'buddy'))).toBe(false)
  })

  test('--yes applies all five changes and preserves existing content', () => {
    const h = fixture()
    const r = runCli(['install', '--yes'], h, { env: { BUDDY_BINARY: h.fakeBin } })
    expect(r.code).toBe(0)

    const link = join(h.home, '.local', 'bin', 'buddy')
    expect(lstatSync(link).isSymbolicLink()).toBe(true)
    expect(readlinkSync(link)).toBe(h.fakeBin)

    const starship = read(h, '.config', 'starship.toml')
    expect(starship.startsWith(STARSHIP)).toBe(true)
    expect(starship).toContain('[custom.buddy]')
    expect(starship).toContain('command = "buddy render"')
    expect(starship).toContain('when = "test -f $HOME/.config/claude-buddy/companion.json"')
    expect(starship).toContain('format = "$output"')
    expect(starship).toContain('shell = ["bash", "--noprofile", "--norc"]')

    const cship = read(h, '.config', 'cship.toml')
    expect(cship).toContain('lines = ["$directory$git_branch$custom.model", "$custom.buddy"]')

    const settings = JSON.parse(read(h, '.claude', 'settings.json'))
    expect(settings.statusLine).toEqual({ type: 'command', command: 'cship', refreshInterval: 1 })
    expect(settings.model).toBe('opus')

    const plugin = join(h.home, '.claude', 'skills', 'claude-buddy')
    expect(lstatSync(plugin).isSymbolicLink()).toBe(true)
    expect(realpathSync(plugin)).toBe(realpathSync(ROOT))
  })

  test('install is idempotent', () => {
    const h = fixture()
    runCli(['install', '--yes'], h, { env: { BUDDY_BINARY: h.fakeBin } })
    const once = [read(h, '.config', 'starship.toml'), read(h, '.config', 'cship.toml'), read(h, '.claude', 'settings.json')]
    const r = runCli(['install', '--yes'], h, { env: { BUDDY_BINARY: h.fakeBin } })
    expect(r.code).toBe(0)
    const twice = [read(h, '.config', 'starship.toml'), read(h, '.config', 'cship.toml'), read(h, '.claude', 'settings.json')]
    expect(twice).toEqual(once)
    expect(twice[0]!.match(/\[custom\.buddy\]/g)!.length).toBe(1)
  })

  test('multi-line cship lines arrays get a new second entry', () => {
    const h = fixture()
    writeFileSync(join(h.home, '.config', 'cship.toml'), '[cship]\nlines = [\n  "$directory",\n]\n\n[other]\nx = 1\n')
    runCli(['install', '--yes'], h, { env: { BUDDY_BINARY: h.fakeBin } })
    const cship = read(h, '.config', 'cship.toml')
    const m = cship.match(/lines\s*=\s*\[([\s\S]*?)\]/)!
    const entries = [...m[1]!.matchAll(/"((?:[^"\\]|\\.)*)"/g)].map(x => x[1])
    expect(entries).toEqual(['$directory', '$custom.buddy'])
    expect(cship).toContain('[other]\nx = 1')
  })

  test('missing starship.toml is created; missing cship.toml is left alone with a note', () => {
    const h = makeHome()
    const fakeBin = join(h.home, 'b')
    writeFileSync(fakeBin, '')
    const r = runCli(['install', '--yes'], h, { env: { BUDDY_BINARY: fakeBin } })
    expect(r.code).toBe(0)
    expect(read(h, '.config', 'starship.toml')).toContain('[custom.buddy]')
    expect(existsSync(join(h.home, '.config', 'cship.toml'))).toBe(false)
    expect(r.stdout.toLowerCase()).toContain('cship')
  })

  test('a missing binary is an error that writes nothing', () => {
    const h = fixture()
    const r = runCli(['install', '--yes'], h, { env: { BUDDY_BINARY: join(h.home, 'nope') } })
    expect(r.code).not.toBe(0)
    expect(read(h, '.config', 'starship.toml')).toBe(STARSHIP)
  })
})

describe('buddy uninstall', () => {
  test('reverses install exactly', () => {
    const h = fixture()
    runCli(['install', '--yes'], h, { env: { BUDDY_BINARY: h.fakeBin } })
    const r = runCli(['uninstall', '--yes'], h, { env: { BUDDY_BINARY: h.fakeBin } })
    expect(r.code).toBe(0)
    expect(read(h, '.config', 'starship.toml')).toBe(STARSHIP)
    expect(read(h, '.config', 'cship.toml')).toBe(CSHIP)
    expect(JSON.parse(read(h, '.claude', 'settings.json'))).toEqual(SETTINGS)
    expect(existsSync(join(h.home, '.local', 'bin', 'buddy'))).toBe(false)
    expect(existsSync(join(h.home, '.claude', 'skills', 'claude-buddy'))).toBe(false)
  })

  test('restores a pre-existing refreshInterval rather than deleting it', () => {
    const h = fixture()
    const s = { ...SETTINGS, statusLine: { ...SETTINGS.statusLine, refreshInterval: 5 } }
    writeFileSync(join(h.home, '.claude', 'settings.json'), JSON.stringify(s, null, 2) + '\n')
    runCli(['install', '--yes'], h, { env: { BUDDY_BINARY: h.fakeBin } })
    expect(JSON.parse(read(h, '.claude', 'settings.json')).statusLine.refreshInterval).toBe(1)
    runCli(['uninstall', '--yes'], h, { env: { BUDDY_BINARY: h.fakeBin } })
    expect(JSON.parse(read(h, '.claude', 'settings.json')).statusLine.refreshInterval).toBe(5)
  })

  test('without --yes prints the diff and changes nothing', () => {
    const h = fixture()
    runCli(['install', '--yes'], h, { env: { BUDDY_BINARY: h.fakeBin } })
    const before = read(h, '.config', 'starship.toml')
    const r = runCli(['uninstall'], h, { env: { BUDDY_BINARY: h.fakeBin } })
    expect(r.stdout).toContain('-[custom.buddy]')
    expect(read(h, '.config', 'starship.toml')).toBe(before)
  })

  test('keeps the companion data', () => {
    const h = fixture()
    writeFileSync(join(h.cfg, 'companion.json'), '{"name":"Crumb","personality":"x","hatchedAt":1}')
    runCli(['install', '--yes'], h, { env: { BUDDY_BINARY: h.fakeBin } })
    runCli(['uninstall', '--yes'], h, { env: { BUDDY_BINARY: h.fakeBin } })
    expect(existsSync(join(h.cfg, 'companion.json'))).toBe(true)
  })
})

describe('plugin layout', () => {
  test('plugin.json names the plugin and version', () => {
    const p = JSON.parse(readFileSync(join(ROOT, '.claude-plugin', 'plugin.json'), 'utf8'))
    expect(p.name).toBe('claude-buddy')
    expect(p.version).toBe('0.1.0')
  })

  test('the buddy skill is user-only and drives the binary', () => {
    const skill = readFileSync(join(ROOT, 'skills', 'buddy', 'SKILL.md'), 'utf8')
    const fm = skill.split('---')[1]!
    expect(fm).toContain('name: buddy')
    expect(fm).toContain('disable-model-invocation: true')
    for (const sub of ['pet', 'off', 'on', 'status', 'rehatch', 'hatch']) expect(skill).toContain(sub)
    expect(skill).toContain('verbatim')
  })
})
