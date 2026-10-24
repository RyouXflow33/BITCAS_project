<?php
declare(strict_types=1);

function navClass(string $current, string $item): string {
    return $current === $item ? 'nav-item active' : 'nav-item';
}

final class PageController {
    public function dispatch(): void {
        require_once dirname(__DIR__) . '/models/Auth.php';
        Auth::start();
        header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
        header('Pragma: no-cache');
        header('Expires: 0');

        $requested = (string)($_GET['page'] ?? 'command');
        $titles = [
            'command' => 'Traffic Map',
            'analytics' => 'Traffic Analytics',
            'incidents' => 'Congestion Reports',
            'dispatch' => 'Dispatch',
            'accounts' => 'Desk accounts',
            'logs' => 'Logs'
        ];
        $page = array_key_exists($requested, $titles) ? $requested : 'command';
        $pageTitle = $titles[$page];
        $viewFile = $page . '.php';
        // Read again from MySQL, so a deleted or disabled account is signed out on the next page load.
        $initialSession = Auth::user();

        require_once dirname(__DIR__) . '/views/partials/icons.php';
        require dirname(__DIR__) . '/views/layout.php';
    }
}
