import { exportFilename, resolveExportTarget } from './presets.js';
import { renderToCanvas } from './render-canvas.js';
import { getTheme } from './themes.js';

// Saves an already-rendered canvas as a PNG download.
export async function downloadCanvasPng(canvas, filename) {
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('The image could not be encoded.');
    const link = document.createElement('a');
    link.download = filename;
    link.href = URL.createObjectURL(blob);
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 0);
}

// Renders the state at its export preset's exact size and downloads it.
export async function downloadPng(state) {
    const target = resolveExportTarget(state);
    const canvas = document.createElement('canvas');
    await renderToCanvas(canvas, state, target, getTheme(state.themeId));
    await downloadCanvasPng(canvas, exportFilename(target));
}
