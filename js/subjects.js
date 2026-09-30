// Subject input and chips. Colours are assigned in state.addSubject; each chip
// has a colour swatch (native colour input), double-click renames it, and ✖
// removes it.

import { addSubject, removeSubject, updateSubject } from './state.js';
import { textColorFor } from './color.js';

// ---------------------------------------------------------------- pure helpers

// <input type="color"> only accepts lowercase #rrggbb.
export function toColorInputValue(color) {
    const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(color || '').trim());
    if (!m) return '#000000';
    const hex = m[1].length === 3 ? m[1].split('').map(ch => ch + ch).join('') : m[1];
    return `#${hex.toLowerCase()}`;
}

// Renames a subject, ignoring blank names and case-insensitive clashes with
// another subject.
export function renameSubject(state, id, name) {
    const trimmed = String(name).trim();
    const subject = state.subjects.find(s => s.id === id);
    if (!subject || !trimmed || trimmed === subject.name) return state;
    const lower = trimmed.toLowerCase();
    if (state.subjects.some(s => s.id !== id && s.name.toLowerCase() === lower)) return state;
    return updateSubject(state, id, { name: trimmed });
}

// ---------------------------------------------------------------- chips

function createChip(id) {
    const chip = document.createElement('div');
    chip.className = 'subject';
    chip.dataset.subject = id;

    const color = document.createElement('input');
    color.type = 'color';
    color.className = 'subject-color';
    color.dataset.color = id;

    const name = document.createElement('span');
    name.className = 'subject-name';
    name.spellcheck = false;

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'remove';
    remove.dataset.remove = id;
    remove.textContent = '✖';

    chip.append(color, name, remove);
    return chip;
}

function fillChip(chip, subject) {
    const [color, name, remove] = chip.children;
    chip.style.background = subject.color;
    chip.style.color = textColorFor(subject.color);
    chip.title = 'Drag onto the timetable · double-click to rename';
    const value = toColorInputValue(subject.color);
    if (color.value !== value) color.value = value;
    color.setAttribute('aria-label', `Colour for ${subject.name}`);
    if (!name.isContentEditable && name.textContent !== subject.name) name.textContent = subject.name;
    remove.setAttribute('aria-label', `Remove ${subject.name}`);
}

export function createSubjects({ input, list }, { getState, update }) {
    // Chips are reused across renders (keyed by subject id) so an open colour
    // picker or a rename in progress survives the re-render its own edits cause.
    const chips = new Map();

    input.addEventListener('keydown', event => {
        if (event.key !== 'Enter') return;
        event.preventDefault();
        const name = input.value;
        update(s => addSubject(s, name));
        input.value = '';
    });

    list.addEventListener('click', event => {
        const remove = event.target.closest('[data-remove]');
        if (!remove) return;
        update(s => removeSubject(s, remove.dataset.remove));
    });

    list.addEventListener('input', event => {
        const id = event.target.dataset.color;
        if (id) update(s => updateSubject(s, id, { color: event.target.value }));
    });

    // Rename: double-click the name, Enter/blur commits, Escape cancels.
    const startRename = nameEl => {
        nameEl.contentEditable = 'true';
        nameEl.focus();
        const range = document.createRange();
        range.selectNodeContents(nameEl);
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
    };
    const finishRename = (nameEl, commit) => {
        if (!nameEl.isContentEditable) return;
        const id = nameEl.closest('.subject').dataset.subject;
        nameEl.contentEditable = 'false';
        const value = nameEl.textContent;
        const subject = getState().subjects.find(s => s.id === id);
        if (subject) nameEl.textContent = subject.name;
        if (commit) update(s => renameSubject(s, id, value));
    };
    list.addEventListener('dblclick', event => {
        const chip = event.target.closest('.subject');
        if (!chip || event.target.closest('button, input')) return;
        startRename(chip.querySelector('.subject-name'));
    });
    list.addEventListener('keydown', event => {
        if (!event.target.matches('.subject-name[contenteditable="true"]')) return;
        if (event.key === 'Enter' || event.key === 'Escape') {
            event.preventDefault();
            finishRename(event.target, event.key === 'Enter');
        }
    });
    list.addEventListener('focusout', event => {
        if (event.target.matches('.subject-name')) finishRename(event.target, true);
    });

    return {
        render(state) {
            const wanted = state.subjects.map(subject => {
                let chip = chips.get(subject.id);
                if (!chip) chips.set(subject.id, (chip = createChip(subject.id)));
                fillChip(chip, subject);
                return chip;
            });
            for (const id of chips.keys()) {
                if (!state.subjects.some(s => s.id === id)) chips.delete(id);
            }
            const current = [...list.children];
            if (current.length !== wanted.length || current.some((node, i) => node !== wanted[i])) {
                list.replaceChildren(...wanted);
            }
        },
    };
}
