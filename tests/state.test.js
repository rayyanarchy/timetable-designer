import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
    addSlot, addSubject, cellKey, createDefaultState, findCoveringCell, mergeCellRight, removeSlot,
    removeSubject, setCell, splitCell, swapCells, updateSlot,
} from '../js/state.js';

function withSubjects(...names) {
    return names.reduce((s, n) => addSubject(s, n), createDefaultState());
}
const subjectId = (state, name) => state.subjects.find(s => s.name === name).id;

test('default state matches the original 5×5 grid', () => {
    const s = createDefaultState();
    assert.deepEqual(s.days.map(d => d.label), ['MON', 'TUE', 'WED', 'THU', 'FRI']);
    assert.equal(s.slots.length, 5);
    assert.equal(s.slots[0].start, '8:20');
    assert.equal(s.slots[4].end, '4:05');
});

test('addSubject ignores blanks and case-insensitive duplicates, and assigns distinct colours', () => {
    let s = withSubjects('Maths', 'maths', '  ', 'Physics');
    assert.deepEqual(s.subjects.map(x => x.name), ['Maths', 'Physics']);
    assert.notEqual(s.subjects[0].color, s.subjects[1].color);
});

test('removeSubject clears cells that used it', () => {
    let s = withSubjects('Maths');
    s = setCell(s, 'd_mon', 's_1', { subjectId: subjectId(s, 'Maths') });
    s = removeSubject(s, subjectId(s, 'Maths'));
    assert.deepEqual(s.cells, {});
});

test('merge and split a double period', () => {
    let s = withSubjects('Lab');
    s = setCell(s, 'd_mon', 's_1', { subjectId: subjectId(s, 'Lab') });
    s = mergeCellRight(s, 'd_mon', 's_1');
    assert.equal(s.cells[cellKey('d_mon', 's_1')].span, 2);
    assert.deepEqual(findCoveringCell(s, 'd_mon', 's_2'), { dayId: 'd_mon', slotId: 's_1' });
    s = splitCell(s, 'd_mon', 's_1');
    assert.equal(s.cells[cellKey('d_mon', 's_1')].span, 1);
    assert.equal(findCoveringCell(s, 'd_mon', 's_2'), null);
});

test('merge is refused when the next slot holds a different subject', () => {
    let s = withSubjects('A', 'B');
    s = setCell(s, 'd_mon', 's_1', { subjectId: subjectId(s, 'A') });
    s = setCell(s, 'd_mon', 's_2', { subjectId: subjectId(s, 'B') });
    assert.equal(mergeCellRight(s, 'd_mon', 's_1'), s);
});

test('a span never crosses a break', () => {
    let s = withSubjects('A');
    s = setCell(s, 'd_mon', 's_1', { subjectId: subjectId(s, 'A') });
    s = mergeCellRight(s, 'd_mon', 's_1');
    s = updateSlot(s, 's_2', { kind: 'break', label: 'Lunch' });
    assert.equal(s.cells[cellKey('d_mon', 's_1')].span, 1);
});

test('turning a slot into a break removes its cells', () => {
    let s = withSubjects('A');
    s = setCell(s, 'd_tue', 's_3', { subjectId: subjectId(s, 'A') });
    s = updateSlot(s, 's_3', { kind: 'break' });
    assert.deepEqual(s.cells, {});
});

test('removing a slot covered by a double period shrinks it', () => {
    let s = withSubjects('A');
    s = setCell(s, 'd_mon', 's_1', { subjectId: subjectId(s, 'A') });
    s = mergeCellRight(s, 'd_mon', 's_1');
    s = removeSlot(s, 's_2');
    assert.equal(s.cells[cellKey('d_mon', 's_1')].span, 1);
});

test('removing the start of a double period keeps the remainder on the next slot', () => {
    let s = withSubjects('A');
    s = setCell(s, 'd_mon', 's_1', { subjectId: subjectId(s, 'A'), note: 'Lab 2' });
    s = mergeCellRight(s, 'd_mon', 's_1');
    s = removeSlot(s, 's_1');
    assert.deepEqual(s.cells[cellKey('d_mon', 's_2')], { subjectId: subjectId(s, 'A'), note: 'Lab 2', span: 1 });
});

test('swapCells swaps content, and moves into empty cells', () => {
    let s = withSubjects('A', 'B');
    const a = { dayId: 'd_mon', slotId: 's_1' };
    const b = { dayId: 'd_fri', slotId: 's_5' };
    s = setCell(s, a.dayId, a.slotId, { subjectId: subjectId(s, 'A') });
    s = setCell(s, b.dayId, b.slotId, { subjectId: subjectId(s, 'B') });
    s = swapCells(s, a, b);
    assert.equal(s.cells[cellKey(a.dayId, a.slotId)].subjectId, subjectId(s, 'B'));
    assert.equal(s.cells[cellKey(b.dayId, b.slotId)].subjectId, subjectId(s, 'A'));

    const empty = { dayId: 'd_wed', slotId: 's_2' };
    s = swapCells(s, a, empty);
    assert.equal(s.cells[cellKey(a.dayId, a.slotId)], undefined);
    assert.equal(s.cells[cellKey(empty.dayId, empty.slotId)].subjectId, subjectId(s, 'B'));
});

test('a moved double period is clamped instead of overwriting a neighbour', () => {
    let s = withSubjects('A', 'B');
    s = setCell(s, 'd_mon', 's_1', { subjectId: subjectId(s, 'A') });
    s = mergeCellRight(s, 'd_mon', 's_1');
    s = setCell(s, 'd_tue', 's_2', { subjectId: subjectId(s, 'B') });
    s = swapCells(s, { dayId: 'd_mon', slotId: 's_1' }, { dayId: 'd_tue', slotId: 's_1' });
    assert.equal(s.cells[cellKey('d_tue', 's_1')].span, 1);
    assert.equal(s.cells[cellKey('d_tue', 's_2')].subjectId, subjectId(s, 'B'));
});

test('addSlot inserts a break at a position', () => {
    const s = addSlot(createDefaultState(), { kind: 'break', label: 'Lunch' }, 4);
    assert.equal(s.slots[4].kind, 'break');
    assert.equal(s.slots[4].label, 'Lunch');
    assert.equal(s.slots.length, 6);
});
