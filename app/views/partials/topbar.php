<?php /** @var string $page @var string $pageTitle */ ?>
<header class="topbar">
    <div class="topbar-left">
        <button class="icon-btn mobile-menu" id="menuToggle" aria-label="Open navigation"><?= icon('menu') ?></button>
        <div class="brand-mark topbar-logo" aria-hidden="true">BT</div>
        <div class="topbar-title">
            <div class="eyebrow"><?= APP_NAME ?> &middot; <?= APP_ORG ?></div>
            <h1><?= htmlspecialchars($pageTitle) ?></h1>
        </div>
    </div>

    <!-- Top tabs (default layout; the sidebar can be chosen in Settings) -->
    <nav class="top-tabs" aria-label="Main navigation">
        <?php foreach (APP_PAGES as $key => $meta): if ($meta['group'] !== 'Operations') continue; ?>
            <a class="top-tab<?= $page === $key ? ' active' : '' ?>" href="?page=<?= $key ?>">
                <?= htmlspecialchars($meta['nav']) ?>
                <?php if ($key === 'incidents'): ?><b class="tab-badge" data-report-count>0</b><?php endif; ?>
            </a>
        <?php endforeach; ?>
    </nav>

    <div class="topbar-actions">
        <div class="live-pill"><span></span> Live</div>
        <a class="icon-btn tab-only<?= in_array($page, ['settings', 'accounts'], true) ? ' active' : '' ?>" href="?page=settings" title="Settings" aria-label="Settings"><?= icon('settings') ?></a>
        <button class="icon-btn tab-only" id="logoutBtn" type="button" title="Logout" aria-label="Logout"><?= icon('logout') ?></button>
    </div>
</header>
