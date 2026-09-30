// Grid settings panel: add, rename, reorder and remove days and slots.
// Rebuilt from state on every render like the grid, with delegated listeners
// on the section. Text fields commit on `change` (blur or Enter), so a
// re-render never interrupts typing.

import { confirmInPage } from './confirm.js';
import { cellsAffectedByKindChange, filledCellsInDay, filledCellsInSlot, hasDayLabel } from './grid-rules.js';
import { addDay, addSlot, moveDay, moveSlot, removeDay, removeSlot, renameDay, updateSlot } from './state.js';

const QUICK_DAYS = ['SAT', 'SUN'];

function el(tag, attrs = {}, children = []) {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(attrs)) {
        if (value === undefined || value === null || value === false) continue;
        if (key === 'text') node.textContent = value;
        else if (key === 'dataset') Object.assign(node.dataset, value);
        else if (key === 'value') node.value = value;
        else node.setAttribute(key, value === true ? '' : value);
    }
    node.append(...children);
    return node;
}

const button = (text, dataset, attrs = {}) => el('button', { type: 'button', text, dataset, ...attrs });

function moveButtons(kind, id, index, count, name) {
    return [
        button('↑', { action: `move-${kind}`, id, dir: '-1', key: `move-${kind}-up:${id}` }, {
            class: 'icon', 'aria-label': `Move ${name} up`, disabled: index === 0,
        }),
        button('↓', { action: `move-${kind}`, id, dir: '1', key: `move-${kind}-down:${id}` }, {
            class: 'icon', 'aria-label': `Move ${name} down`, disabled: index === count - 1,
        }),
        button('×', { action: `remove-${kind}`, id, key: `remove-${kind}:${id}` }, {
            class: 'icon remove-row', 'aria-label': `Remove ${name}`,
        }),
    ];
}

function slotName(slot, classIndex) {
    if (slot.label) return slot.label;
    return slot.kind === 'break' ? 'Break' : `Period ${classIndex}`;
}

export function createSettings(root, { getState, update }) {
    // Unsubmitted text in the "add" fields. This is UI draft text, not
    // timetable state, so it lives here and survives re-renders.
    const drafts = { day: '', slotLabel: '', slotStart: '', slotEnd: '' };

    function renderDays(state) {
        const rows = state.days.map((day, i) =>
            el('li', { class: 'settings-row' }, [
                el('input', {
                    type: 'text', value: day.label, 'aria-label': `Day ${i + 1} label`,
                    dataset: { action: 'rename-day', id: day.id, key: `day-label:${day.id}` },
                }),
                ...moveButtons('day', day.id, i, state.days.length, day.label || 'day'),
            ]),
        );
        const quick = QUICK_DAYS.map(label =>
            button(`+ ${label}`, { action: 'quick-day', label, key: `quick-day:${label}` }, {
                class: 'secondary', disabled: hasDayLabel(state, label),
            }),
        );
        return el('div', { class: 'settings-block' }, [
            el('h3', { text: 'Days' }),
            el('ol', { class: 'settings-list' }, rows),
            el('div', { class: 'settings-add' }, [
                ...quick,
                el('input', {
                    type: 'text', placeholder: 'Custom day', 'aria-label': 'Custom day label', value: drafts.day,
                    dataset: { draft: 'day', key: 'new-day' },
                }),
                button('Add day', { action: 'add-day', key: 'add-day' }, { class: 'secondary' }),
            ]),
        ]);
    }

    function renderSlots(state) {
        let classIndex = 0;
        const rows = state.slots.map((slot, i) => {
            if (slot.kind === 'class') classIndex++;
            const name = slotName(slot, classIndex);
            const field = (f, placeholder, label) =>
                el('input', {
                    type: 'text', value: slot[f], placeholder, 'aria-label': `${name} ${label}`,
                    class: `slot-${f}`,
                    dataset: { action: 'slot-field', field: f, id: slot.id, key: `slot-${f}:${slot.id}` },
                });
            const kind = el('select', {
                'aria-label': `${name} type`,
                dataset: { action: 'slot-kind', id: slot.id, key: `slot-kind:${slot.id}` },
            }, [
                el('option', { value: 'class', text: 'Period', selected: slot.kind === 'class' }),
                el('option', { value: 'break', text: 'Break', selected: slot.kind === 'break' }),
            ]);
            return el('li', { class: `settings-row${slot.kind === 'break' ? ' is-break' : ''}` }, [
                kind,
                field('label', slot.kind === 'break' ? 'Break' : `Period ${classIndex}`, 'label'),
                field('start', 'Start', 'start time'),
                el('span', { class: 'settings-dash', text: '–', 'aria-hidden': 'true' }),
                field('end', 'End', 'end time'),
                ...moveButtons('slot', slot.id, i, state.slots.length, name),
            ]);
        });
        const draft = (name, placeholder, label, cls) =>
            el('input', {
                type: 'text', placeholder, 'aria-label': label, value: drafts[name], class: cls,
                dataset: { draft: name, key: `new-${name}` },
            });
        return el('div', { class: 'settings-block' }, [
            el('h3', { text: 'Periods & breaks' }),
            el('ol', { class: 'settings-list' }, rows),
            el('div', { class: 'settings-add' }, [
                draft('slotLabel', 'Label (e.g. Lunch)', 'New slot label', 'slot-label'),
                draft('slotStart', 'Start', 'New slot start time', 'slot-start'),
                draft('slotEnd', 'End', 'New slot end time', 'slot-end'),
                button('Add period', { action: 'add-slot', kind: 'class', key: 'add-period' }, { class: 'secondary' }),
                button('Add break', { action: 'add-slot', kind: 'break', key: 'add-break' }, { class: 'secondary' }),
            ]),
        ]);
    }

    const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

    async function removeDayWithConfirm(dayId) {
        const state = getState();
        const day = state.days.find(d => d.id === dayId);
        if (!day) return;
        const filled = filledCellsInDay(state, dayId);
        if (filled && !(await confirmInPage(`Remove ${day.label}? Its ${plural(filled, 'filled cell')} will be deleted.`))) return;
        update(s => removeDay(s, dayId));
    }

    async function removeSlotWithConfirm(slotId) {
        const state = getState();
        const index = state.slots.findIndex(s => s.id === slotId);
        if (index === -1) return;
        const slot = state.slots[index];
        const classIndex = state.slots.slice(0, index + 1).filter(s => s.kind === 'class').length;
        const filled = filledCellsInSlot(state, slotId);
        const name = slotName(slot, classIndex);
        if (filled && !(await confirmInPage(`Remove ${name}? Classes on ${plural(filled, 'day')} will be deleted or shortened.`))) return;
        update(s => removeSlot(s, slotId));
    }

    async function changeKind(select) {
        const { id } = select.dataset;
        const kind = select.value;
        const state = getState();
        const affected = cellsAffectedByKindChange(state, id, kind);
        if (affected && !(await confirmInPage(
            `Turn this period into a break? Classes on ${plural(affected, 'day')} will be deleted or shortened.`,
            { confirmLabel: 'Make break' },
        ))) {
            // Put the select back to what the state says.
            select.value = state.slots.find(s => s.id === id)?.kind || 'class';
            return;
        }
        update(s => {
            const slot = s.slots.find(x => x.id === id);
            // Give a new break a sensible label; clear the default one when it
            // becomes a period again.
            const label = kind === 'break' && !slot.label ? 'Break' : kind === 'class' && slot.label === 'Break' ? '' : slot.label;
            return updateSlot(s, id, { kind, label });
        });
    }

    function addCustomDay() {
        const label = drafts.day.trim();
        if (!label) return;
        drafts.day = '';
        update(s => addDay(s, label));
    }

    function addNewSlot(kind) {
        const slot = { kind, label: drafts.slotLabel.trim(), start: drafts.slotStart.trim(), end: drafts.slotEnd.trim() };
        drafts.slotLabel = drafts.slotStart = drafts.slotEnd = '';
        update(s => addSlot(s, slot));
    }

    root.addEventListener('click', event => {
        const target = event.target.closest('button[data-action]');
        if (!target || !root.contains(target)) return;
        const { action, id, dir } = target.dataset;
        const state = getState();
        if (action === 'quick-day') update(s => addDay(s, target.dataset.label));
        else if (action === 'add-day') addCustomDay();
        else if (action === 'add-slot') addNewSlot(target.dataset.kind);
        else if (action === 'move-day') {
            const to = state.days.findIndex(d => d.id === id) + Number(dir);
            if (to >= 0 && to < state.days.length) update(s => moveDay(s, id, to));
        } else if (action === 'move-slot') {
            const to = state.slots.findIndex(x => x.id === id) + Number(dir);
            if (to >= 0 && to < state.slots.length) update(s => moveSlot(s, id, to));
        } else if (action === 'remove-day') removeDayWithConfirm(id);
        else if (action === 'remove-slot') removeSlotWithConfirm(id);
    });

    root.addEventListener('input', event => {
        const { draft } = event.target.dataset;
        if (draft) drafts[draft] = event.target.value;
    });

    root.addEventListener('change', event => {
        const target = event.target;
        const { action, id, field } = target.dataset;
        if (action === 'rename-day') {
            const label = target.value.trim();
            const day = getState().days.find(d => d.id === id);
            if (!label) target.value = day ? day.label : '';
            else if (day && day.label !== label) update(s => renameDay(s, id, label));
        } else if (action === 'slot-field') {
            const value = target.value.trim();
            const slot = getState().slots.find(s => s.id === id);
            if (slot && slot[field] !== value) update(s => updateSlot(s, id, { [field]: value }));
        } else if (action === 'slot-kind') {
            changeKind(target);
        }
    });

    root.addEventListener('keydown', event => {
        if (event.key !== 'Enter' || event.target.tagName !== 'INPUT') return;
        event.preventDefault();
        if (event.target.dataset.draft === 'day') addCustomDay();
        else if (event.target.dataset.action) event.target.blur();
    });

    return {
        render(state) {
            // Re-rendering replaces every node, so carry focus (and the caret)
            // over to the element with the same key.
            const active = root.contains(document.activeElement) ? document.activeElement : null;
            const key = active && active.dataset.key;
            const caret = active && active.tagName === 'INPUT' ? [active.selectionStart, active.selectionEnd] : null;

            root.replaceChildren(
                el('h2', { text: 'Days & periods' }),
                el('div', { class: 'settings-columns' }, [renderDays(state), renderSlots(state)]),
            );

            if (!key) return;
            const next = root.querySelector(`[data-key="${CSS.escape(key)}"]`);
            if (!next || next.disabled) return;
            next.focus();
            if (caret && next.tagName === 'INPUT') next.setSelectionRange(...caret);
        },
    };
}
