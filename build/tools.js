"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getRepositoryFile = getRepositoryFile;
const node_fs_1 = __importDefault(require("node:fs"));
const semver_1 = __importDefault(require("semver"));
const node_child_process_1 = require("node:child_process");
const node_extend_1 = __importDefault(require("node.extend"));
require('node:events').EventEmitter.prototype._maxListeners = 100;
const axios_1 = __importDefault(require("axios"));
// Compare versions
function findPath(path, url) {
    if (!url) {
        return '';
    }
    if (url.substring(0, 'http://'.length) === 'http://' || url.substring(0, 'https://'.length) === 'https://') {
        return url;
    }
    if (path.substring(0, 'http://'.length) === 'http://' || path.substring(0, 'https://'.length) === 'https://') {
        return (path + url).replace(/\/\//g, '/').replace('http:/', 'http://').replace('https:/', 'https://');
    }
    if (url[0] === '/') {
        return `${__dirname}/..${url}`;
    }
    return `${__dirname}/../${path}${url}`;
}
// Return the content of the json file. Download it or read it directly
function getJson(urlOrPath, callback) {
    let sources = {};
    // If an object was read
    if (urlOrPath && typeof urlOrPath === 'object') {
        callback?.(urlOrPath);
    }
    else if (!urlOrPath) {
        console.log('Empty url!');
        callback?.(null);
    }
    else {
        if (urlOrPath.substring(0, 'http://'.length) === 'http://' ||
            urlOrPath.substring(0, 'https://'.length) === 'https://') {
            (0, axios_1.default)(urlOrPath, { timeout: 10000 })
                .then(response => {
                callback?.(response.data, urlOrPath);
            })
                .catch(error => {
                console.log(`Cannot download json from ${urlOrPath}. Error: ${error || (error.response && error.response.data)}`);
                callback?.(null, urlOrPath);
            });
        }
        else {
            if (node_fs_1.default.existsSync(urlOrPath)) {
                try {
                    sources = JSON.parse(node_fs_1.default.readFileSync(urlOrPath).toString());
                }
                catch (e) {
                    console.log(`Cannot parse json file from ${urlOrPath}. Error: ${e}`);
                    callback?.(null, urlOrPath);
                    return;
                }
                callback?.(sources, urlOrPath);
            }
            else if (node_fs_1.default.existsSync(`${__dirname}/../${urlOrPath}`)) {
                try {
                    sources = JSON.parse(node_fs_1.default.readFileSync(`${__dirname}/../${urlOrPath}`).toString());
                }
                catch (e) {
                    console.log(`Cannot parse json file from ${__dirname}/../${urlOrPath}. Error: ${e}`);
                    callback?.(null, urlOrPath);
                    return;
                }
                callback?.(sources, urlOrPath);
            }
            else if (node_fs_1.default.existsSync(`${__dirname}/../tmp/${urlOrPath}`)) {
                try {
                    sources = JSON.parse(node_fs_1.default.readFileSync(`${__dirname}/../tmp/${urlOrPath}`).toString());
                }
                catch (e) {
                    console.log(`Cannot parse json file from ${__dirname}/../tmp/${urlOrPath}. Error: ${e}`);
                    callback?.(null, urlOrPath);
                    return;
                }
                callback?.(sources, urlOrPath);
            }
            else {
                //if (urlOrPath.indexOf('/example/') === -1) console.log('Json file not found: ' + urlOrPath);
                callback?.(null, urlOrPath);
            }
        }
    }
}
/**
 * Extract the license from io-package or package.json
 *
 * @param options io-package.json and package.json contents
 * @returns
 */
// Get a list of all installed adapters and controller version on this host
/**
 * Reads an adapter's npm version
 *
 * @param adapter The adapter to read the npm version from. Null for the root ioBroker packet
 * @param callback Optional callback to receive the version. If not provided, the function will return void.
 */
function getNpmVersion(adapter, callback) {
    adapter = adapter ? `iobroker.${adapter}` : 'iobroker';
    adapter = adapter.toLowerCase();
    const cliCommand = `npm view ${adapter}@latest version`;
    (0, node_child_process_1.exec)(cliCommand, { timeout: 2000 }, (error, stdout) => {
        let version;
        if (error) {
            // command failed
            return typeof callback === 'function' && callback(error);
        }
        else if (stdout) {
            version = semver_1.default.valid(stdout.trim());
        }
        typeof callback === 'function' && callback(null, version);
    });
}
function getIoPack(sources, name, callback) {
    getJson(sources[name].meta, function (ioPack) {
        const packUrl = sources[name].meta.replace('io-package.json', 'package.json');
        if (!ioPack) {
            sources._helper?.failCounter.push(name);
            callback?.(sources, name);
        }
        else {
            setImmediate(() => {
                getJson(packUrl, (pack) => {
                    const version = sources[name].version;
                    const type = sources[name].type;
                    // If installed from git or something else.
                    // js-controller is an exception because it can be installed from npm and from git
                    if (sources[name].url && name !== 'js-controller') {
                        if (ioPack?.common) {
                            sources[name] = (0, node_extend_1.default)(true, sources[name], ioPack.common);
                            // overwrite type of adapter from repository
                            if (type) {
                                sources[name].type = type;
                            }
                            if (pack?.licenses?.length) {
                                sources[name].license ||= pack.licenses[0].type;
                                sources[name].licenseUrl ||= pack.licenses[0].url;
                            }
                        }
                        callback?.(sources, name);
                    }
                    else {
                        if (ioPack?.common) {
                            sources[name] = (0, node_extend_1.default)(true, sources[name], ioPack.common);
                            if (pack?.licenses?.length) {
                                sources[name].license ||= pack.licenses[0].type;
                                sources[name].licenseUrl ||= pack.licenses[0].url;
                            }
                        }
                        // overwrite type of adapter from repository
                        if (type) {
                            sources[name].type = type;
                        }
                        if (version) {
                            sources[name].version = version;
                            callback?.(sources, name);
                        }
                        else {
                            if (sources[name].meta.substring(0, 'http://'.length) === 'http://' ||
                                sources[name].meta.substring(0, 'https://'.length) === 'https://') {
                                //installed from npm
                                getNpmVersion(name, (err, version) => {
                                    if (err) {
                                        console.error(err);
                                    }
                                    if (version) {
                                        sources[name].version = version;
                                    }
                                    else {
                                        sources[name].version = 'npm error';
                                    }
                                    callback?.(sources, name);
                                });
                            }
                            else {
                                callback?.(sources, name);
                            }
                        }
                    }
                });
            });
        }
    });
}
function _getRepositoryFile(sources, path, callback) {
    if (!sources._helper) {
        let count = 0;
        for (const _name in sources) {
            if (!Object.prototype.hasOwnProperty.call(sources, _name)) {
                continue;
            }
            count++;
        }
        sources._helper = { failCounter: [] };
        sources._helper.timeout = setTimeout(function () {
            if (sources._helper) {
                delete sources._helper;
                for (const __name in sources) {
                    if (!Object.prototype.hasOwnProperty.call(sources, __name)) {
                        continue;
                    }
                    if (sources[__name].processed !== undefined) {
                        delete sources[__name].processed;
                    }
                }
                callback?.(`Timeout by read all package.json (${count}) seconds`, sources);
                callback = null;
            }
        }, count * 2000);
    }
    for (const name in sources) {
        if (!Object.prototype.hasOwnProperty.call(sources, name)) {
            continue;
        }
        if (sources[name].processed || name === '_helper') {
            continue;
        }
        sources[name].processed = true;
        if (sources[name].url) {
            sources[name].url = findPath(path, sources[name].url);
        }
        if (sources[name].meta) {
            sources[name].meta = findPath(path, sources[name].meta);
        }
        if (sources[name].icon) {
            sources[name].icon = findPath(path, sources[name].icon);
        }
        if (!sources[name].name && sources[name].meta) {
            console.log(`Read ${name}...`);
            getIoPack(sources, name, () => {
                if (sources._helper) {
                    if (sources._helper.failCounter.length > 10) {
                        clearTimeout(sources._helper.timeout);
                        delete sources._helper;
                        for (const _name in sources) {
                            if (!Object.prototype.hasOwnProperty.call(sources, _name)) {
                                continue;
                            }
                            if (sources[_name].processed !== undefined) {
                                delete sources[_name].processed;
                            }
                        }
                        callback?.('Looks like there is no internet.', sources);
                        callback = null;
                    }
                    else {
                        // process next
                        setImmediate(() => _getRepositoryFile(sources, path, callback));
                    }
                }
            });
            return;
        }
    }
    // all packages are processed
    if (sources._helper) {
        let err;
        if (sources._helper.failCounter.length) {
            err = `Following packages cannot be read: ${sources._helper.failCounter.join(', ')}`;
        }
        clearTimeout(sources._helper.timeout);
        delete sources._helper;
        for (const __name in sources) {
            if (!Object.prototype.hasOwnProperty.call(sources, __name)) {
                continue;
            }
            if (sources[__name].processed !== undefined) {
                delete sources[__name].processed;
            }
        }
        callback?.(err, sources);
        callback = null;
    }
}
// Get list of all adapters and controller in some repository file or in /conf/source-dist.json
function getRepositoryFile(urlOrPath, additionalInfo, callback) {
    let sources = {};
    let path = '';
    if (typeof additionalInfo === 'function') {
        callback = additionalInfo;
        additionalInfo = {};
    }
    if (!additionalInfo) {
        additionalInfo = {};
    }
    if (urlOrPath) {
        const parts = urlOrPath.split('/');
        path = `${parts.splice(0, parts.length - 1).join('/')}/`;
    }
    // If object was read
    if (urlOrPath && typeof urlOrPath === 'object') {
        callback?.(null, urlOrPath);
    }
    else if (!urlOrPath) {
        try {
            sources = JSON.parse(node_fs_1.default.readFileSync(`${getDefaultDataDir()}sources.json`).toString());
        }
        catch {
            sources = {};
        }
        try {
            const sourcesDist = JSON.parse(node_fs_1.default.readFileSync(`${__dirname}/../conf/sources-dist.json`).toString());
            sources = (0, node_extend_1.default)(true, sourcesDist, sources);
        }
        catch {
            // ignore
        }
        for (const s in sources) {
            if (Object.prototype.hasOwnProperty.call(sources, s) && additionalInfo[s]?.published) {
                sources[s].published = additionalInfo[s].published;
            }
        }
        _getRepositoryFile(sources, path, (err) => {
            if (err) {
                console.error(`[${new Date().toString()}] ${err}`);
            }
            callback?.(err, sources);
        });
    }
    else {
        getJson(urlOrPath, (sources) => {
            if (sources) {
                for (const s in sources) {
                    if (Object.prototype.hasOwnProperty.call(sources, s) &&
                        additionalInfo[s] &&
                        additionalInfo[s].published) {
                        sources[s].published = additionalInfo[s].published;
                    }
                }
                setImmediate(() => {
                    _getRepositoryFile(sources, path, (err) => {
                        if (err) {
                            console.error(`[${new Date().toString()}] ${err}`);
                        }
                        callback?.(err, sources);
                    });
                });
            }
            else {
                callback?.(`Cannot read "${urlOrPath}"`, {});
            }
        });
    }
}
// All paths are returned always relative to /node_modules/iobroker.js-controller
// the result has always "/" as last symbol
function getDefaultDataDir() {
    //var dataDir = __dirname.replace(/\\/g, '/');
    //dataDir = dataDir.split('/');
    // If installed with npm
    if (node_fs_1.default.existsSync(`${__dirname}/../../../node_modules/iobroker.js-controller`)) {
        return `../../iobroker-data/`;
    }
    //dataDir.splice(dataDir.length - 1, 1);
    //dataDir = dataDir.join('/');
    return './data/';
}
