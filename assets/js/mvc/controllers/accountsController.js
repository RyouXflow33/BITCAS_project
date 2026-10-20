// MVC - Controller: super-admin desk accounts and each user's own password.

function initAccountsPage() {
    renderAccountsPage();
    bindPasswordToggles();

    const changeForm = document.getElementById('changePasswordForm');
    if (changeForm) {
        changeForm.addEventListener('submit', async (event) => {
            event.preventDefault();
            const error = document.getElementById('changePasswordError');
            const result = await changeOwnPassword(getValue('currentPassword'), getValue('nextPassword'));
            if (result.error) {
                error.hidden = false;
                error.textContent = result.error;
                return;
            }
            error.hidden = true;
            changeForm.reset();
            applyAuthUi(true, currentSession(), document.getElementById('appShell'), document.getElementById('authOverlay'));
            renderAccountsPage();
        });
    }

    const addForm = document.getElementById('addDeskUserForm');
    if (addForm) {
        addForm.addEventListener('submit', async (event) => {
            event.preventDefault();
            const error = document.getElementById('addDeskUserError');
            const pending = createDeskUser({
                fullName: getValue('deskFullName'),
                username: getValue('deskUsername'),
                password: getValue('deskPassword')
            });
            if (pending.error) {
                error.hidden = false;
                error.textContent = pending.error;
                return;
            }
            const saved = await commitDeskUser(pending.pending);
            if (saved.error) {
                error.hidden = false;
                error.textContent = saved.error;
                return;
            }
            error.hidden = true;
            addForm.reset();
            renderAccountsPage();
        });
    }

    const list = document.getElementById('personnelList');
    if (list) {
        list.addEventListener('click', async (event) => {
            const reset = event.target.closest('[data-reset-user]');
            const toggle = event.target.closest('[data-toggle-user]');
            if (reset) {
                const input = list.querySelector(`[data-reset-password="${reset.dataset.resetUser}"]`);
                const result = await resetDeskUserPassword(reset.dataset.resetUser, input ? input.value : '');
                if (result.error) {
                    window.alert(result.error);
                    return;
                }
                if (input) input.value = '';
                renderAccountsPage();
                return;
            }
            if (toggle) {
                const user = state.users.find((item) => item.id === toggle.dataset.toggleUser);
                const result = await setDeskUserActive(toggle.dataset.toggleUser, user ? !user.active : false);
                if (result.error) {
                    window.alert(result.error);
                    return;
                }
                renderAccountsPage();
                return;
            }
            const remove = event.target.closest('[data-delete-user]');
            if (remove) {
                const user = state.users.find((item) => item.id === remove.dataset.deleteUser);
                const name = user ? user.username : 'this account';
                if (!window.confirm(`Delete the desk login for ${name}?`)) return;
                const result = await deleteDeskUser(remove.dataset.deleteUser);
                if (result.error) {
                    window.alert(result.error);
                    return;
                }
                renderAccountsPage();
            }
        });
    }
}

function bindPasswordToggles() {
    if (window.__bitcasPasswordToggle) return;
    const layout = document.querySelector('.accounts-layout');
    if (!layout) return;
    window.__bitcasPasswordToggle = true;
    layout.addEventListener('click', (event) => {
        const button = event.target.closest('[data-toggle-password]');
        if (!button) return;
        const input = document.getElementById(button.dataset.togglePassword);
        if (!input) return;
        const show = input.type === 'password';
        input.type = show ? 'text' : 'password';
        button.textContent = show ? 'Hide' : 'Show';
    });
}
