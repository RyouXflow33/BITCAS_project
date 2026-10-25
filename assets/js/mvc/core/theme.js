// Core - Theme: light / dark / system preference, persisted in localStorage.

const BITCAS_THEME_KEY = 'bitcas_theme';
const BITCAS_MOTION_KEY = 'bitcas_motion';

const BitcasTheme = {
    media: window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null,

    getPref() {
        try { return localStorage.getItem(BITCAS_THEME_KEY) || 'dark'; } catch (e) { return 'dark'; }
    },

    resolve(pref) {
        if (pref === 'system') return this.media && this.media.matches ? 'dark' : 'light';
        return pref === 'dark' ? 'dark' : 'light';
    },

    apply(pref) {
        const root = document.documentElement;
        root.classList.add('theme-switching'); // briefly smooth the color change
        root.setAttribute('data-theme', this.resolve(pref));
        root.setAttribute('data-theme-pref', pref);
        window.setTimeout(() => root.classList.remove('theme-switching'), 350);
        document.dispatchEvent(new CustomEvent('bitcas:themechange', { detail: { pref, theme: this.resolve(pref) } }));
    },

    set(pref) {
        if (!['light', 'dark', 'system'].includes(pref)) pref = 'system';
        try { localStorage.setItem(BITCAS_THEME_KEY, pref); } catch (e) { /* ignore */ }
        this.apply(pref);
    },

    toggle() {
        // Quick toggle flips the *effective* theme and stores it explicitly.
        this.set(this.resolve(this.getPref()) === 'dark' ? 'light' : 'dark');
    },

    init() {
        const toggle = document.getElementById('themeToggle');
        if (toggle) toggle.addEventListener('click', () => this.toggle());
        if (this.media) {
            const onChange = () => { if (this.getPref() === 'system') this.apply('system'); };
            if (this.media.addEventListener) this.media.addEventListener('change', onChange);
            else if (this.media.addListener) this.media.addListener(onChange);
        }
    }
};

const BitcasMotionPref = {
    isEnabled() {
        try { return localStorage.getItem(BITCAS_MOTION_KEY) !== 'off'; } catch (e) { return true; }
    },
    set(enabled) {
        try { localStorage.setItem(BITCAS_MOTION_KEY, enabled ? 'on' : 'off'); } catch (e) { /* ignore */ }
        if (enabled) document.documentElement.removeAttribute('data-motion');
        else document.documentElement.setAttribute('data-motion', 'off');
    }
};

// Navigation layout: top tabs (default) or the collapsible sidebar.
const BITCAS_NAV_KEY = 'bitcas_nav';

const BitcasNav = {
    get() {
        try { return localStorage.getItem(BITCAS_NAV_KEY) === 'sidebar' ? 'sidebar' : 'tabs'; } catch (e) { return 'tabs'; }
    },
    set(mode) {
        mode = mode === 'sidebar' ? 'sidebar' : 'tabs';
        try { localStorage.setItem(BITCAS_NAV_KEY, mode); } catch (e) { /* ignore */ }
        document.documentElement.setAttribute('data-nav', mode);
    }
};
