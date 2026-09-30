// Drag and drop with Pointer Events only (one path for mouse, touch and pen).
//
// - Drag a subject chip onto a cell to fill it (setCell).
// - Drag a filled cell onto another cell to swap them, or move into an empty one.
//
// Mouse and pen start dragging after a few pixels of movement. Touch starts
// after a short long-press, so a normal swipe still scrolls the page; once a
// touch drag is active its touchmove events are cancelled to stop scrolling.
// A real drag swallows the click that follows it, so a plain click or tap on a
// cell still opens the subject dropdown in grid.js.
//
// The grid and chips are rebuilt on every render, so every listener is
// delegated on the document. Nothing here touches the DOM at import time, which
// keeps the pure helpers testable in Node.

import { findCoveringCell, getCell, getSubject, setCell, swapCells } from './state.js';

const MOVE_THRESHOLD = 5; // px before a mouse/pen press becomes a drag
const TOUCH_SLOP = 10; // px a finger may wander during the long-press
const LONG_PRESS_MS = 280;
const EDGE = 48; // px from an edge where auto-scroll starts
const MAX_SCROLL_SPEED = 18; // px per frame

// ---------------------------------------------------------------- pure helpers

// source: { type: 'subject', subjectId } | { type: 'cell', dayId, slotId }
// target: { dayId, slotId }. Returns the new state, or `state` if nothing changes.
export function applyDrop(state, source, target) {
    if (!source || !target) return state;
    const slot = state.slots.find(s => s.id === target.slotId);
    if (!slot || slot.kind !== 'class' || !state.days.some(d => d.id === target.dayId)) return state;
    const cover = findCoveringCell(state, target.dayId, target.slotId);
    const coveredByOther =
        cover &&
        cover.slotId !== target.slotId &&
        !(source.type === 'cell' && cover.dayId === source.dayId && cover.slotId === source.slotId);
    if (coveredByOther) return state;

    if (source.type === 'subject') {
        if (!getSubject(state, source.subjectId)) return state;
        const current = getCell(state, target.dayId, target.slotId);
        if (current && current.subjectId === source.subjectId) return state;
        return setCell(state, target.dayId, target.slotId, { subjectId: source.subjectId });
    }
    if (source.type === 'cell') {
        if (!getCell(state, source.dayId, source.slotId)) return state;
        return swapCells(state, { dayId: source.dayId, slotId: source.slotId }, target);
    }
    return state;
}

// Scroll speed for a pointer at `pos` inside [start, end]: negative near the
// start edge, positive near the end edge, 0 elsewhere. Faster closer to the edge.
export function edgeScrollDelta(pos, start, end, edge = EDGE, max = MAX_SCROLL_SPEED) {
    const size = end - start;
    if (size <= 0) return 0;
    const zone = Math.min(edge, size / 3);
    if (pos < start + zone) return -Math.ceil(max * Math.min(1, (start + zone - pos) / zone));
    if (pos > end - zone) return Math.ceil(max * Math.min(1, (pos - (end - zone)) / zone));
    return 0;
}

// ---------------------------------------------------------------- DOM wiring

const CHIP = '#savedSubjects .subject[data-subject]';
const CELL = '#grid-root td.cell[data-day][data-slot]';
const NO_DRAG = 'button, input, select, textarea, [contenteditable="true"]';

export function initDragAndDrop({ getState, update }) {
    let pending = null; // pressed, not yet dragging
    let drag = null; // active drag
    let swallowAfterUp = null; // pointerId whose release must not click (drag cancelled mid-press)
    let swallow = null; // capturing click listener installed after a drag

    function sourceFor(target) {
        if (!(target instanceof Element) || target.closest(NO_DRAG)) return null;
        const chip = target.closest(CHIP);
        if (chip) return { el: chip, source: { type: 'subject', subjectId: chip.dataset.subject } };
        const cell = target.closest(CELL);
        if (cell && getCell(getState(), cell.dataset.day, cell.dataset.slot)) {
            return { el: cell, source: { type: 'cell', dayId: cell.dataset.day, slotId: cell.dataset.slot } };
        }
        return null;
    }

    function onPointerDown(event) {
        // A new press owns the next click, so stop swallowing.
        stopSwallowing();
        swallowAfterUp = null;
        if (pending || drag || !event.isPrimary || event.button !== 0) return;
        const found = sourceFor(event.target);
        if (!found) return;
        pending = {
            ...found,
            pointerId: event.pointerId,
            touch: event.pointerType === 'touch',
            startX: event.clientX,
            startY: event.clientY,
            x: event.clientX,
            y: event.clientY,
            timer: null,
        };
        if (pending.touch) pending.timer = setTimeout(() => pending && start(pending), LONG_PRESS_MS);
    }

    function onPointerMove(event) {
        if (drag && event.pointerId === drag.pointerId) {
            drag.x = event.clientX;
            drag.y = event.clientY;
            moveGhost();
            updateTarget();
            return;
        }
        if (!pending || event.pointerId !== pending.pointerId) return;
        pending.x = event.clientX;
        pending.y = event.clientY;
        const distance = Math.hypot(event.clientX - pending.startX, event.clientY - pending.startY);
        if (pending.touch) {
            if (distance > TOUCH_SLOP) clearPending(); // it's a scroll, not a long-press
        } else if (distance > MOVE_THRESHOLD) {
            start(pending);
        }
    }

    function onPointerUp(event) {
        if (drag && event.pointerId === drag.pointerId) {
            drag.x = event.clientX;
            drag.y = event.clientY;
            updateTarget();
            const { source, target } = drag;
            finish();
            suppressNextClick();
            if (target) update(s => applyDrop(s, source, target));
        } else if (pending && event.pointerId === pending.pointerId) {
            clearPending();
        } else if (event.pointerId === swallowAfterUp) {
            swallowAfterUp = null;
            suppressNextClick();
        }
    }

    function onPointerCancel(event) {
        if (event.pointerId === swallowAfterUp) swallowAfterUp = null;
        if (drag && event.pointerId === drag.pointerId) finish();
        else if (pending && event.pointerId === pending.pointerId) clearPending();
    }

    function clearPending() {
        if (pending) clearTimeout(pending.timer);
        pending = null;
    }

    function start(p) {
        clearPending();
        const style = getComputedStyle(p.el);
        const ghost = document.createElement('div');
        ghost.className = 'dnd-ghost';
        ghost.setAttribute('aria-hidden', 'true');
        const label =
            p.source.type === 'subject'
                ? p.el.querySelector('.subject-name')?.textContent || p.el.textContent
                : [...p.el.children].map(child => child.textContent).join(' · ') || p.el.textContent;
        ghost.textContent = label.replace('✖', '').trim();
        ghost.style.background = style.backgroundColor;
        ghost.style.color = style.color;
        document.body.append(ghost);

        drag = { ...p, ghost, targetEl: null, target: null, raf: 0 };
        p.el.classList.add('dnd-source');
        document.documentElement.classList.add('dnd-active');
        window.getSelection()?.removeAllRanges();
        try {
            // Keep receiving events if the pointer leaves the window.
            document.documentElement.setPointerCapture(p.pointerId);
        } catch {
            /* pointer already released */
        }
        if (p.touch && navigator.vibrate) navigator.vibrate(10);
        moveGhost();
        updateTarget();
        drag.raf = requestAnimationFrame(autoScroll);
    }

    function moveGhost() {
        // Lift the ghost above a finger so it stays visible.
        const dy = drag.touch ? -drag.ghost.offsetHeight - 16 : 12;
        drag.ghost.style.transform = `translate(${drag.x + 12}px, ${drag.y + dy}px)`;
    }

    function updateTarget() {
        const hit = document.elementFromPoint(drag.x, drag.y);
        let el = hit && hit.closest(CELL);
        if (el) {
            const target = { dayId: el.dataset.day, slotId: el.dataset.slot };
            const same = drag.source.type === 'cell' && drag.source.dayId === target.dayId && drag.source.slotId === target.slotId;
            drag.target = same ? null : target;
            if (same) el = null;
        } else {
            drag.target = null;
        }
        if (el !== drag.targetEl) {
            drag.targetEl?.classList.remove('dnd-target');
            el?.classList.add('dnd-target');
            drag.targetEl = el;
        }
    }

    function autoScroll() {
        if (!drag) return;
        let moved = false;
        const root = document.getElementById('grid-root');
        if (root && root.scrollWidth > root.clientWidth) {
            const r = root.getBoundingClientRect();
            if (drag.y >= r.top && drag.y <= r.bottom) {
                const dx = edgeScrollDelta(drag.x, r.left, r.right);
                const before = root.scrollLeft;
                if (dx) root.scrollLeft += dx;
                moved ||= root.scrollLeft !== before;
            }
        }
        const dy = edgeScrollDelta(drag.y, 0, window.innerHeight);
        if (dy) {
            const before = window.scrollY;
            window.scrollBy(0, dy);
            moved ||= window.scrollY !== before;
        }
        if (moved) updateTarget();
        drag.raf = requestAnimationFrame(autoScroll);
    }

    // Cancels a drag while the pointer is still down; its release won't click.
    function cancel() {
        if (!drag) return;
        swallowAfterUp = drag.pointerId;
        finish();
    }

    // Ends the drag (drop or cancel) and cleans up.
    function finish() {
        if (!drag) return;
        cancelAnimationFrame(drag.raf);
        drag.ghost.remove();
        drag.el.classList.remove('dnd-source');
        drag.targetEl?.classList.remove('dnd-target');
        document.documentElement.classList.remove('dnd-active');
        try {
            document.documentElement.releasePointerCapture(drag.pointerId);
        } catch {
            /* already released */
        }
        drag = null;
    }

    // Swallows the click the browser may dispatch right after a drag ends.
    function suppressNextClick() {
        stopSwallowing();
        swallow = event => {
            event.stopPropagation();
            event.preventDefault();
            stopSwallowing();
        };
        window.addEventListener('click', swallow, true);
        setTimeout(stopSwallowing, 400);
    }

    function stopSwallowing() {
        if (swallow) window.removeEventListener('click', swallow, true);
        swallow = null;
    }

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('pointermove', onPointerMove);
    document.addEventListener('pointerup', onPointerUp);
    document.addEventListener('pointercancel', onPointerCancel);
    // An active touch drag must not scroll the page.
    document.addEventListener('touchmove', event => { if (drag) event.preventDefault(); }, { passive: false });
    // Long-press would otherwise open the context menu on Android.
    document.addEventListener('contextmenu', event => { if (drag || (pending && pending.touch)) event.preventDefault(); });
    document.addEventListener('dragstart', event => { if (pending || drag) event.preventDefault(); });
    document.addEventListener('keydown', event => {
        if (event.key !== 'Escape') return;
        cancel();
        clearPending();
    });
    window.addEventListener('blur', () => { cancel(); clearPending(); });
}
