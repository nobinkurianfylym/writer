# Manual Screen Reader Test Script

## Prerequisites

- macOS with VoiceOver (built-in)
- Windows with NVDA (free download from nvaccess.org)
- FYLYM Writer running locally (`pnpm dev`)
- Navigate to the editor-dev route in your browser

## Test Matrix

| # | Action | Expected (VoiceOver) | Expected (NVDA) | Pass? |
|---|--------|---------------------|------------------|-------|
| 1 | Navigate to editor page | "Screenplay editor, document" announced | "Screenplay editor, document" announced | |
| 2 | Tab to element dropdown | "Element type, popup button" or similar control announcement | "Element type, combo box" | |
| 3 | Tab to theme selector | "Theme, popup button" | "Theme, combo box" | |
| 4 | Tab to mode buttons | "Normal, toggle button, pressed" | "Normal, toggle button, pressed" | |
| 5 | Tab to Focus mode button | "Focus, toggle button, not pressed" | "Focus, toggle button, not pressed" | |
| 6 | Press Enter on Focus button | "Focus, toggle button, pressed" announced | "Focus, toggle button, pressed" | |
| 7 | Tab to editor content area | "Screenplay editor, document" | "Screenplay editor, document" | |
| 8 | Arrow down through blocks | "Now editing: [element type]" announced on type change | "Now editing: [element type]" announced on type change | |
| 9 | Press Cmd+F / Ctrl+F | "Find in document, search" region announced, focus moves to search input | Same | |
| 10 | Type search text | Matches update; "X of Y matches" announced via live region | Same | |
| 11 | Click Next match button | "Next match, button"; match count updates announced | Same | |
| 12 | Click Previous match button | "Previous match, button"; match count updates announced | Same | |
| 13 | Tab to element filter in find bar | "Filter by element type, popup button" | "Filter by element type, combo box" | |
| 14 | Press Escape in find bar | Find bar closes, focus returns to editor | Same | |
| 15 | Press Cmd+K / Ctrl+K | "Jump to scene, dialog" announced; "Filter scenes, combo box" focused | Same | |
| 16 | Arrow down in scene palette | Active option changes; new scene name read via aria-activedescendant | Same | |
| 17 | Press Enter in scene palette | Dialog closes, editor scrolls to selected scene | Same | |
| 18 | Press Escape in scene palette | Dialog closes without navigation | Same | |

## VoiceOver Quick Reference

- Toggle VoiceOver: Cmd+F5
- Navigate: VO+Arrow keys (VO = Ctrl+Option)
- Interact with group: VO+Shift+Down Arrow
- Stop interacting: VO+Shift+Up Arrow
- Read current item: VO+F3

## NVDA Quick Reference

- Toggle NVDA: Ctrl+Alt+N (or Insert key as NVDA modifier)
- Navigate: Tab / Shift+Tab, Arrow keys in browse mode
- Toggle browse/focus mode: Insert+Space
- Read current item: Insert+Tab

## Checklist Summary

- [ ] All 18 tests pass on VoiceOver (macOS Safari or Chrome)
- [ ] All 18 tests pass on NVDA (Windows Chrome or Firefox)
- [ ] No unlabeled interactive controls encountered
- [ ] No focus traps detected (can always Tab/Escape out)
- [ ] Live region announcements fire on element type changes
- [ ] Reduced motion: confirm transitions/animations are suppressed with "Reduce motion" enabled in system preferences
