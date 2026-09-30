import assert from 'node:assert/strict';
import { test } from 'node:test';

import { HISTORY_LIMIT, createHistory, record, redo, undo } from '../js/history.js';

test('undo and redo walk back and forth through recorded states', () => {
    let h = createHistory();
    h = record(h, 'a');
    h = record(h, 'b');
    let r = undo(h, 'c');
    assert.equal(r.state, 'b');
    r = undo(r.history, r.state);
    assert.equal(r.state, 'a');
    assert.equal(undo(r.history, r.state), null);
    r = redo(r.history, r.state);
    assert.equal(r.state, 'b');
    r = redo(r.history, r.state);
    assert.equal(r.state, 'c');
    assert.equal(redo(r.history, r.state), null);
});

test('a new change clears redo', () => {
    let h = record(createHistory(), 'a');
    const r = undo(h, 'b');
    h = record(r.history, r.state);
    assert.deepEqual(h.future, []);
});

test('history keeps at most HISTORY_LIMIT states', () => {
    let h = createHistory();
    for (let i = 0; i < HISTORY_LIMIT + 20; i++) h = record(h, i);
    assert.equal(h.past.length, HISTORY_LIMIT);
    assert.equal(h.past[0], 20);
});
