// The timetable card: the exported image, live and editable. It renders the
// same layout the PNG uses (layout.js), as positioned boxes scaled to fit the
// screen, so what you edit is exactly what you download.
//
// Everything is edited in place: tap a day, a time or a class to open its
// editor; the + buttons beside the card add days and periods.

import { el, icon } from './dom.js';
import { canMergeRight, canSplit } from './grid-rules.js';
import { computeLayout } from './layout.js';
import { closePopover, openPopover } from './popover.js';
import { getKind, resolveExportTarget } from './presets.js';
import { DOT_SIZE, ensureFonts, measureText } from './render-canvas.js';
import {
    addDay, addSlot, addSubject, clearCell, getCell, getSubject, mergeCellRight, moveDay, moveSlot, nextDayLabel,
    removeDay, removeSlot, renameDay, setCell, splitCell, updateSlot,
} from './state.js';
import { getTheme } from './themes.js';
import { showToast } from './toast.js';

// Home Screen widgets have continuous corners of roughly this radius.
const WIDGET_CORNER_PT = 22;
const ADD_BUTTON_ROOM = 48; // px kept free beside the card for the + buttons
const LINE_HEIGHT = 1.2;

const slotTimes = slot => [slot.start, slot.end].filter(Boolean).join(' – ');

export function createCard(area, { getState, update, undo }) {
    const frame = el('div', { class: 'card-frame' });
    const stage = el('div', { class: 'card', role: 'group', 'aria-label': 'Timetable' });
    const addDayButton = el('button', { type: 'button', class: 'card-add', 'aria-label': 'Add day', title: 'Add day' }, [icon('plus', 16)]);
    const addSlotButton = el('button', { type: 'button', class: 'card-add', 'aria-label': 'Add period', title: 'Add period' }, [icon('plus', 16)]);
    frame.append(stage, addDayButton, addSlotButton);
    const caption = el('p', { class: 'card-caption' });
    area.append(frame, caption);

    let layout = null;
    let loadedFonts = new Set();

    // ------------------------------------------------------------ rendering

    function itemNode(item, editable) {
        const lines = item.lines.map(l =>
            el('span', { class: 'tt-line', style: { font: l.font, color: l.color || item.textColor, height: `${l.size * LINE_HEIGHT}px`, lineHeight: `${l.size * LINE_HEIGHT}px` } }, [
                l.dot && el('span', { class: 'tt-dot', style: { background: l.dot, width: `${l.size * DOT_SIZE}px`, height: `${l.size * DOT_SIZE}px`, marginRight: `${l.size * DOT_SIZE}px` } }),
                l.text,
            ]),
        );
        const empty = item.kind === 'cell' && !lines.length;
        const node = el(
            'div',
            {
                class: `tt-item tt-${item.kind} align-${item.align}${empty ? ' is-empty' : ''}`,
                style: {
                    left: `${item.x}px`,
                    top: `${item.y}px`,
                    width: `${item.w}px`,
                    height: `${item.h}px`,
                    background: item.fill,
                    borderRadius: `${item.radius}px`,
                    boxShadow: item.stroke ? `inset 0 0 0 ${item.stroke.width}px ${item.stroke.color}` : null,
                    textAlign: item.align,
                    paddingLeft: item.align === 'left' ? `${item.padX}px` : null,
                    paddingRight: item.align === 'left' ? `${item.padX / 2}px` : null,
                },
                dataset: { day: item.dayId, slot: item.slotId },
            },
            item.vertical
                ? [el('div', { class: 'tt-rotated', style: { width: `${item.h}px`, height: `${item.w}px` } }, lines)]
                : lines,
        );
        if (editable && item.kind !== 'corner') {
            node.tabIndex = 0;
            node.setAttribute('role', 'button');
            node.setAttribute('aria-label', describe(item));
        }
        return node;
    }

    function describe(item) {
        const state = getState();
        const day = state.days.find(d => d.id === item.dayId);
        const slot = state.slots.find(s => s.id === item.slotId);
        if (item.kind === 'day') return `Edit day ${day?.label}`;
        if (item.kind === 'header') return `Edit times ${slotTimes(slot) || ''}`.trim();
        if (item.kind === 'break') return `Edit break ${slot?.label || ''}`.trim();
        const cell = getCell(state, item.dayId, item.slotId);
        const subject = cell && getSubject(state, cell.subjectId);
        return `${day?.label} ${slotTimes(slot)}: ${subject ? subject.name : 'empty'}`;
    }

    function render(state) {
        const target = resolveExportTarget(state);
        const theme = getTheme(state.themeId);
        layout = computeLayout(state, target, theme, measureText);
        const pt = layout.meta.pointScale;

        stage.style.width = `${layout.width}px`;
        stage.style.height = `${layout.height}px`;
        stage.style.background = layout.background;
        stage.style.borderRadius = `${WIDGET_CORNER_PT * pt}px`;
        stage.style.setProperty('--cell-size', `${layout.meta.cellSize}px`);
        stage.style.setProperty('--ring', theme.dark ? 'rgba(255,255,255,.55)' : 'rgba(0,0,0,.35)');
        stage.dataset.tone = theme.dark ? 'dark' : 'light';
        stage.replaceChildren(...layout.items.map(item => itemNode(item, true)));
        fit();

        const kind = target.kind && getKind(target.kind);
        caption.textContent = `${kind ? kind.label : target.label} · ${target.width} × ${target.height}`;

        // Text is measured with whatever font is loaded; once the style's
        // font arrives, lay out again with the real metrics.
        if (!loadedFonts.has(theme.fontFamily)) {
            ensureFonts(theme).then(() => {
                loadedFonts = new Set(loadedFonts).add(theme.fontFamily);
                render(getState());
            });
        }
    }

    function fit() {
        if (!layout) return;
        const top = area.getBoundingClientRect().top + window.scrollY;
        const narrow = window.matchMedia('(max-width: 760px)').matches;
        // On phones the card takes the full width and the + buttons sit on its
        // edges; on desktop they get room beside it.
        const availW = Math.max(160, area.clientWidth - (narrow ? 0 : 2 * ADD_BUTTON_ROOM));
        // Leave room below the card for its caption and the + button.
        const availH = narrow ? Infinity : Math.max(220, window.innerHeight - Math.max(top, 120) - 120);
        const k = Math.min(availW / layout.width, availH / layout.height);
        stage.style.transform = `scale(${k})`;
        stage.style.setProperty('--k', k);
        frame.style.width = `${layout.width * k}px`;
        frame.style.height = `${layout.height * k}px`;
        placeAddButtons(k, narrow);
    }

    // The + buttons sit just outside the card, beside the last day and after
    // the last time, whichever way round the layout is.
    function placeAddButtons(k, narrow) {
        const headers = layout.items.filter(i => i.kind === 'header');
        const days = layout.items.filter(i => i.kind === 'day');
        const corner = layout.items.find(i => i.kind === 'corner');
        const columns = layout.meta.orientation === 'columns';
        const headerRow = corner ? (corner.y + corner.h / 2) * k : 16;
        const labelCol = corner ? (corner.x + corner.w / 2) * k : 16;
        const outside = narrow ? 0 : 12;
        const right = { left: `${layout.width * k + outside}px`, top: `${headerRow}px` };
        const below = { left: `${labelCol}px`, top: `${layout.height * k + outside}px` };
        Object.assign(addSlotButton.style, columns ? below : right);
        Object.assign(addDayButton.style, columns ? right : below);
        addSlotButton.hidden = !headers.length && !corner;
        addDayButton.hidden = !days.length && !corner;
    }

    new ResizeObserver(() => fit()).observe(area);
    window.addEventListener('resize', fit);

    // ------------------------------------------------------------ editors

    // Re-opens an editor after a change re-rendered the card.
    function reopen(kind, ids) {
        const selector = {
            day: `.tt-day[data-day="${ids.dayId}"]`,
            header: `.tt-header[data-slot="${ids.slotId}"]`,
            cell: `.tt-cell[data-day="${ids.dayId}"][data-slot="${ids.slotId}"]`,
        }[kind];
        const node = stage.querySelector(selector);
        if (node) openEditor(node);
    }

    function removeWithUndo(message, fn) {
        closePopover();
        update(fn);
        showToast(message, { action: 'Undo', onAction: undo });
    }

    function openEditor(node) {
        const { day: dayId, slot: slotId } = node.dataset;
        if (node.classList.contains('tt-day')) dayEditor(node, dayId);
        else if (node.classList.contains('tt-header') || node.classList.contains('tt-break')) slotEditor(node, slotId);
        else if (node.classList.contains('tt-cell')) cellEditor(node, dayId, slotId);
    }

    const field = (label, input) => el('label', { class: 'field' }, [el('span', { class: 'field-label', text: label }), input]);
    const iconButton = (name, label, onclick, extra = '') =>
        el('button', { type: 'button', class: `icon-button ${extra}`, 'aria-label': label, title: label, onclick }, [icon(name, 16)]);

    function dayEditor(node, dayId) {
        const state = getState();
        const index = state.days.findIndex(d => d.id === dayId);
        const day = state.days[index];
        if (!day) return;
        const columns = layout.meta.orientation === 'columns';
        const name = el('input', { type: 'text', class: 'input', value: day.label, autofocus: true, 'aria-label': 'Day name' });
        const save = () => {
            const label = name.value.trim();
            if (label && label !== getState().days.find(d => d.id === dayId)?.label) update(s => renameDay(s, dayId, label));
        };
        name.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); closePopover(); } });
        const move = to => () => { save(); update(s => moveDay(s, dayId, to)); reopen('day', { dayId }); };
        const content = el('div', { class: 'editor' }, [
            el('p', { class: 'editor-title', text: 'Day' }),
            name,
            el('div', { class: 'editor-row' }, [
                el('div', { class: 'button-group' }, [
                    iconButton(columns ? 'left' : 'up', 'Move earlier', move(index - 1), index === 0 ? 'is-disabled' : ''),
                    iconButton(columns ? 'right' : 'down', 'Move later', move(index + 1), index === state.days.length - 1 ? 'is-disabled' : ''),
                ]),
                el('button', {
                    type: 'button',
                    class: 'text-button danger',
                    text: 'Remove day',
                    onclick: () => removeWithUndo(`Removed ${day.label}`, s => removeDay(s, dayId)),
                }),
            ]),
        ]);
        openPopover(node, content, { label: `Edit ${day.label}`, onClose: save });
    }

    function slotEditor(node, slotId) {
        const state = getState();
        const index = state.slots.findIndex(s => s.id === slotId);
        const slot = state.slots[index];
        if (!slot) return;
        const columns = layout.meta.orientation === 'columns';
        const start = el('input', { type: 'text', class: 'input', value: slot.start, placeholder: '9:00', inputmode: 'numeric', autofocus: true, 'aria-label': 'Start time' });
        const end = el('input', { type: 'text', class: 'input', value: slot.end, placeholder: '10:00', inputmode: 'numeric', 'aria-label': 'End time' });
        const label = el('input', { type: 'text', class: 'input', value: slot.label, placeholder: 'Lunch', 'aria-label': 'Break name' });
        const values = () => ({ start: start.value.trim(), end: end.value.trim(), ...(slot.kind === 'break' ? { label: label.value.trim() } : {}) });
        const save = () => {
            const current = getState().slots.find(s => s.id === slotId);
            if (!current) return;
            const patch = values();
            if (Object.entries(patch).some(([k, v]) => current[k] !== v)) update(s => updateSlot(s, slotId, patch));
        };
        for (const input of [start, end, label]) {
            input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); closePopover(); } });
        }
        const setKind = kind => () => {
            if (kind === slot.kind) return;
            closePopover();
            update(s => updateSlot(s, slotId, { ...values(), kind, label: kind === 'break' ? label.value.trim() || 'Break' : '' }));
            reopen('header', { slotId });
        };
        const move = to => () => { save(); update(s => moveSlot(s, slotId, to)); reopen('header', { slotId }); };
        const content = el('div', { class: 'editor' }, [
            el('div', { class: 'segmented', role: 'radiogroup', 'aria-label': 'Type' }, [
                el('button', { type: 'button', role: 'radio', 'aria-checked': String(slot.kind === 'class'), text: 'Class', onclick: setKind('class') }),
                el('button', { type: 'button', role: 'radio', 'aria-checked': String(slot.kind === 'break'), text: 'Break', onclick: setKind('break') }),
            ]),
            el('div', { class: 'field-pair' }, [field('Starts', start), field('Ends', end)]),
            slot.kind === 'break' ? field('Name', label) : null,
            el('div', { class: 'editor-row' }, [
                el('div', { class: 'button-group' }, [
                    iconButton(columns ? 'up' : 'left', 'Move earlier', move(index - 1), index === 0 ? 'is-disabled' : ''),
                    iconButton(columns ? 'down' : 'right', 'Move later', move(index + 1), index === state.slots.length - 1 ? 'is-disabled' : ''),
                ]),
                el('button', {
                    type: 'button',
                    class: 'text-button danger',
                    text: slot.kind === 'break' ? 'Remove break' : 'Remove period',
                    onclick: () => removeWithUndo(slot.kind === 'break' ? 'Removed break' : 'Removed period', s => removeSlot(s, slotId)),
                }),
            ]),
        ]);
        openPopover(node, content, { label: 'Edit period', onClose: save });
    }

    function cellEditor(node, dayId, slotId) {
        const state = getState();
        const cell = getCell(state, dayId, slotId);
        const day = state.days.find(d => d.id === dayId);
        const slot = state.slots.find(s => s.id === slotId);
        const note = el('input', { type: 'text', class: 'input', value: cell?.note || '', placeholder: 'Room or teacher', 'aria-label': 'Note' });
        const withNote = s => {
            const value = note.value.trim();
            const current = getCell(s, dayId, slotId);
            return value === (current?.note || '') ? s : setCell(s, dayId, slotId, { note: value });
        };
        const act = fn => () => { closePopover(); update(s => fn(withNote(s))); };
        note.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); closePopover(); } });

        const subjects = state.subjects.map(subject =>
            el('button', {
                type: 'button',
                class: 'choice',
                'aria-pressed': String(cell?.subjectId === subject.id),
                onclick: act(s => setCell(s, dayId, slotId, { subjectId: subject.id })),
            }, [el('span', { class: 'dot', style: { background: subject.color } }), el('span', { class: 'choice-name', text: subject.name }), icon('check', 16)]),
        );
        const newSubject = el('input', { type: 'text', class: 'input', placeholder: state.subjects.length ? 'New subject…' : 'Type a subject, e.g. Maths', 'aria-label': 'New subject' });
        newSubject.addEventListener('keydown', e => {
            if (e.key !== 'Enter' || !newSubject.value.trim()) return;
            e.preventDefault();
            const name = newSubject.value.trim();
            closePopover();
            update(s => {
                const added = addSubject(withNote(s), name);
                const subject = added.subjects.find(x => x.name.toLowerCase() === name.toLowerCase());
                return setCell(added, dayId, slotId, { subjectId: subject.id });
            });
        });

        const actions = [];
        if (canMergeRight(state, dayId, slotId)) actions.push(el('button', { type: 'button', class: 'text-button', text: 'Make double', onclick: act(s => mergeCellRight(s, dayId, slotId)) }));
        if (canSplit(state, dayId, slotId)) actions.push(el('button', { type: 'button', class: 'text-button', text: 'Split', onclick: act(s => splitCell(s, dayId, slotId)) }));
        if (cell) actions.push(el('button', { type: 'button', class: 'text-button danger', text: 'Clear', onclick: () => { closePopover(); update(s => clearCell(s, dayId, slotId)); } }));

        const content = el('div', { class: 'editor editor-cell' }, [
            el('p', { class: 'editor-title', text: [day?.label, slotTimes(slot)].filter(Boolean).join(' · ') }),
            subjects.length ? el('div', { class: 'choices' }, subjects) : null,
            newSubject,
            field('Note', note),
            actions.length ? el('div', { class: 'editor-row editor-actions' }, actions) : null,
        ]);
        openPopover(node, content, { label: 'Edit class', onClose: () => update(withNote) });
    }

    function addSlotMenu() {
        const add = kind => () => {
            closePopover();
            const state = getState();
            const last = state.slots[state.slots.length - 1];
            let id;
            update(s => {
                const next = addSlot(s, { kind, start: last?.end || '', label: kind === 'break' ? 'Break' : '' });
                id = next.slots[next.slots.length - 1].id;
                return next;
            });
            reopen('header', { slotId: id });
        };
        const content = el('div', { class: 'editor' }, [
            el('p', { class: 'editor-title', text: 'Add' }),
            el('div', { class: 'choices' }, [
                el('button', { type: 'button', class: 'choice', onclick: add('class') }, [el('span', { class: 'choice-name', text: 'Period' })]),
                el('button', { type: 'button', class: 'choice', onclick: add('break') }, [el('span', { class: 'choice-name', text: 'Break' })]),
            ]),
        ]);
        openPopover(addSlotButton, content, { label: 'Add period or break' });
    }

    function addNewDay() {
        let id;
        update(s => {
            const next = addDay(s, nextDayLabel(s));
            id = next.days[next.days.length - 1].id;
            return next;
        });
        reopen('day', { dayId: id });
    }

    stage.addEventListener('click', event => {
        const node = event.target.closest('.tt-item[tabindex]');
        if (node) openEditor(node);
    });
    stage.addEventListener('keydown', event => {
        const node = event.target.closest('.tt-item[tabindex]');
        if (node && (event.key === 'Enter' || event.key === ' ')) {
            event.preventDefault();
            openEditor(node);
        }
    });
    addSlotButton.addEventListener('click', addSlotMenu);
    addDayButton.addEventListener('click', addNewDay);

    return { render };
}
