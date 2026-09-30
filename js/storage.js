import { STATE_VERSION, createDefaultState, normalize } from './state.js';

const STORAGE_KEY = 'timetable-designer:state';
const SAVE_DELAY_MS = 300;

const isString = v => typeof v === 'string';
const isObject = v => v !== null && typeof v === 'object' && !Array.isArray(v);

// Checks untrusted data (localStorage or an imported file) and returns a clean
// state, filling optional fields from the defaults. Throws with a readable
// message when the data isn't a timetable.
export function validateState(data) {
    if (!isObject(data)) throw new Error('Not a timetable file.');
    if (data.version !== STATE_VERSION) throw new Error(`Unsupported timetable version: ${data.version}.`);

    const need = (ok, what) => { if (!ok) throw new Error(`Invalid timetable: ${what}.`); };
    need(Array.isArray(data.days) && data.days.every(d => isObject(d) && isString(d.id) && isString(d.label)), 'days');
    need(
        Array.isArray(data.slots) &&
            data.slots.every(s => isObject(s) && isString(s.id) && (s.kind === 'class' || s.kind === 'break')),
        'slots',
    );
    need(
        Array.isArray(data.subjects) &&
            data.subjects.every(s => isObject(s) && isString(s.id) && isString(s.name) && isString(s.color)),
        'subjects',
    );
    need(isObject(data.cells) && Object.values(data.cells).every(isObject), 'cells');

    const defaults = createDefaultState();
    const size = isObject(data.customSize) ? data.customSize : defaults.customSize;
    return normalize({
        version: STATE_VERSION,
        days: data.days.map(({ id, label }) => ({ id, label })),
        slots: data.slots.map(({ id, kind, start, end, label }) => ({
            id,
            kind,
            start: isString(start) ? start : '',
            end: isString(end) ? end : '',
            label: isString(label) ? label : '',
        })),
        subjects: data.subjects.map(({ id, name, color }) => ({ id, name, color })),
        cells: data.cells,
        themeId: isString(data.themeId) ? data.themeId : defaults.themeId,
        exportPresetId: isString(data.exportPresetId) ? data.exportPresetId : defaults.exportPresetId,
        customSize: { w: Number(size.w) || defaults.customSize.w, h: Number(size.h) || defaults.customSize.h },
    });
}

// Storage can be unavailable (private mode, blocked site data), so every
// access is guarded and the app falls back to the default timetable.
export function loadState() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) return validateState(JSON.parse(raw));
    } catch (error) {
        console.warn('Could not load saved timetable, starting fresh:', error);
    }
    return createDefaultState();
}

let saveTimer = null;
export function saveStateSoon(state) {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        } catch (error) {
            console.warn('Could not save timetable:', error);
        }
    }, SAVE_DELAY_MS);
}

export function downloadStateJson(state) {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    link.download = 'timetable.json';
    link.href = URL.createObjectURL(blob);
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 0);
}

export async function readStateFile(file) {
    let data;
    try {
        data = JSON.parse(await file.text());
    } catch {
        throw new Error('That file isn\'t valid JSON.');
    }
    return validateState(data);
}
