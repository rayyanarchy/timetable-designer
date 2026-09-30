// Pure layout for the exported image: turns a state and a target size into a
// flat list of boxes with already-fitted text. No DOM or canvas access; text
// is measured through the injected `measureText(text, cssFont) => width`, so
// this runs in Node tests with a fake measurer.
//
// The full week is always shown. Two orientations are possible:
//   'rows'    – days are rows, slots are columns (matching the editor);
//   'columns' – days are columns, slots are rows (tried for portrait targets).
// Day and time labels may be shortened (MON → Mo → M, "8:20 - 9:20" → "8:20")
// when that buys noticeably larger text. Every candidate is laid out and the
// best one is kept (see chooseLabels / computeLayout).
//
// Break slots are one box spanning every day; cells with span > 1 cover
// adjacent slots. Both work in either orientation.

import { textColorFor } from './color.js';
import { getCell, getSubject } from './state.js';

const BREAK_WEIGHT = 0.5;
const SEARCH_STEPS = 14;
const LABEL_COL_MIN = 0.08; // share of the content width for the label column
const LABEL_COL_MAX = 0.2;
// A shorter label is only used when the less-shortened one loses more than
// this share of the achievable text size.
const SHORTEN_TOLERANCE = 0.9;
const HEADER_RATIO = 0.6;
const RAW_MIN = 1;

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

// ---------------------------------------------------------------- labels

// Progressively shorter forms of a day label, longest first:
// 'MON' → ['MON', 'Mo', 'M'], 'Monday' → ['Monday', 'Mon', 'Mo', 'M'].
export function dayLabelVariants(label) {
    const text = label.trim();
    const allCaps = text === text.toUpperCase() && text !== text.toLowerCase();
    const two = allCaps && text.length > 2 ? text[0] + text[1].toLowerCase() : text.slice(0, 2);
    const variants = [text];
    for (const v of [text.slice(0, 3), two, text.slice(0, 1)]) {
        if (v && v.length < variants[variants.length - 1].length) variants.push(v);
    }
    return variants;
}

// Header text for a slot, longest first: ['8:20 - 9:20', '8:20']. Headers
// only show times (as in the editor); a slot without times has a blank header.
export function slotLabelVariants(slot) {
    const times = [slot.start, slot.end].filter(Boolean);
    if (!times.length) return [''];
    return times.length > 1 ? [times.join(' - '), times[0]] : [times[0]];
}

// Text shown inside a break, falling back to 'Break' like the editor does.
export const breakBodyText = slot => slot.label.trim() || 'Break';

const pick = (variants, level) => variants[Math.min(level, variants.length - 1)];

// ---------------------------------------------------------------- geometry

const sum = list => list.reduce((a, b) => a + b, 0);

// Lays weighted items end to end from `start`; returns [{ start, size }].
function runs(start, unit, weights) {
    let pos = start;
    return weights.map(w => {
        const run = { start: pos, size: unit * w };
        pos += run.size;
        return run;
    });
}

// Lays out one candidate: an orientation plus a shortening level for day and
// slot labels. Returns the fitted font sizes and every box, without text.
function plan(ctx, transposed, dayLevel, slotLevel) {
    const { state, content, gap, floor, measureText, headerFont, cellFont } = ctx;
    const { days, slots } = state;
    const dayTexts = days.map(d => pick(dayLabelVariants(d.label), dayLevel));
    const slotTexts = slots.map(s => pick(slotLabelVariants(s), slotLevel));
    const slotWeights = slots.map(s => (s.kind === 'break' ? BREAK_WEIGHT : 1));
    const dayWeights = days.map(() => 1);

    // "across" runs left to right below the header row; "down" runs top to
    // bottom right of the label column.
    const across = transposed ? { texts: dayTexts, weights: dayWeights } : { texts: slotTexts, weights: slotWeights };
    const down = transposed ? { texts: slotTexts, weights: slotWeights } : { texts: dayTexts, weights: dayWeights };

    // The header row is as tall as one full-weight item in the down direction.
    const unit = content.h / (1 + (sum(down.weights) || 1));
    const downRuns = runs(content.y + unit, unit, down.weights);

    const labelColFor = size => {
        const widest = Math.max(0, ...down.texts.map(t => measureText(t, headerFont(size))));
        return Math.min(Math.max(widest + size * 1.2, content.w * LABEL_COL_MIN), content.w * LABEL_COL_MAX);
    };
    const acrossRunsFor = labelW =>
        runs(content.x + labelW, (content.w - labelW) / (sum(across.weights) || 1), across.weights);

    const headerFits = size => {
        if (size * 1.3 > unit - gap) return false;
        const labelW = labelColFor(size);
        const acrossRuns = acrossRunsFor(labelW);
        const topOk = across.texts.every((t, i) => measureText(t, headerFont(size)) + size <= acrossRuns[i].size - gap);
        const sideOk = down.texts.every(
            (t, i) =>
                !t || (measureText(t, headerFont(size)) + size <= labelW - gap && size * 1.3 <= downRuns[i].size - gap),
        );
        return topOk && sideOk;
    };
    // Raw sizes ignore the floor; they measure how much room a candidate has
    // even when its text ends up clamped to the floor and ellipsized.
    const rawHeaderSize = fitSize(RAW_MIN, unit * 0.45, headerFits);
    const headerSize = Math.max(floor, rawHeaderSize);
    const labelW = labelColFor(headerSize);
    const acrossRuns = acrossRunsFor(labelW);

    const dayRuns = transposed ? acrossRuns : downRuns;
    const slotRuns = transposed ? downRuns : acrossRuns;
    // A box covering one day run and the slot runs from..to (inclusive).
    const rect = (dayRun, from, to) => {
        const s = { start: slotRuns[from].start, size: slotRuns[to].start + slotRuns[to].size - slotRuns[from].start };
        return transposed
            ? { x: dayRun.start, y: s.start, w: dayRun.size, h: s.size }
            : { x: s.start, y: dayRun.start, w: s.size, h: dayRun.size };
    };
    const headerBand = run =>
        transposed
            ? { x: content.x, y: run.start, w: labelW, h: run.size }
            : { x: run.start, y: content.y, w: run.size, h: unit };
    const dayBand = run =>
        transposed
            ? { x: run.start, y: content.y, w: run.size, h: unit }
            : { x: content.x, y: run.start, w: labelW, h: run.size };

    const corner = { x: content.x, y: content.y, w: labelW, h: unit };
    const slotHeaders = slots.map((slot, i) => ({ slot, text: slotTexts[i], box: headerBand(slotRuns[i]) }));
    const dayHeaders = days.map((day, r) => ({ text: dayTexts[r], box: dayBand(dayRuns[r]) }));
    const allDays = days.length
        ? { start: dayRuns[0].start, size: sum(dayRuns.map(r => r.size)) }
        : { start: transposed ? content.x + labelW : content.y + unit, size: 0 };
    const breaks = slots
        .map((slot, i) => (slot.kind === 'break' ? { slot, box: rect(allDays, i, i) } : null))
        .filter(Boolean);

    const cellBoxes = [];
    days.forEach((day, r) => {
        for (let i = 0; i < slots.length; i++) {
            if (slots[i].kind !== 'class') continue;
            const cell = getCell(state, day.id, slots[i].id);
            const span = cell ? cell.span : 1;
            cellBoxes.push({ ...rect(dayRuns[r], i, i + span - 1), cell });
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
    const maxCellSize = unit * 0.4;
    const rawCellSize = fitSize(RAW_MIN, maxCellSize, cellFits(false));
    let showNotes = true;
    let cellSize = fitSize(floor, maxCellSize, cellFits(true));
    if (!cellFits(true)(cellSize)) {
        showNotes = false;
        cellSize = fitSize(floor, maxCellSize, cellFits(false));
    }

    return {
        orientation: transposed ? 'columns' : 'rows',
        dayLevel,
        slotLevel,
        headerSize,
        floor,
        rawHeaderSize,
        rawCellSize,
        cellSize,
        showNotes,
        corner,
        slotHeaders,
        dayHeaders,
        breaks,
        cellBoxes,
    };
}

// How good a candidate's text is: the (unclamped) subject-name font, limited
// by the header font, which may shrink to HEADER_RATIO × the cell font without
// penalty.
// Headers that only fit below the floor get ellipsized, so they count double
// against the candidate.
const textScore = p => {
    const header = p.rawHeaderSize >= p.floor ? p.rawHeaderSize / HEADER_RATIO : p.rawHeaderSize / 2;
    return Math.min(header, p.rawCellSize);
};

// Among one orientation's candidates, the least-shortened one whose score is
// within SHORTEN_TOLERANCE of the best. Day labels are shortened before times.
function chooseLabels(candidates) {
    const best = Math.max(...candidates.map(textScore));
    const ok = candidates.filter(p => textScore(p) >= best * SHORTEN_TOLERANCE);
    ok.sort((a, b) => a.dayLevel + a.slotLevel - (b.dayLevel + b.slotLevel) || a.slotLevel - b.slotLevel);
    return ok[0];
}

// Orientation: whichever gives the bigger cell font. Raw sizes are compared so
// that, when both are clamped to the floor, the one needing less ellipsis
// wins; headers count only when they are the bottleneck (see textScore).
// Ties keep the editor's days-as-rows orientation.

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

    const ctx = {
        state,
        content,
        gap,
        floor,
        measureText,
        headerFont: size => fontString(theme.headerWeight, size, theme.fontFamily),
        cellFont: size => fontString(theme.cellWeight, size, theme.fontFamily),
    };
    const dayLevels = Math.max(1, ...state.days.map(d => dayLabelVariants(d.label).length));
    const slotLevels = Math.max(1, ...state.slots.map(s => slotLabelVariants(s).length));
    const bestFor = transposed => {
        const candidates = [];
        for (let d = 0; d < dayLevels; d++) for (let s = 0; s < slotLevels; s++) candidates.push(plan(ctx, transposed, d, s));
        return chooseLabels(candidates);
    };
    let chosen = bestFor(false);
    if (content.h > content.w) {
        const columns = bestFor(true);
        if (textScore(columns) > textScore(chosen) * 1.01) chosen = columns;
    }
    const { headerSize, cellSize, showNotes } = chosen;

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
    push('corner', chosen.corner, theme.headerBg, theme.headerText, []);
    for (const { text, box } of chosen.slotHeaders) {
        push('header', box, theme.headerBg, theme.headerText, [line(text, hw, headerSize, box.w - gap - headerSize)]);
    }
    for (const { slot, box } of chosen.breaks) {
        const text = breakBodyText(slot);
        push('break', box, theme.breakBg, theme.breakText, [line(text, cw, cellSize, box.w - gap - cellSize)]);
    }
    for (const { text, box } of chosen.dayHeaders) {
        push('day', box, theme.headerBg, theme.headerText, [line(text, hw, headerSize, box.w - gap - headerSize)]);
    }
    for (const b of chosen.cellBoxes) {
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
        meta: {
            headerSize,
            cellSize,
            showNotes,
            floor,
            content,
            orientation: chosen.orientation,
            dayLabelLevel: chosen.dayLevel,
            slotLabelLevel: chosen.slotLevel,
        },
    };
}
