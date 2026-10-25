// MVC - View: Settings page (theme selection + animation switch state).

function renderSettingsPage() {
    const pref = BitcasTheme.getPref();
    document.querySelectorAll('input[name="themePref"]').forEach((input) => {
        input.checked = input.value === pref;
        const card = input.closest('.theme-card');
        if (card) card.classList.toggle('selected', input.checked);
    });

    const nav = BitcasNav.get();
    document.querySelectorAll('input[name="navPref"]').forEach((input) => {
        input.checked = input.value === nav;
        const card = input.closest('.theme-card');
        if (card) card.classList.toggle('selected', input.checked);
    });

    renderSettingsAccounts();

    const motion = document.getElementById('motionToggle');
    if (motion) motion.checked = BitcasMotionPref.isEnabled();
}


// --- Admin accounts (real desk users; IP / unit / last login are SAMPLE values) ---------

function sampleHash(text) {
    let h = 7;
    for (let i = 0; i < text.length; i += 1) h = (h * 31 + text.charCodeAt(i)) >>> 0;
    return h;
}

// Deterministic fake "last login" details. Nothing here is recorded or sent anywhere.
function sampleLoginFor(user, isYou) {
    const h = sampleHash(`${user.id}|${user.username}`);
    const nets = ['203.0.113', '198.51.100', '192.0.2'];
    const devices = ['Chrome \u00b7 Windows 11', 'Edge \u00b7 Windows 10', 'Chrome \u00b7 Android', 'Safari \u00b7 iPhone'];
    return {
        ip: `${nets[h % nets.length]}.${10 + ((h >>> 3) % 200)}`,
        unit: user.role === 'super_admin' ? 'Command Desk 01' : `Traffic Desk Unit ${2 + (h % 4)}`,
        device: user.role === 'super_admin' ? 'Chrome \u00b7 Windows 11' : devices[(h >>> 5) % devices.length],
        minutesAgo: isYou ? 0 : 3 + (h % 2600)
    };
}

function relativeMinutes(minutes) {
    if (minutes < 2) return 'Active now';
    if (minutes < 60) return `${minutes} min ago`;
    if (minutes < 1440) return `${Math.floor(minutes / 60)} hr ago`;
    const days = Math.floor(minutes / 1440);
    return `${days} day${days > 1 ? 's' : ''} ago`;
}

function renderSettingsAccounts() {
    const body = document.getElementById('settingsAccountsBody');
    if (!body) return;

    const session = typeof currentSession === 'function' ? currentSession() : null;
    let users = (typeof state !== 'undefined' && state && Array.isArray(state.users)) ? state.users : [];
    if (!users.length && session) {
        users = [{ id: session.userId, fullName: session.fullName, username: session.username, role: session.role, active: true }];
    }

    if (!users.length) {
        body.innerHTML = '<tr><td colspan="5" class="table-empty">No accounts loaded yet.</td></tr>';
        return;
    }

    body.innerHTML = users.map((user) => {
        const isYou = !!session && user.id === session.userId;
        const info = sampleLoginFor(user, isYou);
        const when = new Date(Date.now() - info.minutesAgo * 60000);
        const status = user.active === false ? 'Disabled' : 'Active';
        return `<tr class="${isYou ? 'is-you' : ''}">
            <td data-label="Account">
                <strong>${escapeHtml(user.fullName || user.username)}</strong>${isYou ? '<em class="you-badge">You</em>' : ''}
                <small>${escapeHtml(user.username)} &middot; ${escapeHtml(roleLabel(user.role))}</small>
            </td>
            <td data-label="Status"><span class="tag ${status === 'Active' ? 'success' : ''}">${status}</span></td>
            <td data-label="IP address"><code>${escapeHtml(info.ip)}</code></td>
            <td data-label="Unit"><strong>${escapeHtml(info.unit)}</strong><small>${escapeHtml(info.device)}</small></td>
            <td data-label="Last login"><strong>${escapeHtml(when.toLocaleString([], { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }))}</strong><small>${relativeMinutes(info.minutesAgo)}</small></td>
        </tr>`;
    }).join('');
}
