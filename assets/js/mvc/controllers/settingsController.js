// MVC - Controller: Settings page interactions.

function initSettingsPage() {
    renderSettingsPage();

    document.querySelectorAll('input[name="themePref"]').forEach((input) => {
        input.addEventListener('change', () => {
            if (input.checked) BitcasTheme.set(input.value);
            renderSettingsPage();
        });
    });

    document.querySelectorAll('input[name="navPref"]').forEach((input) => {
        input.addEventListener('change', () => {
            if (input.checked) BitcasNav.set(input.value);
            renderSettingsPage();
        });
    });

    const motion = document.getElementById('motionToggle');
    if (motion) {
        motion.addEventListener('change', () => BitcasMotionPref.set(motion.checked));
    }

    // Keep the selection in sync if the theme changes elsewhere (e.g. top-bar toggle).
    document.addEventListener('bitcas:themechange', renderSettingsPage);
}
