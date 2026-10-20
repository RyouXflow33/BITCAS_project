<section class="page-head">
    <div>
        <span class="section-kicker"><?= icon('users') ?> Who may sign in to the desk</span>
    </div>
</section>

<div class="camera-banner" id="passwordNotice" hidden></div>

<div class="accounts-layout">
    <section class="panel">
        <div class="panel-head"><div><h2><?= icon('badge') ?> Change my password</h2><span>Your login only. Officers on Dispatch do not use this.</span></div></div>
        <form class="form-grid" id="changePasswordForm">
            <div>
                <label for="currentPassword">Current password</label>
                <div class="password-field">
                    <input id="currentPassword" type="password" autocomplete="current-password" required>
                    <button class="btn tiny" type="button" data-toggle-password="currentPassword">Show</button>
                </div>
            </div>
            <div>
                <label for="nextPassword">New password</label>
                <div class="password-field">
                    <input id="nextPassword" type="password" autocomplete="new-password" required minlength="8">
                    <button class="btn tiny" type="button" data-toggle-password="nextPassword">Show</button>
                </div>
            </div>
            <p class="form-error" id="changePasswordError" hidden></p>
            <div class="full-width">
                <button class="btn primary" type="submit"><?= icon('save') ?> Save password</button>
            </div>
        </form>
    </section>

    <section class="panel" id="personnelPanel" hidden>
        <div class="panel-head"><div><h2><?= icon('user-plus') ?> Add desk personnel</h2><span>Super admin only. This is not a public registration form.</span></div></div>
        <form class="form-grid" id="addDeskUserForm">
            <div>
                <label for="deskFullName">Full name</label>
                <input id="deskFullName" type="text" required placeholder="Maria Santos" autocomplete="name">
            </div>
            <div>
                <label for="deskUsername">Username</label>
                <input id="deskUsername" type="text" required placeholder="msantos" autocomplete="off">
            </div>
            <div>
                <label for="deskPassword">Temporary password</label>
                <div class="password-field">
                    <input id="deskPassword" type="password" required minlength="8" autocomplete="new-password">
                    <button class="btn tiny" type="button" data-toggle-password="deskPassword">Show</button>
                </div>
            </div>
            <p class="form-error" id="addDeskUserError" hidden></p>
            <div class="full-width">
                <button class="btn primary" type="submit"><?= icon('user-plus') ?> Add personnel</button>
            </div>
        </form>
        <div id="personnelList"></div>
    </section>
</div>
<script>
if (!window.__bitcasPasswordToggle) {
    window.__bitcasPasswordToggle = true;
    document.querySelector('.accounts-layout').addEventListener('click', (event) => {
        const button = event.target.closest('[data-toggle-password]');
        if (!button) return;
        const input = document.getElementById(button.getAttribute('data-toggle-password'));
        if (!input) return;
        const show = input.type === 'password';
        input.type = show ? 'text' : 'password';
        button.textContent = show ? 'Hide' : 'Show';
    });
}
</script>
