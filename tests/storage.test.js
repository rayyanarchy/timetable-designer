import assert from 'node:assert/strict';
import { test } from 'node:test';

import { addSubject, createDefaultState, setCell } from '../js/state.js';
import { validateState } from '../js/storage.js';

function withSubjects(...names) {
    return names.reduce((s, n) => addSubject(s, n), createDefaultState());
}
const subjectId = (state, name) => state.subjects.find(s => s.name === name).id;

test('validateState round-trips a saved state', () => {
    let s = withSubjects('A');
    s = setCell(s, 'd_mon', 's_1', { subjectId: subjectId(s, 'A'), note: 'Room 4' });
    assert.deepEqual(validateState(JSON.parse(JSON.stringify(s))), s);
});

test('validateState rejects data that is not a timetable', () => {
    assert.throws(() => validateState(null), /Not a timetable/);
    assert.throws(() => validateState({ version: 99 }), /version/);
    assert.throws(() => validateState({ ...createDefaultState(), days: 'nope' }), /days/);
});

test('validateState drops cells pointing at unknown days, slots or subjects', () => {
    const s = createDefaultState();
    s.cells = {
        'd_nope:s_1': { subjectId: null, note: 'x', span: 1 },
        'd_mon:s_1': { subjectId: 'sub_missing', note: '', span: 1 },
        'd_mon:s_2': { subjectId: null, note: 'kept', span: 1 },
    };
    assert.deepEqual(Object.keys(validateState(s).cells), ['d_mon:s_2']);
});
