'use strict';
const fs = require('fs');
const path = require('path');

const stableJsonPath = path.normalize(path.join(__dirname, '../sources-dist-stable.json'));

const stable = JSON.parse(fs.readFileSync(stableJsonPath, 'utf8'));

const keys = Object.keys(stable).filter(k => !k.startsWith('_'));
let hasError = false;

for (let i = 1; i < keys.length; i++) {
    if (keys[i] < keys[i - 1]) {
        console.error(`Out of order: "${keys[i]}" should come before "${keys[i - 1]}"`);
        hasError = true;
    }
}

if (hasError) {
    process.exit(1);
} else {
    console.log('sources-dist-stable.json: All keys are in correct alphabetical order.');
}
