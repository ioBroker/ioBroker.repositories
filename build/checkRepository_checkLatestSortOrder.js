"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const checkRepository_common_1 = require("./checkRepository_common");
const latest = (0, checkRepository_common_1.loadRepository)('sources-dist.json');
const keys = Object.keys(latest).filter(k => !k.startsWith('_'));
let hasError = false;
if (keys[0]) {
    (0, checkRepository_common_1.logAdapterStart)(keys[0]);
}
for (let i = 1; i < keys.length; i++) {
    (0, checkRepository_common_1.logAdapterStart)(keys[i]);
    const inOrder = keys[i] >= keys[i - 1];
    (0, checkRepository_common_1.logCheck)(keys[i], 'sortOrder', { previousAdapter: keys[i - 1] }, inOrder);
    if (!inOrder) {
        console.error(`Out of order: "${keys[i]}" should come before "${keys[i - 1]}"`);
        hasError = true;
    }
}
if (hasError) {
    process.exit(1);
}
else {
    console.log('sources-dist.json: All keys are in correct alphabetical order.');
}
