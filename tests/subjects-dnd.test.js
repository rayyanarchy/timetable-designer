import assert from 'node:assert/strict';
import { test } from 'node:test';

import { applyDrop, edgeScrollDelta } from '../js/dnd.js';
import { addSlot, addSubject, cellKey, createDefaultState, removeSubject, setCell } from '../js/state.js';
import { isSubjectUsed, renameSubject, restoreSubject, toColorInputValue } from '../js/subjects.js';

function withSubjects(...names) {
    return names.reduce((s, n) => addSubject(s, n), createDefaultState());
}
const sid = (state, name) => state.subjects.find(s => s.name === name).id;
const at = (dayId, slotId) => ({ dayId, slotId });

// ---------------------------------------------------------------- applyDrop

test('dropping a subject chip on a cell fills it, keeping the note and span', () => {
    let s = withSubjects('Maths', 'Art');
    s = setCell(s, 'd_mon', 's_1', { note: 'Room 4', span: 2 });
    const next = applyDrop(s, { type: 'subject', subjectId: sid(s, 'Art') }, at('d_mon', 's_1'));
    assert.deepEqual(next.cells[cellKey('d_mon', 's_1')], { subjectId: sid(s, 'Art'), note: 'Room 4', span: 2 });
});

test('dropping the same subject on a cell that already has it is a no-op', () => {
    let s = withSubjects('Maths');
    s = setCell(s, 'd_mon', 's_1', { subjectId: sid(s, 'Maths') });
    assert.equal(applyDrop(s, { type: 'subject', subjectId: sid(s, 'Maths') }, at('d_mon', 's_1')), s);
});

test('dropping an unknown subject or onto an unknown position does nothing', () => {
    const s = withSubjects('Maths');
    assert.equal(applyDrop(s, { type: 'subject', subjectId: 'nope' }, at('d_mon', 's_1')), s);
    assert.equal(applyDrop(s, { type: 'subject', subjectId: sid(s, 'Maths') }, at('d_xxx', 's_1')), s);
    assert.equal(applyDrop(s, { type: 'subject', subjectId: sid(s, 'Maths') }, at('d_mon', 's_x')), s);
});

test('dropping onto a break slot does nothing', () => {
    let s = addSlot(withSubjects('Maths'), { kind: 'break' }, 2);
    const breakId = s.slots[2].id;
    assert.equal(applyDrop(s, { type: 'subject', subjectId: sid(s, 'Maths') }, at('d_mon', breakId)), s);
});

test('dropping onto a position covered by another double period does nothing', () => {
    let s = withSubjects('Maths', 'Art');
    s = setCell(s, 'd_mon', 's_1', { subjectId: sid(s, 'Maths'), span: 2 });
    assert.equal(applyDrop(s, { type: 'subject', subjectId: sid(s, 'Art') }, at('d_mon', 's_2')), s);
});

test('dragging a cell onto a filled cell swaps them', () => {
    let s = withSubjects('Maths', 'Art');
    s = setCell(s, 'd_mon', 's_1', { subjectId: sid(s, 'Maths') });
    s = setCell(s, 'd_tue', 's_3', { subjectId: sid(s, 'Art'), note: 'Studio' });
    const next = applyDrop(s, { type: 'cell', ...at('d_mon', 's_1') }, at('d_tue', 's_3'));
    assert.equal(next.cells[cellKey('d_mon', 's_1')].subjectId, sid(s, 'Art'));
    assert.equal(next.cells[cellKey('d_mon', 's_1')].note, 'Studio');
    assert.equal(next.cells[cellKey('d_tue', 's_3')].subjectId, sid(s, 'Maths'));
});

test('dragging a cell onto an empty cell moves it, span included', () => {
    let s = withSubjects('Maths');
    s = setCell(s, 'd_mon', 's_1', { subjectId: sid(s, 'Maths'), span: 2 });
    const next = applyDrop(s, { type: 'cell', ...at('d_mon', 's_1') }, at('d_wed', 's_3'));
    assert.equal(next.cells[cellKey('d_mon', 's_1')], undefined);
    assert.deepEqual(next.cells[cellKey('d_wed', 's_3')], { subjectId: sid(s, 'Maths'), note: '', span: 2 });
});

test('a double period can move into the slot its own span covers', () => {
    let s = withSubjects('Maths');
    s = setCell(s, 'd_mon', 's_1', { subjectId: sid(s, 'Maths'), span: 2 });
    const next = applyDrop(s, { type: 'cell', ...at('d_mon', 's_1') }, at('d_mon', 's_2'));
    assert.equal(next.cells[cellKey('d_mon', 's_1')], undefined);
    assert.equal(next.cells[cellKey('d_mon', 's_2')].span, 2);
});

test('dragging a cell onto itself, or an empty source, does nothing', () => {
    let s = withSubjects('Maths');
    s = setCell(s, 'd_mon', 's_1', { subjectId: sid(s, 'Maths') });
    assert.equal(applyDrop(s, { type: 'cell', ...at('d_mon', 's_1') }, at('d_mon', 's_1')), s);
    assert.equal(applyDrop(s, { type: 'cell', ...at('d_mon', 's_2') }, at('d_mon', 's_3')), s);
    assert.equal(applyDrop(s, null, at('d_mon', 's_3')), s);
    assert.equal(applyDrop(s, { type: 'subject', subjectId: sid(s, 'Maths') }, null), s);
});

// ---------------------------------------------------------------- edgeScrollDelta

test('edgeScrollDelta is zero in the middle and grows towards each edge', () => {
    assert.equal(edgeScrollDelta(500, 0, 1000), 0);
    assert.ok(edgeScrollDelta(40, 0, 1000) < 0);
    assert.ok(edgeScrollDelta(5, 0, 1000) < edgeScrollDelta(40, 0, 1000));
    assert.ok(edgeScrollDelta(960, 0, 1000) > 0);
    assert.ok(edgeScrollDelta(995, 0, 1000) > edgeScrollDelta(960, 0, 1000));
    assert.equal(edgeScrollDelta(-50, 0, 1000), -18); // capped past the edge
    assert.equal(edgeScrollDelta(2000, 0, 1000), 18);
    assert.equal(edgeScrollDelta(50, 0, 0), 0);
});

test('edgeScrollDelta shrinks the edge zone for small areas', () => {
    assert.equal(edgeScrollDelta(50, 0, 90), 0); // zone is 30px, 50 is in the middle
    assert.ok(edgeScrollDelta(10, 0, 90) < 0);
});

// ---------------------------------------------------------------- subjects helpers

test('toColorInputValue normalises to lowercase #rrggbb', () => {
    assert.equal(toColorInputValue('#FF6B6B'), '#ff6b6b');
    assert.equal(toColorInputValue('#AbC'), '#aabbcc');
    assert.equal(toColorInputValue('4dabf7'), '#4dabf7');
    assert.equal(toColorInputValue('red'), '#000000');
    assert.equal(toColorInputValue(undefined), '#000000');
});

test('renameSubject trims and rejects blanks and clashes with other subjects', () => {
    const s = withSubjects('Maths', 'Art');
    const id = sid(s, 'Maths');
    assert.equal(renameSubject(s, id, '  Further Maths ').subjects[0].name, 'Further Maths');
    assert.equal(renameSubject(s, id, 'MATHS').subjects[0].name, 'MATHS'); // own name, new case
    assert.equal(renameSubject(s, id, '   '), s);
    assert.equal(renameSubject(s, id, 'art'), s);
    assert.equal(renameSubject(s, 'nope', 'X'), s);
});

test('isSubjectUsed reports whether any cell refers to the subject', () => {
    let s = withSubjects('Maths', 'Art');
    s = setCell(s, 'd_mon', 's_1', { subjectId: sid(s, 'Maths') });
    assert.equal(isSubjectUsed(s, sid(s, 'Maths')), true);
    assert.equal(isSubjectUsed(s, sid(s, 'Art')), false);
});

test('restoreSubject exactly undoes removeSubject when nothing else changed', () => {
    let s = withSubjects('Maths', 'Art', 'Music');
    s = setCell(s, 'd_mon', 's_1', { subjectId: sid(s, 'Art'), span: 2 });
    s = setCell(s, 'd_tue', 's_4', { subjectId: sid(s, 'Art'), note: 'Studio' });
    s = setCell(s, 'd_wed', 's_2', { subjectId: sid(s, 'Music') });
    const id = sid(s, 'Art');
    assert.deepEqual(restoreSubject(removeSubject(s, id), s, id), s);
});

test('restoreSubject keeps later edits and does not overwrite reused cells', () => {
    let s = withSubjects('Maths', 'Art');
    s = setCell(s, 'd_mon', 's_1', { subjectId: sid(s, 'Art') });
    s = setCell(s, 'd_mon', 's_3', { subjectId: sid(s, 'Art') });
    const id = sid(s, 'Art');
    let after = removeSubject(s, id);
    after = setCell(after, 'd_mon', 's_1', { subjectId: sid(s, 'Maths') }); // reused meanwhile
    after = addSubject(after, 'Chemistry');
    const restored = restoreSubject(after, s, id);
    assert.deepEqual(restored.subjects.map(x => x.name), ['Maths', 'Art', 'Chemistry']);
    assert.equal(restored.cells[cellKey('d_mon', 's_1')].subjectId, sid(s, 'Maths'));
    assert.equal(restored.cells[cellKey('d_mon', 's_3')].subjectId, id);
    assert.equal(restoreSubject(restored, s, id), restored); // already present
});
