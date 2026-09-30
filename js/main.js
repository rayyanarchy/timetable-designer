// Boot: load saved state, render, and route every change through update().

import { downloadPng } from './export.js';
import { initDragAndDrop } from './dnd.js';
import { createGrid } from './grid.js';
import { createSettings } from './settings.js';
import { downloadStateJson, loadState, readStateFile, saveStateSoon } from './storage.js';
import { createSubjects } from './subjects.js';
import { applyThemeToDocument, getTheme } from './themes.js';

let state = loadState();
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

function update(fn) {
    const next = fn(state);
    if (next === state) return;
    state = next;
    render();
    saveStateSoon(state);
}

function replaceState(next) {
    update(() => next);
}

document.getElementById('downloadBtn').addEventListener('click', () => {
    downloadPng(state).catch(error => console.error('Could not export the timetable:', error));
});

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
