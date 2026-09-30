import assert from 'node:assert/strict';
import { test } from 'node:test';

import { breakBodyText, computeLayout, dayLabelVariants, minFontSize, slotLabelVariants } from '../js/layout.js';
import {
    addSlot, addSubject, createDefaultState, findCoveringCell, mergeCellRight, renameDay, setCell,
} from '../js/state.js';
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

// A long day (9 slots incl. a break) so portrait targets are transposed.
function longDayState() {
    let s = sampleState();
    for (let i = 0; i < 3; i++) s = addSlot(s, { start: '4:05', end: '5:00' });
    const [maths, physics] = s.subjects.map(x => x.id);
    s.days.forEach((day, r) => s.slots.forEach((slot, i) => {
        if (slot.kind === 'class' && !findCoveringCell(s, day.id, slot.id) && (r + i) % 2) {
            s = setCell(s, day.id, slot.id, { subjectId: (r + i) % 4 === 1 ? maths : physics });
        }
    }));
    return s;
}

const sizes = [
    { width: 2028, height: 948 },
    { width: 510, height: 510 },
    { width: 474, height: 474 },
    { width: 1179, height: 2556, safeArea: { top: 700, bottom: 300 } },
    { width: 1206, height: 2622, safeArea: { top: 840, right: 30, bottom: 330, left: 30 } },
];
const states = { sample: sampleState, 'long day': longDayState };

for (const target of sizes) for (const [name, makeState] of Object.entries(states)) {
    test(`every box stays inside ${target.width}×${target.height} minus safe areas (${name})`, () => {
        const layout = computeLayout(makeState(), target, theme, fakeMeasure);
        const safe = { top: 0, right: 0, bottom: 0, left: 0, ...target.safeArea };
        for (const item of layout.items) {
            assert.ok(item.x >= safe.left - 0.01, `${item.kind} left`);
            assert.ok(item.y >= safe.top - 0.01, `${item.kind} top`);
            assert.ok(item.x + item.w <= target.width - safe.right + 0.01, `${item.kind} right`);
            assert.ok(item.y + item.h <= target.height - safe.bottom + 0.01, `${item.kind} bottom`);
        }
    });

    test(`fonts never go below the floor at ${target.width}×${target.height} (${name})`, () => {
        const layout = computeLayout(makeState(), target, theme, fakeMeasure);
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

// ---------------------------------------------------------------- orientation

const portrait = sizes[4];

test('a wide target keeps days as rows', () => {
    assert.equal(computeLayout(longDayState(), sizes[0], theme, fakeMeasure).meta.orientation, 'rows');
});

test('a tall target with a long day turns days into columns for larger text', () => {
    const layout = computeLayout(longDayState(), portrait, theme, fakeMeasure);
    assert.equal(layout.meta.orientation, 'columns');
    const rowsOnly = computeLayout(longDayState(), { ...portrait, width: portrait.height, height: portrait.width }, theme, fakeMeasure);
    assert.equal(rowsOnly.meta.orientation, 'rows');
    const days = layout.items.filter(i => i.kind === 'day');
    // Day labels run across the top, in one row.
    assert.ok(days.every(d => Math.abs(d.y - days[0].y) < 0.01));
    assert.ok(days.every((d, i) => i === 0 || d.x > days[i - 1].x));
});

test('in columns, a double period is one box twice as tall as a single cell', () => {
    const layout = computeLayout(longDayState(), portrait, theme, fakeMeasure);
    assert.equal(layout.meta.orientation, 'columns');
    // Cells are listed day by day: Monday's first box is the Mon 8:20 double.
    const [double, next] = layout.items.filter(i => i.kind === 'cell');
    assert.equal(double.lines[0].text.slice(0, 4), 'Math');
    const monday = layout.items.find(i => i.kind === 'day');
    assert.ok(Math.abs(double.x - monday.x) < 0.01 && Math.abs(next.x - monday.x) < 0.01);
    assert.ok(Math.abs(double.h - 2 * next.h) < 1);
    assert.ok(Math.abs(double.w - next.w) < 0.01);
    assert.ok(Math.abs(next.y - (double.y + double.h)) < 0.01, 'the next slot starts below the double period');
});

test('in columns, a break is one box spanning every day column', () => {
    const state = longDayState();
    const layout = computeLayout(state, portrait, theme, fakeMeasure);
    const breaks = layout.items.filter(i => i.kind === 'break');
    assert.equal(breaks.length, 1);
    const days = layout.items.filter(i => i.kind === 'day');
    assert.ok(Math.abs(breaks[0].x - days[0].x) < 0.01);
    assert.ok(Math.abs(breaks[0].w - days[0].w * state.days.length) < 1);
    const header = layout.items.filter(i => i.kind === 'header');
    assert.equal(header.length, state.slots.length);
    assert.ok(header.every(h => Math.abs(h.x - header[0].x) < 0.01), 'slot labels form the left column');
});

// ---------------------------------------------------------------- labels

test('label variants shorten days and times', () => {
    assert.deepEqual(dayLabelVariants('MON'), ['MON', 'Mo', 'M']);
    assert.deepEqual(dayLabelVariants('Wednesday'), ['Wednesday', 'Wed', 'We', 'W']);
    assert.deepEqual(dayLabelVariants('D1'), ['D1', 'D']);
    assert.deepEqual(slotLabelVariants({ kind: 'class', start: '8:20', end: '9:20', label: '' }), ['8:20 - 9:20', '8:20']);
    assert.deepEqual(slotLabelVariants({ kind: 'break', start: '', end: '', label: 'Lunch' }), ['']);
    assert.deepEqual(slotLabelVariants({ kind: 'break', start: '12:35', end: '1:20', label: 'Lunch' }), ['12:35 - 1:20', '12:35']);
    assert.deepEqual(slotLabelVariants({ kind: 'class', start: '', end: '', label: '' }), ['']);
});

const labels = (layout, kind) => layout.items.filter(i => i.kind === kind).map(i => i.lines[0]?.text ?? '');

test('a large widget keeps full day and time labels', () => {
    const layout = computeLayout(sampleState(), sizes[0], theme, fakeMeasure);
    assert.deepEqual(labels(layout, 'day'), ['MON', 'TUE', 'WED', 'THU', 'FRI']);
    assert.ok(labels(layout, 'header').includes('8:20 - 9:20'));
});

test('a small widget shortens time labels to the start time instead of ellipsizing', () => {
    const layout = computeLayout(sampleState(), sizes[2], theme, fakeMeasure);
    const headers = labels(layout, 'header');
    assert.ok(headers.includes('8:20'));
    assert.ok(headers.every(h => !h.includes(' - ') && !h.includes('…')), headers.join(','));
});

test('long day names are shortened when they would crowd the grid', () => {
    let s = sampleState();
    ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'].forEach((label, i) => { s = renameDay(s, s.days[i].id, label); });
    assert.deepEqual(labels(computeLayout(s, sizes[0], theme, fakeMeasure), 'day'), ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']);
    const small = labels(computeLayout(s, sizes[2], theme, fakeMeasure), 'day');
    assert.deepEqual(small, ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']);
});

test('break headers show times and the break body shows its label, or "Break"', () => {
    let s = addSlot(sampleState(), { kind: 'break', label: '', start: '10:20', end: '10:35' }, 2);
    const layout = computeLayout(s, sizes[0], theme, fakeMeasure);
    // Break columns are narrow, so their text may be ellipsized.
    const bodies = layout.items.filter(i => i.kind === 'break').map(i => i.lines[0]?.text.replace('…', ''));
    assert.equal(bodies.length, 2);
    assert.ok('Break'.startsWith(bodies[0]) && bodies[0].length > 0, bodies[0]);
    assert.ok('Lunch'.startsWith(bodies[1]) && bodies[1].length > 0, bodies[1]);
    const headers = labels(layout, 'header');
    assert.ok(!headers.includes('Lunch'), headers.join(','));
    assert.ok(headers.some(h => h.startsWith('10:20')), headers.join(','));
    assert.equal(breakBodyText({ label: '  ' }), 'Break');
});
