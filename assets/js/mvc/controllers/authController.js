// MVC - Controller: login/logout flow and post-auth bootstrapping.

function initAuth() {
    const shell = document.getElementById('appShell');
    const overlay = document.getElementById('authOverlay');
    const form = document.getElementById('loginForm');
    const logoutBtn = document.getElementById('logoutBtn');
    const sidebarLogoutBtn = document.getElementById('sidebarLogoutBtn');

    if (form) {
        form.addEventListener('submit', (event) => {
            event.preventDefault();
            const username = getValue('loginUsername').toLowerCase();
            const password = getValue('loginPassword');

            if (!isValidCredential(username, password)) {
                setText('loginError', 'Invalid username or password.');
                return;
            }

            const session = {
                username: username === 'admin' ? 'lguadmin' : username,
                role: 'Traffic Desk',
                loginAtIso: new Date().toISOString()
            };
            saveAuthSession(session);
            setText('loginError', '');
            applyAuthUi(true, session, shell, overlay);

            bootSession();
        });
    }

    const doLogout = () => {
        clearAuthSession();
        window.location.href = 'index.php?page=command';
    };

    if (logoutBtn) logoutBtn.addEventListener('click', doLogout);
    if (sidebarLogoutBtn) sidebarLogoutBtn.addEventListener('click', doLogout);

    const session = loadAuthSession();
    applyAuthUi(Boolean(session), session, shell, overlay);

    return Boolean(session);
}
