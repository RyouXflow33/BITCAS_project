<?php
declare(strict_types=1);

// Shared limits for anything a person types. The browser shows the same rules.
// Each method returns the cleaned value, or throws InvalidArgumentException with a message to show.
final class InputRules {
    public static function personName(string $value, string $label = 'Name'): string {
        $value = trim($value);
        $length = mb_strlen($value);
        if ($length < 1 || $length > 60 || !preg_match("/^[\\p{L}][\\p{L} .'-]*$/u", $value)) {
            throw new InvalidArgumentException($label . ' must be 1-60 characters: letters, spaces, apostrophe, dot, or dash. No numbers.');
        }
        return $value;
    }

    public static function username(string $value): string {
        $value = strtolower(trim($value));
        if (!preg_match('/^[a-z0-9._-]{3,32}$/', $value)) {
            throw new InvalidArgumentException('Username must be 3-32 characters: letters, numbers, dot, dash, or underscore.');
        }
        return $value;
    }

    public static function password(string $value, string $label = 'Password'): string {
        $length = strlen($value);
        if ($length < 8 || $length > 64) {
            throw new InvalidArgumentException($label . ' must be 8-64 characters.');
        }
        return $value;
    }

    // Free text that may contain numbers (a street, a zone, a radio name). HTML is refused.
    public static function shortText(string $value, string $label, int $max, bool $required = false): string {
        $value = trim($value);
        if ($value === '') {
            if ($required) {
                throw new InvalidArgumentException($label . ' is required.');
            }
            return '';
        }
        if (mb_strlen($value) > $max || preg_match('/[<>]/', $value)) {
            throw new InvalidArgumentException($label . ' must be at most ' . $max . ' characters and cannot contain < or >.');
        }
        return $value;
    }

    // Empty is allowed. A real number must be 11 digits starting with 09.
    public static function contact(string $value): string {
        $value = trim($value);
        if ($value === '' || $value === '--') {
            return $value === '' ? '--' : $value;
        }
        if (!preg_match('/^09\d{9}$/', $value)) {
            throw new InvalidArgumentException('Contact must be 11 digits starting with 09, for example 09171234567.');
        }
        return $value;
    }

    public static function badge(string $value): string {
        $value = strtoupper(trim($value));
        if (!preg_match('/^[A-Z0-9-]{2,20}$/', $value)) {
            throw new InvalidArgumentException('Badge ID must be 2-20 characters: letters, numbers, or a dash.');
        }
        return $value;
    }

    // Rejects "12abc". PHP would otherwise turn that into the integer 12.
    public static function wholeNumber($value, string $label, int $min, int $max): int {
        $text = trim((string)$value);
        if (!preg_match('/^\d+$/', $text)) {
            throw new InvalidArgumentException($label . ' must be a whole number.');
        }
        $number = (int)$text;
        if ($number < $min || $number > $max) {
            throw new InvalidArgumentException($label . ' must be from ' . $min . ' to ' . $max . '.');
        }
        return $number;
    }

    public static function note(string $value, string $label, int $max): string {
        $value = trim($value);
        if (mb_strlen($value) > $max || preg_match('/[<>]/', $value)) {
            throw new InvalidArgumentException($label . ' must be at most ' . $max . ' characters and cannot contain < or >.');
        }
        return $value;
    }
}
