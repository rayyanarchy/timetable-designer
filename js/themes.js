// A theme is one token object shared by the editor (as CSS custom properties)
// and the canvas renderer, so the editor and exported image look alike.

export const THEMES = {
    classic: {
        id: 'classic',
        name: 'Classic',
        fontFamily: '"Segoe UI", Tahoma, Geneva, Verdana, system-ui, sans-serif',
        headerWeight: 700,
        cellWeight: 600,
        background: '#ffffff',
        headerBg: '#ffffff',
        headerText: '#333333',
        cellBg: '#ffffff',
        cellText: '#1b1b1f',
        breakBg: '#f1f1f1',
        breakText: '#777777',
        gridLine: '#dddddd',
        gridLineWidth: 1, // relative to a 1000px-wide image; scaled by the layout
        radius: 0,        // cell corner radius, same scale as gridLineWidth
        gap: 0,           // space between cells, same scale
    },
};

export const DEFAULT_THEME_ID = 'classic';

export function getTheme(id) {
    return THEMES[id] || THEMES[DEFAULT_THEME_ID];
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
