// A style is one token object read by the layout (so the editor card and the
// exported image look the same) and applied to the page as CSS variables.
// Metrics are in points and scaled per export size (see layout.pointScale).
//
// subjectStyle decides how a class looks:
//   'tint'  – a soft wash of the subject colour, name in a deep shade of it;
//   'solid' – the full colour with black or white text;
//   'dot'   – a neutral cell with a small coloured dot before the name.

import { mix, readableOn, textColorFor } from './color.js';

const ATKINSON = '"Atkinson Hyperlegible Next", "Atkinson Hyperlegible", system-ui, sans-serif';
const SN_PRO = '"SN Pro", system-ui, sans-serif';

const base = {
    fontFamily: ATKINSON,
    headerWeight: 700,
    timeWeight: 500,
    cellWeight: 600,
    noteWeight: 400,
    headerBg: 'transparent',
    gridLine: 'transparent',
    gridLineWidth: 0,
    radius: 6,
    gap: 3,
    padding: 12,
    align: 'left',
    subjectStyle: 'tint',
    tint: 0.22,
    dark: false,
};

export const THEMES = {
    paper: {
        ...base,
        id: 'paper',
        name: 'Paper',
        background: '#faf8f3',
        headerText: '#1e1c18',
        timeText: '#8c877c',
        cellBg: '#f1ede4',
        cellText: '#1e1c18',
        breakBg: '#f5f2eb',
        breakText: '#9a9489',
    },
    ink: {
        ...base,
        id: 'ink',
        name: 'Ink',
        dark: true,
        tint: 0.3,
        background: '#141414',
        headerText: '#f3f0e8',
        timeText: '#8b877f',
        cellBg: '#211f1e',
        cellText: '#f3f0e8',
        breakBg: '#1a1918',
        breakText: '#7c786f',
    },
    mist: {
        ...base,
        id: 'mist',
        name: 'Mist',
        tint: 0.2,
        background: '#e9eef3',
        headerText: '#15202b',
        timeText: '#6f7c8a',
        cellBg: '#ffffff',
        cellText: '#15202b',
        breakBg: '#dfe6ed',
        breakText: '#7d8a98',
    },
    bloom: {
        ...base,
        id: 'bloom',
        name: 'Bloom',
        fontFamily: SN_PRO,
        headerWeight: 700,
        cellWeight: 700,
        align: 'center',
        subjectStyle: 'solid',
        radius: 8,
        background: '#ffffff',
        headerText: '#111111',
        timeText: '#8a8a8e',
        cellBg: '#f2f2f4',
        cellText: '#111111',
        breakBg: '#f7f7f8',
        breakText: '#9a9aa0',
    },
    mono: {
        ...base,
        id: 'mono',
        name: 'Mono',
        fontFamily: SN_PRO,
        subjectStyle: 'dot',
        radius: 0,
        gap: 0,
        gridLine: '#e6e4df',
        gridLineWidth: 0.5,
        background: '#ffffff',
        headerText: '#111111',
        timeText: '#85827a',
        cellBg: '#ffffff',
        cellText: '#111111',
        breakBg: '#f6f5f2',
        breakText: '#85827a',
    },
};

export const DEFAULT_THEME_ID = 'paper';

export function getTheme(id) {
    return THEMES[id] || THEMES[DEFAULT_THEME_ID];
}

// How a cell holding a subject of this colour looks in a style:
// { fill, text, note, dot? }.
export function subjectAppearance(theme, color) {
    if (theme.subjectStyle === 'solid') {
        const text = textColorFor(color);
        return { fill: color, text, note: text };
    }
    if (theme.subjectStyle === 'dot') {
        return { fill: theme.cellBg, text: theme.cellText, note: theme.timeText, dot: color };
    }
    const fill = mix(theme.background, color, theme.tint);
    const text = readableOn(color, fill, theme.dark ? '#ffffff' : '#000000');
    return { fill, text, note: text };
}

export function applyThemeToDocument(theme, root = document.documentElement) {
    const vars = {
        '--tt-font': theme.fontFamily,
        '--tt-bg': theme.background,
        '--tt-text': theme.headerText,
        '--tt-muted': theme.timeText,
        '--tt-cell-bg': theme.cellBg,
    };
    for (const [name, value] of Object.entries(vars)) root.style.setProperty(name, value);
    root.dataset.theme = theme.id;
    root.dataset.themeTone = theme.dark ? 'dark' : 'light';
}
