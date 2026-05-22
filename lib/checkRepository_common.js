'use strict';
const fs = require('fs');
const path = require('path');

function isDebugEnabled(argv = process.argv, env = process.env) {
    if (argv.includes('--debug') || argv.includes('--log')) {
        return true;
    }

    return ['1', 'true', 'yes', 'on'].includes(
        String(env.CHECK_REPOSITORY_DEBUG || env.CHECK_REPOSITORY_LOG || '').toLowerCase(),
    );
}

function isLogEnabled(argv = process.argv, env = process.env) {
    return isDebugEnabled(argv, env);
}

function logWithTimestamp(message, options = {}) {
    const {
        enabled = isDebugEnabled(),
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

function formatLogParameters(parameters) {
    if (parameters === undefined) {
        return '{}';
    }

    try {
        return JSON.stringify(parameters);
    } catch {
        return String(parameters);
    }
}

function logCheck(adapterName, check, parameters, result, options) {
    logWithTimestamp(
        `adapter="${adapterName}" check="${check}" parameters=${formatLogParameters(parameters)} result=${result ? 'ok' : 'fail'}`,
        options,
    );
}

function logDownload(url, result, options, parameters = {}) {
    logWithTimestamp(
        `download url="${url}" parameters=${formatLogParameters(parameters)} result=${result ? 'ok' : 'fail'}`,
        options,
    );
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
    isDebugEnabled,
    isLogEnabled,
    loadRepository,
    logAdapterStart,
    logCheck,
    logDownload,
    logWithTimestamp,
};
