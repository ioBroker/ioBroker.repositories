"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.isDebugEnabled = isDebugEnabled;
exports.isLogEnabled = isLogEnabled;
exports.logWithTimestamp = logWithTimestamp;
exports.logAdapterStart = logAdapterStart;
exports.logCheck = logCheck;
exports.logDownload = logDownload;
exports.loadRepository = loadRepository;
exports.getRepositoryEntries = getRepositoryEntries;
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
function isDebugEnabled(argv = process.argv, env = process.env) {
    if (argv.includes('--debug') || argv.includes('--log')) {
        return true;
    }
    return ['1', 'true', 'yes', 'on'].includes(String(env.CHECK_REPOSITORY_DEBUG || env.CHECK_REPOSITORY_LOG || '').toLowerCase());
}
function isLogEnabled(argv = process.argv, env = process.env) {
    return isDebugEnabled(argv, env);
}
function logWithTimestamp(message, options = {}) {
    const { enabled = isDebugEnabled(), logger = console.log, now = () => new Date().toISOString() } = options;
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
    }
    catch {
        return String(parameters);
    }
}
function logCheck(adapterName, check, parameters, result, options) {
    logWithTimestamp(`adapter="${adapterName}" check="${check}" parameters=${formatLogParameters(parameters)} result=${result ? 'ok' : 'fail'}`, options);
}
function logDownload(url, result, options, parameters = {}) {
    logWithTimestamp(`download url="${url}" parameters=${formatLogParameters(parameters)} result=${result ? 'ok' : 'fail'}`, options);
}
function loadRepository(fileName) {
    const jsonPath = node_path_1.default.normalize(node_path_1.default.join(__dirname, `../${fileName}`));
    return JSON.parse(node_fs_1.default.readFileSync(jsonPath, 'utf8'));
}
/** All real adapter entries, i.e. everything except the `_`-prefixed metadata keys. */
function getRepositoryEntries(repository) {
    return Object.entries(repository).filter(([name]) => !name.startsWith('_'));
}
