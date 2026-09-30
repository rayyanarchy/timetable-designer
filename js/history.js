// Undo/redo over whole states. States are immutable values, so keeping
// references is cheap. Pure: main.js owns the instance and the key bindings.

export const HISTORY_LIMIT = 100;

export const createHistory = () => ({ past: [], future: [] });

// Records `previous` before a change. Any new change clears the redo stack.
export function record(history, previous) {
    const past = [...history.past, previous].slice(-HISTORY_LIMIT);
    return { past, future: [] };
}

// Returns { history, state } or null when there is nothing to undo.
export function undo(history, current) {
    if (!history.past.length) return null;
    const state = history.past[history.past.length - 1];
    return { state, history: { past: history.past.slice(0, -1), future: [current, ...history.future] } };
}

export function redo(history, current) {
    if (!history.future.length) return null;
    const [state, ...future] = history.future;
    return { state, history: { past: [...history.past, current], future } };
}
