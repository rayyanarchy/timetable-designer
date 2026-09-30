import { resolveExportTarget } from './presets.js';
import { renderToCanvas } from './render-canvas.js';
import { getTheme } from './themes.js';

export async function downloadPng(state) {
    const target = resolveExportTarget(state);
    const canvas = document.createElement('canvas');
    await renderToCanvas(canvas, state, target, getTheme(state.themeId));
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    const link = document.createElement('a');
    link.download = `timetable-${target.id}.png`;
    link.href = URL.createObjectURL(blob);
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 0);
}
