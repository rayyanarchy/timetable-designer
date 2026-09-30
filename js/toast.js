// A single toast at the bottom of the screen, optionally with an action such
// as Undo.

import { el } from './dom.js';

let region = null;
let timer = 0;

export function showToast(message, { action, onAction, duration = 5000 } = {}) {
    region ??= document.getElementById('toasts');
    clearTimeout(timer);
    const hide = () => region.replaceChildren();
    const toast = el('div', { class: 'toast', role: 'status' }, [
        el('span', { text: message }),
        action &&
            el('button', {
                type: 'button',
                class: 'toast-action',
                text: action,
                onclick: () => { hide(); onAction(); },
            }),
    ]);
    region.replaceChildren(toast);
    timer = setTimeout(hide, duration);
}
