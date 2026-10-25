<?php
declare(strict_types=1);

/**
 * BITCAS - app info and page routes. Single source of truth for the version
 * shown in the sidebar, login card and Settings -> About.
 */

const APP_NAME       = 'BITCAS';
const APP_TAGLINE    = 'Barangay Intelligent Traffic Congestion Alert System';
const APP_VERSION    = '1.4.0';
const APP_BUILD_DATE = '2026-10-25';
const APP_ORG        = 'LGU Traffic Dashboard';

/**
 * Pages the router accepts.
 *   group    : sidebar group ('Operations' pages are also the top tabs; null = not in the nav)
 *   nav      : short label for tabs / sidebar
 *   backdrop : true = blurred satellite map behind the page (see core/backdrop.js)
 */
const APP_PAGES = [
    'command'   => ['title' => 'Traffic Management', 'nav' => 'Traffic Map', 'icon' => 'map',       'group' => 'Operations', 'file' => 'command.php',   'backdrop' => false],
    'incidents' => ['title' => 'Congestion Reports', 'nav' => 'Reports',     'icon' => 'reports',   'group' => 'Operations', 'file' => 'incidents.php', 'backdrop' => true],
    'dispatch'  => ['title' => 'Dispatch',           'nav' => 'Dispatch',    'icon' => 'dispatch',  'group' => 'Operations', 'file' => 'dispatch.php',  'backdrop' => true],
    'analytics' => ['title' => 'Traffic Analytics',  'nav' => 'Analytics',   'icon' => 'analytics', 'group' => 'Operations', 'file' => 'analytics.php', 'backdrop' => true],
    'logs'      => ['title' => 'Logs',               'nav' => 'Logs',        'icon' => 'clock',     'group' => 'Operations', 'file' => 'logs.php',      'backdrop' => false],
    'settings'  => ['title' => 'Settings',           'nav' => 'Settings',    'icon' => 'settings',  'group' => 'System',     'file' => 'settings.php',  'backdrop' => false],
    'accounts'  => ['title' => 'Desk accounts',      'nav' => 'Desk accounts', 'icon' => 'users',   'group' => null,         'file' => 'accounts.php',  'backdrop' => false],
];

const APP_DEFAULT_PAGE = 'command';
