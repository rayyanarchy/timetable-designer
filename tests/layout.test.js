import assert from 'node:assert/strict';
import { test } from 'node:test';

import { computeLayout, minFontSize } from '../js/layout.js';
import { addSlot, addSubject, createDefaultState, mergeCellRight, setCell } from '../js/state.js';
import { THEMES } from '../js/themes.js';

// Deterministic stand-in for canvas measureText: 0.6em per character.
const fakeMeasure = (text, font) => text.length * parseFloat(font.match(/([\d.]+)px/)[1]) * 0.6;
const theme = THEMES.classic;

function sampleState() {
    let s = addSubject(createDefaultState(), 'Mathematics');
    s = addSubject(s, 'Physics');
    const [maths, physics] = s.subjects.map(x => x.id);
    s = setCell(s, 'd_mon', 's_1', { subjectId: maths, note: 'Room 12' });
    s = mergeCellRight(s, 'd_mon', 's_1');
    s = setCell(s, 'd_wed', 's_4', { subjectId: physics });
    return addSlot(s, { kind: 'break', label: 'Lunch' }, 4);
}

const sizes = [
    { width: 2028, height: 948 },
    { width: 510, height: 510 },
    { width: 1179, height: 2556, safeArea: { top: 700, bottom: 300 } },
];

for (const target of sizes) {
    test(`every box stays inside ${target.width}×${target.height} minus safe areas`, () => {
        const layout = computeLayout(sampleState(), target, theme, fakeMeasure);
        const safe = { top: 0, right: 0, bottom: 0, left: 0, ...target.safeArea };
        for (const item of layout.items) {
            assert.ok(item.x >= safe.left - 0.01, `${item.kind} left`);
            assert.ok(item.y >= safe.top - 0.01, `${item.kind} top`);
            assert.ok(item.x + item.w <= target.width - safe.right + 0.01, `${item.kind} right`);
            assert.ok(item.y + item.h <= target.height - safe.bottom + 0.01, `${item.kind} bottom`);
        }
    });

    test(`fonts never go below the floor at ${target.width}×${target.height}`, () => {
        const layout = computeLayout(sampleState(), target, theme, fakeMeasure);
        const floor = minFontSize(target.width, target.height);
        for (const item of layout.items) for (const line of item.lines) assert.ok(line.size >= floor * 0.8 - 0.01);
    });
}

test('a double period is one box twice as wide as a single cell', () => {
    const layout = computeLayout(sampleState(), sizes[0], theme, fakeMeasure);
    const mon = layout.items.filter(i => i.kind === 'cell' && i.lines[0]?.text === 'Mathematics');
    assert.equal(mon.length, 1);
    const single = layout.items.find(i => i.kind === 'cell' && i.lines[0]?.text === 'Physics');
    assert.ok(Math.abs(mon[0].w - 2 * single.w) < 1);
});

test('a break is one box spanning every day row', () => {
    const state = sampleState();
    const layout = computeLayout(state, sizes[0], theme, fakeMeasure);
    const breaks = layout.items.filter(i => i.kind === 'break');
    assert.equal(breaks.length, 1);
    const day = layout.items.find(i => i.kind === 'day');
    assert.ok(Math.abs(breaks[0].h - day.h * state.days.length) < 1);
});

test('notes are hidden before names shrink below the floor', () => {
    let s = addSubject(createDefaultState(), 'Maths');
    s = setCell(s, 'd_mon', 's_1', { subjectId: s.subjects[0].id, note: 'A very long room and teacher note' });
    const layout = computeLayout(s, { width: 400, height: 200 }, theme, fakeMeasure);
    assert.equal(layout.meta.showNotes, false);
    const cell = layout.items.find(i => i.kind === 'cell' && i.lines.length);
    assert.equal(cell.lines.length, 1);
});
