<?php
declare(strict_types=1);

// Unit checks for the shared character and number rules.
//   php tests/input_rules.php

require_once __DIR__ . '/../app/models/InputRules.php';

$failed = 0;
function check(string $name, bool $ok): void {
    global $failed;
    echo ($ok ? '  PASS  ' : '  FAIL  ') . $name . "\n";
    if (!$ok) {
        $failed++;
    }
}
function rejects(string $name, callable $fn): void {
    try {
        $fn();
        check($name, false);
    } catch (InvalidArgumentException $error) {
        check($name, $error->getMessage() !== '');
    }
}

check('letters and spaces are a name', InputRules::personName('Maria Santos') === 'Maria Santos');
rejects('a digit in a name is refused', static function () { InputRules::personName('Juan1'); });
rejects('61 letters are refused', static function () { InputRules::personName(str_repeat('A', 61)); });
check('username is lowered', InputRules::username('MSantos') === 'msantos');
rejects('a 2-character username is refused', static function () { InputRules::username('ab'); });
rejects('a 7-character password is refused', static function () { InputRules::password('1234567'); });
check('vehicle count 12', InputRules::wholeNumber('12', 'Vehicle count', 0, 500) === 12);
rejects('12abc is not a whole number', static function () { InputRules::wholeNumber('12abc', 'Vehicle count', 0, 500); });
check('contact 11 digits', InputRules::contact('09171234567') === '09171234567');
rejects('a dashed phone is refused', static function () { InputRules::contact('0917-123-4567'); });

echo $failed ? "\n$failed failed\n" : "\nall checks passed\n";
exit($failed ? 1 : 0);
