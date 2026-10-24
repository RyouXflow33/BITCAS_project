// Same limits as app/models/InputRules.php. Each function returns an error string, or '' when the value is allowed.

function personNameError(value, label) {
    const text = String(value || '').trim();
    if (!text || text.length > 60 || !/^[\p{L}][\p{L} .'-]*$/u.test(text)) {
        return `${label || 'Name'} must be 1-60 characters: letters, spaces, apostrophe, dot, or dash. No numbers.`;
    }
    return '';
}

function usernameError(value) {
    const text = String(value || '').trim().toLowerCase();
    if (!/^[a-z0-9._-]{3,32}$/.test(text)) {
        return 'Username must be 3-32 characters: letters, numbers, dot, dash, or underscore.';
    }
    return '';
}

function passwordError(value, label) {
    const text = String(value || '');
    if (text.length < 8 || text.length > 64) {
        return `${label || 'Password'} must be 8-64 characters.`;
    }
    return '';
}

function shortTextError(value, label, max, required) {
    const text = String(value || '').trim();
    if (!text) return required ? `${label} is required.` : '';
    if (text.length > max || /[<>]/.test(text)) {
        return `${label} must be at most ${max} characters and cannot contain < or >.`;
    }
    return '';
}

function contactError(value) {
    const text = String(value || '').trim();
    if (!text || text === '--') return '';
    if (!/^09\d{9}$/.test(text)) {
        return 'Contact must be 11 digits starting with 09, for example 09171234567.';
    }
    return '';
}

function badgeError(value) {
    const text = String(value || '').trim().toUpperCase();
    if (text && !/^[A-Z0-9-]{2,20}$/.test(text)) {
        return 'Badge ID must be 2-20 characters: letters, numbers, or a dash.';
    }
    return '';
}

function wholeNumberError(value, label, min, max) {
    const text = String(value ?? '').trim();
    if (!/^\d+$/.test(text)) return `${label} must be a whole number.`;
    const number = Number(text);
    if (number < min || number > max) return `${label} must be from ${min} to ${max}.`;
    return '';
}

function noteError(value, label, max) {
    return shortTextError(value, label, max, false);
}
