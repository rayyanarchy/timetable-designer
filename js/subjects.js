// Subjects panel: a stack beside the card on wide screens and a two-column
// grid under it on phones. Each subject shows its colour once, as a dot. Drag
// a subject onto the card (dnd.js), or tap it to rename, recolour or delete.

import { SUBJECT_PALETTE } from './color.js';
import { el, icon } from './dom.js';
import { closePopover, openPopover } from './popover.js';
import { addSubject, removeSubject, updateSubject } from './state.js';
import { showToast } from './toast.js';

// ---------------------------------------------------------------- pure helpers

// <input type="color"> only accepts lowercase #rrggbb.
export function toColorInputValue(color) {
    const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(color || '').trim());
    if (!m) return '#000000';
    const hex = m[1].length === 3 ? m[1].split('').map(ch => ch + ch).join('') : m[1];
    return `#${hex.toLowerCase()}`;
}

// Renames a subject, ignoring blank names and case-insensitive clashes with
// another subject.
export function renameSubject(state, id, name) {
    const trimmed = String(name).trim();
    const subject = state.subjects.find(s => s.id === id);
    if (!subject || !trimmed || trimmed === subject.name) return state;
    const lower = trimmed.toLowerCase();
    if (state.subjects.some(s => s.id !== id && s.name.toLowerCase() === lower)) return state;
    return updateSubject(state, id, { name: trimmed });
}

// How many classes a week use this subject (a double period counts once).
export const classCount = (state, id) => Object.values(state.cells).filter(c => c.subjectId === id).length;

// ---------------------------------------------------------------- panel

export function createSubjects(root, { getState, update, undo }) {
    const input = el('input', { type: 'text', class: 'input subject-input', placeholder: 'Add a subject', 'aria-label': 'Add a subject', enterkeyhint: 'done' });
    const addButton = el('button', { type: 'submit', class: 'icon-button', 'aria-label': 'Add subject', title: 'Add subject' }, [icon('plus', 16)]);
    const form = el('form', { class: 'subject-add' }, [input, addButton]);
    const list = el('ul', { class: 'subject-list', role: 'list' });
    const hint = el('p', { class: 'subject-hint', text: 'Add your subjects, then drag them onto the timetable — or tap any slot.' });
    const count = el('span', { class: 'panel-count' });
    root.append(el('div', { class: 'panel-head' }, [el('h2', { class: 'panel-title', text: 'Subjects' }), count]), form, list, hint);

    form.addEventListener('submit', event => {
        event.preventDefault();
        const name = input.value;
        if (!name.trim()) return;
        update(s => addSubject(s, name));
        input.value = '';
    });

    function editor(node, id) {
        const subject = getState().subjects.find(s => s.id === id);
        if (!subject) return;
        const name = el('input', { type: 'text', class: 'input', value: subject.name, autofocus: true, 'aria-label': 'Subject name' });
        const save = () => update(s => renameSubject(s, id, name.value));
        name.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); closePopover(); } });

        const setColor = color => update(s => updateSubject(s, id, { color }));
        const swatches = SUBJECT_PALETTE.map(color =>
            el('button', {
                type: 'button',
                class: 'swatch',
                style: { background: color },
                'aria-label': `Colour ${color}`,
                'aria-pressed': String(subject.color.toLowerCase() === color.toLowerCase()),
                onclick: event => {
                    setColor(color);
                    for (const b of event.currentTarget.parentNode.querySelectorAll('.swatch')) b.setAttribute('aria-pressed', String(b === event.currentTarget));
                },
            }),
        );
        const custom = el('input', { type: 'color', class: 'swatch swatch-custom', value: toColorInputValue(subject.color), 'aria-label': 'Custom colour', title: 'Custom colour' });
        custom.addEventListener('input', () => setColor(custom.value));

        const content = el('div', { class: 'editor' }, [
            el('p', { class: 'editor-title', text: 'Subject' }),
            name,
            el('div', { class: 'swatches', role: 'group', 'aria-label': 'Colour' }, [...swatches, custom]),
            el('div', { class: 'editor-row' }, [
                el('span', { class: 'editor-note', text: plural(classCount(getState(), id)) }),
                el('button', {
                    type: 'button',
                    class: 'text-button danger',
                    text: 'Delete',
                    onclick: () => {
                        closePopover();
                        update(s => removeSubject(s, id));
                        showToast(`Deleted ${subject.name}`, { action: 'Undo', onAction: undo });
                    },
                }),
            ]),
        ]);
        openPopover(node, content, { label: `Edit ${subject.name}`, onClose: save });
    }

    const plural = n => (n === 1 ? '1 class a week' : `${n} classes a week`);

    list.addEventListener('click', event => {
        const item = event.target.closest('.subject-item');
        if (item) editor(item, item.dataset.subject);
    });
    list.addEventListener('keydown', event => {
        const item = event.target.closest('.subject-item');
        if (item && (event.key === 'Enter' || event.key === ' ')) {
            event.preventDefault();
            editor(item, item.dataset.subject);
        }
    });

    return {
        render(state) {
            count.textContent = state.subjects.length ? String(state.subjects.length) : '';
            hint.hidden = state.subjects.length > 2;
            list.replaceChildren(
                ...state.subjects.map(subject => {
                    const n = classCount(state, subject.id);
                    return el('li', {}, [
                        el('div', {
                            class: 'subject-item',
                            tabindex: '0',
                            role: 'button',
                            dataset: { subject: subject.id },
                            'aria-label': `${subject.name}, ${plural(n)}. Drag onto the timetable, or press Enter to edit.`,
                        }, [
                            el('span', { class: 'dot', style: { background: subject.color } }),
                            el('span', { class: 'subject-item-name', text: subject.name }),
                            n ? el('span', { class: 'subject-item-count', text: String(n) }) : null,
                        ]),
                    ]);
                }),
            );
        },
    };
}
