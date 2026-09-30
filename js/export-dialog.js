// Export dialog: pick a preset (kind + device) or a custom size, see a live
// preview and download it. The preview canvas is rendered by renderToCanvas at
// the exact export size (and only scaled down by CSS), and Download saves that
// same canvas, so the file always matches the preview.

import { downloadCanvasPng } from './export.js';
import {
    CUSTOM_PRESET_ID, CUSTOM_SIZE_LIMITS, EXPORT_KINDS, PRESET_GROUPS, clampCustomSize, describePresetId, exportFilename,
    getKind, presetIdFor, resolveExportTarget,
} from './presets.js';
import { renderToCanvas } from './render-canvas.js';
import { setCustomSize, setExportPreset } from './state.js';
import { getTheme } from './themes.js';

const option = (value, label) => {
    const el = document.createElement('option');
    el.value = value;
    el.textContent = label;
    return el;
};

export function createExportDialog(dialog, openButton, { getState, update }) {
    const $ = selector => dialog.querySelector(selector);
    const kindSelect = $('#export-kind');
    const deviceField = $('#export-device-field');
    const deviceSelect = $('#export-device');
    const customFields = $('#export-custom-fields');
    const widthInput = $('#export-width');
    const heightInput = $('#export-height');
    const sizeInfo = $('#export-size-info');
    const frame = $('#export-preview-frame');
    const safeOverlay = $('#export-safe-overlay');
    const errorText = $('#export-error');
    const downloadButton = $('#export-download');
    let preview = $('#export-preview');

    for (const input of [widthInput, heightInput]) {
        input.min = CUSTOM_SIZE_LIMITS.min;
        input.max = CUSTOM_SIZE_LIMITS.max;
    }
    for (const group of PRESET_GROUPS) {
        const optgroup = document.createElement('optgroup');
        optgroup.label = group.label;
        for (const kind of EXPORT_KINDS.filter(k => k.group === group.id)) optgroup.append(option(kind.id, kind.label));
        kindSelect.append(optgroup);
    }

    // Rendering is async (fonts load first), so each render gets a token and
    // only the latest one is shown. `rendering` is what Download waits for.
    let renderToken = 0;
    let rendering = Promise.resolve();

    function renderPreview() {
        const token = ++renderToken;
        const state = getState();
        const target = resolveExportTarget(state);
        const canvas = document.createElement('canvas');
        canvas.id = 'export-preview';
        canvas.className = preview.className;
        canvas.setAttribute('role', 'img');
        canvas.setAttribute('aria-label', `Preview, ${target.width} × ${target.height} pixels`);
        rendering = renderToCanvas(canvas, state, target, getTheme(state.themeId)).then(() => {
            if (token !== renderToken) return;
            preview.replaceWith(canvas);
            preview = canvas;
            preview.dataset.filename = exportFilename(target);
            frame.style.setProperty('--export-ratio', String(target.width / target.height));
            showSafeArea(target);
        });
        rendering.catch(showError);
        return rendering;
    }

    function showSafeArea(target) {
        const safe = target.safeArea;
        safeOverlay.hidden = !safe;
        if (!safe) return;
        safeOverlay.style.top = `${(safe.top / target.height) * 100}%`;
        safeOverlay.style.bottom = `${(safe.bottom / target.height) * 100}%`;
        safeOverlay.style.left = `${(safe.left / target.width) * 100}%`;
        safeOverlay.style.right = `${(safe.right / target.width) * 100}%`;
    }

    function showError(error) {
        console.error('Could not render the timetable:', error);
        errorText.textContent = 'Sorry, the image could not be created.';
        errorText.hidden = false;
    }

    // Brings every control in line with the stored preset, then re-renders.
    function sync() {
        const state = getState();
        const { kind: kindId, device: deviceId } = describePresetId(state.exportPresetId);
        const kind = getKind(kindId);
        kindSelect.value = kindId;

        deviceField.hidden = !kind.devices.length;
        deviceSelect.replaceChildren(...kind.devices.map(d => option(d.id, `${d.label} · ${d.width}×${d.height}`)));
        if (deviceId) deviceSelect.value = deviceId;

        const custom = kindId === CUSTOM_PRESET_ID;
        customFields.hidden = !custom;
        if (custom && document.activeElement !== widthInput) widthInput.value = clampCustomSize(state.customSize.w);
        if (custom && document.activeElement !== heightInput) heightInput.value = clampCustomSize(state.customSize.h);

        const target = resolveExportTarget(state);
        sizeInfo.textContent =
            `${target.width} × ${target.height} px` +
            (target.safeArea ? ' · the dashed area shows where the timetable goes, clear of the clock and home indicator' : '');
        errorText.hidden = true;
        renderPreview();
    }

    const choose = presetId => {
        update(s => (s.exportPresetId === presetId ? s : setExportPreset(s, presetId)));
        sync();
    };

    kindSelect.addEventListener('change', () => {
        // Keep the same device when the new kind offers it (e.g. Small → Large).
        const current = describePresetId(getState().exportPresetId).device;
        choose(presetIdFor(kindSelect.value, current));
    });
    deviceSelect.addEventListener('change', () => choose(presetIdFor(kindSelect.value, deviceSelect.value)));

    const inRange = n => Number.isFinite(n) && n >= CUSTOM_SIZE_LIMITS.min && n <= CUSTOM_SIZE_LIMITS.max;
    const applyCustom = clamp => {
        const read = input => (clamp ? clampCustomSize(input.value) : Math.round(Number(input.value)));
        const w = read(widthInput);
        const h = read(heightInput);
        if (!inRange(w) || !inRange(h)) return; // wait for a valid value (or the change event)
        if (clamp) {
            widthInput.value = w;
            heightInput.value = h;
        }
        const { customSize } = getState();
        if (customSize.w !== w || customSize.h !== h) update(s => setCustomSize(s, w, h));
        sync();
    };
    for (const input of [widthInput, heightInput]) {
        input.addEventListener('input', () => applyCustom(false));
        input.addEventListener('change', () => applyCustom(true));
    }

    downloadButton.addEventListener('click', async () => {
        downloadButton.disabled = true;
        try {
            await rendering;
            await downloadCanvasPng(preview, preview.dataset.filename);
        } catch (error) {
            showError(error);
        } finally {
            downloadButton.disabled = false;
        }
    });

    openButton.addEventListener('click', () => {
        sync();
        dialog.showModal();
    });

    return { open: () => openButton.click(), rendered: () => rendering };
}
