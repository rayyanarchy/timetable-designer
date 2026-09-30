import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
    cellsAffectedByKindChange, filledCellsInDay, filledCellsInSlot, hasDayLabel,
} from '../js/grid-rules.js';
import { addDay, addSlot, addSubject, createDefaultState, mergeCellRight, setCell } from '../js/state.js';

function withSubjects(...names) {
    return names.reduce((s, n) => addSubject(s, n), createDefaultState());
}
const subjectId = (state, name) => state.subjects.find(s => s.name === name).id;

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
