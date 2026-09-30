import assert from 'node:assert/strict';
import { test } from 'node:test';

import { SUBJECT_PALETTE, contrastRatio, relativeLuminance } from '../js/color.js';
import { computeLayout } from '../js/layout.js';
import { addSubject, createDefaultState, setCell } from '../js/state.js';
import { THEMES, subjectAppearance } from '../js/themes.js';

const contrast = (a, b) => contrastRatio(relativeLuminance(a), relativeLuminance(b));
const fakeMeasure = (text, font) => text.length * parseFloat(font.match(/([\d.]+)px/)[1]) * 0.6;

for (const theme of Object.values(THEMES)) {
    test(`${theme.name}: every palette colour gives readable subject text`, () => {
        for (const color of SUBJECT_PALETTE) {
            const look = subjectAppearance(theme, color);
            assert.ok(contrast(look.text, look.fill) >= 4.5, `${color}: ${look.text} on ${look.fill}`);
        }
    });

    test(`${theme.name}: day and time labels are readable on the background`, () => {
        assert.ok(contrast(theme.headerText, theme.background) >= 7);
        assert.ok(contrast(theme.timeText, theme.background) >= 3);
    });

    test(`${theme.name}: a filled timetable stays inside a Medium widget`, () => {
        let s = addSubject(createDefaultState(), 'Maths');
        s = setCell(s, 'd_mon', 's_1', { subjectId: s.subjects[0].id, note: 'Room 4' });
        const target = { width: 1014, height: 474, scale: 3 };
        const layout = computeLayout(s, target, theme, fakeMeasure);
        for (const item of layout.items) {
            assert.ok(item.x >= 0 && item.y >= 0 && item.x + item.w <= target.width && item.y + item.h <= target.height);
        }
        const cell = layout.items.find(i => i.dayId === 'd_mon' && i.slotId === 's_1');
        if (theme.subjectStyle === 'dot') assert.equal(cell.lines[0].dot, s.subjects[0].color);
    });
}
