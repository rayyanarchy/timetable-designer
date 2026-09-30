// Boot: load saved state, render, and route every change through update().

import { createCard } from './card.js';
import { initDragAndDrop } from './dnd.js';
import { createHistory, record, redo, undo } from './history.js';
import { loadState, saveStateSoon } from './storage.js';
import { createSubjects } from './subjects.js';

let state = loadState();
let timeline = createHistory();
const getState = () => state;

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

const undoLast = () => step(undo);
const context = { getState, update, undo: undoLast };

const card = createCard(document.getElementById('card-area'), context);
const subjects = createSubjects(document.getElementById('subjects'), context);
initDragAndDrop(context);

function render() {
    card.render(state);
    subjects.render(state);
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

render();
