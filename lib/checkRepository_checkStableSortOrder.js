'use strict';
const { loadRepository, logAdapterStart, logCheck } = require('./checkRepository_common');

const stable = loadRepository('sources-dist-stable.json');

const keys = Object.keys(stable).filter(k => !k.startsWith('_'));
let hasError = false;

if (keys[0]) {
    logAdapterStart(keys[0]);
}

for (let i = 1; i < keys.length; i++) {
    logAdapterStart(keys[i]);
    const inOrder = keys[i] >= keys[i - 1];
    logCheck(keys[i], 'sortOrder', { previousAdapter: keys[i - 1] }, inOrder);

    if (!inOrder) {
        console.error(`Out of order: "${keys[i]}" should come before "${keys[i - 1]}"`);
        hasError = true;
    }
}

if (hasError) {
    process.exit(1);
} else {
    console.log('sources-dist-stable.json: All keys are in correct alphabetical order.');
}
