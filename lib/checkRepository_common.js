'use strict';
const fs = require('fs');
const path = require('path');

function isLogEnabled(argv = process.argv, env = process.env) {
    if (argv.includes('--log')) {
        return true;
    }

    return ['1', 'true', 'yes', 'on'].includes(String(env.CHECK_REPOSITORY_LOG || '').toLowerCase());
}

function logWithTimestamp(message, options = {}) {
    const {
        enabled = isLogEnabled(),
        logger = console.log,
        now = () => new Date().toISOString(),
    } = options;

    if (enabled) {
        logger(`[${now()}] ${message}`);
    }
}

function logAdapterStart(name, options) {
    logWithTimestamp(`Checking adapter "${name}"`, options);
}

function loadRepository(fileName) {
    const jsonPath = path.normalize(path.join(__dirname, `../${fileName}`));
    return JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
}

function getRepositoryEntries(repository) {
    return Object.entries(repository).filter(([name]) => !name.startsWith('_'));
}

module.exports = {
    getRepositoryEntries,
    isLogEnabled,
    loadRepository,
    logAdapterStart,
    logWithTimestamp,
};
