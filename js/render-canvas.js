// Draws a layout from layout.js onto a canvas. Used for both the exported PNG
// and the export preview, so the two always match.

import { computeLayout } from './layout.js';

const LINE_HEIGHT = 1.2;

let measureCtx = null;
export function measureText(text, font) {
    measureCtx ??= document.createElement('canvas').getContext('2d');
    measureCtx.font = font;
    return measureCtx.measureText(text).width;
}

// Canvas text only uses fonts that are already loaded, so wait for the
// theme's fonts before measuring or drawing.
export async function ensureFonts(theme) {
    if (!document.fonts) return;
    await Promise.all([
        document.fonts.load(`${theme.headerWeight} 16px ${theme.fontFamily}`),
        document.fonts.load(`${theme.cellWeight} 16px ${theme.fontFamily}`),
    ]).catch(() => {});
}

function drawBox(ctx, item) {
    ctx.beginPath();
    if (item.radius > 0 && ctx.roundRect) ctx.roundRect(item.x, item.y, item.w, item.h, item.radius);
    else ctx.rect(item.x, item.y, item.w, item.h);
    ctx.fillStyle = item.fill;
    ctx.fill();
    if (item.stroke) {
        ctx.strokeStyle = item.stroke.color;
        ctx.lineWidth = item.stroke.width;
        ctx.stroke();
    }

    if (!item.lines.length) return;
    const total = item.lines.reduce((sum, l) => sum + l.size * LINE_HEIGHT, 0);
    let y = item.y + (item.h - total) / 2;
    ctx.fillStyle = item.textColor;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    item.lines.forEach(l => {
        const lineH = l.size * LINE_HEIGHT;
        ctx.font = l.font;
        ctx.fillText(l.text, item.x + item.w / 2, y + lineH / 2);
        y += lineH;
    });
}

export function drawLayout(ctx, layout) {
    ctx.fillStyle = layout.background;
    ctx.fillRect(0, 0, layout.width, layout.height);
    layout.items.forEach(item => drawBox(ctx, item));
}

// Renders the timetable at exactly width × height pixels.
export async function renderToCanvas(canvas, state, target, theme) {
    await ensureFonts(theme);
    canvas.width = target.width;
    canvas.height = target.height;
    const layout = computeLayout(state, target, theme, measureText);
    drawLayout(canvas.getContext('2d'), layout);
    return layout;
}
