// Bright, student-friendly palette. Each colour keeps readable text on top
// (see textColorFor) so it can be used for cells in any theme.
export const SUBJECT_PALETTE = [
    '#FF6B6B', '#FFA94D', '#FFD43B', '#69DB7C', '#38D9A9',
    '#4DABF7', '#748FFC', '#B197FC', '#F783AC', '#A9E34B',
];

// Picks the first palette colour not already used, cycling when all are taken.
export function nextPaletteColor(usedColors) {
    const used = new Set(usedColors.map(c => c && c.toLowerCase()));
    const free = SUBJECT_PALETTE.find(c => !used.has(c.toLowerCase()));
    return free || SUBJECT_PALETTE[usedColors.length % SUBJECT_PALETTE.length];
}

export function relativeLuminance(hex) {
    const n = hex.replace('#', '');
    const full = n.length === 3 ? n.split('').map(ch => ch + ch).join('') : n;
    const [r, g, b] = [0, 2, 4].map(i => {
        const c = parseInt(full.slice(i, i + 2), 16) / 255;
        return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(l1, l2) {
    const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1];
    return (hi + 0.05) / (lo + 0.05);
}

// Returns whichever of dark/light text has the higher contrast on `bg`.
export function textColorFor(bg, dark = '#1b1b1f', light = '#ffffff') {
    const l = relativeLuminance(bg);
    return contrastRatio(l, relativeLuminance(dark)) >= contrastRatio(l, relativeLuminance(light))
        ? dark
        : light;
}

const toRgb = hex => {
    const n = hex.replace('#', '');
    const full = n.length === 3 ? n.split('').map(ch => ch + ch).join('') : n;
    return [0, 2, 4].map(i => parseInt(full.slice(i, i + 2), 16));
};
const toHex = rgb => `#${rgb.map(v => Math.round(v).toString(16).padStart(2, '0')).join('')}`;

// Blends `a` towards `b`: amount 0 gives a, 1 gives b.
export function mix(a, b, amount) {
    const [ra, rb] = [toRgb(a), toRgb(b)];
    return toHex(ra.map((v, i) => v + (rb[i] - v) * amount));
}

// Moves `color` towards `towards` (usually black or white) until it reaches
// `ratio` contrast on `bg`, so tinted text keeps its hue but stays readable.
export function readableOn(color, bg, towards, ratio = 4.5) {
    const lbg = relativeLuminance(bg);
    for (let t = 0; t <= 1; t += 0.05) {
        const c = mix(color, towards, t);
        if (contrastRatio(relativeLuminance(c), lbg) >= ratio) return c;
    }
    return towards;
}
