import { loadRepository, logAdapterStart, logCheck } from './checkRepository_common';

const latest = loadRepository('sources-dist.json');
const requiredAttributes = ['meta', 'icon', 'type'];
const allowedTypes = [
    'alarm',
    'climate-control',
    'communication',
    'date-and-time',
    'energy',
    'garden',
    'general',
    'geoposition',
    'hardware',
    'health',
    'household',
    'infrastructure',
    'iot-systems',
    'lighting',
    'logic',
    'messaging',
    'metering',
    'misc-data',
    'multimedia',
    'network',
    'protocols',
    'storage',
    'utility',
    'vehicle',
    'visualization',
    'visualization-icons',
    'visualization-widgets',
    'weather',
];

let hasError = false;

for (const [name, entry] of Object.entries(latest)) {
    if (name.startsWith('_')) {
        continue;
    }

    logAdapterStart(name);

    const isObjectEntry = typeof entry === 'object' && !!entry && !Array.isArray(entry);
    logCheck(name, 'entryObject', {}, isObjectEntry);

    if (!isObjectEntry) {
        console.error(`Adapter "${name}" must be an object`);
        hasError = true;
        continue;
    }

    // the entries are validated here, so they are treated as a plain bag of attributes
    const attributes = entry as Record<string, unknown>;

    const keys = Object.keys(attributes);
    const missing = requiredAttributes.filter(attribute => !keys.includes(attribute));
    const additional = keys.filter(key => !requiredAttributes.includes(key));
    logCheck(name, 'requiredAttributes', { requiredAttributes, keys }, !missing.length);
    logCheck(name, 'additionalAttributes', { requiredAttributes, keys }, !additional.length);

    if (missing.length) {
        console.error(`Adapter "${name}" is missing required attributes: ${missing.join(', ')}`);
        hasError = true;
    }
    if (additional.length) {
        console.error(`Adapter "${name}" has additional attributes: ${additional.join(', ')}`);
        hasError = true;
    }

    for (const attribute of requiredAttributes) {
        const isStringAttribute = typeof attributes[attribute] === 'string';
        logCheck(name, 'attributeType', { attribute, value: attributes[attribute] }, isStringAttribute);

        if (!isStringAttribute) {
            console.error(`Adapter "${name}" attribute "${attribute}" must be a string`);
            hasError = true;
        }
    }

    if (typeof attributes.type === 'string') {
        const hasAllowedType = allowedTypes.includes(attributes.type);
        logCheck(name, 'allowedType', { type: attributes.type }, hasAllowedType);

        if (!hasAllowedType) {
            console.error(`Adapter "${name}" has invalid type "${attributes.type}"`);
            hasError = true;
        }
    } else {
        logCheck(name, 'allowedType', { type: attributes.type }, false);
    }
}

if (hasError) {
    process.exit(1);
}

console.log('sources-dist.json: attribute checks passed.');
