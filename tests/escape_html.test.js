// Unit test for escapeHtml() in assets/js/mvc/core/helpers.js.
//
//   node tests/escape_html.test.js
//
// escapeHtml is what keeps text typed by a person (names, notes, locations) from being
// read as HTML when a view puts it into innerHTML. The function is pulled out of the
// real file, so the test always checks the code that ships.

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const source = fs.readFileSync(path.join(__dirname, '..', 'assets', 'js', 'mvc', 'core', 'helpers.js'), 'utf8');
const match = source.match(/function escapeHtml\(value\) \{[\s\S]*?\n\}/);
if (!match) {
    console.error('FAIL  escapeHtml() was not found in helpers.js');
    process.exit(1);
}
const escapeHtml = new Function(`${match[0]}; return escapeHtml;`)();

const cases = [
    ['plain text stays the same', 'Villamonte Street', 'Villamonte Street'],
    ['a script tag is neutralised', '<script>alert(1)</script>', '&lt;script&gt;alert(1)&lt;/script&gt;'],
    ['an image onerror payload is neutralised', '<img src=x onerror=alert(1)>', '&lt;img src=x onerror=alert(1)&gt;'],
    ['double quotes cannot close an attribute', '" onmouseover="alert(1)', '&quot; onmouseover=&quot;alert(1)'],
    ['an ampersand is escaped first, so entities are not double-decoded', 'A&B &lt;', 'A&amp;B &amp;lt;'],
    ['null becomes an empty string', null, ''],
    ['undefined becomes an empty string', undefined, ''],
    ['numbers are accepted', 42, '42'],
    ['an empty string stays empty', '', '']
];

let failed = 0;
for (const [name, input, expected] of cases) {
    try {
        assert.strictEqual(escapeHtml(input), expected);
        console.log(`  PASS  ${name}`);
    } catch (error) {
        failed += 1;
        console.log(`  FAIL  ${name}  (got ${JSON.stringify(escapeHtml(input))})`);
    }
}

console.log(`\n${cases.length - failed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
