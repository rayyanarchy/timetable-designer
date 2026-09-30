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
    const weights = new Set([theme.headerWeight, theme.timeWeight, theme.cellWeight, theme.noteWeight]);
    await Promise.all([...weights].map(w => document.fonts.load(`${w} 16px ${theme.fontFamily}`))).catch(() => {});
}

// Dots in the 'dot' subject style are this share of the font size across,
// followed by the same share as spacing (see layout.js dotRoom).
export const DOT_SIZE = 0.45;

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
    if (item.vertical) {
        // Draw as if the box were turned a quarter left, reading bottom to top.
        ctx.save();
        ctx.translate(item.x + item.w / 2, item.y + item.h / 2);
        ctx.rotate(-Math.PI / 2);
        drawBox(ctx, { ...item, vertical: false, x: -item.h / 2, y: -item.w / 2, w: item.h, h: item.w, align: 'center', fill: 'transparent', stroke: null });
        ctx.restore();
        return;
    }
    const total = item.lines.reduce((sum, l) => sum + l.size * LINE_HEIGHT, 0);
    let y = item.y + (item.h - total) / 2;
    const left = item.align === 'left';
    ctx.textAlign = left ? 'left' : 'center';
    ctx.textBaseline = 'middle';
    item.lines.forEach(l => {
        const lineH = l.size * LINE_HEIGHT;
        const mid = y + lineH / 2;
        ctx.font = l.font;
        let x = left ? item.x + item.padX : item.x + item.w / 2;
        if (l.dot) {
            const d = l.size * DOT_SIZE;
            const textW = ctx.measureText(l.text).width;
            const dotX = left ? x : x - (textW + d * 2) / 2;
            ctx.fillStyle = l.dot;
            ctx.beginPath();
            ctx.arc(dotX + d / 2, mid, d / 2, 0, Math.PI * 2);
            ctx.fill();
            x = left ? x + d * 2 : x + d;
        }
        ctx.fillStyle = l.color || item.textColor;
        ctx.fillText(l.text, x, mid);
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
