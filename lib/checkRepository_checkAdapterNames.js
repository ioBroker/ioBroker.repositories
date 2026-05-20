'use strict';
const { getRepositoryEntries, loadRepository, logAdapterStart } = require('./checkRepository_common');

const reservedAdapterNames = ['config', 'system', 'alias', 'design', 'all', 'self'];

function findReservedAdapterNames(repository, options = {}) {
    const failures = [];

    for (const [name] of getRepositoryEntries(repository)) {
        logAdapterStart(name, options);

        if (reservedAdapterNames.includes(name.replace(/^iobroker\./i, ''))) {
            failures.push(name);
        }
    }

    return failures;
}

function run() {
    const latest = loadRepository('sources-dist.json');
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

module.exports = {
    findReservedAdapterNames,
    reservedAdapterNames,
};
