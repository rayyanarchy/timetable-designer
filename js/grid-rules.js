// Pure questions the grid editor asks before offering an action. No DOM here,
// so the rules are tested in Node alongside js/state.js.

import { getCell, mergeCellRight } from './state.js';

// "Make double period" is offered exactly when mergeCellRight would change
// something: the next slot exists, is a class slot, and is empty or holds the
// same subject.
export const canMergeRight = (state, dayId, slotId) => mergeCellRight(state, dayId, slotId) !== state;

export function canSplit(state, dayId, slotId) {
    const cell = getCell(state, dayId, slotId);
    return Boolean(cell && cell.span > 1);
}
