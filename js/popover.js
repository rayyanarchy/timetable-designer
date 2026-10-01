// One popover at a time, anchored to an element. On narrow screens it becomes
// a bottom sheet. `onClose` runs whenever it closes (outside tap, Escape, or
// opening another), so editors can save a half-typed value.

import { el } from './dom.js';

const GAP = 8;
const MARGIN = 12;
const SHEET = '(max-width: 640px)';

let current = null;

export function closePopover() {
    const open = current;
    if (!open) return;
    current = null;
    open.node.remove();
    open.backdrop?.remove();
    window.removeEventListener('resize', open.place);
    window.removeEventListener('scroll', open.place, true);
    open.onClose?.();
}

export const isPopoverOpen = () => Boolean(current);

// placement: 'below' (centred under the anchor, flipping above when there's
// no room) or 'side' (to the right, e.g. for sidebar items, falling back to
// below when there's no room).
export function openPopover(anchor, content, { label = '', onClose, className = '', placement = 'below' } = {}) {
    installListeners();
    closePopover();
    const sheet = window.matchMedia(SHEET).matches;
    const node = el('div', { class: `popover ${sheet ? 'is-sheet' : ''} ${className}`, role: 'dialog', 'aria-label': label }, [content]);
    const backdrop = sheet ? el('div', { class: 'popover-backdrop', onclick: closePopover }) : null;
    if (backdrop) document.body.append(backdrop);
    document.body.append(node);

    // Anchors can be re-rendered while the popover is open; keep the last
    // known position then.
    let rect = anchor.getBoundingClientRect();
    const place = () => {
        if (sheet) return;
        if (anchor.isConnected) rect = anchor.getBoundingClientRect();
        const w = node.offsetWidth;
        const h = node.offsetHeight;
        if (placement === 'side' && rect.right + GAP + w <= window.innerWidth - MARGIN) {
            node.style.left = `${rect.right + GAP}px`;
            node.style.top = `${Math.min(Math.max(rect.top - 14, MARGIN), window.innerHeight - h - MARGIN)}px`;
            return;
        }
        const left = Math.min(Math.max(rect.left + rect.width / 2 - w / 2, MARGIN), window.innerWidth - w - MARGIN);
        let top = rect.bottom + GAP;
        if (top + h > window.innerHeight - MARGIN && rect.top - h - GAP > MARGIN) top = rect.top - h - GAP;
        node.style.left = `${left}px`;
        node.style.top = `${Math.max(MARGIN, top)}px`;
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    current = { node, backdrop, onClose, place, anchor };
    // Read layout once so the opening transition starts from the closed style.
    void node.offsetWidth;
    node.classList.add('is-open');

    // Focus the field to type into; menus take focus themselves so the
    // keyboard can reach them without drawing a ring on the first item.
    const first = node.querySelector('[autofocus]') || (sheet ? null : node.querySelector('input'));
    if (first) {
        first.focus({ preventScroll: true });
        first.select?.();
    } else {
        node.tabIndex = -1;
        node.focus({ preventScroll: true });
    }
    return node;
}

// Installed on first use so the module can be imported without a DOM.
let installed = false;
function installListeners() {
    if (installed) return;
    installed = true;
    document.addEventListener('pointerdown', event => {
        if (!current) return;
        if (current.node.contains(event.target) || current.anchor.contains?.(event.target)) return;
        closePopover();
    }, true);
    document.addEventListener('keydown', event => {
        if (event.key !== 'Escape' || !current) return;
        const anchor = current.anchor;
        closePopover();
        if (anchor.isConnected) anchor.focus?.({ preventScroll: true });
    });
}
