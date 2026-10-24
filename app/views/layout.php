<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>BITCAS | <?= htmlspecialchars($pageTitle) ?></title>
    <meta name="description" content="BITCAS intelligent transport and emergency command interface">
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap">
    <link rel="stylesheet" href="assets/css/style.css?v=<?= filemtime(dirname(__DIR__, 2) . '/assets/css/style.css') ?>">
    <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=" crossorigin="">
</head>
<body data-page="<?= htmlspecialchars($page) ?>">
<?php render_icon_sprite(); ?>
<div class="auth-overlay" id="authOverlay">
    <form class="login-card" id="loginForm" autocomplete="off">
        <div class="login-mark"><?= icon('map') ?></div>
        <h2>BITCAS Login</h2>
        <p>LGU Traffic Dashboard</p>

        <label for="loginUsername">Username</label>
        <div class="field-wrap"><?= icon('user') ?><input id="loginUsername" name="bitcas-user" type="text" autocomplete="off" value="" required maxlength="32" pattern="[A-Za-z0-9._-]{3,32}"></div>
        <small>3-32 characters: letters, numbers, dot, dash, or underscore.</small>

        <label for="loginPassword">Password</label>
        <div class="field-wrap"><?= icon('badge') ?><input id="loginPassword" name="bitcas-pass" type="password" autocomplete="off" value="" required minlength="8" maxlength="64"></div>
        <small>8-64 characters.</small>

        <div id="loginError" class="login-error"></div>
        <button class="btn primary full" type="submit"><?= icon('login') ?> Login</button>
    </form>
</div>

<div class="app-shell" id="appShell" hidden>
    <?php include __DIR__ . '/partials/sidebar.php'; ?>

    <main class="main">
        <header class="topbar">
            <div class="topbar-left">
                <button class="icon-btn mobile-menu" id="menuToggle" aria-label="Open navigation"><?= icon('menu') ?></button>
                <div>
                    <div class="eyebrow">BITCAS</div>
                    <h1><?= htmlspecialchars($pageTitle) ?></h1>
                </div>
            </div>
            <div class="topbar-actions">
                <div class="live-pill"><span></span> Live</div>
                <div class="user-chip">
                    <div class="avatar" id="currentUserAvatar">LG</div>
                    <div>
                        <strong id="currentUserName">LGU Admin</strong>
                        <small id="currentUserRole">Traffic Desk</small>
                    </div>
                </div>
                <button class="btn ghost" id="logoutBtn" type="button"><?= icon('logout') ?> Logout</button>
            </div>
        </header>

        <div class="content">
            <?php include __DIR__ . '/pages/' . $viewFile; ?>
        </div>
    </main>
</div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js" integrity="sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=" crossorigin=""></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"></script>
<script>window.__BITCAS_SESSION = <?= json_encode($initialSession ?? null, JSON_UNESCAPED_SLASHES) ?>;</script>
<?php
// Every local script carries its file time, so a browser or Hostinger cache can never serve an old copy
// after an upload. Load order matters: core, models, views, controllers, then the bootstrap.
$appScripts = [
    'core/constants.js', 'core/helpers.js', 'core/inputRules.js',
    'models/store.js', 'models/analyticsModel.js',
    'views/authView.js', 'views/commandView.js', 'views/analyticsView.js',
    'views/reportsView.js', 'views/dispatchView.js', 'views/accountsView.js', 'views/logsView.js',
    'controllers/authController.js', 'controllers/commandController.js',
    'controllers/analyticsController.js', 'controllers/reportsController.js',
    'controllers/dispatchController.js', 'controllers/accountsController.js', 'controllers/logsController.js',
    'app.js'
];
$scriptRoot = dirname(__DIR__, 2) . '/assets/js/mvc/';
foreach ($appScripts as $script) {
    $stamp = (int)@filemtime($scriptRoot . $script);
    echo '<script src="assets/js/mvc/' . $script . '?v=' . $stamp . '"></script>' . "\n";
}
?>
</body>
</html>
