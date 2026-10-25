// Core - Motion: loading circle + fade-in / fade-out between pages.

const BitcasMotion = {
    FADE_OUT_MS: 260,
    MIN_LOADER_MS: 450,
    startedAt: performance.now(),

    get enabled() {
        return BitcasMotionPref.isEnabled() &&
            !(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
    },

    get loader() { return document.getElementById('pageLoader'); },

    showLoader() {
        const l = this.loader;
        if (l) l.classList.add('is-visible');
    },

    hideLoader() {
        const l = this.loader;
        if (l) l.classList.remove('is-visible');
    },

    // Page just loaded: hold the loader a moment, then fade it away and fade the page in.
    reveal() {
        const wait = this.enabled ? Math.max(0, this.MIN_LOADER_MS - (performance.now() - this.startedAt)) : 0;
        window.setTimeout(() => {
            document.body.classList.remove('is-leaving');
            document.body.classList.add('page-ready');
            this.hideLoader();
        }, wait);
    },

    // Fade the page out, show the loading circle, then navigate.
    navigate(url) {
        if (!this.enabled) { window.location.href = url; return; }
        if (this.leaving) return;
        this.leaving = true;
        document.body.classList.add('is-leaving');
        this.showLoader();
        window.setTimeout(() => { window.location.href = url; }, this.FADE_OUT_MS);
    },

    // Fade the page out, then run a callback (used by logout, which replaces the history entry).
    leave(callback) {
        if (!this.enabled) { callback(); return; }
        document.body.classList.add('is-leaving');
        this.showLoader();
        window.setTimeout(callback, this.FADE_OUT_MS);
    },

    // Run an in-page action (e.g. login) behind the loading circle.
    withLoader(action, ms = 550) {
        if (!this.enabled) { action(); return; }
        this.showLoader();
        window.setTimeout(() => { action(); this.hideLoader(); }, ms);
    },

    isInternalNav(a, event) {
        if (!a || event.defaultPrevented || event.button !== 0) return false;
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return false;
        if (a.target && a.target !== '_self') return false;
        if (a.hasAttribute('download')) return false;
        const href = a.getAttribute('href');
        if (!href || href.startsWith('#') || href.startsWith('javascript:')) return false;
        const url = new URL(a.href, window.location.href);
        if (url.origin !== window.location.origin) return false;
        // same page + same query -> nothing to do
        return url.pathname + url.search !== window.location.pathname + window.location.search;
    },

    init() {
        document.addEventListener('click', (event) => {
            const a = event.target.closest('a[href]');
            if (!this.isInternalNav(a, event)) return;
            event.preventDefault();
            this.navigate(a.href);
        });

        // Back/forward cache: page restored in its "leaving" state -> reset it.
        window.addEventListener('pageshow', (event) => {
            if (event.persisted) {
                this.leaving = false;
                document.body.classList.remove('is-leaving');
                this.hideLoader();
            }
        });

        if (document.readyState === 'complete') this.reveal();
        else window.addEventListener('load', () => this.reveal());
    }
};
