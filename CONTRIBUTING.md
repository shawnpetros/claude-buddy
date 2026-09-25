# Contributing

This is personal tooling, kept public so it's easy to share and fork. A couple of rules
if you're sending a change:

## Sprites

Any sprite, icon, or pixel-art contribution must be your own original art. Nothing traced,
generated from, or copied out of the leaked source this project was reverse-engineered from,
and nothing lifted from Anthropic's actual `/buddy` art or prompts. Describe what inspired the
piece in the PR if it's not obvious.

## Tests first

For anything touching the bones roll, the render width math, or the hook throttling, write
the failing test before the fix. Those are exactly the places where a "looks right" change
quietly breaks determinism or blows the status line width — see `SPEC.md` §6 and §7 for the
invariants and the adversarial test list this project is built against.

Small, reviewable PRs. If the diff is hard to review in one sitting, split it.
