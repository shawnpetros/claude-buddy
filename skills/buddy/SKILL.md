---
name: buddy
description: Hatch, pet, mute, unmute or inspect your terminal companion. Usage /buddy:buddy [pet|off|on|status|rehatch]
argument-hint: "[pet|off|on|status|rehatch]"
disable-model-invocation: true
allowed-tools: Bash(buddy:*), Bash(test -f:*)
---

Your companion is driven by the `buddy` command-line tool. Run exactly one command with the Bash tool, then print its output back to the user verbatim inside a plain code block. Do not add commentary before or after, and do not speak for the companion. It has its own speech bubble.

The argument was: `$ARGUMENTS`

Pick the command from the argument:

| Argument | Command |
|---|---|
| `pet` | `buddy pet` |
| `off` | `buddy mute` |
| `on` | `buddy unmute` |
| `status` | `buddy status` |
| `rehatch` | `buddy rehatch` |
| (empty) | `buddy hatch` if `test -f "$HOME/.config/claude-buddy/companion.json"` fails, otherwise `buddy status` |

For any other argument, run `buddy status` and add one line listing the valid arguments: pet, off, on, status, rehatch.

If `buddy` is not on the PATH, run the same subcommand as `"${CLAUDE_PLUGIN_ROOT}/bin/buddy"` instead. If that fails too, tell the user to run `bun run build` and then `buddy install` from the plugin directory.

Hatching calls a model and can take up to a minute. Let it finish.
