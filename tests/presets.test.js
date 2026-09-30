import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
    CUSTOM_PRESET_ID, CUSTOM_SIZE_LIMITS, EXPORT_KINDS, EXPORT_PRESETS, LEGACY_PRESET_ID, describePresetId,
    exportFilename, presetIdFor, resolveExportTarget,
} from '../js/presets.js';
import { createDefaultState, setCustomSize, setExportPreset } from '../js/state.js';

const target = id => resolveExportTarget(setExportPreset(createDefaultState(), id));

test('preset ids are unique and sizes are whole pixels', () => {
    const ids = EXPORT_PRESETS.map(p => p.id);
    assert.equal(new Set(ids).size, ids.length);
    for (const p of EXPORT_PRESETS) {
        assert.ok(Number.isInteger(p.width) && p.width > 0, p.id);
        assert.ok(Number.isInteger(p.height) && p.height > 0, p.id);
    }
});

test('new timetables default to the generic iPhone Medium widget', () => {
    assert.equal(createDefaultState().exportPresetId, 'ios-medium-iphone');
});

test('the legacy id still resolves to the original 2028×948 image', () => {
    const t = target(LEGACY_PRESET_ID);
    assert.deepEqual([t.id, t.width, t.height], ['ios-medium', 2028, 948]);
    assert.equal(exportFilename(t), 'timetable-ios-medium.png');
});

test('widget sizes follow the HIG point sizes at the device scale', () => {
    const size = id => [target(id).width, target(id).height];
    assert.deepEqual(size('ios-small-iphone'), [474, 474]); // 158 pt @3x
    assert.deepEqual(size('ios-medium-iphone'), [1014, 474]); // 338×158 pt @3x
    assert.deepEqual(size('ios-large-iphone'), [1014, 1062]); // 338×354 pt @3x
    assert.deepEqual(size('ios-medium-iphone-max'), [1092, 510]); // 364×170 pt @3x
    assert.deepEqual(size('ios-small-iphone-se'), [296, 296]); // 148 pt @2x
    assert.deepEqual(size('ipad-xl-ipad-13'), [1496, 712]); // 748×356 pt @2x
    assert.deepEqual(size('ipad-xl-ipad-11'), [1256, 600]); // 628×300 pt @2x
});

test('wallpapers leave most of the screen inside their safe area', () => {
    const wallpapers = EXPORT_PRESETS.filter(p => p.kind === 'wallpaper');
    assert.ok(wallpapers.length >= 3);
    for (const p of wallpapers) {
        const { top, bottom, left, right } = p.safeArea;
        assert.ok(top > 0 && bottom > 0, p.id);
        assert.ok(p.height - top - bottom > p.height * 0.4, p.id);
        assert.ok(p.width - left - right > p.width * 0.9, p.id);
    }
    assert.deepEqual([target('wallpaper-iphone-17').width, target('wallpaper-iphone-17').height], [1206, 2622]);
});

test('custom sizes are clamped to the limits', () => {
    let s = setExportPreset(createDefaultState(), CUSTOM_PRESET_ID);
    s = setCustomSize(s, 50, 99999);
    const t = resolveExportTarget(s);
    assert.deepEqual([t.width, t.height], [CUSTOM_SIZE_LIMITS.min, CUSTOM_SIZE_LIMITS.max]);
    assert.equal(exportFilename(t), 'timetable-custom.png');
});

test('unknown ids fall back to the default preset', () => {
    assert.equal(target('nope').id, LEGACY_PRESET_ID);
    assert.deepEqual(describePresetId('nope'), { kind: 'ios-medium', device: 'legacy' });
});

test('changing kind keeps the device when the new kind offers it', () => {
    assert.equal(presetIdFor('ios-large', 'iphone-max'), 'ios-large-iphone-max');
    assert.equal(presetIdFor('ios-small', 'legacy'), 'ios-small-iphone');
    assert.equal(presetIdFor('ipad-xl', 'iphone-max'), 'ipad-xl-ipad-11');
    assert.equal(presetIdFor(CUSTOM_PRESET_ID, 'iphone'), CUSTOM_PRESET_ID);
    for (const kind of EXPORT_KINDS) {
        for (const device of kind.devices) {
            assert.deepEqual(describePresetId(presetIdFor(kind.id, device.id)), { kind: kind.id, device: device.id });
        }
    }
});
