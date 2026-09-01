"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const checkRepository_common_1 = require("./checkRepository_common");
const latest = (0, checkRepository_common_1.loadRepository)('sources-dist.json');
const stable = (0, checkRepository_common_1.loadRepository)('sources-dist-stable.json');
const requiredAttributes = ['meta', 'icon', 'type', 'version'];
const semVerPattern = /^\d+\.\d+\.\d+$/;
let hasError = false;
for (const [name, entry] of Object.entries(stable)) {
    if (name.startsWith('_')) {
        continue;
    }
    (0, checkRepository_common_1.logAdapterStart)(name);
    const isObjectEntry = typeof entry === 'object' && !!entry && !Array.isArray(entry);
    (0, checkRepository_common_1.logCheck)(name, 'entryObject', {}, isObjectEntry);
    if (!isObjectEntry) {
        console.error(`Adapter "${name}" in stable must be an object`);
        hasError = true;
        continue;
    }
    // the entries are validated here, so they are treated as a plain bag of attributes
    const attributes = entry;
    const keys = Object.keys(attributes);
    const missing = requiredAttributes.filter(attribute => !keys.includes(attribute));
    const additional = keys.filter(key => !requiredAttributes.includes(key));
    (0, checkRepository_common_1.logCheck)(name, 'requiredAttributes', { requiredAttributes, keys }, !missing.length);
    (0, checkRepository_common_1.logCheck)(name, 'additionalAttributes', { requiredAttributes, keys }, !additional.length);
    if (missing.length) {
        console.error(`Adapter "${name}" in stable is missing required attributes: ${missing.join(', ')}`);
        hasError = true;
    }
    if (additional.length) {
        console.error(`Adapter "${name}" in stable has additional attributes: ${additional.join(', ')}`);
        hasError = true;
    }
    for (const attribute of requiredAttributes) {
        const isStringAttribute = typeof attributes[attribute] === 'string';
        (0, checkRepository_common_1.logCheck)(name, 'attributeType', { attribute, value: attributes[attribute] }, isStringAttribute);
        if (!isStringAttribute) {
            console.error(`Adapter "${name}" in stable attribute "${attribute}" must be a string`);
            hasError = true;
        }
    }
    if (typeof attributes.version === 'string') {
        const hasValidVersion = semVerPattern.test(attributes.version);
        (0, checkRepository_common_1.logCheck)(name, 'stableVersion', { version: attributes.version }, hasValidVersion);
        if (!hasValidVersion) {
            console.error(`Adapter "${name}" in stable has invalid version "${attributes.version}"`);
            hasError = true;
        }
    }
    else {
        (0, checkRepository_common_1.logCheck)(name, 'stableVersion', { version: attributes.version }, false);
    }
    const latestEntry = latest[name];
    const existsInLatest = !!latestEntry;
    (0, checkRepository_common_1.logCheck)(name, 'presentInLatest', {}, existsInLatest);
    if (!existsInLatest) {
        console.error(`Adapter "${name}" is in sources-dist-stable.json but not in sources-dist.json`);
        hasError = true;
        continue;
    }
    for (const attribute of ['meta', 'icon', 'type']) {
        const isEqual = attributes[attribute] === latestEntry[attribute];
        (0, checkRepository_common_1.logCheck)(name, 'matchesLatestAttribute', { attribute, latest: latestEntry[attribute], stable: attributes[attribute] }, isEqual);
        if (!isEqual) {
            console.error(`Adapter "${name}" attribute "${attribute}" differs between sources-dist.json and sources-dist-stable.json`);
            hasError = true;
        }
    }
}
if (hasError) {
    process.exit(1);
}
console.log('sources-dist-stable.json: attribute checks passed.');
