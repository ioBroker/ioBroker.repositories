'use strict';
const fs = require('fs');
const path = require('path');

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
} catch (e) {
    console.error(`${fileName}: invalid JSON - ${e.message}`);
    process.exit(1);
}

let hasError = false;

if (text.includes('\t')) {
    console.error(`${fileName}: formatting error - tabs are not allowed`);
    hasError = true;
}

const normalizedText = text.replace(/\r\n/g, '\n');
const expected = JSON.stringify(parsed, null, 2);
if (normalizedText !== expected && normalizedText !== `${expected}\n`) {
    console.error(`${fileName}: formatting error - expected canonical JSON format with 2-space indentation and double quotes`);
    hasError = true;
}

if (hasError) {
    process.exit(1);
}

console.log(`${fileName}: JSON and formatting checks passed.`);
