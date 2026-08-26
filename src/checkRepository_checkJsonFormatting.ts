import fs from 'node:fs';
import path from 'node:path';
import { logCheck } from './checkRepository_common';

const fileName = process.argv[2];
if (!fileName) {
    console.error('Missing file argument. Usage: node build/checkRepository_checkJsonFormatting.js <file>');
    process.exit(1);
}

const jsonPath = path.normalize(path.join(__dirname, `../${fileName}`));
const text = fs.readFileSync(jsonPath, 'utf8');

let parsed: unknown;
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
    console.error(
        `${fileName}: formatting error - expected canonical JSON format with 2-space indentation and double quotes`,
    );
    hasError = true;
}

if (hasError) {
    process.exit(1);
}

console.log(`${fileName}: JSON and formatting checks passed.`);
