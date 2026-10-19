// MVC - Controller: login/logout flow and post-auth bootstrapping.

function initAuth() {
    const shell = document.getElementById('appShell');
    const overlay = document.getElementById('authOverlay');
    const form = document.getElementById('loginForm');
    const logoutBtn = document.getElementById('logoutBtn');
    const sidebarLogoutBtn = document.getElementById('sidebarLogoutBtn');

    const usernameInput = document.getElementById('loginUsername');
    const passwordInput = document.getElementById('loginPassword');
    if (usernameInput) usernameInput.value = '';
    if (passwordInput) passwordInput.value = '';

    if (form) {
        form.addEventListener('submit', async (event) => {
            event.preventDefault();
            const username = getValue('loginUsername').toLowerCase();
            const password = getValue('loginPassword');
            const result = await authenticateUser(username, password);
            if (result.error) {
                setText('loginError', result.error);
                return;
            }

            const session = sessionFromUser(result.user);
            saveAuthSession(session);
            setText('loginError', '');
            if (session.mustChangePassword && document.body.dataset.page !== 'accounts') {
                window.location.href = 'index.php?page=accounts';
                return;
            }
            applyAuthUi(true, session, shell, overlay);
            bootSession();
        });
    }

    const doLogout = async () => {
        await clearAuthSession();
        applyAuthUi(false, null, shell, overlay);
        if (usernameInput) usernameInput.value = '';
        if (passwordInput) passwordInput.value = '';
        if (window.__bitcasVisionPoller) {
            clearInterval(window.__bitcasVisionPoller);
            window.__bitcasVisionPoller = null;
        }
        window.location.replace('index.php?page=command');
    };

    window.addEventListener('pageshow', (event) => {
        if (!event.persisted) return;
        const restored = loadAuthSession();
        if (!restored) {
            if (window.__bitcasVisionPoller) {
                clearInterval(window.__bitcasVisionPoller);
                window.__bitcasVisionPoller = null;
            }
            applyAuthUi(false, null, shell, overlay);
            if (usernameInput) usernameInput.value = '';
            if (passwordInput) passwordInput.value = '';
            return;
        }
        applyAuthUi(true, restored, shell, overlay);
    });

    if (logoutBtn) logoutBtn.addEventListener('click', doLogout);
    if (sidebarLogoutBtn) sidebarLogoutBtn.addEventListener('click', doLogout);

    const session = loadAuthSession();
    if (session?.mustChangePassword && document.body.dataset.page !== 'accounts') {
        window.location.href = 'index.php?page=accounts';
        return false;
    }
    applyAuthUi(Boolean(session), session, shell, overlay);

    return Boolean(session);
}
