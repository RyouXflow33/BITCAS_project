<?php /** @var string $page */ $inSettings = in_array($page, ['settings', 'accounts'], true); ?>
<aside class="sidebar" id="sidebar">
    <div class="brand">
        <button class="sidebar-toggle" id="sidebarToggle" type="button" aria-label="Toggle sidebar" aria-expanded="true" title="Toggle sidebar"><?= icon('sidebar') ?></button>
    </div>

    <nav class="nav">
        <div class="nav-label">Operations</div>
        <?php foreach (APP_PAGES as $key => $meta): if ($meta['group'] !== 'Operations') continue; ?>
            <a class="<?= navClass($page, $key) ?>" href="?page=<?= $key ?>" title="<?= htmlspecialchars($meta['nav']) ?>">
                <?= icon($meta['icon']) ?><span class="nav-text"><?= htmlspecialchars($meta['nav']) ?></span>
                <?php if ($key === 'incidents'): ?><b class="nav-badge" id="reportNavCount">0</b><?php endif; ?>
            </a>
        <?php endforeach; ?>
    </nav>

    <div class="sidebar-footer">
        <div class="account-nav">
            <button class="settings-toggle" id="settingsToggle" type="button" title="Settings" aria-expanded="<?= $inSettings ? 'true' : 'false' ?>" aria-controls="settingsMenu">
                <?= icon('settings') ?>
                <span class="nav-text">Settings</span>
                <i class="settings-chevron" aria-hidden="true"></i>
            </button>
            <div class="settings-menu" id="settingsMenu" <?= $inSettings ? '' : 'hidden' ?>>
                <a class="settings-link<?= $page === 'settings' ? ' active' : '' ?>" href="?page=settings">Preferences</a>
                <a class="settings-link<?= $page === 'accounts' ? ' active' : '' ?>" href="?page=accounts">Desk accounts</a>
            </div>
        </div>
        <button class="btn ghost full" id="sidebarLogoutBtn" type="button" title="Logout"><?= icon('logout') ?><span class="nav-text">Logout</span></button>
        <a class="sidebar-version" href="?page=settings" title="About <?= APP_NAME ?>">v<?= APP_VERSION ?></a>
    </div>
</aside>
