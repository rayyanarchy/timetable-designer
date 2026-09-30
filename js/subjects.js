// Subject input and chips. Colours are assigned in state.addSubject.

import { addSubject, removeSubject } from './state.js';
import { textColorFor } from './color.js';

export function createSubjects({ input, list }, { update }) {
    input.addEventListener('keydown', event => {
        if (event.key !== 'Enter') return;
        event.preventDefault();
        const name = input.value;
        update(s => addSubject(s, name));
        input.value = '';
    });

    list.addEventListener('click', event => {
        const remove = event.target.closest('[data-remove]');
        if (remove) update(s => removeSubject(s, remove.dataset.remove));
    });

    return {
        render(state) {
            list.replaceChildren(
                ...state.subjects.map(subject => {
                    const chip = document.createElement('div');
                    chip.className = 'subject';
                    chip.dataset.subject = subject.id;
                    chip.style.background = subject.color;
                    chip.style.color = textColorFor(subject.color);
                    chip.textContent = subject.name;

                    const remove = document.createElement('button');
                    remove.type = 'button';
                    remove.className = 'remove';
                    remove.dataset.remove = subject.id;
                    remove.setAttribute('aria-label', `Remove ${subject.name}`);
                    remove.textContent = '✖';
                    chip.appendChild(remove);
                    return chip;
                }),
            );
        },
    };
}
