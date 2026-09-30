# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

A browser-based timetable designer that exports timetables as PNG images, aimed at students who use them as iOS widgets, wallpapers or custom-size images. The README roadmap lists the planned features.

## Development

It's a static site written in vanilla JS ES modules. There is no build step and no dependencies.

- **Run:** `python3 -m http.server` from the repo root, then open http://localhost:8000. ES modules don't load over `file://`, so opening `index.html` directly won't work.
- **Test:** `node --test` runs every `tests/*.test.js` file using Node's built-in runner (Node 22+). To run one test by name: `node --test --test-name-pattern="merge" tests/state.test.js`. `node --test tests/` doesn't work on Node 22, because it treats the directory as a file.

## Architecture

- **All state lives in one object** (`js/state.js`). It holds days, slots, subjects, cells keyed `dayId:slotId`, and settings. Every mutation is a pure function that returns a new state and ends with `normalize()`.
  - `normalize()` enforces the grid rules:
    - A cell with `span > 1` is a double period covering the next class slots.
    - Spans never cross a break, run past the last slot or overlap another cell.
    - Break slots never hold cells.
    - Empty cells and references to deleted subjects are dropped.
  - Use `findCoveringCell` to tell whether a position is inside a double period.
  - This module has no DOM access, so it can be tested in Node.
- **One update loop** in `js/main.js`: `update(fn)` sets `state = fn(state)`, records the previous state for undo/redo (`js/history.js`, Cmd/Ctrl+Z), re-renders every module and autosaves.
  - UI modules get `{ getState, update, undo }` and never keep their own copy of the state.
  - Modules rebuild their DOM on every render, so listeners are delegated on their root.
- **Persistence** (`js/storage.js`): debounced localStorage autosave plus JSON download/upload. Anything loaded or imported goes through `validateState()`.
- **The editor card and the PNG come from the same layout.** `js/layout.js` is a pure function: given the state, target size (with `scale`, pixels per point) and style, it returns boxes with fitted text and the ids of the day/slot/cell each box shows. It measures text through an injected `measureText` function, so tests use a fake measurer.
  - `js/card.js` renders those boxes as positioned divs scaled to fit the screen, and opens in-place editors (popovers) for days, times and classes. `js/render-canvas.js` draws the same boxes with Canvas 2D for the export. Any change to how a box looks must be made in both renderers.
  - Style metrics (padding, gap, radius, hairlines) are in points and scaled by the preset's `scale`, so every size keeps iOS proportions.
  - Fitting: day and time labels are sized separately and never outgrow the class text; labels are shortened (MON → Mon → M, "8:20 - 9:20" → "8:20") only when it gives class names more room and keeps days distinct; two-word names wrap onto a second line; notes are hidden before names shrink; nothing goes below `minFontSize` (it's ellipsized instead). Tall targets may turn days into columns.
- **Sizes** (`js/presets.js`): widget sizes per device from Apple's HIG tables (cited in the file). Each preset id encodes the kind and the device (e.g. `ios-medium-iphone-max`), so `state.exportPresetId` is the only stored choice. The legacy id `ios-medium` (2028×948) must keep resolving for old saved states. Wallpaper presets exist but are deliberately not offered in the UI yet.
- **Styles** (`js/themes.js`) are token objects read by the layout. `subjectStyle` decides how a class looks (`tint`, `solid` or `dot`); `subjectAppearance()` keeps tinted text at 4.5:1 contrast, and `tests/themes.test.js` checks every style against the palette.
- **UI modules:** `js/controls.js` (size and style pickers), `js/subjects.js` (subjects panel), `js/export-menu.js` (Download split button with device, Save/Open JSON), `js/popover.js` (one popover at a time; a bottom sheet on phones), `js/toast.js` (Undo toasts — used instead of confirmations; never use `window.alert`/`confirm`).
  - `js/grid-rules.js` holds pure checks the editors use before offering an action, e.g. `canMergeRight` is "`mergeCellRight` would change the state".
  - `js/dnd.js` handles drag and drop with Pointer Events and document-level listeners, on `.subject-item[data-subject]` and `.tt-cell[data-day][data-slot]`, and swallows the click that ends a drag so a plain tap still opens the editor.
- **CSS** lives in `css/`, one file per module, on the tokens in `css/base.css` (light and dark app themes, iOS-style radii). The app theme is independent of the card's style.
