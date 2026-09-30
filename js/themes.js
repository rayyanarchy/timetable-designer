// A theme is one token object read by the layout (so the editor card and the
// exported image look the same) and applied to the page as CSS variables.
// Metrics are in points and scaled per export size (see layout.pointScale).

import { textColorFor } from './color.js';

export const THEMES = {
    classic: {
        id: 'classic',
        name: 'Classic',
        fontFamily: '"Segoe UI", Tahoma, Geneva, Verdana, system-ui, sans-serif',
        headerWeight: 700,
        timeWeight: 700,
        cellWeight: 600,
        noteWeight: 600,
        background: '#ffffff',
        headerBg: '#ffffff',
        headerText: '#333333',
        timeText: '#333333',
        cellBg: '#ffffff',
        cellText: '#1b1b1f',
        breakBg: '#f1f1f1',
        breakText: '#777777',
        gridLine: '#dddddd',
        gridLineWidth: 0.35,
        radius: 0,
        gap: 0,
        padding: 6,
        align: 'center',
        subjectStyle: 'solid',
    },
};

export const DEFAULT_THEME_ID = 'classic';

export function getTheme(id) {
    return THEMES[id] || THEMES[DEFAULT_THEME_ID];
}

// How a cell holding a subject of this colour looks in a theme:
// { fill, text, note, dot? }.
export function subjectAppearance(theme, color) {
    const text = textColorFor(color);
    return { fill: color, text, note: text };
}

export function applyThemeToDocument(theme, root = document.documentElement) {
    const vars = {
        '--tt-font': theme.fontFamily,
        '--tt-bg': theme.background,
        '--tt-header-bg': theme.headerBg,
        '--tt-header-text': theme.headerText,
        '--tt-cell-bg': theme.cellBg,
        '--tt-cell-text': theme.cellText,
        '--tt-break-bg': theme.breakBg,
        '--tt-break-text': theme.breakText,
        '--tt-grid-line': theme.gridLine,
    };
    for (const [name, value] of Object.entries(vars)) root.style.setProperty(name, value);
    root.dataset.theme = theme.id;
}
