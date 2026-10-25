<section class="page-head">
    <div>
        <span class="section-kicker"><?= icon('settings') ?> Preferences</span>
        <p>Customize how <?= APP_NAME ?> looks and behaves on this device.</p>
    </div>
</section>

<div class="settings-grid">
    <section class="panel">
        <div class="panel-head">
            <div><h2><?= icon('sparkles') ?> Appearance</h2><span>Saved on this device</span></div>
        </div>
        <div class="settings-body">
            <div class="setting-block">
                <div class="setting-title">Theme</div>
                <div class="setting-hint">Choose a light or dark interface, or follow your device.</div>
                <div class="theme-options" role="radiogroup" aria-label="Theme">
                    <label class="theme-card">
                        <input type="radio" name="themePref" value="light">
                        <span class="theme-preview preview-light"><i></i><i></i><i></i></span>
                        <span class="theme-label"><?= icon('sun') ?> Light</span>
                    </label>
                    <label class="theme-card">
                        <input type="radio" name="themePref" value="dark">
                        <span class="theme-preview preview-dark"><i></i><i></i><i></i></span>
                        <span class="theme-label"><?= icon('moon') ?> Dark</span>
                    </label>
                    <label class="theme-card">
                        <input type="radio" name="themePref" value="system">
                        <span class="theme-preview preview-system"><i></i><i></i><i></i></span>
                        <span class="theme-label"><?= icon('monitor') ?> System</span>
                    </label>
                </div>
            </div>

            <div class="setting-block setting-divider">
                <div class="setting-title">Navigation</div>
                <div class="setting-hint">Switch between top tabs and the collapsible sidebar.</div>
                <div class="theme-options nav-options" role="radiogroup" aria-label="Navigation layout">
                    <label class="theme-card">
                        <input type="radio" name="navPref" value="tabs">
                        <span class="theme-preview preview-tabs"><i></i><i></i></span>
                        <span class="theme-label"><?= icon('map') ?> Top tabs</span>
                    </label>
                    <label class="theme-card">
                        <input type="radio" name="navPref" value="sidebar">
                        <span class="theme-preview preview-sidebar"><i></i><i></i></span>
                        <span class="theme-label"><?= icon('sidebar') ?> Sidebar</span>
                    </label>
                </div>
            </div>

            <div class="setting-row">
                <div>
                    <div class="setting-title">Page animations</div>
                    <div class="setting-hint">Fade and loading transitions when moving between pages.</div>
                </div>
                <label class="switch">
                    <input type="checkbox" id="motionToggle" aria-label="Page animations">
                    <span class="switch-track"><span class="switch-thumb"></span></span>
                </label>
            </div>
        </div>
    </section>

    <section class="panel">
        <div class="panel-head">
            <div><h2><?= icon('info') ?> About</h2><span><?= APP_NAME ?> information</span></div>
        </div>
        <div class="settings-body">
            <div class="about-hero">
                <div class="about-mark">BT</div>
                <div>
                    <strong><?= APP_NAME ?></strong>
                    <p><?= htmlspecialchars(APP_TAGLINE) ?></p>
                </div>
                <span class="version-badge">v<?= APP_VERSION ?></span>
            </div>

            <dl class="about-list">
                <div><dt>Version</dt><dd><?= APP_VERSION ?></dd></div>
                <div><dt>Build date</dt><dd><?= APP_BUILD_DATE ?></dd></div>
                <div><dt>Target site</dt><dd>Villamonte Street, Bacolod City</dd></div>
                <div><dt>Data source</dt><dd>Vision node (YOLOv8) &rarr; MySQL</dd></div>
                <div><dt>Server runtime</dt><dd>PHP <?= PHP_VERSION ?></dd></div>
                <div><dt>Map engine</dt><dd>Leaflet 1.9.4 / OpenStreetMap</dd></div>
            </dl>
        </div>
    </section>

    <section class="panel accounts-panel">
        <div class="panel-head">
            <div><h2><?= icon('users') ?> Admin accounts</h2><span>Who may sign in to the desk &middot; IP address, unit and last login are sample values</span></div>
            <a class="btn tiny" href="?page=accounts"><?= icon('user-plus') ?> Manage desk accounts</a>
        </div>
        <div class="table-wrap">
            <table class="accounts-table">
                <thead>
                    <tr><th>Account</th><th>Status</th><th>IP address</th><th>Unit</th><th>Last login</th></tr>
                </thead>
                <tbody id="settingsAccountsBody">
                    <tr><td colspan="5" class="table-empty">Loading accounts&hellip;</td></tr>
                </tbody>
            </table>
        </div>
    </section>
</div>
