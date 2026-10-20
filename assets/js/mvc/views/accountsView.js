// MVC - View: desk accounts. Super admin provisions logins. Officers stay on the roster.

function renderAccountsPage() {
    const session = currentSession();
    const notice = document.getElementById('passwordNotice');
    if (notice) {
        if (session?.mustChangePassword) {
            notice.hidden = false;
            notice.dataset.state = 'offline';
            notice.innerHTML = '<div><strong>Change your password</strong><span>The super admin set a temporary password. Save a new one before using the desk.</span></div>';
        } else {
            notice.hidden = true;
        }
    }

    const panel = document.getElementById('personnelPanel');
    if (panel) panel.hidden = !isSuperAdmin();
    renderPersonnelList();
}

function renderPersonnelList() {
    const target = document.getElementById('personnelList');
    if (!target || !isSuperAdmin()) return;

    const me = currentActor().userId;
    target.innerHTML = (state.users || []).map((user) => {
        const status = user.active ? 'Active' : 'Disabled';
        const self = user.id === me;
        return `
            <div class="account-row">
                <div>
                    <strong>${user.fullName}</strong>
                    <small>${user.username} · ${roleLabel(user.role)} · ${status}</small>
                </div>
                <div class="row-actions">
                    <div class="password-field">
                        <input id="resetPassword-${user.id}" type="password" data-reset-password="${user.id}" placeholder="Temporary password" autocomplete="new-password">
                        <button class="btn tiny" type="button" data-toggle-password="resetPassword-${user.id}">Show</button>
                    </div>
                    <button class="btn tiny" type="button" data-reset-user="${user.id}">Reset password</button>
                    <button class="btn tiny" type="button" data-toggle-user="${user.id}" ${self ? 'disabled' : ''}>${user.active ? 'Disable' : 'Enable'}</button>
                    <button class="btn tiny" type="button" data-delete-user="${user.id}" ${self ? 'disabled' : ''}>${icon('trash')} Delete</button>
                </div>
            </div>
        `;
    }).join('');
}
