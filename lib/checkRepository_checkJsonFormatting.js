'use strict';
const fs = require('fs');
const path = require('path');
const { logCheck } = require('./checkRepository_common');

const fileName = process.argv[2];
if (!fileName) {
    console.error('Missing file argument. Usage: node lib/checkRepository_checkJsonFormatting.js <file>');
    process.exit(1);
}

const jsonPath = path.normalize(path.join(__dirname, `../${fileName}`));
const text = fs.readFileSync(jsonPath, 'utf8');

let parsed;
try {
    parsed = JSON.parse(text);
    logCheck(fileName, 'jsonParse', {}, true);
} catch (e) {
    logCheck(fileName, 'jsonParse', { error: e.message }, false);
    console.error(`${fileName}: invalid JSON - ${e.message}`);
    process.exit(1);
}

let hasError = false;

const hasNoTabs = !text.includes('\t');
logCheck(fileName, 'noTabs', {}, hasNoTabs);

if (!hasNoTabs) {
    console.error(`${fileName}: formatting error - tabs are not allowed`);
    hasError = true;
}

const normalizedText = text.replace(/\r\n/g, '\n');
const expected = JSON.stringify(parsed, null, 2);
const canonicalFormatting = normalizedText === expected || normalizedText === `${expected}\n`;
logCheck(fileName, 'canonicalFormatting', {}, canonicalFormatting);

if (!canonicalFormatting) {
    console.error(`${fileName}: formatting error - expected canonical JSON format with 2-space indentation and double quotes`);
    // Find and report the first differing line
    const actualLines = normalizedText.split('\n');
    const expectedLines = expected.split('\n');
    const maxLen = Math.max(actualLines.length, expectedLines.length);
    for (let i = 0; i < maxLen; i++) {
        if (actualLines[i] !== expectedLines[i]) {
            console.error(`  First difference at line ${i + 1}:`);
            console.error(`    actual  : ${JSON.stringify(actualLines[i])}`);
            console.error(`    expected: ${JSON.stringify(expectedLines[i])}`);
            break;
        }
    }
    hasError = true;
}

if (hasError) {
    process.exit(1);
}

console.log(`${fileName}: JSON and formatting checks passed.`);
