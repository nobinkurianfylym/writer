# Tab/Enter Element Transition Spec (E1-3)

This is the reviewable spec for `transition.ts`'s pure `(currentBlockType, key,
isEmpty) -> { nextType, caret }` function. **Human verification gate**: check
this table against real Final Draft behavior before relying on it in E2-2
(the editor's keyboard plugin).

Two keys are covered: **Tab** (retypes the current block in place; caret
stays in it) and **Enter** (creates a new block after the current one; caret
moves into it). `isEmpty` refers to whether the *current* block has any text
before the key is pressed.

## Tab

Tab has two independent cycles:

1. **Main cycle** — "which structural element am I starting":
   `action -> character -> transition -> shot -> action -> ...`
2. **Dialogue toggle** — inside a dialogue exchange, Tab dips into/out of a
   parenthetical instead of advancing the main cycle:
   `dialogue <-> parenthetical`

Every other block type (scene_heading, lyric, centered, dual_dialogue, note,
section, synopsis, page_break, title_page) isn't part of either cycle; Tab on
one of these enters the main cycle at its first step, `character`.

Tab's target does **not** depend on `isEmpty` — pressing Tab mid-sentence
retypes the block the same way as pressing it on an empty one.

| Current type | Tab -> |
|---|---|
| scene_heading | character |
| action | character |
| character | transition |
| dialogue | parenthetical |
| parenthetical | dialogue |
| transition | shot |
| shot | action |
| lyric | character |
| centered | character |
| dual_dialogue | character |
| note | character |
| section | character |
| synopsis | character |
| page_break | character |
| title_page | character |

## Enter

Enter's target depends on whether the current block is empty:

- **Non-empty** ("I finished typing this, what's next"): most types either
  continue as themselves (multi-paragraph action/dialogue/lyric/note/synopsis)
  or advance to the natural next element (character -> dialogue, transition ->
  the next scene heading).
- **Empty** ("I pressed Enter again without typing anything — let me out"): a
  demotion back to the nearest sensible base element, `action` for almost
  every type. `parenthetical` demotes only one level, to `dialogue`, since it
  only exists nested inside a dialogue exchange — there's no "outer" type to
  fall back through first.

| Current type | Enter (non-empty) -> | Enter (empty) -> |
|---|---|---|
| scene_heading | action | action |
| action | action | action |
| character | dialogue | action |
| dialogue | dialogue | action |
| parenthetical | dialogue | dialogue |
| transition | scene_heading | action |
| shot | action | action |
| lyric | lyric | action |
| centered | action | action |
| dual_dialogue | action | action |
| note | note | action |
| section | action | action |
| synopsis | synopsis | action |
| page_break | action | action |
| title_page | action | action |

## Auto-caps entry

`scene_heading`, `character`, and `transition` are the three types rendered
in all-caps (§4, `ElementStyle.caps` in the format profiles from E1-2) — any
transition landing on one of them is therefore an "auto-caps entry" as far as
the editor is concerned. This isn't separate state in the transition table
itself: it falls out of looking up `ElementStyle.caps` for whatever
`nextType` this function returns.
