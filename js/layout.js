// Pure layout for the exported image: turns a state and a target size into a
// flat list of boxes with already-fitted text. No DOM or canvas access; text
// is measured through the injected `measureText(text, cssFont) => width`, so
// this runs in Node tests with a fake measurer.
//
// Days are rows, slots are columns (matching the editor). Break slots are one
// box spanning every day row; cells with span > 1 cover adjacent slots.

import { textColorFor } from './color.js';
import { getCell, getSubject } from './state.js';

const BREAK_WEIGHT = 0.5;
const SEARCH_STEPS = 14;

export const fontString = (weight, size, family) => `${weight} ${size}px ${family}`;

// Smallest font allowed in an image of this size; text that can't fit at
// this size is ellipsized instead of shrunk further.
export const minFontSize = (width, height) => Math.max(8, Math.min(width, height) * 0.022);

// Largest size in [min, max] for which fits(size) holds, or min if none does.
function fitSize(min, max, fits) {
    if (max <= min || !fits(min)) return min;
    let lo = min;
    let hi = max;
    for (let i = 0; i < SEARCH_STEPS; i++) {
        const mid = (lo + hi) / 2;
        if (fits(mid)) lo = mid;
        else hi = mid;
    }
    return lo;
}

export function ellipsize(text, font, maxWidth, measureText) {
    if (measureText(text, font) <= maxWidth) return text;
    let end = text.length;
    while (end > 0 && measureText(`${text.slice(0, end)}…`, font) > maxWidth) end--;
    return end > 0 ? `${text.slice(0, end)}…` : '';
}

const slotHeaderText = slot =>
    slot.kind === 'break' && !(slot.start || slot.end)
        ? slot.label
        : [slot.start, slot.end].filter(Boolean).join(' - ');

export function computeLayout(state, target, theme, measureText) {
    const { width, height } = target;
    const safe = { top: 0, right: 0, bottom: 0, left: 0, ...target.safeArea };
    const unit = Math.min(width, height) / 500;
    const pad = Math.round(Math.min(width, height) * 0.04);
    const gap = theme.gap * unit;
    const radius = theme.radius * unit;
    const lineWidth = theme.gridLineWidth * unit;
    const floor = minFontSize(width, height);

    const content = {
        x: safe.left + pad,
        y: safe.top + pad,
        w: Math.max(0, width - safe.left - safe.right - 2 * pad),
        h: Math.max(0, height - safe.top - safe.bottom - 2 * pad),
    };

    const { days, slots } = state;
    const rowH = content.h / (days.length + 1);
    const headerFont = size => fontString(theme.headerWeight, size, theme.fontFamily);
    const cellFont = size => fontString(theme.cellWeight, size, theme.fontFamily);

    // Column widths depend on the header font (the day column is as wide as
    // its longest label), so the header size is fitted first.
    const totalWeight = slots.reduce((sum, s) => sum + (s.kind === 'break' ? BREAK_WEIGHT : 1), 0) || 1;
    const columnsFor = size => {
        const labelW = Math.max(0, ...days.map(d => measureText(d.label, headerFont(size)))) + size * 1.2;
        const dayColW = Math.min(Math.max(labelW, content.w * 0.08), content.w * 0.2);
        const perWeight = (content.w - dayColW) / totalWeight;
        let x = content.x + dayColW;
        const cols = slots.map(s => {
            const w = perWeight * (s.kind === 'break' ? BREAK_WEIGHT : 1);
            const col = { x, w };
            x += w;
            return col;
        });
        return { dayColW, cols };
    };
    const headerFits = size => {
        if (size * 1.3 > rowH - gap) return false;
        const { dayColW, cols } = columnsFor(size);
        const dayFits = days.every(d => measureText(d.label, headerFont(size)) + size <= dayColW - gap);
        const slotFits = slots.every((s, i) => measureText(slotHeaderText(s), headerFont(size)) + size <= cols[i].w - gap);
        return dayFits && slotFits;
    };
    const headerSize = fitSize(floor, rowH * 0.45, headerFits);
    const { dayColW, cols } = columnsFor(headerSize);

    // Cell boxes, before text is fitted.
    const cellBoxes = [];
    days.forEach((day, r) => {
        const y = content.y + rowH * (r + 1);
        for (let i = 0; i < slots.length; i++) {
            if (slots[i].kind !== 'class') continue;
            const cell = getCell(state, day.id, slots[i].id);
            const span = cell ? cell.span : 1;
            const last = cols[i + span - 1];
            cellBoxes.push({ x: cols[i].x, y, w: last.x + last.w - cols[i].x, h: rowH, cell });
            i += span - 1;
        }
    });

    const filled = cellBoxes
        .filter(b => b.cell)
        .map(b => ({ ...b, subject: getSubject(state, b.cell.subjectId) }));
    const cellFits = withNotes => size =>
        filled.every(b => {
            const lines = [b.subject?.name, withNotes ? b.cell.note : ''].filter(Boolean);
            const noteSize = size * 0.8;
            const textH = size * 1.2 + (lines.length > 1 ? noteSize * 1.2 : 0);
            if (textH > (b.h - gap) * 0.9) return false;
            const nameOk = !b.subject || measureText(b.subject.name, cellFont(size)) + size <= b.w - gap;
            const noteOk =
                !withNotes || !b.cell.note || measureText(b.cell.note, cellFont(noteSize)) + size <= b.w - gap;
            return nameOk && noteOk;
        });
    const maxCellSize = rowH * 0.4;
    let showNotes = true;
    let cellSize = fitSize(floor, maxCellSize, cellFits(true));
    if (!cellFits(true)(cellSize)) {
        showNotes = false;
        cellSize = fitSize(floor, maxCellSize, cellFits(false));
    }

    // Build the final boxes.
    const inset = b => ({ x: b.x + gap / 2, y: b.y + gap / 2, w: b.w - gap, h: b.h - gap });
    const stroke = lineWidth > 0 ? { color: theme.gridLine, width: lineWidth } : null;
    const line = (text, weight, size, maxW) => {
        const font = fontString(weight, size, theme.fontFamily);
        return { text: ellipsize(text, font, maxW, measureText), font, size };
    };
    const items = [];
    const push = (kind, box, fill, textColor, lines) => {
        const b = inset(box);
        items.push({ kind, ...b, fill, radius, stroke, textColor, lines: lines.filter(l => l.text) });
    };

    const hw = theme.headerWeight;
    const cw = theme.cellWeight;
    push('corner', { x: content.x, y: content.y, w: dayColW, h: rowH }, theme.headerBg, theme.headerText, []);
    slots.forEach((slot, i) => {
        const box = { x: cols[i].x, y: content.y, w: cols[i].w, h: rowH };
        push('header', box, theme.headerBg, theme.headerText, [line(slotHeaderText(slot), hw, headerSize, box.w - gap - headerSize)]);
        if (slot.kind === 'break') {
            const body = { x: cols[i].x, y: content.y + rowH, w: cols[i].w, h: rowH * days.length };
            push('break', body, theme.breakBg, theme.breakText, [line(slot.label, cw, cellSize, body.w - gap - cellSize)]);
        }
    });
    days.forEach((day, r) => {
        const box = { x: content.x, y: content.y + rowH * (r + 1), w: dayColW, h: rowH };
        push('day', box, theme.headerBg, theme.headerText, [line(day.label, hw, headerSize, box.w - gap - headerSize)]);
    });
    for (const b of cellBoxes) {
        const subject = b.cell ? getSubject(state, b.cell.subjectId) : null;
        const fill = subject ? subject.color : theme.cellBg;
        const textColor = subject ? textColorFor(subject.color) : theme.cellText;
        const maxW = b.w - gap - cellSize;
        const lines = [];
        if (subject) lines.push(line(subject.name, cw, cellSize, maxW));
        if (b.cell && b.cell.note && showNotes) lines.push(line(b.cell.note, cw, cellSize * 0.8, maxW));
        push('cell', b, fill, textColor, lines);
    }

    return {
        width,
        height,
        background: theme.background,
        items,
        meta: { headerSize, cellSize, showNotes, floor, content },
    };
}
