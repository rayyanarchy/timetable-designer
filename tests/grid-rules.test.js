import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
    canMergeRight, canSplit,
} from '../js/grid-rules.js';
import { addSlot, addSubject, createDefaultState, mergeCellRight, setCell } from '../js/state.js';

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
