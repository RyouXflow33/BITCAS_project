// MVC - View: sidebar, clock, auth UI and global navigation counters.

function renderGlobalCounters() {
    const navCount = document.getElementById('reportNavCount');
    if (!navCount || !state) return;
    const openCount = getOpenCameraReports().length;
    navCount.textContent = String(openCount);
}

function applyAuthUi(isAuthed, session, shell, overlay) {
    if (!shell || !overlay) return;

    if (isAuthed) {
        overlay.hidden = true;
        shell.hidden = false;
        const name = session?.fullName || (session?.username ? session.username.toUpperCase() : 'LGU Admin');
        setText('currentUserName', name);
        setText('currentUserRole', roleLabel(session?.role));
        setText('currentUserAvatar', name.slice(0, 2).toUpperCase());
        return;
    }

    shell.hidden = true;
    overlay.hidden = false;
}

function setupSidebar() {
    const sidebar = document.getElementById('sidebar');
    const toggle = document.getElementById('menuToggle');
    if (toggle && sidebar) {
        toggle.addEventListener('click', () => sidebar.classList.toggle('open'));
    }

    const settingsToggle = document.getElementById('settingsToggle');
    const settingsMenu = document.getElementById('settingsMenu');
    if (settingsToggle && settingsMenu) {
        settingsToggle.addEventListener('click', () => {
            const open = settingsToggle.getAttribute('aria-expanded') === 'true';
            settingsToggle.setAttribute('aria-expanded', String(!open));
            settingsMenu.hidden = open;
        });
    }
}

function setupClock() {
    const clock = document.getElementById('clock');
    if (!clock) return;
    const tickClock = () => {
        const now = new Date();
        clock.textContent = now.toLocaleTimeString([], { hour12: false });
    };
    tickClock();

    if (!window.__bitcasClock) {
        window.__bitcasClock = setInterval(tickClock, 1000);
    }
}
