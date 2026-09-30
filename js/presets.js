// Export size presets. Sizes are in image pixels; safeArea (optional) is the
// region the timetable must stay out of, e.g. a wallpaper's clock and dock.

export const EXPORT_PRESETS = [
    { id: 'ios-medium', label: 'iOS Medium widget', width: 2028, height: 948 },
];

export const CUSTOM_PRESET_ID = 'custom';
export const CUSTOM_SIZE_LIMITS = { min: 200, max: 6000 };

export function resolveExportTarget(state) {
    if (state.exportPresetId === CUSTOM_PRESET_ID) {
        const clamp = n => Math.min(CUSTOM_SIZE_LIMITS.max, Math.max(CUSTOM_SIZE_LIMITS.min, Math.round(n)));
        return { id: CUSTOM_PRESET_ID, width: clamp(state.customSize.w), height: clamp(state.customSize.h) };
    }
    return EXPORT_PRESETS.find(p => p.id === state.exportPresetId) || EXPORT_PRESETS[0];
}
