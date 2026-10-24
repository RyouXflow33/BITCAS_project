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

    const registerForm = document.getElementById('registerForm');
    const showRegister = document.getElementById('showRegister');
    const showLogin = document.getElementById('showLogin');
    if (showRegister && registerForm && form) {
        showRegister.addEventListener('click', () => {
            form.hidden = true;
            registerForm.hidden = false;
        });
    }
    if (showLogin && registerForm && form) {
        showLogin.addEventListener('click', () => {
            registerForm.hidden = true;
            form.hidden = false;
        });
    }
    if (registerForm) {
        registerForm.addEventListener('submit', async (event) => {
            event.preventDefault();
            const errorEl = document.getElementById('registerError');
            const okEl = document.getElementById('registerOk');
            if (okEl) okEl.hidden = true;
            const fullName = getValue('regFullName');
            const username = getValue('regUsername');
            const password = getValue('regPassword');
            const again = getValue('regPassword2');
            const problem = personNameError(fullName, 'Full name')
                || usernameError(username)
                || passwordError(password, 'Password')
                || (password !== again ? 'The two passwords do not match.' : '');
            if (problem) {
                if (errorEl) errorEl.textContent = problem;
                return;
            }
            const result = await registerAccount(fullName, username, password);
            if (result.error) {
                if (errorEl) errorEl.textContent = result.error;
                return;
            }
            if (errorEl) errorEl.textContent = '';
            if (okEl) {
                okEl.hidden = false;
                okEl.textContent = result.message || 'Registered. A super admin must enable this account before you can sign in.';
            }
            registerForm.reset();
        });
    }

    if (form) {
        form.addEventListener('submit', async (event) => {
            event.preventDefault();
            const username = getValue('loginUsername').toLowerCase();
            const password = getValue('loginPassword');
            const problem = usernameError(username) || passwordError(password, 'Password');
            if (problem) {
                setText('loginError', problem);
                return;
            }
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
