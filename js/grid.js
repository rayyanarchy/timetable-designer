// Editor grid. Rebuilt from state on every change; all interaction goes
// through delegated listeners on the root, so newly rendered cells work
// without rebinding.

import { textColorFor } from './color.js';
import { clearCell, findCoveringCell, getCell, getSubject, setCell, updateSlot } from './state.js';

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

const editable = (field, value) =>
    el('span', { contenteditable: 'true', spellcheck: 'false', dataset: { field }, text: value });

function slotHeader(slot) {
    const children =
        slot.kind === 'break'
            ? [editable('label', slot.label)]
            : [editable('start', slot.start), ' - ', editable('end', slot.end)];
    return el('th', { dataset: { slot: slot.id }, class: slot.kind === 'break' ? 'break' : null }, children);
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
                if (r === 0) {
                    tds.push(el('td', { class: 'break', rowspan: state.days.length, text: slot.label }));
                }
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

let openDropdown = null;

function closeDropdown() {
    if (openDropdown) openDropdown.remove();
    openDropdown = null;
}

document.addEventListener('pointerdown', event => {
    if (openDropdown && !openDropdown.contains(event.target) && !event.target.closest('td.cell')) closeDropdown();
});
document.addEventListener('keydown', event => {
    if (event.key === 'Escape') closeDropdown();
});

function showSubjectDropdown(cellEl, state, update) {
    closeDropdown();
    const { day: dayId, slot: slotId } = cellEl.dataset;
    const option = (text, onPick, className = 'dropdown-option') => {
        const node = el('div', { class: className, text, role: 'option', tabindex: '0' });
        const pick = () => { onPick(); closeDropdown(); };
        node.addEventListener('click', pick);
        node.addEventListener('keydown', e => { if (e.key === 'Enter') pick(); });
        return node;
    };

    const options = state.subjects.map(subject =>
        option(subject.name, () => update(s => setCell(s, dayId, slotId, { subjectId: subject.id }))),
    );
    if (!options.length) options.push(el('div', { class: 'dropdown-empty', text: 'Add a subject first' }));
    if (getCell(state, dayId, slotId)) {
        options.push(option('Clear', () => update(s => clearCell(s, dayId, slotId)), 'dropdown-option dropdown-clear'));
    }

    const dropdown = el('div', { class: 'dropdown', role: 'listbox' }, options);
    const rect = cellEl.getBoundingClientRect();
    dropdown.style.top = `${rect.bottom + window.scrollY}px`;
    dropdown.style.left = `${rect.left + window.scrollX}px`;
    document.body.appendChild(dropdown);
    openDropdown = dropdown;
}

// ---------------------------------------------------------------- wiring

// `getState()` returns the current state; `update(fn)` applies fn(state).
export function createGrid(root, { getState, update }) {
    root.addEventListener('click', event => {
        const cellEl = event.target.closest('td.cell');
        if (cellEl && root.contains(cellEl)) showSubjectDropdown(cellEl, getState(), update);
    });
    root.addEventListener('keydown', event => {
        if (event.target.matches('[contenteditable]') && event.key === 'Enter') {
            event.preventDefault();
            event.target.blur();
        } else if (event.target.matches('td.cell') && (event.key === 'Enter' || event.key === ' ')) {
            event.preventDefault();
            showSubjectDropdown(event.target, getState(), update);
        }
    });
    // Slot times and break labels are committed when the field loses focus,
    // so re-rendering never interrupts typing.
    root.addEventListener('focusout', event => {
        const field = event.target.dataset && event.target.dataset.field;
        const header = event.target.closest && event.target.closest('th[data-slot]');
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
                  ? `th[data-slot="${slotId}"] [data-field="${active.dataset.field}"]`
                  : active.matches('td.cell')
                    ? `td.cell[data-day="${active.dataset.day}"][data-slot="${slotId}"]`
                    : null;
            root.replaceChildren(renderTable(state));
            if (selector) root.querySelector(selector)?.focus();
        },
    };
}
