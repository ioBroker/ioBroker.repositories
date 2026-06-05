'use strict';

/**
 * objectStructure.js
 *
 * Validates an ioBroker object dump (already parsed into a JS object) against
 * the schema rules defined in config_StateRoles.js.
 *
 * Does NOT perform any file I/O and does NOT log anything.
 * Returns a structured result object; callers decide how to present it.
 *
 * Exported API:
 *
 *   checkObjectStructure(objects, adapter)
 *
 *   @param  {object} objects  - Parsed content of an ioBroker object-dump JSON file.
 *                               Keys are object ids, values are ioBroker object records.
 *   @param  {string} adapter  - Adapter name (used only for id-prefix validation).
 *   @returns {CheckResult}
 *
 * CheckResult shape:
 * {
 *   adapter:      string,            // adapter name passed in
 *   objectCount:  number,            // total number of objects checked
 *   errors:   [ { code, message } ], // severity: error  (rule violations)
 *   warnings: [ { code, message } ], // severity: warning (style / convention)
 * }
 */

const {
    ROOT_OBJECT_SCHEMA,
    ALLOWED_OBJECT_TYPES,
    HIERARCHY_TYPES,
    VALID_STATE_TYPES,
    STATE_SCHEMA,
    STATE_ROLE_RULES,
} = require('./config_StateRoles');

// ---------------------------------------------------------------------------
// One-time setup: strip ambiguous read/write constraints from roles whose
// directionality is context-dependent and should not be enforced globally.
// ---------------------------------------------------------------------------
const ROLE_RULES = (() => {
    // Shallow-clone each entry so we never mutate the imported config object.
    const cloned = {};
    for (const [role, rule] of Object.entries(STATE_ROLE_RULES)) {
        cloned[role] = { ...rule };
    }
    for (const ambiguousRole of ['button', 'button.long']) {
        if (cloned[ambiguousRole]) {
            delete cloned[ambiguousRole].read;
            delete cloned[ambiguousRole].write;
        }
    }
    return cloned;
})();

const FORBIDDEN_ID_CHARS_REGEX = /[^._\-/ :!#$%&()+=@^{}|~\p{Ll}\p{Lu}\p{Nd}]+/gu;
const ID_SUGGESTION_REGEX = /[^a-zA-Z0-9_,-.]+/g;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function getValueType(value) {
    if (Array.isArray(value)) return 'array';
    if (value === null) return 'null';
    return typeof value;
}

function isPlainObject(value) {
    return getValueType(value) === 'object';
}

function isStringOrI18nObject(value) {
    if (typeof value === 'string') return true;
    if (!isPlainObject(value)) return false;
    const vals = Object.values(value);
    return vals.length > 0 && vals.every(v => typeof v === 'string');
}

function matchesCommonType(value, commonType) {
    switch (commonType) {
        case 'mixed':
            return true;
        case 'array':
            return Array.isArray(value);
        case 'boolean':
            return typeof value === 'boolean';
        case 'number':
            return typeof value === 'number' && Number.isFinite(value);
        case 'object':
            return isPlainObject(value);
        case 'string':
        case 'file':
        case 'json':
            return typeof value === 'string';
        case 'multistate':
            return ['string', 'number', 'boolean'].includes(typeof value);
        default:
            return false;
    }
}

// ---------------------------------------------------------------------------
// Role-rule lookup (built once per call via createRoleRuleMaps)
// ---------------------------------------------------------------------------

function createRoleRuleMaps() {
    const exactRules = new Map();
    const prefixRules = [];

    for (const [role, rule] of Object.entries(ROLE_RULES)) {
        if (role.endsWith('.')) {
            prefixRules.push({ prefix: role, rule });
        } else {
            exactRules.set(role, rule);
        }
    }

    return { exactRules, prefixRules };
}

function getRoleRule(role, { exactRules, prefixRules }) {
    if (exactRules.has(role)) return exactRules.get(role);

    for (const { prefix, rule } of prefixRules) {
        if (role.startsWith(prefix)) return rule;
    }

    // ".setting." is a valid infix that should fall through to the base role
    if (role.includes('.setting.')) {
        const base = role.replace('.setting.', '.');
        if (exactRules.has(base)) return exactRules.get(base);
        for (const { prefix, rule } of prefixRules) {
            if (base.startsWith(prefix)) return rule;
        }
    }

    return null;
}

// ---------------------------------------------------------------------------
// Collector — replaces the logger; stores issues as plain objects
// ---------------------------------------------------------------------------

function createCollector() {
    const errors = [];
    const warnings = [];

    return {
        error: (code, message) => errors.push({ code, message }),
        warning: (code, message) => warnings.push({ code, message }),
        get errors() {
            return errors;
        },
        get warnings() {
            return warnings;
        },
    };
}

// ---------------------------------------------------------------------------
// Validation — common block of a state object
// ---------------------------------------------------------------------------

/**
 * Validates the `common` sub-object of a state against STATE_SCHEMA.
 *
 * STATE_SCHEMA keys carry a "common." prefix (e.g. "common.role") to
 * document the full object path. The bare field name is derived by
 * stripping that prefix before reading values from `common`.
 */
function validateStateCommon(stateId, common, collector, roleRuleMaps) {
    if (!isPlainObject(common)) {
        collector.error('E1001', `Object "${stateId}": common must be an object.`);
        return;
    }

    // Allowed bare keys derived from schema
    const schemaKeys = new Set(Object.keys(STATE_SCHEMA).map(k => k.slice('common.'.length)));

    const unsupportedKeys = Object.keys(common).filter(k => !schemaKeys.has(k));
    if (unsupportedKeys.length > 0) {
        collector.error(
            'E1002',
            `Object "${stateId}": common contains unsupported keys: ${unsupportedKeys.join(', ')}.`,
        );
    }

    for (const [schemaKey, schema] of Object.entries(STATE_SCHEMA)) {
        const bareKey = schemaKey.slice('common.'.length);
        const hasValue = Object.prototype.hasOwnProperty.call(common, bareKey);

        if (schema.required && !hasValue) {
            collector.error('E1003', `Object "${stateId}": common is missing required key "${schemaKey}".`);
            continue;
        }

        if (!hasValue) continue;

        const value = common[bareKey];

        if (schema.types && !schema.types.includes(getValueType(value))) {
            collector.error(
                'E1004',
                `Object "${stateId}": "${schemaKey}" must be of type ${schema.types.join(' or ')}.`,
            );
            continue;
        }

        if (schema.onlyForTypes && !schema.onlyForTypes.includes(common.type)) {
            collector.error(
                'E1005',
                `Object "${stateId}": "${schemaKey}" is only allowed for common.type = ${schema.onlyForTypes.join(' or ')}.`,
            );
        }

        if (schema.matchesCommonType && common.type && !matchesCommonType(value, common.type)) {
            collector.error(
                'E1006',
                `Object "${stateId}": "${schemaKey}" value must match common.type "${common.type}".`,
            );
        }

        if (schema.name && !isStringOrI18nObject(value)) {
            collector.error('E1007', `Object "${stateId}": "${schemaKey}" must be a string or an i18n object.`);
        }

        if (schema.role) {
            const roleRule = getRoleRule(value, roleRuleMaps);
            if (!roleRule) {
                collector.error('E1008', `Object "${stateId}": unknown role "${value}".`);
                continue;
            }

            if (Array.isArray(roleRule.types) && common.type && !roleRule.types.includes(common.type)) {
                collector.error(
                    'E1009',
                    `Object "${stateId}": role "${value}" does not support common.type "${common.type}".`,
                );
            }

            if (typeof roleRule.read === 'boolean' && common.read !== roleRule.read) {
                collector.error(
                    'E1010',
                    `Object "${stateId}": role "${value}" requires common.read = ${roleRule.read}.`,
                );
            }

            if (typeof roleRule.write === 'boolean' && common.write !== roleRule.write) {
                collector.error(
                    'E1011',
                    `Object "${stateId}": role "${value}" requires common.write = ${roleRule.write}.`,
                );
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Validation — hierarchy order
// ---------------------------------------------------------------------------

function validateHierarchyObjectOrder(objectsById, idsToCheck, collector) {
    for (const objectId of idsToCheck) {
        const levels = objectId.split('.');
        const chain = [];

        for (let i = 3; i <= levels.length; i++) {
            const levelId = levels.slice(0, i).join('.');
            const levelObj = objectsById[levelId];
            if (levelObj) chain.push({ id: levelId, type: levelObj.type });
        }

        const hasHierarchyMember = chain.some(e => HIERARCHY_TYPES.has(e.type));
        if (hasHierarchyMember && chain.some(e => !HIERARCHY_TYPES.has(e.type))) {
            collector.error('E2001', `Object "${objectId}": hierarchy contains non-hierarchy object types.`);
        }

        if (chain.filter(e => e.type === 'device').length > 1) {
            collector.error('E2002', `Object "${objectId}": hierarchy contains more than one device.`);
        }

        const firstChannelIdx = chain.findIndex(e => e.type === 'channel');
        if (firstChannelIdx !== -1 && chain.slice(firstChannelIdx + 1).some(e => e.type === 'device')) {
            collector.error('E2003', `Object "${objectId}": hierarchy contains a device after a channel.`);
        }

        for (let i = 0; i < chain.length - 1; i++) {
            if (chain[i].type === 'state') {
                collector.error('E2004', `Object "${objectId}": state object "${chain[i].id}" has children.`);
                break;
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Validation — full object dump
// ---------------------------------------------------------------------------

function validateObjectDump(objects, adapter, collector) {
    if (!isPlainObject(objects)) {
        collector.error('E3001', 'Input must be a plain JSON object at root level.');
        return [];
    }

    const entries = Object.entries(objects);

    // Every root key must match its record's _id
    for (const [rootKey, rootObj] of entries) {
        if (!isPlainObject(rootObj) || rootObj._id !== rootKey) {
            collector.error(
                'E3002',
                `Root object "${rootKey}": invalid — expected a plain object with _id === "${rootKey}".`,
            );
        }
    }

    if (collector.errors.length > 0) {
        collector.error('E3003', 'Input is not a valid ioBroker object dump — processing aborted.');
        return [];
    }

    const roleRuleMaps = createRoleRuleMaps();
    const relevantIds = [];

    for (const [objectId, objectData] of entries) {
        // --- Root-schema key presence and types ---
        for (const [requiredKey, expectedType] of Object.entries(ROOT_OBJECT_SCHEMA)) {
            if (!Object.prototype.hasOwnProperty.call(objectData, requiredKey)) {
                collector.error('E3004', `Object "${objectId}": missing required key "${requiredKey}".`);
                continue;
            }
            const actualType = getValueType(objectData[requiredKey]);
            if (actualType !== expectedType) {
                collector.error(
                    'E3005',
                    `Object "${objectId}": key "${requiredKey}" must be type ${expectedType}, got ${actualType}.`,
                );
            }
        }

        // --- No extra root keys ---
        const unsupportedKeys = Object.keys(objectData).filter(
            k => !Object.prototype.hasOwnProperty.call(ROOT_OBJECT_SCHEMA, k),
        );
        if (unsupportedKeys.length > 0) {
            collector.error(
                'E3006',
                `Object "${objectId}": contains unsupported root keys: ${unsupportedKeys.join(', ')}.`,
            );
        }

        // --- Known object type ---
        if (!ALLOWED_OBJECT_TYPES.has(objectData.type)) {
            collector.error('E3007', `Object "${objectId}": unknown type "${objectData.type}".`);
        }

        if (HIERARCHY_TYPES.has(objectData.type)) {
            relevantIds.push(objectId);
        }

        // --- Object id character checks ---
        FORBIDDEN_ID_CHARS_REGEX.lastIndex = 0;
        if (FORBIDDEN_ID_CHARS_REGEX.test(objectId)) {
            const sanitized = objectId.replace(FORBIDDEN_ID_CHARS_REGEX, '');
            collector.error(
                'E3008',
                `Object id "${objectId}": contains forbidden characters. Suggested id: "${sanitized}".`,
            );
        }

        const suggestionMatches = objectId.match(ID_SUGGESTION_REGEX);
        if (suggestionMatches) {
            const uniqueChars = [...new Set(suggestionMatches.join('').split(''))].join('');
            collector.warning(
                'W3001',
                `Object id "${objectId}": contains non [a-zA-Z0-9_,-] characters (${uniqueChars}). Consider removing them.`,
            );
        }
    }

    // --- Every hierarchy object must have all intermediate parents present ---
    for (const objectId of relevantIds) {
        const levels = objectId.split('.');
        // Skip adapter name (index 0) and instance number (index 1)
        for (let i = 3; i < levels.length; i++) {
            const prefix = levels.slice(0, i).join('.');
            if (!Object.prototype.hasOwnProperty.call(objects, prefix)) {
                collector.error('E3009', `Object "${objectId}": missing intermediate object "${prefix}".`);
            }
        }
    }

    validateHierarchyObjectOrder(objects, relevantIds, collector);

    // --- State-specific validation ---
    for (const objectId of relevantIds) {
        const objectData = objects[objectId];
        if (objectData.type !== 'state') continue;

        const common = objectData.common;

        if (!isPlainObject(common) || !Object.prototype.hasOwnProperty.call(common, 'type')) {
            collector.error('E3010', `Object "${objectId}": state must define common.type.`);
            continue;
        }

        if (!VALID_STATE_TYPES.has(common.type)) {
            collector.error('E3011', `Object "${objectId}": invalid common.type "${common.type}".`);
        }

        validateStateCommon(objectId, common, collector, roleRuleMaps);
    }

    return relevantIds;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Checks an ioBroker object dump for structural and schema errors.
 *
 * @param  {object} objects  - Parsed JSON content of the object-dump file.
 * @param  {string} adapter  - Adapter name used for contextual validation.
 * @returns {{ adapter: string, objectCount: number,
 *             errors: {code: string, message: string}[],
 *             warnings: {code: string, message: string}[] }}
 */
function checkObjectStructure(objects, adapter) {
    const collector = createCollector();

    const objectCount = isPlainObject(objects) ? Object.keys(objects).length : 0;
    validateObjectDump(objects, adapter, collector);

    return {
        adapter,
        objectCount,
        errors: collector.errors,
        warnings: collector.warnings,
    };
}

module.exports = { checkObjectStructure };
