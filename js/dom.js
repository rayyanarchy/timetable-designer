// Tiny DOM helpers shared by the UI modules.

// el('button', { class: 'x', onclick: fn, dataset: {...}, style: {...} }, [children])
export function el(tag, attrs = {}, children = []) {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(attrs)) {
        if (value === undefined || value === null || value === false) continue;
        if (key === 'text') node.textContent = value;
        else if (key === 'dataset') Object.assign(node.dataset, value);
        else if (key === 'style') Object.assign(node.style, value);
        else if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
        else if (key === 'value') node.value = value;
        else node.setAttribute(key, value === true ? '' : value);
    }
    node.append(...children.filter(c => c !== null && c !== undefined && c !== false));
    return node;
}

const SVG_NS = 'http://www.w3.org/2000/svg';
const ICONS = {
    plus: 'M12 5v14M5 12h14',
    down: 'M12 4v12m0 0-5-5m5 5 5-5M5 20h14',
    chevron: 'm6 9 6 6 6-6',
    up: 'm18 15-6-6-6 6',
    left: 'm15 18-6-6 6-6',
    right: 'm9 18 6-6-6-6',
    trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3',
    check: 'm5 12 5 5L20 7',
    save: 'M12 3v12m0 0-4-4m4 4 4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2',
    open: 'M12 21V9m0 0-4 4m4-4 4 4M4 7V5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v2',
    split: 'M12 4v16M4 12h4m8 0h4',
    merge: 'M4 12h16m-4-4 4 4-4 4M8 8l-4 4 4 4',
    x: 'M6 6l12 12M18 6 6 18',
};

export function icon(name, size = 18) {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('width', size);
    svg.setAttribute('height', size);
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('class', 'icon');
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', ICONS[name]);
    svg.append(path);
    return svg;
}
