// In-page confirmation, used instead of window.confirm so the app never opens
// a browser dialog. Resolves true when the user confirms, false otherwise.

let current = null;

export function confirmInPage(message, { confirmLabel = 'Remove', cancelLabel = 'Cancel' } = {}) {
    if (current) current.finish(false);
    const returnFocus = document.activeElement;

    return new Promise(resolve => {
        const overlay = document.createElement('div');
        overlay.className = 'confirm-overlay';
        const box = document.createElement('div');
        box.className = 'confirm-box';
        box.setAttribute('role', 'alertdialog');
        box.setAttribute('aria-modal', 'true');
        const text = document.createElement('p');
        text.id = 'confirm-message';
        text.textContent = message;
        box.setAttribute('aria-describedby', text.id);

        const cancel = document.createElement('button');
        cancel.type = 'button';
        cancel.className = 'secondary';
        cancel.textContent = cancelLabel;
        const ok = document.createElement('button');
        ok.type = 'button';
        ok.className = 'danger';
        ok.textContent = confirmLabel;
        const buttons = document.createElement('div');
        buttons.className = 'confirm-buttons';
        buttons.append(cancel, ok);
        box.append(text, buttons);
        overlay.append(box);

        const finish = result => {
            if (current !== handle) return;
            current = null;
            overlay.remove();
            document.removeEventListener('keydown', onKey, true);
            // The element that asked may have been re-rendered; only restore
            // focus if it is still in the document.
            if (returnFocus && returnFocus.isConnected) returnFocus.focus();
            resolve(result);
        };
        const onKey = event => {
            if (event.key === 'Escape') {
                event.preventDefault();
                event.stopPropagation();
                finish(false);
            } else if (event.key === 'Tab') {
                // Keep focus inside the two buttons.
                event.preventDefault();
                (document.activeElement === ok ? cancel : ok).focus();
            }
        };
        const handle = { finish };
        current = handle;

        cancel.addEventListener('click', () => finish(false));
        ok.addEventListener('click', () => finish(true));
        overlay.addEventListener('pointerdown', event => { if (event.target === overlay) finish(false); });
        document.addEventListener('keydown', onKey, true);
        document.body.append(overlay);
        cancel.focus();
    });
}
