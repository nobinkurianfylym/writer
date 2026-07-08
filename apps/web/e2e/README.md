# E2-2 element-behavior Playwright tests

Playwright tests for `packages/editor`'s E2-2 element-behavior plugin
(Tab/Enter bound to the E1-3 state machine, Backspace-merge, ⌘1–⌘9,
smart-type detection, auto-caps), driven against the real, rendered
`<ScriptEditor>` at `/editor-dev` (a dev-only harness page, not linked from
the app's real navigation).

## Why this exists alongside packages/editor's own (headless) tests

`packages/editor` already has ~40 unit tests exercising every command and
plugin directly against `prosemirror-state`, with no DOM at all. Those are
fast and thorough for the *logic* — but they can't prove that a real
keystroke, in a real browser, actually reaches that logic the way a user's
typing does. This file's tests exist specifically to close that gap, and
finding a case where it mattered is exactly what happened while building
this suite:

An early manual smoke-test used `document.execCommand("insertText", ...)`
to simulate typing directly in a running dev server. It correctly inserted
text into the document, but the smart-type input rule (auto-converting
`int. ` to a scene heading) never fired — `execCommand` doesn't route
through ProseMirror's `handleTextInput` prop the way genuine keystroke
events do. Switching to Playwright's `page.keyboard.type()` (which
dispatches real `keydown`/`keypress`/`input` events) resolved it. This is
the reason the smart-type tests in `tab-enter-spec-table.spec.ts` matter as
a *browser*-level check, not just a headless one.

## Scope

`tab-enter-spec-table.spec.ts` scripts a representative sample of
`transition.spec.md`'s Tab/Enter table — not an exhaustive re-check of
every `(type, key, isEmpty)` triple. That exhaustive check already exists
twice over: as a pure-function property/unit test in
`screenplay-core/src/transition.test.ts`, and as a headless command test in
`packages/editor/src/commands.test.ts`. This file's job is narrower and
different: prove real keystrokes reach that already-verified logic.

`full-scene-zero-mouse.spec.ts` is the ticket's exit test — "typing a full
2-page scene requires zero mouse interactions." It's a
structurally-representative scene (multiple scenes, a full dialogue
exchange with a parenthetical, a transition, ⌘-explicit-switch) rather than
a character-count-matched "exactly 2 pages of Courier at 55 lines/page" —
actual pagination is thoroughly tested independently in E1-5. The only
non-keyboard call anywhere in that file is `focusEditor()`, which calls the
DOM's own `.focus()` — no `page.click()` or `page.mouse.*` appears.

## Running

```sh
pnpm --filter @fylym/web exec playwright install chromium  # once, if not already installed
pnpm --filter @fylym/web test:e2e
```

The config starts `pnpm dev` automatically if nothing is already listening
on port 3000 (`webServer.reuseExistingServer`), so a `pnpm dev` you already
have running locally is reused rather than fighting over the port.

**Human-verification note**: `transition.spec.md` (E1-3) is itself flagged
as a human-verification gate — check it against real Final Draft behavior
before relying on it. These tests verify the *editor* faithfully implements
whatever `transition.spec.md` currently says, not that the spec itself is
correct.
