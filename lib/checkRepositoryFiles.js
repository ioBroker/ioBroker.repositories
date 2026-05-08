'use strict';
const fs = require('node:fs');
const path = require('node:path');

const latestJsonPath = path.join(__dirname, '..', 'sources-dist.json');
const stableJsonPath = path.join(__dirname, '..', 'sources-dist-stable.json');

/**
 * Checks that all keys in a JSON repository file are in correct alphabetical order.
 * All out-of-order entries are logged. The complete file is always checked.
 *
 * @param {string} filePath - Path to the repository JSON file
 * @returns {boolean} true if all keys are in alphabetical order, false otherwise
 */
function checkAlphabeticalOrder(filePath) {
    const text = fs.readFileSync(filePath, 'utf8');
    const data = JSON.parse(text);

    const keys = Object.keys(data).filter(k => !k.startsWith('_'));
    let hasError = false;

    for (let i = 1; i < keys.length; i++) {
        if (keys[i].toLowerCase() < keys[i - 1].toLowerCase()) {
            console.error(`"${keys[i]}" is out of alphabetical order (comes after "${keys[i - 1]}")`);
            hasError = true;
        }
    }

    return !hasError;
}

/**
 * Checks that all adapters listed in sources-dist-stable.json are also present in sources-dist.json.
 * All missing entries are logged. The complete file is always checked.
 *
 * @returns {boolean} true if all stable adapters are present in latest, false otherwise
 */
function checkStableInLatest() {
    const latest = JSON.parse(fs.readFileSync(latestJsonPath, 'utf8'));
    const stable = JSON.parse(fs.readFileSync(stableJsonPath, 'utf8'));

    let hasError = false;
    for (const name of Object.keys(stable)) {
        if (name.startsWith('_')) {
            continue;
        }
        if (!latest[name]) {
            console.error(`Adapter "${name}" is in sources-dist-stable.json but not in sources-dist.json`);
            hasError = true;
        }
    }

    return !hasError;
}

const command = process.argv[2];

if (command === 'checkLatest') {
    console.log('Checking sources-dist.json for alphabetical order...');
    const ok = checkAlphabeticalOrder(latestJsonPath);
    if (ok) {
        console.log('All keys in sources-dist.json are in correct alphabetical order.');
    } else {
        console.error('sources-dist.json has keys that are not in alphabetical order.');
        process.exit(1);
    }
} else if (command === 'checkStable') {
    console.log('Checking sources-dist-stable.json for alphabetical order...');
    const ok = checkAlphabeticalOrder(stableJsonPath);
    if (ok) {
        console.log('All keys in sources-dist-stable.json are in correct alphabetical order.');
    } else {
        console.error('sources-dist-stable.json has keys that are not in alphabetical order.');
        process.exit(1);
    }
} else if (command === 'checkStableInLatest') {
    console.log('Checking that all adapters in sources-dist-stable.json are present in sources-dist.json...');
    const ok = checkStableInLatest();
    if (ok) {
        console.log('All adapters in sources-dist-stable.json are present in sources-dist.json.');
    } else {
        console.error('Some adapters in sources-dist-stable.json are missing from sources-dist.json.');
        process.exit(1);
    }
} else {
    console.error(`Unknown command: "${command}". Use: checkLatest, checkStable, or checkStableInLatest`);
    process.exit(1);
}
