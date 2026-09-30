// Boot: load saved state, render, and route every change through update().

import { initDragAndDrop } from './dnd.js';
import { createExportDialog } from './export-dialog.js';
import { createGrid } from './grid.js';
import { createHistory, record, redo, undo } from './history.js';
import { createSettings } from './settings.js';
import { downloadStateJson, loadState, readStateFile, saveStateSoon } from './storage.js';
import { createSubjects } from './subjects.js';
import { applyThemeToDocument, getTheme } from './themes.js';

let state = loadState();
let timeline = createHistory();
const getState = () => state;

const grid = createGrid(document.getElementById('grid-root'), { getState, update });
const settings = createSettings(document.getElementById('grid-settings'), { getState, update });
const subjects = createSubjects(
    { input: document.getElementById('subjectInput'), list: document.getElementById('savedSubjects') },
    { getState, update },
);
initDragAndDrop({ getState, update });

function render() {
    applyThemeToDocument(getTheme(state.themeId));
    subjects.render(state);
    grid.render(state);
    settings.render(state);
}

function commit(next) {
    state = next;
    render();
    saveStateSoon(state);
}

function update(fn) {
    const next = fn(state);
    if (next === state) return;
    timeline = record(timeline, state);
    commit(next);
}

function step(move) {
    const result = move(timeline, state);
    if (!result) return;
    timeline = result.history;
    commit(result.state);
}

// Cmd/Ctrl+Z undoes, Shift+Cmd/Ctrl+Z or Ctrl+Y redoes. Text fields keep
// their own undo.
document.addEventListener('keydown', event => {
    if (!(event.metaKey || event.ctrlKey) || event.altKey) return;
    if (event.target.closest('input, textarea, [contenteditable="true"]')) return;
    const key = event.key.toLowerCase();
    if (key === 'z' || key === 'y') {
        event.preventDefault();
        step(key === 'y' || event.shiftKey ? redo : undo);
    }
});

function replaceState(next) {
    update(() => next);
}

createExportDialog(document.getElementById('export-dialog'), document.getElementById('downloadBtn'), { getState, update });

document.getElementById('exportJsonBtn').addEventListener('click', () => downloadStateJson(state));

const importInput = document.getElementById('importJsonInput');
document.getElementById('importJsonBtn').addEventListener('click', () => importInput.click());
importInput.addEventListener('change', async () => {
    const [file] = importInput.files;
    importInput.value = '';
    if (!file) return;
    try {
        replaceState(await readStateFile(file));
    } catch (error) {
        showMessage(error.message);
    }
});

const message = document.getElementById('message');
function showMessage(text) {
    message.textContent = text;
    message.hidden = false;
    clearTimeout(showMessage.timer);
    showMessage.timer = setTimeout(() => { message.hidden = true; }, 5000);
}

render();
