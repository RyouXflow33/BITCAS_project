<?php
// Every local stylesheet/script carries its file time so a browser or Hostinger cache never serves an old copy.
$assetRoot = dirname(__DIR__, 2);
$stamp = static fn(string $path): int => (int)@filemtime($assetRoot . '/' . $path);
$styles = ['style', 'sidebar', 'theme', 'motion', 'settings', 'glass', 'charts', 'backdrop'];
?><!doctype html>
<html lang="en" data-theme="dark" data-nav="tabs">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title><?= APP_NAME ?> | <?= htmlspecialchars($pageTitle) ?></title>
    <meta name="description" content="BITCAS intelligent transport and emergency command interface">
    <link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='8' fill='%23f59e0b'/%3E%3C/svg%3E">
    <meta name="color-scheme" content="light dark">
    <!-- Runs before first paint: saved theme / navigation layout (no white flash) + loader failsafe -->
    <script src="assets/js/mvc/core/theme-init.js?v=<?= $stamp('assets/js/mvc/core/theme-init.js') ?>"></script>
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap">
<?php foreach ($styles as $css): ?>
    <link rel="stylesheet" href="assets/css/<?= $css ?>.css?v=<?= $stamp('assets/css/' . $css . '.css') ?>">
<?php endforeach; ?>
    <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=" crossorigin="">
    <noscript><style>.page-loader{display:none!important}</style></noscript>
</head>
<body data-page="<?= htmlspecialchars($page) ?>"<?= $hasBackdrop ? ' class="has-backdrop"' : '' ?>>
<?php render_icon_sprite(); ?>
<?php include __DIR__ . '/partials/loader.php'; ?>
<?php if ($hasBackdrop): ?>
<div class="page-backdrop" id="pageBackdrop" aria-hidden="true"></div>
<?php endif; ?>
<div class="auth-overlay" id="authOverlay">
    <form class="login-card" id="loginForm" autocomplete="off">
        <div class="login-mark"><?= icon('map') ?></div>
        <h2><?= APP_NAME ?> Login</h2>
        <p><?= APP_ORG ?></p>

        <label for="loginUsername">Username</label>
        <div class="field-wrap"><?= icon('user') ?><input id="loginUsername" name="bitcas-user" type="text" autocomplete="off" value="" required maxlength="32" pattern="[A-Za-z0-9._-]{3,32}"></div>
        <small>3-32 characters: letters, numbers, dot, dash, or underscore.</small>

        <label for="loginPassword">Password</label>
        <div class="field-wrap"><?= icon('badge') ?><input id="loginPassword" name="bitcas-pass" type="password" autocomplete="off" value="" required minlength="8" maxlength="64"></div>
        <small>8-64 characters.</small>

        <div id="loginError" class="login-error"></div>
        <button class="btn primary full" type="submit"><?= icon('login') ?> Login</button>
        <div class="login-version">v<?= APP_VERSION ?></div>
    </form>
</div>

<div class="app-shell" id="appShell" hidden>
    <?php include __DIR__ . '/partials/sidebar.php'; ?>

    <main class="main">
        <?php include __DIR__ . '/partials/topbar.php'; ?>

        <div class="content">
            <h1 class="page-heading"><?= htmlspecialchars($pageTitle) ?></h1>
            <p id="deskSaveNotice" class="form-error" hidden></p>
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
    'core/constants.js', 'core/helpers.js', 'core/inputRules.js', 'core/theme.js', 'core/motion.js', 'core/charts.js', 'core/backdrop.js',
    'models/store.js', 'models/analyticsModel.js',
    'views/authView.js', 'views/commandView.js', 'views/analyticsView.js', 'views/chartsView.js',
    'views/reportsView.js', 'views/dispatchView.js', 'views/accountsView.js', 'views/logsView.js', 'views/settingsView.js',
    'controllers/authController.js', 'controllers/commandController.js',
    'controllers/analyticsController.js', 'controllers/chartsController.js', 'controllers/reportsController.js',
    'controllers/dispatchController.js', 'controllers/accountsController.js', 'controllers/logsController.js', 'controllers/settingsController.js',
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
