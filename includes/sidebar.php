<aside class="sidebar" id="sidebar">
    <div class="brand">
        <div class="brand-mark">BT</div>
        <div>
            <strong>BITCAS</strong>
            <span>LGU Dashboard</span>
        </div>
    </div>

    <nav class="nav">
        <div class="nav-label">Operations</div>
        <a class="<?= navClass($page,'command') ?>" href="?page=command"><?= icon('map') ?> Traffic Map</a>
        <a class="<?= navClass($page,'incidents') ?>" href="?page=incidents"><?= icon('reports') ?> Reports <b class="nav-badge" id="reportNavCount">0</b></a>
        <a class="<?= navClass($page,'dispatch') ?>" href="?page=dispatch"><?= icon('dispatch') ?> Dispatch</a>
        <a class="<?= navClass($page,'analytics') ?>" href="?page=analytics"><?= icon('analytics') ?> Analytics</a>
    </nav>

    <div class="sidebar-footer">
        <button class="btn ghost full" id="sidebarLogoutBtn" type="button"><?= icon('logout') ?> Logout</button>
    </div>
</aside>
