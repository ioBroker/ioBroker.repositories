'use strict';
const { loadRepository, logAdapterStart, logCheck } = require('./checkRepository_common');

const latest = loadRepository('sources-dist.json');
const stable = loadRepository('sources-dist-stable.json');

let hasError = false;

for (const name of Object.keys(stable)) {
    if (name === '_repoInfo') {
        continue;
    }

    logAdapterStart(name);
    const existsInLatest = !!latest[name];
    logCheck(name, 'presentInLatest', {}, existsInLatest);

    if (!existsInLatest) {
        console.error(`Adapter "${name}" is in sources-dist-stable.json but not in sources-dist.json`);
        hasError = true;
    }
}

if (hasError) {
    process.exit(1);
} else {
    console.log('All adapters in sources-dist-stable.json are present in sources-dist.json.');
}
