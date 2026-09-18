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
        const name = session?.username ? session.username.toUpperCase() : 'LGUADMIN';
        setText('currentUserName', name);
        setText('currentUserRole', session?.role || 'Traffic Desk');
        setText('currentUserAvatar', name.slice(0, 2));
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
