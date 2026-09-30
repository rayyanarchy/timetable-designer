// Download split button: the main part saves the PNG at the chosen size;
// the chevron opens a menu with the device (which sets the exact pixels)
// and saving or opening the timetable as a JSON file.

import { el, icon } from './dom.js';
import { downloadPng } from './export.js';
import { closePopover, isPopoverOpen, openPopover } from './popover.js';
import { describePresetId, getKind, presetIdFor, resolveExportTarget } from './presets.js';
import { setExportPreset } from './state.js';
import { downloadStateJson, readStateFile } from './storage.js';
import { showToast } from './toast.js';

export function createExportMenu(root, { getState, update }) {
    const main = el('button', { type: 'button', class: 'split-main' }, [icon('down', 16), el('span', { text: 'Download' })]);
    const toggle = el('button', { type: 'button', class: 'split-toggle', 'aria-label': 'More download options', 'aria-haspopup': 'dialog' }, [icon('chevron', 16)]);
    const file = el('input', { type: 'file', accept: 'application/json,.json', hidden: true });
    root.append(el('div', { class: 'split-button' }, [main, toggle]), file);

    main.addEventListener('click', async () => {
        main.disabled = true;
        try {
            await downloadPng(getState());
        } catch (error) {
            showToast(`Couldn't create the image: ${error.message}`);
        } finally {
            main.disabled = false;
        }
    });

    file.addEventListener('change', async () => {
        const [chosen] = file.files;
        file.value = '';
        if (!chosen) return;
        try {
            const next = await readStateFile(chosen);
            update(() => next);
            showToast(`Opened ${chosen.name}`);
        } catch (error) {
            showToast(error.message);
        }
    });

    function menu() {
        const state = getState();
        const { kind: kindId, device } = describePresetId(state.exportPresetId);
        const kind = getKind(kindId);
        const target = resolveExportTarget(state);
        const devices = kind && kind.devices.length > 1
            ? el('div', { class: 'menu-section' }, [
                el('p', { class: 'menu-label', text: 'Device' }),
                ...kind.devices.map(d =>
                    el('button', {
                        type: 'button',
                        class: 'menu-item',
                        role: 'menuitemradio',
                        'aria-checked': String(d.id === device),
                        onclick: () => { update(s => setExportPreset(s, presetIdFor(kindId, d.id))); closePopover(); },
                    }, [el('span', { class: 'menu-item-text' }, [el('span', { text: d.label }), el('span', { class: 'menu-item-meta', text: [d.models, `${d.width} × ${d.height}`].filter(Boolean).join(' · ') })]), icon('check', 16)]),
                ),
            ])
            : null;
        const content = el('div', { class: 'menu', role: 'menu' }, [
            el('button', { type: 'button', class: 'menu-item', role: 'menuitem', onclick: () => { closePopover(); main.click(); } }, [
                icon('down', 16),
                el('span', { class: 'menu-item-text' }, [el('span', { text: 'Download PNG' }), el('span', { class: 'menu-item-meta', text: `${target.width} × ${target.height}` })]),
            ]),
            devices,
            el('div', { class: 'menu-section' }, [
                el('button', { type: 'button', class: 'menu-item', role: 'menuitem', onclick: () => { closePopover(); downloadStateJson(getState()); } }, [
                    icon('save', 16), el('span', { class: 'menu-item-text' }, [el('span', { text: 'Save timetable' }), el('span', { class: 'menu-item-meta', text: '.json' })]),
                ]),
                el('button', { type: 'button', class: 'menu-item', role: 'menuitem', onclick: () => { closePopover(); file.click(); } }, [
                    icon('open', 16), el('span', { class: 'menu-item-text' }, [el('span', { text: 'Open timetable…' })]),
                ]),
            ]),
        ]);
        openPopover(toggle, content, { label: 'Download options', className: 'popover-menu' });
    }

    let openedFromToggle = false;
    toggle.addEventListener('pointerdown', () => { openedFromToggle = isPopoverOpen(); });
    toggle.addEventListener('click', () => {
        if (openedFromToggle) { closePopover(); openedFromToggle = false; return; }
        menu();
    });
}
