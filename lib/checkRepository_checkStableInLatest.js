'use strict';
const fs = require('fs');
const path = require('path');

const latestJsonPath = path.normalize(path.join(__dirname, '../sources-dist.json'));
const stableJsonPath = path.normalize(path.join(__dirname, '../sources-dist-stable.json'));

const latest = JSON.parse(fs.readFileSync(latestJsonPath, 'utf8'));
const stable = JSON.parse(fs.readFileSync(stableJsonPath, 'utf8'));

let hasError = false;

for (const name of Object.keys(stable)) {
    if (name === '_repoInfo') {
        continue;
    }
    if (!latest[name]) {
        console.error(`Adapter "${name}" is in sources-dist-stable.json but not in sources-dist.json`);
        hasError = true;
    }
}

if (hasError) {
    process.exit(1);
} else {
    console.log('All adapters in sources-dist-stable.json are present in sources-dist.json.');
}
