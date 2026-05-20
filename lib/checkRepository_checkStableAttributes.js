'use strict';
const { loadRepository, logAdapterStart } = require('./checkRepository_common');

const latest = loadRepository('sources-dist.json');
const stable = loadRepository('sources-dist-stable.json');
const requiredAttributes = ['meta', 'icon', 'type', 'version'];
const semVerPattern = /^\d+\.\d+\.\d+$/;

let hasError = false;

for (const [name, entry] of Object.entries(stable)) {
    if (name.startsWith('_')) {
        continue;
    }

    logAdapterStart(name);

    if (typeof entry !== 'object' || !entry || Array.isArray(entry)) {
        console.error(`Adapter "${name}" in stable must be an object`);
        hasError = true;
        continue;
    }

    const keys = Object.keys(entry);
    const missing = requiredAttributes.filter(attribute => !keys.includes(attribute));
    const additional = keys.filter(key => !requiredAttributes.includes(key));

    if (missing.length) {
        console.error(`Adapter "${name}" in stable is missing required attributes: ${missing.join(', ')}`);
        hasError = true;
    }
    if (additional.length) {
        console.error(`Adapter "${name}" in stable has additional attributes: ${additional.join(', ')}`);
        hasError = true;
    }

    for (const attribute of requiredAttributes) {
        if (typeof entry[attribute] !== 'string') {
            console.error(`Adapter "${name}" in stable attribute "${attribute}" must be a string`);
            hasError = true;
        }
    }

    if (typeof entry.version === 'string' && !semVerPattern.test(entry.version)) {
        console.error(`Adapter "${name}" in stable has invalid version "${entry.version}"`);
        hasError = true;
    }

    if (!latest[name]) {
        console.error(`Adapter "${name}" is in sources-dist-stable.json but not in sources-dist.json`);
        hasError = true;
        continue;
    }

    for (const attribute of ['meta', 'icon', 'type']) {
        if (entry[attribute] !== latest[name][attribute]) {
            console.error(
                `Adapter "${name}" attribute "${attribute}" differs between sources-dist.json and sources-dist-stable.json`,
            );
            hasError = true;
        }
    }
}

if (hasError) {
    process.exit(1);
}

console.log('sources-dist-stable.json: attribute checks passed.');
