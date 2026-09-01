"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.reservedAdapterNames = void 0;
exports.findReservedAdapterNames = findReservedAdapterNames;
const checkRepository_common_1 = require("./checkRepository_common");
exports.reservedAdapterNames = ['config', 'system', 'alias', 'design', 'all', 'self'];
function findReservedAdapterNames(repository, options = {}) {
    const failures = [];
    for (const [name] of (0, checkRepository_common_1.getRepositoryEntries)(repository)) {
        (0, checkRepository_common_1.logAdapterStart)(name, options);
        const normalizedName = name.replace(/^iobroker\./i, '');
        const isReserved = exports.reservedAdapterNames.includes(normalizedName);
        (0, checkRepository_common_1.logCheck)(name, 'reservedName', { normalizedName }, !isReserved, options);
        if (isReserved) {
            failures.push(name);
        }
    }
    return failures;
}
function run() {
    const latest = (0, checkRepository_common_1.loadRepository)('sources-dist.json');
    const failures = findReservedAdapterNames(latest);
    if (failures.length) {
        console.error(`Reserved adapter names found: ${failures.join(', ')}`);
        process.exit(1);
    }
    console.log('sources-dist.json: no reserved adapter names found.');
}
if (require.main === module) {
    run();
}
