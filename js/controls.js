// The Design panel: the card's size (which widget) and its style. Both
// apply instantly, so you edit inside the look you'll export.

import { SUBJECT_PALETTE } from './color.js';
import { el } from './dom.js';
import { describePresetId, presetIdFor } from './presets.js';
import { setExportPreset, setTheme } from './state.js';
import { THEMES, subjectAppearance } from './themes.js';

export const SIZE_OPTIONS = [
    { kind: 'ios-small', label: 'Small' },
    { kind: 'ios-medium', label: 'Medium' },
    { kind: 'ios-large', label: 'Large' },
    { kind: 'ipad-xl', label: 'iPad' },
];

// A tiny picture of a style: its background with three classes drawn in it.
function stylePreview(theme) {
    const bars = SUBJECT_PALETTE.slice(0, 3).map((color, i) => {
        const look = subjectAppearance(theme, color);
        return el('span', {
            class: 'style-bar',
            style: {
                background: look.fill,
                borderRadius: theme.radius ? '3px' : '0',
                boxShadow: theme.gridLineWidth ? `inset 0 0 0 1px ${theme.gridLine}` : null,
                width: `${[70, 50, 60][i]}%`,
            },
        }, [look.dot ? el('span', { class: 'style-dot', style: { background: look.dot } }) : null]);
    });
    return el('span', { class: 'style-preview', style: { background: theme.background } }, bars);
}

export function createControls(root, { getState, update }) {
    const sizeButtons = SIZE_OPTIONS.map(option =>
        el('button', {
            type: 'button',
            role: 'radio',
            text: option.label,
            dataset: { kind: option.kind },
            onclick: () => {
                const { device } = describePresetId(getState().exportPresetId);
                update(s => setExportPreset(s, presetIdFor(option.kind, device)));
            },
        }),
    );
    const styleButtons = Object.values(THEMES).map(theme =>
        el('button', {
            type: 'button',
            role: 'radio',
            class: 'style-option',
            dataset: { theme: theme.id },
            onclick: () => update(s => setTheme(s, theme.id)),
        }, [stylePreview(theme), el('span', { class: 'style-name', text: theme.name })]),
    );

    root.append(
        el('div', { class: 'panel-head' }, [el('h2', { class: 'panel-title', text: 'Design' })]),
        el('div', { class: 'control' }, [
            el('span', { class: 'control-label', id: 'size-label', text: 'Size' }),
            el('div', { class: 'segmented', role: 'radiogroup', 'aria-labelledby': 'size-label' }, sizeButtons),
        ]),
        el('div', { class: 'control' }, [
            el('span', { class: 'control-label', id: 'style-label', text: 'Style' }),
            el('div', { class: 'styles', role: 'radiogroup', 'aria-labelledby': 'style-label' }, styleButtons),
        ]),
    );

    return {
        render(state) {
            const { kind } = describePresetId(state.exportPresetId);
            for (const b of sizeButtons) b.setAttribute('aria-checked', String(b.dataset.kind === kind));
            for (const b of styleButtons) b.setAttribute('aria-checked', String(b.dataset.theme === state.themeId));
        },
    };
}
