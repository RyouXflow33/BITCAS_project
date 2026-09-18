<aside class="sidebar" id="sidebar">
    <div class="brand">
        <div class="brand-mark">BT</div>
        <div>
            <strong>BITCAS</strong>
            <span>LGU Dashboard</span>
        </div>
    </div>

    <nav class="nav">
        <a class="<?= navClass($page,'command') ?>" href="?page=command"><span>⌘</span> Traffic Map</a>
        <a class="<?= navClass($page,'incidents') ?>" href="?page=incidents"><span>!</span> Congested Reports <b class="nav-badge" id="reportNavCount">0</b></a>
        <a class="<?= navClass($page,'dispatch') ?>" href="?page=dispatch"><span>⇄</span> Dispatch</a>
        <a class="<?= navClass($page,'analytics') ?>" href="?page=analytics"><span>⌁</span> Analytics</a>
    </nav>

    <div class="sidebar-footer">
        <button class="btn ghost full" id="sidebarLogoutBtn" type="button">Logout</button>
    </div>
</aside>
