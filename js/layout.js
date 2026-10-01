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

import { getCell, getSubject, shortNameFor } from './state.js';
import { subjectAppearance } from './themes.js';

const BREAK_WEIGHT = 0.5;
const SEARCH_STEPS = 14;
const LABEL_COL_MIN = 0.08; // share of the content width for the label column
const LABEL_COL_MAX = 0.2;
// A shorter label is only used when the less-shortened one loses more than
// this share of the achievable text size.
const SHORTEN_TOLERANCE = 0.9;
const RAW_MIN = 1;
// Class names that would be smaller than this many points switch to their
// short name (abbreviation).
const COMFORT_PT = 7;
// The header row is this share of a day row, leaving more room for classes.
const HEADER_ROW = 0.6;

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

// Splits a name over at most two lines at a space, as evenly as possible.
// Returns the lines, or null when even two lines don't fit `maxWidth`.
export function wrapName(name, font, maxWidth, measureText) {
    if (measureText(name, font) <= maxWidth) return [name];
    const words = name.split(' ');
    let best = null;
    for (let i = 1; i < words.length; i++) {
        const lines = [words.slice(0, i).join(' '), words.slice(i).join(' ')];
        const widest = Math.max(...lines.map(l => measureText(l, font)));
        if (widest <= maxWidth && (!best || widest < best.widest)) best = { lines, widest };
    }
    return best ? best.lines : null;
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
    const { state, content, gap, floor, comfortSize, measureText, dayFont, timeFont, cellFont, dotRoom, useShort } = ctx;
    const { days, slots } = state;
    const dayTexts = days.map(d => pick(dayLabelVariants(d.label), dayLevel));
    // Breaks are narrow, so their header only ever shows the start time.
    const slotTexts = slots.map(s => {
        const variants = slotLabelVariants(s);
        return s.kind === 'break' ? variants[variants.length - 1] : pick(variants, slotLevel);
    });
    const slotWeights = slots.map(s => (s.kind === 'break' ? BREAK_WEIGHT : 1));
    const dayWeights = days.map(() => 1);

    // "across" runs left to right below the header row; "down" runs top to
    // bottom right of the label column.
    // Break headers don't limit the label size: they're narrow, and their
    // time is dropped when it doesn't fit (see computeLayout).
    const fitTexts = slotTexts.map((t, i) => (slots[i].kind === 'break' ? '' : t));
    const across = transposed ? { texts: dayTexts, weights: dayWeights } : { texts: fitTexts, weights: slotWeights };
    const down = transposed ? { texts: fitTexts, weights: slotWeights } : { texts: dayTexts, weights: dayWeights };

    // The header row is HEADER_ROW of one full-weight item in the down direction.
    const unit = content.h / (HEADER_ROW + (sum(down.weights) || 1));
    const headerH = unit * HEADER_ROW;
    const downRuns = runs(content.y + headerH, unit, down.weights);

    // Labels down the side and across the top are sized separately, so a
    // long time range doesn't shrink the day names (or the other way round).
    const sideFont = transposed ? timeFont : dayFont;
    const topFont = transposed ? dayFont : timeFont;
    const labelColFor = size => {
        const widest = Math.max(0, ...down.texts.map(t => measureText(t, sideFont(size))));
        return Math.min(Math.max(widest + size * 1.2 + gap, content.w * LABEL_COL_MIN), content.w * LABEL_COL_MAX);
    };
    const acrossRunsFor = labelW =>
        runs(content.x + labelW, (content.w - labelW) / (sum(across.weights) || 1), across.weights);

    const sideFits = size =>
        down.texts.every(
            (t, i) =>
                !t ||
                (measureText(t, sideFont(size)) + size * 1.2 <= content.w * LABEL_COL_MAX - gap &&
                    size * 1.3 <= downRuns[i].size - gap),
        );
    // Raw sizes ignore the floor; they measure how much room a candidate has
    // even when its text ends up clamped to the floor and ellipsized.
    const rawSideSize = fitSize(RAW_MIN, unit * 0.45, sideFits);
    // The label column is as wide as its labels, so the side size is kept
    // near the class text: build once, then again with the side size capped
    // at 0.9 × the class size if that frees room for the classes.
    const build = sideSize => {
        const labelW = labelColFor(sideSize);
        const acrossRuns = acrossRunsFor(labelW);
        const topFits = size =>
            size * 1.3 <= headerH - gap &&
            across.texts.every((t, i) => !t || measureText(t, topFont(size)) + size <= acrossRuns[i].size - gap);
        const rawTopSize = fitSize(RAW_MIN, headerH * 0.6, topFits);
        const topSize = Math.max(floor, rawTopSize);
        const rawHeaderSize = Math.min(rawSideSize, rawTopSize);
        const daySize = transposed ? topSize : sideSize;
        const timeSize = transposed ? sideSize : topSize;

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
                : { x: run.start, y: content.y, w: run.size, h: headerH };
        const dayBand = run =>
            transposed
                ? { x: run.start, y: content.y, w: run.size, h: headerH }
                : { x: content.x, y: run.start, w: labelW, h: run.size };

        const corner = { x: content.x, y: content.y, w: labelW, h: headerH };
        const slotHeaders = slots.map((slot, i) => ({ slot, text: slotTexts[i], box: headerBand(slotRuns[i]) }));
        const dayHeaders = days.map((day, r) => ({ day, text: dayTexts[r], box: dayBand(dayRuns[r]) }));
        const allDays = days.length
            ? { start: dayRuns[0].start, size: sum(dayRuns.map(r => r.size)) }
            : { start: transposed ? content.x + labelW : content.y + headerH, size: 0 };
        const breaks = slots
            .map((slot, i) => (slot.kind === 'break' ? { slot, box: rect(allDays, i, i) } : null))
            .filter(Boolean);

        const cellBoxes = [];
        days.forEach((day, r) => {
            for (let i = 0; i < slots.length; i++) {
                if (slots[i].kind !== 'class') continue;
                const cell = getCell(state, day.id, slots[i].id);
                const span = cell ? cell.span : 1;
                cellBoxes.push({ ...rect(dayRuns[r], i, i + span - 1), cell, dayId: day.id, slotId: slots[i].id, span });
                i += span - 1;
            }
        });

        const filled = cellBoxes
            .filter(b => b.cell)
            .map(b => ({ ...b, subject: getSubject(state, b.cell.subjectId) }));
        // Whether `text` fits box b at `size` (wrapping onto two lines if needed).
        const fitsAs = (b, text, size, withNotes) => {
            const room = (b.h - gap) * 0.9 - (withNotes && b.cell.note ? size * 0.8 * 1.2 : 0);
            const lines = wrapName(text, cellFont(size), b.w - gap - size * (1 + dotRoom), measureText);
            return Boolean(lines) && lines.length * size * 1.2 <= room;
        };
        // With short names allowed, only subjects whose full name can't fit
        // somewhere at a comfortable size (COMFORT_PT) switch to their short name,
        // everywhere they appear; the rest keep their full names.
        const shortSubjects = new Set(
            useShort
                ? filled.filter(b => b.subject && !fitsAs(b, b.subject.name, comfortSize, false)).map(b => b.subject.id)
                : [],
        );
        const shownName = subject => (shortSubjects.has(subject.id) ? shortNameFor(subject) : subject.name);
        const cellFits = withNotes => size =>
            filled.every(b => {
                const noteSize = size * 0.8;
                if (b.subject && !fitsAs(b, shownName(b.subject), size, withNotes)) return false;
                if (!b.subject && size * 1.2 > (b.h - gap) * 0.9 - (withNotes && b.cell.note ? noteSize * 1.2 : 0)) return false;
                const noteOk =
                    !withNotes || !b.cell.note || measureText(b.cell.note, cellFont(noteSize)) + size <= b.w - gap;
                return noteOk;
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
            headerSize: Math.min(daySize, timeSize),
            daySize,
            timeSize,
            floor,
            rawHeaderSize,
            rawCellSize,
            cellSize,
            showNotes,
            shortSubjects,
            corner,
            slotHeaders,
            dayHeaders,
            breaks,
            cellBoxes,
        };
    };
    const first = build(Math.max(floor, rawSideSize));
    const capped = Math.max(floor, Math.min(rawSideSize, first.cellSize * 0.9));
    const side = p => (transposed ? p.timeSize : p.daySize);
    return capped < side(first) ? build(capped) : first;
}

// How good a candidate's text is: the (unclamped) class font. Labels only
// count when they would have to go below the floor (and be ellipsized),
// which scales the score down in proportion.
const textScore = p => (p.rawHeaderSize >= p.floor ? p.rawCellSize : (p.rawCellSize * p.rawHeaderSize) / p.floor);

// Among one orientation's candidates, the least-shortened one whose score is
// within SHORTEN_TOLERANCE of the best. Day labels are shortened before times.
// When even the best candidate has to ellipsize class names, every bit of
// room counts, so the tolerance is dropped.
function chooseLabels(all) {
    // Labels that would need an ellipsis lose to any that don't.
    const clean = all.filter(p => p.rawHeaderSize >= p.floor);
    const candidates = clean.length ? clean : all;
    const scores = candidates.map(textScore);
    const best = Math.max(...scores);
    const bestCandidate = candidates[scores.indexOf(best)];
    const tolerance = bestCandidate.rawCellSize >= bestCandidate.floor ? SHORTEN_TOLERANCE : 0.999;
    const ok = candidates.filter(p => textScore(p) >= best * tolerance);
    ok.sort((a, b) => a.dayLevel + a.slotLevel - (b.dayLevel + b.slotLevel) || a.slotLevel - b.slotLevel);
    return ok[0];
}

// Orientation: whichever gives the bigger cell font. Raw sizes are compared so
// that, when both are clamped to the floor, the one needing less ellipsis
// wins; headers count only when they are the bottleneck (see textScore).
// Ties keep the editor's days-as-rows orientation.

// Sizes are in image pixels; theme metrics (padding, gap, radius) are in
// points and scaled by target.scale (pixels per point, e.g. 3 for an @3x
// iPhone widget). Targets without a scale use one that treats the short side
// as a small widget (~158 pt).
export const pointScale = target => target.scale || Math.min(target.width, target.height) / 158;

// When class names would be cut off or cramped, the layout is done again
// with short names allowed: subjects that don't fit comfortably show their
// short name (abbreviation) and the rest keep their full names.
export function computeLayout(state, target, theme, measureText) {
    const full = layoutTimetable(state, target, theme, measureText, false);
    const cramped = full.meta.namesCut || full.meta.cellSize < full.meta.comfortSize;
    return cramped ? layoutTimetable(state, target, theme, measureText, true) : full;
}

function layoutTimetable(state, target, theme, measureText, useShort) {
    const { width, height } = target;
    const safe = { top: 0, right: 0, bottom: 0, left: 0, ...target.safeArea };
    const pt = pointScale(target);
    const pad = theme.padding * pt;
    const gap = theme.gap * pt;
    const radius = theme.radius * pt;
    const lineWidth = theme.gridLineWidth * pt;
    const floor = minFontSize(width, height);

    const content = {
        x: safe.left + pad,
        y: safe.top + pad,
        w: Math.max(0, width - safe.left - safe.right - 2 * pad),
        h: Math.max(0, height - safe.top - safe.bottom - 2 * pad),
    };

    // In the 'dot' style a coloured dot sits before the subject name.
    const dotRoom = theme.subjectStyle === 'dot' ? 0.9 : 0;
    const ctx = {
        state,
        content,
        gap,
        floor,
        measureText,
        dotRoom,
        useShort,
        comfortSize: Math.max(floor, COMFORT_PT * pt),
        dayFont: size => fontString(theme.headerWeight, size, theme.fontFamily),
        timeFont: size => fontString(theme.timeWeight, size, theme.fontFamily),
        cellFont: size => fontString(theme.cellWeight, size, theme.fontFamily),
    };
    const dayLevels = Math.max(1, ...state.days.map(d => dayLabelVariants(d.label).length));
    const slotLevels = Math.max(1, ...state.slots.map(s => slotLabelVariants(s).length));
    // Shortening must not make two days look alike (TUE/THU → T), unless
    // they already did.
    const labelsAt = d => state.days.map(day => pick(dayLabelVariants(day.label), d).toUpperCase());
    const distinctAt = d => d === 0 || new Set(labelsAt(d)).size === new Set(labelsAt(0)).size;
    const bestFor = transposed => {
        const candidates = [];
        for (let d = 0; d < dayLevels; d++) {
            if (!distinctAt(d)) continue;
            for (let s = 0; s < slotLevels; s++) candidates.push(plan(ctx, transposed, d, s));
        }
        return chooseLabels(candidates);
    };
    let chosen = bestFor(false);
    if (content.h > content.w) {
        const columns = bestFor(true);
        if (textScore(columns) > textScore(chosen) * 1.01) chosen = columns;
    }
    const { cellSize, showNotes } = chosen;
    // Labels never outgrow the classes they describe.
    const daySize = Math.max(floor, Math.min(chosen.daySize, cellSize * 0.9));
    const timeSize = Math.max(floor, Math.min(chosen.timeSize, cellSize * 0.8));
    const headerSize = Math.min(daySize, timeSize);

    // Build the final boxes. Every box keeps the ids of what it shows, so the
    // editor can render the same layout and know what was clicked.
    const inset = b => ({ x: b.x + gap / 2, y: b.y + gap / 2, w: b.w - gap, h: b.h - gap });
    const stroke = lineWidth > 0 ? { color: theme.gridLine, width: lineWidth } : null;
    const line = (text, weight, size, maxW, extra) => {
        const font = fontString(weight, size, theme.fontFamily);
        return { text: ellipsize(text, font, maxW, measureText), font, size, ...extra };
    };
    const items = [];
    const push = (kind, box, fill, textColor, lines, ids = {}, textSize = headerSize) => {
        const b = inset(box);
        items.push({
            kind,
            ...ids,
            ...b,
            fill,
            radius: kind === 'cell' || kind === 'break' ? radius : 0,
            stroke: kind === 'cell' || kind === 'break' ? stroke : null,
            textColor,
            align: theme.align,
            padX: textSize * 0.55,
            lines: lines.filter(l => l.text),
        });
    };

    const hw = theme.headerWeight;
    const cw = theme.cellWeight;
    push('corner', chosen.corner, theme.headerBg, theme.headerText, []);
    for (const { slot, text: full, box } of chosen.slotHeaders) {
        const fits = measureText(full, fontString(theme.timeWeight, timeSize, theme.fontFamily)) + timeSize <= box.w - gap;
        const text = slot.kind === 'break' && !fits ? '' : full;
        push('header', box, theme.headerBg, theme.timeText, [line(text, theme.timeWeight, timeSize, box.w - gap - timeSize)], { slotId: slot.id }, timeSize);
    }
    // A break spanning every day is long and thin; its name runs along it.
    for (const { slot, box } of chosen.breaks) {
        const text = breakBodyText(slot);
        const vertical = box.h > box.w * 1.5;
        const size = vertical ? Math.max(floor, Math.min(cellSize, (box.w - gap) / 1.6)) : cellSize;
        const room = (vertical ? box.h : box.w) - gap - size;
        push('break', box, theme.breakBg, theme.breakText, [line(text, cw, size, room)], { slotId: slot.id, vertical }, size);
    }
    for (const { day, text, box } of chosen.dayHeaders) {
        push('day', box, theme.headerBg, theme.headerText, [line(text, hw, daySize, box.w - gap - daySize)], { dayId: day.id }, daySize);
    }
    let namesCut = false;
    for (const b of chosen.cellBoxes) {
        const subject = b.cell ? getSubject(state, b.cell.subjectId) : null;
        const look = subject ? subjectAppearance(theme, subject.color) : { fill: theme.cellBg, text: theme.cellText };
        const maxW = b.w - gap - cellSize;
        const lines = [];
        if (subject) {
            // Long names wrap onto a second line when the cell is tall enough
            // (the fitting above only picks sizes where that holds);
            // otherwise they stay on one line and are ellipsized.
            const dot = look.dot ? { dot: look.dot } : null;
            const nameW = maxW - (dot ? cellSize * dotRoom : 0);
            const font = fontString(cw, cellSize, theme.fontFamily);
            const noteRoom = b.cell.note && showNotes ? cellSize * 0.8 * 1.2 : 0;
            const asLines = text => {
                const wrapped = wrapName(text, font, nameW, measureText);
                return wrapped && wrapped.length * cellSize * 1.2 + noteRoom <= (b.h - gap) * 0.9 ? wrapped : null;
            };
            const shown = chosen.shortSubjects.has(subject.id) ? shortNameFor(subject) : subject.name;
            let nameLines = asLines(shown);
            if (!nameLines) {
                namesCut = true;
                nameLines = [shown];
            }
            nameLines.forEach((text, i) => lines.push(line(text, cw, cellSize, nameW, i === 0 ? dot : null)));
        }
        if (b.cell && b.cell.note && showNotes) {
            lines.push(line(b.cell.note, theme.noteWeight, cellSize * 0.8, maxW, { color: look.note }));
        }
        push('cell', b, look.fill, look.text, lines, { dayId: b.dayId, slotId: b.slotId, span: b.span }, cellSize);
    }

    return {
        width,
        height,
        background: theme.background,
        items,
        meta: {
            namesCut,
            shortNames: useShort,
            comfortSize: Math.max(floor, COMFORT_PT * pt),
            headerSize,
            daySize,
            timeSize,
            cellSize,
            showNotes,
            floor,
            content,
            pointScale: pt,
            orientation: chosen.orientation,
            dayLabelLevel: chosen.dayLevel,
            slotLabelLevel: chosen.slotLevel,
        },
    };
}
