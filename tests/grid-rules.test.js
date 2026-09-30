import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
    canMergeRight, canSplit, cellsAffectedByKindChange, filledCellsInDay, filledCellsInSlot, hasDayLabel,
} from '../js/grid-rules.js';
import { addDay, addSlot, addSubject, createDefaultState, mergeCellRight, setCell } from '../js/state.js';

function withSubjects(...names) {
    return names.reduce((s, n) => addSubject(s, n), createDefaultState());
}
const subjectId = (state, name) => state.subjects.find(s => s.name === name).id;

test('canMergeRight: only when the next slot is an empty or same-subject class slot', () => {
    let s = withSubjects('Maths', 'Art');
    const maths = subjectId(s, 'Maths');
    assert.equal(canMergeRight(s, 'd_mon', 's_1'), false, 'no cell');

    s = setCell(s, 'd_mon', 's_1', { subjectId: maths });
    assert.equal(canMergeRight(s, 'd_mon', 's_1'), true, 'next slot empty');

    s = setCell(s, 'd_mon', 's_2', { subjectId: subjectId(s, 'Art') });
    assert.equal(canMergeRight(s, 'd_mon', 's_1'), false, 'next slot holds a different subject');

    s = setCell(s, 'd_mon', 's_2', { subjectId: maths });
    assert.equal(canMergeRight(s, 'd_mon', 's_1'), true, 'next slot holds the same subject');

    s = setCell(s, 'd_mon', 's_5', { subjectId: maths });
    assert.equal(canMergeRight(s, 'd_mon', 's_5'), false, 'last slot');
});

test('canMergeRight is false when the next slot is a break', () => {
    let s = withSubjects('Maths');
    s = addSlot(s, { kind: 'break', label: 'Lunch' }, 1);
    s = setCell(s, 'd_mon', 's_1', { subjectId: subjectId(s, 'Maths') });
    assert.equal(canMergeRight(s, 'd_mon', 's_1'), false);
});

test('canSplit only for double periods', () => {
    let s = withSubjects('Lab');
    s = setCell(s, 'd_mon', 's_1', { subjectId: subjectId(s, 'Lab') });
    assert.equal(canSplit(s, 'd_mon', 's_1'), false);
    s = mergeCellRight(s, 'd_mon', 's_1');
    assert.equal(canSplit(s, 'd_mon', 's_1'), true);
    assert.equal(canSplit(s, 'd_mon', 's_2'), false, 'covered position is not an origin');
});

test('filledCellsInDay counts only that day', () => {
    let s = withSubjects('Maths');
    const maths = subjectId(s, 'Maths');
    s = setCell(s, 'd_mon', 's_1', { subjectId: maths });
    s = setCell(s, 'd_mon', 's_3', { note: 'Room 4' });
    s = setCell(s, 'd_tue', 's_1', { subjectId: maths });
    assert.equal(filledCellsInDay(s, 'd_mon'), 2);
    assert.equal(filledCellsInDay(s, 'd_tue'), 1);
    assert.equal(filledCellsInDay(s, 'd_wed'), 0);
});

test('filledCellsInSlot counts days whose cells start in or span over the slot', () => {
    let s = withSubjects('Lab');
    const lab = subjectId(s, 'Lab');
    s = setCell(s, 'd_mon', 's_1', { subjectId: lab });
    s = mergeCellRight(s, 'd_mon', 's_1');
    s = setCell(s, 'd_tue', 's_2', { subjectId: lab });
    assert.equal(filledCellsInSlot(s, 's_1'), 1);
    assert.equal(filledCellsInSlot(s, 's_2'), 2);
    assert.equal(filledCellsInSlot(s, 's_3'), 0);
});

test('cellsAffectedByKindChange only counts class -> break', () => {
    let s = withSubjects('Maths');
    s = setCell(s, 'd_mon', 's_2', { subjectId: subjectId(s, 'Maths') });
    assert.equal(cellsAffectedByKindChange(s, 's_2', 'break'), 1);
    assert.equal(cellsAffectedByKindChange(s, 's_2', 'class'), 0);
    assert.equal(cellsAffectedByKindChange(s, 's_3', 'break'), 0);
    s = addSlot(s, { kind: 'break' });
    assert.equal(cellsAffectedByKindChange(s, s.slots.at(-1).id, 'class'), 0);
});

test('hasDayLabel ignores case and whitespace', () => {
    let s = createDefaultState();
    assert.equal(hasDayLabel(s, 'sat'), false);
    s = addDay(s, 'SAT');
    assert.equal(hasDayLabel(s, ' sat '), true);
    assert.equal(hasDayLabel(s, 'mon'), true);
});
