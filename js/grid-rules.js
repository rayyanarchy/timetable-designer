// Pure questions the grid editor asks before offering an action. No DOM here,
// so the rules are tested in Node alongside js/state.js.

import { findCoveringCell, getCell, mergeCellRight } from './state.js';

// "Make double period" is offered exactly when mergeCellRight would change
// something: the next slot exists, is a class slot, and is empty or holds the
// same subject.
export const canMergeRight = (state, dayId, slotId) => mergeCellRight(state, dayId, slotId) !== state;

export function canSplit(state, dayId, slotId) {
    const cell = getCell(state, dayId, slotId);
    return Boolean(cell && cell.span > 1);
}

// Number of filled cells that would be lost or shortened by removing a day.
export function filledCellsInDay(state, dayId) {
    return Object.keys(state.cells).filter(key => key.slice(0, key.lastIndexOf(':')) === dayId).length;
}

// Number of days whose content sits in (or spans over) a slot.
export function filledCellsInSlot(state, slotId) {
    return state.days.filter(day => findCoveringCell(state, day.id, slotId)).length;
}

// Number of days whose content would be dropped or shortened if a slot
// changed kind. Turning a break into a class slot never loses anything.
export function cellsAffectedByKindChange(state, slotId, kind) {
    const slot = state.slots.find(s => s.id === slotId);
    if (!slot || slot.kind === kind || kind !== 'break') return 0;
    return filledCellsInSlot(state, slotId);
}

export const hasDayLabel = (state, label) =>
    state.days.some(d => d.label.trim().toLowerCase() === label.trim().toLowerCase());
