"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const checkRepository_common_1 = require("./checkRepository_common");
const latest = (0, checkRepository_common_1.loadRepository)('sources-dist.json');
const stable = (0, checkRepository_common_1.loadRepository)('sources-dist-stable.json');
let hasError = false;
for (const name of Object.keys(stable)) {
    if (name === '_repoInfo') {
        continue;
    }
    (0, checkRepository_common_1.logAdapterStart)(name);
    const existsInLatest = !!latest[name];
    (0, checkRepository_common_1.logCheck)(name, 'presentInLatest', {}, existsInLatest);
    if (!existsInLatest) {
        console.error(`Adapter "${name}" is in sources-dist-stable.json but not in sources-dist.json`);
        hasError = true;
    }
}
if (hasError) {
    process.exit(1);
}
else {
    console.log('All adapters in sources-dist-stable.json are present in sources-dist.json.');
}
