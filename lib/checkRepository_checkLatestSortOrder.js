'use strict';
const fs = require('fs');
const path = require('path');

const latestJsonPath = path.normalize(path.join(__dirname, '../sources-dist.json'));

const latest = JSON.parse(fs.readFileSync(latestJsonPath, 'utf8'));

const keys = Object.keys(latest).filter(k => !k.startsWith('_'));
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
    console.log('sources-dist.json: All keys are in correct alphabetical order.');
}
