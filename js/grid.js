// Editor grid. Rebuilt from state on every change; all interaction goes
// through delegated listeners on the root, so newly rendered cells work
// without rebinding.

import { textColorFor } from './color.js';
import { canMergeRight, canSplit } from './grid-rules.js';
import {
    clearCell, findCoveringCell, getCell, getSubject, mergeCellRight, setCell, splitCell, updateSlot,
} from './state.js';

function el(tag, attrs = {}, children = []) {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(attrs)) {
        if (value === undefined || value === null || value === false) continue;
        if (key === 'text') node.textContent = value;
        else if (key === 'dataset') Object.assign(node.dataset, value);
        else if (key === 'style') Object.assign(node.style, value);
        else node.setAttribute(key, value === true ? '' : value);
    }
    node.append(...children);
    return node;
}

const editable = (field, value, placeholder) =>
    el('span', {
        contenteditable: 'true', spellcheck: 'false', dataset: { field, placeholder }, text: value,
        'aria-label': placeholder,
    });

// Every header shows the slot's times. A break's label lives in its body
// column (which spans all days), so each field appears exactly once.
function slotHeader(slot) {
    const children = [editable('start', slot.start, 'Start'), ' - ', editable('end', slot.end, 'End')];
    return el('th', { dataset: { slot: slot.id }, class: slot.kind === 'break' ? 'break' : null }, children);
}

function breakTd(state, slot) {
    return el('td', { class: 'break', rowspan: state.days.length, dataset: { slot: slot.id } }, [
        editable('label', slot.label, 'Break'),
    ]);
}

function cellTd(state, day, slot) {
    const cell = getCell(state, day.id, slot.id);
    const subject = cell ? getSubject(state, cell.subjectId) : null;
    const children = [];
    if (subject) children.push(el('span', { class: 'cell-subject', text: subject.name }));
    if (cell && cell.note) children.push(el('span', { class: 'cell-note', text: cell.note }));
    return el(
        'td',
        {
            class: 'cell',
            colspan: cell && cell.span > 1 ? cell.span : null,
            tabindex: '0',
            dataset: { day: day.id, slot: slot.id },
            style: subject ? { background: subject.color, color: textColorFor(subject.color) } : null,
        },
        children,
    );
}

export function renderTable(state) {
    const head = el('tr', {}, [el('th', { class: 'corner', text: 'Day' }), ...state.slots.map(slotHeader)]);
    const rows = state.days.map((day, r) => {
        const tds = [];
        for (const slot of state.slots) {
            if (slot.kind === 'break') {
                if (r === 0) tds.push(breakTd(state, slot));
                continue;
            }
            const cover = findCoveringCell(state, day.id, slot.id);
            if (cover && cover.slotId !== slot.id) continue;
            tds.push(cellTd(state, day, slot));
        }
        return el('tr', {}, [el('th', { dataset: { day: day.id }, text: day.label }), ...tds]);
    });
    return el('table', { id: 'timetable' }, [el('thead', {}, [head]), el('tbody', {}, rows)]);
}

// ---------------------------------------------------------------- dropdown

// { node, root, dayId, slotId, commit } while a cell menu is open.
let openDropdown = null;

// Closes the menu. `commit` saves a note that was typed but not yet saved;
// `refocus` moves keyboard focus back to the cell the menu belongs to.
function closeDropdown({ commit = false, refocus = false } = {}) {
    const open = openDropdown;
    if (!open) return;
    openDropdown = null;
    open.node.remove();
    if (commit) open.commit();
    if (refocus) focusCell(open.root, open.dayId, open.slotId);
}

function focusCell(root, dayId, slotId) {
    root.querySelector(`td.cell[data-day="${dayId}"][data-slot="${slotId}"]`)?.focus();
}

document.addEventListener('pointerdown', event => {
    if (openDropdown && !openDropdown.node.contains(event.target)) closeDropdown({ commit: true });
});
document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && openDropdown) closeDropdown({ refocus: true });
});

function showSubjectDropdown(root, cellEl, getState, update, { focusMenu = false } = {}) {
    const { day: dayId, slot: slotId } = cellEl.dataset;
    // Saving a pending note from another menu re-renders the table, so look
    // the cell up again afterwards.
    closeDropdown({ commit: true });
    if (!cellEl.isConnected) cellEl = root.querySelector(`td.cell[data-day="${dayId}"][data-slot="${slotId}"]`);
    if (!cellEl) return;
    const state = getState();
    const cell = getCell(state, dayId, slotId);

    const noteInput = el('input', {
        type: 'text', class: 'dropdown-note', placeholder: 'Room / teacher', 'aria-label': 'Note (room or teacher)',
    });
    noteInput.value = cell ? cell.note : '';
    // Applies the typed note (if it changed) before another action.
    const withNote = s => {
        const note = noteInput.value.trim();
        const current = getCell(s, dayId, slotId);
        return note === (current ? current.note : '') ? s : setCell(s, dayId, slotId, { note });
    };
    const commit = () => update(withNote);

    // Runs an action, then closes the menu and returns focus to the cell.
    const run = fn => {
        closeDropdown();
        update(fn);
        focusCell(root, dayId, slotId);
    };
    const option = (text, onPick, className = 'dropdown-option') => {
        const node = el('div', { class: className, text, role: 'option', tabindex: '0' });
        node.addEventListener('click', () => run(onPick));
        node.addEventListener('keydown', e => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                run(onPick);
            }
        });
        return node;
    };

    const subjects = state.subjects.map(subject =>
        option(subject.name, s => setCell(withNote(s), dayId, slotId, { subjectId: subject.id })),
    );
    if (!subjects.length) subjects.push(el('div', { class: 'dropdown-empty', text: 'Add a subject first' }));
    const actions = [];
    if (canMergeRight(state, dayId, slotId)) {
        actions.push(option('Make double period', s => mergeCellRight(withNote(s), dayId, slotId), 'dropdown-option dropdown-action'));
    }
    if (canSplit(state, dayId, slotId)) {
        actions.push(option('Split', s => splitCell(withNote(s), dayId, slotId), 'dropdown-option dropdown-action'));
    }
    if (cell) actions.push(option('Clear', s => clearCell(s, dayId, slotId), 'dropdown-option dropdown-clear'));

    noteInput.addEventListener('keydown', e => {
        if (e.key === 'Enter') {
            e.preventDefault();
            run(withNote);
        }
    });

    const node = el('div', { class: 'dropdown cell-menu' }, [
        el('div', { class: 'dropdown-options', role: 'listbox', 'aria-label': 'Subject' }, subjects),
        el('label', { class: 'dropdown-note-row' }, [el('span', { text: 'Note' }), noteInput]),
        ...actions,
    ]);
    const rect = cellEl.getBoundingClientRect();
    node.style.top = `${rect.bottom + window.scrollY}px`;
    node.style.left = `${rect.left + window.scrollX}px`;
    document.body.appendChild(node);
    openDropdown = { node, root, dayId, slotId, commit };
    if (focusMenu) node.querySelector('[tabindex="0"], input')?.focus();
}

// ---------------------------------------------------------------- wiring

// `getState()` returns the current state; `update(fn)` applies fn(state).
export function createGrid(root, { getState, update }) {
    root.addEventListener('click', event => {
        const cellEl = event.target.closest('td.cell');
        if (cellEl && root.contains(cellEl)) showSubjectDropdown(root, cellEl, getState, update);
    });
    root.addEventListener('keydown', event => {
        if (event.target.matches('[contenteditable]') && event.key === 'Enter') {
            event.preventDefault();
            event.target.blur();
        } else if (event.target.matches('td.cell') && (event.key === 'Enter' || event.key === ' ')) {
            event.preventDefault();
            showSubjectDropdown(root, event.target, getState, update, { focusMenu: true });
        }
    });
    // Slot times and break labels are committed when the field loses focus,
    // so re-rendering never interrupts typing.
    root.addEventListener('focusout', event => {
        const field = event.target.dataset && event.target.dataset.field;
        const header = event.target.closest && event.target.closest('th[data-slot], td.break[data-slot]');
        if (!field || !header) return;
        const value = event.target.textContent.trim();
        const slot = getState().slots.find(s => s.id === header.dataset.slot);
        if (slot && slot[field] !== value) update(s => updateSlot(s, slot.id, { [field]: value }));
    });

    return {
        render(state) {
            closeDropdown();
            // Re-rendering replaces every node, so carry keyboard focus over to
            // the matching field or cell in the new table.
            const active = root.contains(document.activeElement) ? document.activeElement : null;
            const slotId = active && active.closest('[data-slot]')?.dataset.slot;
            const selector = !active
                ? null
                : active.dataset.field
                  ? `[data-slot="${slotId}"] > [data-field="${active.dataset.field}"]`
                  : active.matches('td.cell')
                    ? `td.cell[data-day="${active.dataset.day}"][data-slot="${slotId}"]`
                    : null;
            root.replaceChildren(renderTable(state));
            if (selector) root.querySelector(selector)?.focus();
        },
    };
}
