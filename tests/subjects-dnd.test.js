import assert from 'node:assert/strict';
import { test } from 'node:test';

import { addSubject, createDefaultState } from '../js/state.js';
import { renameSubject, toColorInputValue } from '../js/subjects.js';

function withSubjects(...names) {
    return names.reduce((s, n) => addSubject(s, n), createDefaultState());
}
const sid = (state, name) => state.subjects.find(s => s.name === name).id;

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
