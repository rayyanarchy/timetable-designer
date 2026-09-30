// Pure data model for a timetable. No DOM access here: every mutation takes a
// state and returns a new one, so this module runs (and is tested) in Node.
//
// Shape:
// { version,
//   days:     [{ id, label }],
//   slots:    [{ id, kind: 'class' | 'break', start, end, label }],
//   subjects: [{ id, name, color }],
//   cells:    { 'dayId:slotId': { subjectId, note, span } },
//   themeId, exportPresetId, customSize: { w, h } }
//
// A cell with span > 1 covers the following class slots on the same day (a
// double period). Break slots span every day and never hold cells.
// normalize() enforces these rules after every structural change.

import { nextPaletteColor } from './color.js';

export const STATE_VERSION = 1;

export function uid(prefix) {
    return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

export const cellKey = (dayId, slotId) => `${dayId}:${slotId}`;

export function createDefaultState() {
    const days = ['MON', 'TUE', 'WED', 'THU', 'FRI'].map(label => ({ id: `d_${label.toLowerCase()}`, label }));
    const times = [['8:20', '9:20'], ['9:20', '10:20'], ['10:35', '11:35'], ['11:35', '12:35'], ['1:20', '4:05']];
    const slots = times.map(([start, end], i) => ({ id: `s_${i + 1}`, kind: 'class', start, end, label: '' }));
    return {
        version: STATE_VERSION,
        days,
        slots,
        subjects: [],
        cells: {},
        themeId: 'paper',
        exportPresetId: 'ios-medium',
        customSize: { w: 1080, h: 1080 },
    };
}

// ---------------------------------------------------------------- queries

export const getSubject = (state, id) => state.subjects.find(s => s.id === id) || null;
export const getCell = (state, dayId, slotId) => state.cells[cellKey(dayId, slotId)] || null;

// Returns { dayId, slotId } of the cell whose span covers this position, or
// null. A cell's own origin counts as covered by itself.
export function findCoveringCell(state, dayId, slotId) {
    const index = state.slots.findIndex(s => s.id === slotId);
    for (let i = index; i >= 0; i--) {
        const cell = getCell(state, dayId, state.slots[i].id);
        if (cell) return i + cell.span > index ? { dayId, slotId: state.slots[i].id } : null;
    }
    return null;
}

// ---------------------------------------------------------------- invariants

// Drops cells on unknown days/slots or break slots, clears references to
// deleted subjects, removes empty cells and clamps spans so they never cross
// a break, run past the last slot or overlap another cell.
export function normalize(state) {
    const subjectIds = new Set(state.subjects.map(s => s.id));
    const cells = {};
    for (const day of state.days) {
        state.slots.forEach((slot, i) => {
            const raw = state.cells[cellKey(day.id, slot.id)];
            if (!raw || slot.kind !== 'class') return;
            const subjectId = subjectIds.has(raw.subjectId) ? raw.subjectId : null;
            const note = typeof raw.note === 'string' ? raw.note : '';
            if (!subjectId && !note) return;
            let span = 1;
            const wanted = Math.max(1, Math.floor(raw.span) || 1);
            while (
                span < wanted &&
                i + span < state.slots.length &&
                state.slots[i + span].kind === 'class' &&
                !state.cells[cellKey(day.id, state.slots[i + span].id)]
            ) span++;
            cells[cellKey(day.id, slot.id)] = { subjectId, note, span };
        });
    }
    return { ...state, cells };
}

// ---------------------------------------------------------------- subjects

export function addSubject(state, name, color) {
    const trimmed = name.trim();
    if (!trimmed || state.subjects.some(s => s.name.toLowerCase() === trimmed.toLowerCase())) return state;
    const subject = {
        id: uid('sub'),
        name: trimmed,
        color: color || nextPaletteColor(state.subjects.map(s => s.color)),
    };
    return { ...state, subjects: [...state.subjects, subject] };
}

export function updateSubject(state, id, patch) {
    return { ...state, subjects: state.subjects.map(s => (s.id === id ? { ...s, ...patch, id } : s)) };
}

export function removeSubject(state, id) {
    return normalize({ ...state, subjects: state.subjects.filter(s => s.id !== id) });
}

// ---------------------------------------------------------------- days

const WEEK = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];

// A label for a new day: the next weekday not already used, else 'DAY n'.
export function nextDayLabel(state) {
    const used = new Set(state.days.map(d => d.label.trim().toUpperCase()));
    const last = WEEK.indexOf(state.days[state.days.length - 1]?.label.trim().toUpperCase());
    for (let i = 1; i <= WEEK.length; i++) {
        const label = WEEK[(last + i + WEEK.length) % WEEK.length];
        if (!used.has(label)) return label;
    }
    return `DAY ${state.days.length + 1}`;
}

export function addDay(state, label, index = state.days.length) {
    const days = [...state.days];
    days.splice(index, 0, { id: uid('d'), label: label.trim() || 'DAY' });
    return { ...state, days };
}

export function renameDay(state, dayId, label) {
    return { ...state, days: state.days.map(d => (d.id === dayId ? { ...d, label } : d)) };
}

export function moveDay(state, dayId, toIndex) {
    const days = state.days.filter(d => d.id !== dayId);
    days.splice(toIndex, 0, state.days.find(d => d.id === dayId));
    return { ...state, days };
}

export function removeDay(state, dayId) {
    return normalize({ ...state, days: state.days.filter(d => d.id !== dayId) });
}

// ---------------------------------------------------------------- slots

export function addSlot(state, slot = {}, index = state.slots.length) {
    const slots = [...state.slots];
    slots.splice(index, 0, {
        id: uid('s'),
        kind: slot.kind === 'break' ? 'break' : 'class',
        start: slot.start || '',
        end: slot.end || '',
        label: slot.label || (slot.kind === 'break' ? 'Break' : ''),
    });
    return normalize({ ...state, slots });
}

export function updateSlot(state, slotId, patch) {
    const slots = state.slots.map(s => (s.id === slotId ? { ...s, ...patch, id: slotId } : s));
    return normalize({ ...state, slots });
}

export function moveSlot(state, slotId, toIndex) {
    const slots = state.slots.filter(s => s.id !== slotId);
    slots.splice(toIndex, 0, state.slots.find(s => s.id === slotId));
    return normalize({ ...state, slots });
}

// Removing a slot shrinks any double period that covered it. If the slot was
// the start of a double period, the remainder moves to the next slot.
export function removeSlot(state, slotId) {
    const index = state.slots.findIndex(s => s.id === slotId);
    if (index === -1) return state;
    const cells = { ...state.cells };
    const next = state.slots[index + 1];
    for (const day of state.days) {
        const cover = findCoveringCell(state, day.id, slotId);
        if (!cover) continue;
        const key = cellKey(day.id, cover.slotId);
        const cell = cells[key];
        if (cover.slotId === slotId) {
            delete cells[key];
            if (cell.span > 1 && next) cells[cellKey(day.id, next.id)] = { ...cell, span: cell.span - 1 };
        } else {
            cells[key] = { ...cell, span: cell.span - 1 };
        }
    }
    return normalize({ ...state, slots: state.slots.filter(s => s.id !== slotId), cells });
}

// ---------------------------------------------------------------- cells

// patch: { subjectId?, note? }. Passing subjectId: null and note: '' clears.
export function setCell(state, dayId, slotId, patch) {
    const key = cellKey(dayId, slotId);
    const current = state.cells[key] || { subjectId: null, note: '', span: 1 };
    return normalize({ ...state, cells: { ...state.cells, [key]: { ...current, ...patch } } });
}

export function clearCell(state, dayId, slotId) {
    const cells = { ...state.cells };
    delete cells[cellKey(dayId, slotId)];
    return { ...state, cells };
}

// Swaps two whole cells (content and span). Either may be empty, so this
// also covers "move to an empty slot".
export function swapCells(state, a, b) {
    const ka = cellKey(a.dayId, a.slotId);
    const kb = cellKey(b.dayId, b.slotId);
    if (ka === kb) return state;
    const cells = { ...state.cells };
    const ca = cells[ka];
    const cb = cells[kb];
    delete cells[ka];
    delete cells[kb];
    if (ca) cells[kb] = ca;
    if (cb) cells[ka] = cb;
    return normalize({ ...state, cells });
}

export const moveCell = swapCells;

// Extends a cell over the next class slot. Only allowed when that slot is
// empty or holds the same subject (whose own span is absorbed).
export function mergeCellRight(state, dayId, slotId) {
    const cell = getCell(state, dayId, slotId);
    if (!cell) return state;
    const index = state.slots.findIndex(s => s.id === slotId);
    const next = state.slots[index + cell.span];
    if (!next || next.kind !== 'class') return state;
    const nextCell = getCell(state, dayId, next.id);
    if (nextCell && nextCell.subjectId !== cell.subjectId) return state;
    const cells = { ...state.cells };
    delete cells[cellKey(dayId, next.id)];
    cells[cellKey(dayId, slotId)] = { ...cell, span: cell.span + (nextCell ? nextCell.span : 1) };
    return normalize({ ...state, cells });
}

export function splitCell(state, dayId, slotId) {
    const cell = getCell(state, dayId, slotId);
    if (!cell || cell.span <= 1) return state;
    return normalize({ ...state, cells: { ...state.cells, [cellKey(dayId, slotId)]: { ...cell, span: cell.span - 1 } } });
}

// ---------------------------------------------------------------- settings

export function setTheme(state, themeId) {
    return { ...state, themeId };
}

export function setExportPreset(state, exportPresetId) {
    return { ...state, exportPresetId };
}

export function setCustomSize(state, w, h) {
    return { ...state, customSize: { w, h } };
}
