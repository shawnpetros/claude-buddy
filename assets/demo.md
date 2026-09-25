# Recording the demo GIF

Not run yet. When the build is ready, this records a ~20s demo of the status line in
`compact` mode: hatch, a quip on a turn, an error trigger, a pet.

Requires [vhs](https://github.com/charmbracelet/vhs) (`brew install vhs`).

## `assets/demo.tape`

Save the block below as `assets/demo.tape`, then run it from the repo root:

```
vhs assets/demo.tape
```

It writes `assets/demo.gif`.

```tape
Output assets/demo.gif

Set Shell "zsh"
Set FontSize 16
Set Width 1000
Set Height 500
Set Theme "Catppuccin Mocha"
Set TypingSpeed 60ms

Type "claude"
Enter
Sleep 2s

Type "/buddy:buddy"
Enter
Sleep 3s

Type "echo 'hatched, say hi Crumb'"
Enter
Sleep 4s

Type "npm test"
Enter
Sleep 3s

Type "/buddy:buddy pet"
Enter
Sleep 3s

Type "exit"
Enter
Sleep 1s
```

Swap `Crumb` for whatever your own creature ends up named, and swap `npm test` for a command
in this repo that actually fails on a clean checkout, so the error trigger fires for real
instead of needing a scripted failure.
