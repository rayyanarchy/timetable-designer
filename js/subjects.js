// Subjects panel: a stack beside the card on wide screens and a two-column
// grid under it on phones. Each subject shows its colour once, as a dot. Drag
// a subject onto the card (dnd.js), or tap it to rename, recolour or delete.

import { SUBJECT_PALETTE } from './color.js';
import { el, icon } from './dom.js';
import { closePopover, openPopover } from './popover.js';
import { addSubject, removeSubject, suggestShortName, updateSubject } from './state.js';
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
        // The short name is optional; the placeholder shows the suggestion
        // used when it's left empty, and follows the name as it's edited.
        const short = el('input', { type: 'text', class: 'input input-short', value: subject.short || '', placeholder: suggestShortName(subject.name), maxlength: '12', 'aria-label': 'Short name' });
        name.addEventListener('input', () => { short.placeholder = suggestShortName(name.value || subject.name); });
        const save = () =>
            update(s => {
                const renamed = renameSubject(s, id, name.value);
                const value = short.value.trim();
                const current = renamed.subjects.find(x => x.id === id);
                return current && (current.short || '') !== value ? updateSubject(renamed, id, { short: value }) : renamed;
            });
        for (const input of [name, short]) {
            input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); closePopover(); } });
        }

        const swatches = SUBJECT_PALETTE.map(color =>
            el('button', { type: 'button', class: 'swatch', style: { background: color }, 'aria-label': `Colour ${color}`, onclick: () => setColor(color) }),
        );
        // A colour input can't be sized like the other swatches, so it sits
        // invisibly inside a round label.
        const picker = el('input', { type: 'color', 'aria-label': 'Custom colour' });
        const custom = el('label', { class: 'swatch swatch-custom', title: 'Custom colour' }, [picker]);
        picker.addEventListener('input', () => setColor(picker.value));
        // Marks the chosen swatch; a colour outside the palette shows on the
        // custom swatch instead of its rainbow.
        const showColor = color => {
            const value = toColorInputValue(color);
            const inPalette = SUBJECT_PALETTE.some(c => toColorInputValue(c) === value);
            swatches.forEach((b, i) => b.setAttribute('aria-pressed', String(toColorInputValue(SUBJECT_PALETTE[i]) === value)));
            custom.setAttribute('aria-pressed', String(!inPalette));
            custom.style.background = inPalette ? '' : value;
            picker.value = value;
        };
        const setColor = color => {
            update(s => updateSubject(s, id, { color }));
            showColor(color);
        };
        showColor(subject.color);

        const content = el('div', { class: 'editor' }, [
            el('p', { class: 'editor-title', text: 'Subject' }),
            name,
            el('label', { class: 'field field-inline' }, [
                el('span', { class: 'field-text' }, [
                    el('span', { class: 'field-label', text: 'Short name' }),
                    el('span', { class: 'field-hint', text: 'Used when the full name doesn’t fit' }),
                ]),
                short,
            ]),
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
        openPopover(node, content, { label: `Edit ${subject.name}`, onClose: save, placement: 'side' });
    }

    const rows = new Map();
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
            // Items are kept between renders (keyed by subject), so editing a
            // subject doesn't rebuild the list under the pointer.
            const items = state.subjects.map(subject => {
                const n = classCount(state, subject.id);
                let li = rows.get(subject.id);
                if (!li) {
                    li = el('li', {}, [
                        el('div', { class: 'subject-item', tabindex: '0', role: 'button', dataset: { subject: subject.id } }, [
                            el('span', { class: 'dot' }),
                            el('span', { class: 'subject-item-name' }),
                            el('span', { class: 'subject-item-count' }),
                        ]),
                    ]);
                    rows.set(subject.id, li);
                }
                const item = li.firstChild;
                const [dot, name, badge] = item.children;
                dot.style.background = subject.color;
                name.textContent = subject.name;
                badge.textContent = n ? String(n) : '';
                badge.hidden = !n;
                item.setAttribute('aria-label', `${subject.name}, ${plural(n)}. Drag onto the timetable, or press Enter to edit.`);
                return li;
            });
            for (const id of rows.keys()) if (!state.subjects.some(s => s.id === id)) rows.delete(id);
            const current = [...list.children];
            if (current.length !== items.length || current.some((node, i) => node !== items[i])) list.replaceChildren(...items);
        },
    };
}
