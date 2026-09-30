// Export size presets. Sizes are in image pixels; safeArea (optional) is the
// region the timetable must stay out of, e.g. a wallpaper's clock and dock.
//
// A preset is a (kind, device) pair: "Medium widget" on "iPhone 6.7″". Its id
// (e.g. 'ios-medium-iphone-max') is what state.exportPresetId stores, so one
// stored value picks both. The export dialog lists kinds, then devices.
//
// Sources (checked 2026-10-01):
// - Widget sizes in points: Apple Human Interface Guidelines, Widgets,
//   "iOS dimensions" and "iPadOS dimensions" tables
//   https://developer.apple.com/design/human-interface-guidelines/widgets
//   For iPad the "Device" row is used (the size the widget is shown at on the
//   Home Screen), not the "Canvas" row.
// - Which models have which screen size (points, scale, pixels): HIG Layout,
//   "iOS, iPadOS device screen dimensions". The live page dropped this table in
//   its September 2026 update; the version from the September 2025 update is at
//   https://web.archive.org/web/2025/https://developer.apple.com/design/human-interface-guidelines/layout
//
// Apple's widget table has no rows for the 402×874 pt (iPhone 16 Pro, 17,
// 17 Pro), 420×912 pt (iPhone Air) or 440×956 pt (16/17 Pro Max) screens, so
// no widget sizes are given for those phones; the generic iPhone preset is
// the fallback. Wallpapers use full screen pixels, which are published for them.

// Widget sizes in points from the HIG table, keyed by device option.
const IPHONE_WIDGETS = [
    {
        id: 'iphone',
        label: 'iPhone 6.1″',
        models: 'iPhone 12–15, 12–15 Pro, 16, 16e; also newer iPhones',
        // 390×844 and 393×852 pt rows (identical widget sizes), @3x
        scale: 3, small: [158, 158], medium: [338, 158], large: [338, 354],
    },
    {
        id: 'iphone-max',
        label: 'iPhone 6.7″',
        models: '12–15 Pro Max, 14–16 Plus',
        // 428×926 and 430×932 pt rows (identical widget sizes), @3x
        scale: 3, small: [170, 170], medium: [364, 170], large: [364, 382],
    },
    {
        id: 'iphone-x',
        label: 'iPhone 5.8″ and mini',
        models: 'X, XS, 11 Pro, 12 mini, 13 mini',
        // 375×812 pt row, @3x
        scale: 3, small: [155, 155], medium: [329, 155], large: [329, 345],
    },
    {
        id: 'iphone-se',
        label: 'iPhone SE',
        models: 'SE (2nd, 3rd gen), 6–8',
        // 375×667 pt row, @2x
        scale: 2, small: [148, 148], medium: [321, 148], large: [321, 324],
    },
];

const IPAD_XL_WIDGETS = [
    // 820×1180 pt (iPad Air 10.9″/11″, iPad 11″) and 834×1194 pt (iPad Pro 11″)
    // rows, Device target, @2x
    { id: 'ipad-11', label: 'iPad 11″', models: 'iPad Pro 11″, iPad Air 11″, iPad 11″', scale: 2, size: [628, 300] },
    // 1024×1366 pt row (iPad Pro 12.9″, iPad Air 13″), Device target, @2x
    { id: 'ipad-13', label: 'iPad 13″', models: 'iPad Pro 12.9″, iPad Air 13″', scale: 2, size: [748, 356] },
    // 744×1133 pt row (iPad mini 8.3″), Device target, @2x
    { id: 'ipad-mini', label: 'iPad mini', models: 'iPad mini 8.3″', scale: 2, size: [540, 260] },
];

// Lock Screen wallpapers: full-screen pixels (HIG Layout table) and a safe
// area in points, multiplied by the scale.
//
// Apple doesn't publish Lock Screen clock geometry, so the safe area is a
// conservative estimate of the iOS 16+ Lock Screen on Dynamic Island iPhones:
// - top 280 pt: status bar (~54–62 pt safe-area inset), the date line and
//   the large clock (together ending near 200 pt), plus the optional row of
//   Lock Screen widgets under the clock (~70 pt). That is about a third of
//   an 852 pt-tall screen.
// - bottom 110 pt: the flashlight and camera buttons (~50 pt, inset ~40 pt
//   from the bottom edge) and the home indicator (34 pt safe-area inset).
// Notifications also stack up from the bottom; they cover whatever is there.
const LOCK_SCREEN_SAFE_PT = { top: 280, right: 0, bottom: 110, left: 0 };

const WALLPAPERS = [
    { id: 'iphone-17', label: 'iPhone 17, 17 Pro, 16 Pro', scale: 3, px: [1206, 2622] },
    { id: 'iphone-17-pro-max', label: 'iPhone 17 Pro Max, 16 Pro Max', scale: 3, px: [1320, 2868] },
    { id: 'iphone-air', label: 'iPhone Air', scale: 3, px: [1260, 2736] },
    { id: 'iphone-16', label: 'iPhone 16, 15, 15 Pro, 14 Pro', scale: 3, px: [1179, 2556] },
    { id: 'iphone-16-plus', label: 'iPhone 16 Plus, 15 Plus, 15 Pro Max, 14 Pro Max', scale: 3, px: [1290, 2796] },
    { id: 'iphone-16e', label: 'iPhone 16e, 14, 13, 13 Pro, 12, 12 Pro', scale: 3, px: [1170, 2532] },
];

const scaled = ([w, h], scale) => ({ width: w * scale, height: h * scale, scale });
const safeFor = scale => Object.fromEntries(Object.entries(LOCK_SCREEN_SAFE_PT).map(([k, v]) => [k, v * scale]));

export const CUSTOM_PRESET_ID = 'custom';
export const CUSTOM_SIZE_LIMITS = { min: 200, max: 6000 };

// The size the original app exported (338×158 pt medium widget at 6×, i.e.
// twice the 6.1″ iPhone @3x size). Saved states may still point at it.
export const LEGACY_PRESET_ID = 'ios-medium';

export const PRESET_GROUPS = [
    { id: 'widgets', label: 'Home Screen widgets' },
    { id: 'wallpapers', label: 'Wallpapers' },
    { id: 'custom', label: 'Custom' },
];

const widgetKind = (id, label, key) => ({
    id,
    group: 'widgets',
    label,
    defaultDevice: 'iphone',
    devices: IPHONE_WIDGETS.map(d => ({
        id: d.id,
        label: d.label,
        models: d.models,
        presetId: `${id}-${d.id}`,
        ...scaled(d[key], d.scale),
    })),
});

// Kinds of export, each with its device options, in the order the dialog
// lists them.
export const EXPORT_KINDS = [
    widgetKind('ios-small', 'Small widget', 'small'),
    widgetKind('ios-medium', 'Medium widget', 'medium'),
    widgetKind('ios-large', 'Large widget', 'large'),
    {
        id: 'ipad-xl',
        group: 'widgets',
        label: 'iPad Extra Large widget',
        defaultDevice: 'ipad-11',
        devices: IPAD_XL_WIDGETS.map(d => ({ id: d.id, label: d.label, models: d.models, presetId: `ipad-xl-${d.id}`, ...scaled(d.size, d.scale) })),
    },
    {
        id: 'wallpaper',
        group: 'wallpapers',
        label: 'iPhone Lock Screen wallpaper',
        defaultDevice: 'iphone-17',
        devices: WALLPAPERS.map(d => ({
            id: d.id,
            label: d.label,
            presetId: `wallpaper-${d.id}`,
            width: d.px[0],
            height: d.px[1],
            scale: d.scale,
            safeArea: safeFor(d.scale),
        })),
    },
    { id: CUSTOM_PRESET_ID, group: 'custom', label: 'Custom size', devices: [] },
];

// The legacy size is offered as one more device option of the Medium widget.
EXPORT_KINDS[1].devices.push({
    id: 'legacy',
    label: 'Original size',
    models: '2× the 6.1″ iPhone widget',
    presetId: LEGACY_PRESET_ID,
    width: 2028,
    height: 948,
    scale: 6,
});

// Every concrete preset: { id, kind, device, label, width, height, safeArea? }.
export const EXPORT_PRESETS = EXPORT_KINDS.flatMap(kind =>
    kind.devices.map(({ presetId, id, label, models, ...size }) => ({
        id: presetId,
        kind: kind.id,
        device: id,
        label: `${kind.label} – ${label}`,
        ...size,
    })),
);

const DEFAULT_PRESET_ID = LEGACY_PRESET_ID;

export const getKind = id => EXPORT_KINDS.find(k => k.id === id) || null;
export const findPreset = id => EXPORT_PRESETS.find(p => p.id === id) || null;

// The preset id for a kind and device. Falls back to the kind's default
// device when that kind has no such device.
export function presetIdFor(kindId, deviceId) {
    if (kindId === CUSTOM_PRESET_ID) return CUSTOM_PRESET_ID;
    const kind = getKind(kindId);
    if (!kind) return DEFAULT_PRESET_ID;
    const device = kind.devices.find(d => d.id === deviceId) || kind.devices.find(d => d.id === kind.defaultDevice);
    return device.presetId;
}

// { kind, device } for a stored preset id; unknown ids resolve to the default.
export function describePresetId(presetId) {
    if (presetId === CUSTOM_PRESET_ID) return { kind: CUSTOM_PRESET_ID, device: null };
    const preset = findPreset(presetId) || findPreset(DEFAULT_PRESET_ID);
    return { kind: preset.kind, device: preset.device };
}

export const clampCustomSize = n =>
    Math.min(CUSTOM_SIZE_LIMITS.max, Math.max(CUSTOM_SIZE_LIMITS.min, Math.round(Number(n) || 0)));

export function resolveExportTarget(state) {
    if (state.exportPresetId === CUSTOM_PRESET_ID) {
        return {
            id: CUSTOM_PRESET_ID,
            label: 'Custom size',
            width: clampCustomSize(state.customSize.w),
            height: clampCustomSize(state.customSize.h),
        };
    }
    return findPreset(state.exportPresetId) || findPreset(DEFAULT_PRESET_ID);
}

export const exportFilename = target => `timetable-${target.id}.png`;
