// Runs in <head> before first paint: applies the saved theme/motion preference
// so dark-mode users never see a white flash, and adds a loader failsafe.
(function () {
    var root = document.documentElement;
    try {
        var pref = localStorage.getItem('bitcas_theme') || 'dark';
        var dark = pref === 'dark' || (pref === 'system' && window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches);
        root.setAttribute('data-theme', dark ? 'dark' : 'light');
        root.setAttribute('data-theme-pref', pref);
        root.setAttribute('data-nav', localStorage.getItem('bitcas_nav') === 'sidebar' ? 'sidebar' : 'tabs');
        if (localStorage.getItem('bitcas_sidebar') === 'collapsed') root.setAttribute('data-sidebar', 'collapsed');
        if (localStorage.getItem('bitcas_motion') === 'off') root.setAttribute('data-motion', 'off');
    } catch (e) { root.setAttribute('data-theme', 'dark'); root.setAttribute('data-nav', 'tabs'); }

    // If scripts fail to load, never leave the user stuck behind the loader.
    setTimeout(function () {
        var l = document.getElementById('pageLoader');
        if (l) l.classList.remove('is-visible');
        if (document.body) document.body.classList.add('page-ready');
    }, 6000);
})();
