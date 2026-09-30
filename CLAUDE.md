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
- **One update loop** in `js/main.js`: `update(fn)` sets `state = fn(state)`, re-renders everything (grid, subject chips, theme variables) and autosaves.
  - UI modules get `getState` and `update` and never keep their own copy of the state.
  - `js/grid.js` rebuilds the table on every render, so all its listeners are delegated on `#grid-root`.
- **Persistence** (`js/storage.js`): debounced localStorage autosave plus JSON download/upload. Anything loaded or imported goes through `validateState()`.
- **Export doesn't capture the editor DOM.** `js/layout.js` is a pure function: given the state, target size, safe area and theme, it returns boxes with fitted text. It measures text through an injected `measureText` function, so tests use a fake measurer.
  - Fonts are sized by binary search, never go below `minFontSize`, and are ellipsized if they still don't fit. Notes are hidden before names get shrunk.
  - `js/render-canvas.js` draws the layout with Canvas 2D. `js/export.js` renders at the preset's exact pixel size (`js/presets.js`) and downloads the PNG. The preview and the export must both go through `renderToCanvas` so they always match.
- **Export presets and dialog:**
  - `js/presets.js` holds the widget, wallpaper and custom sizes. Each preset id encodes the format and the device (e.g. `ios-medium-iphone-max`), so `state.exportPresetId` is the only stored choice.
  - The legacy id `ios-medium` (2028×948) must keep resolving, because older saved states use it.
  - Widget sizes come from Apple's HIG tables, cited in the file. Wallpaper safe areas are estimates.
  - `js/export-dialog.js` renders the preview at the full export size and downloads that same canvas.
- **Editor modules:**
  - `js/settings.js` is the days and periods panel.
  - `js/grid-rules.js` holds pure checks the menus use before offering an action, e.g. `canMergeRight` is defined as "`mergeCellRight` would change the state".
  - `js/confirm.js` is the in-page confirmation. Never use `window.alert` or `window.confirm`.
  - `js/dnd.js` handles drag and drop with Pointer Events and document-level listeners. It relies on the selectors `#savedSubjects .subject[data-subject]` and `#grid-root td.cell[data-day][data-slot]`, and swallows the click that ends a drag so a plain click still opens the cell menu.
- **Themes** (`js/themes.js`) are token objects. `applyThemeToDocument` turns them into CSS custom properties (`--tt-*`) for the editor, and the canvas renderer reads the same object directly. A visual change to a theme therefore has to work in both places.
