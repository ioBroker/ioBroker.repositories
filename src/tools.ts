import fs from 'node:fs';
import semver from 'semver';
import { exec } from 'node:child_process';
import extend from 'node.extend';

require('node:events').EventEmitter.prototype._maxListeners = 100;
import axios from 'axios';

// Compare versions

function getAppName(): string {
    const parts = __dirname.replace(/\\/g, '/').split('/');
    return parts[parts.length - 2].split('.')[0];
}

/** Derived from the directory name, e.g. 'ioBroker' for ioBroker.repositories. */
export const appName = getAppName();

function findPath(path: string, url: string): string {
    if (!url) {
        return '';
    }
    if (url.substring(0, 'http://'.length) === 'http://' || url.substring(0, 'https://'.length) === 'https://') {
        return url;
    }
    if (path.substring(0, 'http://'.length) === 'http://' || path.substring(0, 'https://'.length) === 'https://') {
        return (path + url).replace(/\/\//g, '/').replace('http:/', 'http://').replace('https:/', 'https://');
    }
    if (url && url[0] === '/') {
        return `${__dirname}/..${url}`;
    }
    return `${__dirname}/../${path}${url}`;
}

// Return the content of the json file. Download it or read it directly
function getJson(urlOrPath: string, callback?: (...args: any[]) => void): void {
    let sources: Record<string, any> = {};
    // If an object was read
    if (urlOrPath && typeof urlOrPath === 'object') {
        callback?.(urlOrPath);
    } else if (!urlOrPath) {
        console.log('Empty url!');
        callback?.(null);
    } else {
        if (
            urlOrPath.substring(0, 'http://'.length) === 'http://' ||
            urlOrPath.substring(0, 'https://'.length) === 'https://'
        ) {
            axios(urlOrPath, { timeout: 10000 })
                .then(response => {
                    callback?.(response.data, urlOrPath);
                })
                .catch(error => {
                    console.log(
                        `Cannot download json from ${urlOrPath}. Error: ${error || (error.response && error.response.data)}`,
                    );
                    callback?.(null, urlOrPath);
                });
        } else {
            if (fs.existsSync(urlOrPath)) {
                try {
                    sources = JSON.parse(fs.readFileSync(urlOrPath).toString());
                } catch (e) {
                    console.log(`Cannot parse json file from ${urlOrPath}. Error: ${e}`);
                    callback?.(null, urlOrPath);
                    return;
                }
                callback?.(sources, urlOrPath);
            } else if (fs.existsSync(`${__dirname}/../${urlOrPath}`)) {
                try {
                    sources = JSON.parse(fs.readFileSync(`${__dirname}/../${urlOrPath}`).toString());
                } catch (e) {
                    console.log(`Cannot parse json file from ${__dirname}/../${urlOrPath}. Error: ${e}`);
                    callback?.(null, urlOrPath);
                    return;
                }
                callback?.(sources, urlOrPath);
            } else if (fs.existsSync(`${__dirname}/../tmp/${urlOrPath}`)) {
                try {
                    sources = JSON.parse(fs.readFileSync(`${__dirname}/../tmp/${urlOrPath}`).toString());
                } catch (e) {
                    console.log(`Cannot parse json file from ${__dirname}/../tmp/${urlOrPath}. Error: ${e}`);
                    callback?.(null, urlOrPath);
                    return;
                }
                callback?.(sources, urlOrPath);
            } else {
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
function getNpmVersion(adapter: string, callback?: (err: any, version?: string) => void): void {
    adapter = adapter ? `${appName}.${adapter}` : appName;
    adapter = adapter.toLowerCase();

    const cliCommand = `npm view ${adapter}@latest version`;

    exec(cliCommand, { timeout: 2000 }, (error: any, stdout: string) => {
        let version;
        if (error) {
            // command failed
            return typeof callback === 'function' && callback(error);
        } else if (stdout) {
            version = semver.valid(stdout.trim());
        }
        typeof callback === 'function' && callback(null, version);
    });
}

function getIoPack(sources: any, name: string, callback?: (...args: any[]) => void): void {
    getJson(sources[name].meta, function (ioPack: any) {
        const packUrl = sources[name].meta.replace('io-package.json', 'package.json');
        if (!ioPack) {
            sources._helper && sources._helper.failCounter.push(name);
            callback?.(sources, name);
        } else {
            setImmediate(() => {
                getJson(packUrl, (pack: any) => {
                    const version = sources[name].version;
                    const type = sources[name].type;
                    // If installed from git or something else.
                    // js-controller is an exception because it can be installed from npm and from git
                    if (sources[name].url && name !== 'js-controller') {
                        if (ioPack && ioPack.common) {
                            sources[name] = extend(true, sources[name], ioPack.common);

                            // overwrite type of adapter from repository
                            if (type) {
                                sources[name].type = type;
                            }
                            if (pack && pack.licenses && pack.licenses.length) {
                                sources[name].license = sources[name].license || pack.licenses[0].type;
                                sources[name].licenseUrl = sources[name].licenseUrl || pack.licenses[0].url;
                            }
                        }

                        callback?.(sources, name);
                    } else {
                        if (ioPack && ioPack.common) {
                            sources[name] = extend(true, sources[name], ioPack.common);
                            if (pack && pack.licenses && pack.licenses.length) {
                                sources[name].license = sources[name].license || pack.licenses[0].type;
                                sources[name].licenseUrl = sources[name].licenseUrl || pack.licenses[0].url;
                            }
                        }

                        // overwrite type of adapter from repository
                        if (type) {
                            sources[name].type = type;
                        }

                        if (version) {
                            sources[name].version = version;
                            callback?.(sources, name);
                        } else {
                            if (
                                sources[name].meta.substring(0, 'http://'.length) === 'http://' ||
                                sources[name].meta.substring(0, 'https://'.length) === 'https://'
                            ) {
                                //installed from npm
                                getNpmVersion(name, (err: any, version?: string) => {
                                    err && console.error(err);

                                    if (version) {
                                        sources[name].version = version;
                                    } else {
                                        sources[name].version = 'npm error';
                                    }
                                    callback?.(sources, name);
                                });
                            } else {
                                callback?.(sources, name);
                            }
                        }
                    }
                });
            });
        }
    });
}

function _getRepositoryFile(sources: any, path: string, callback: (err?: any, sources?: any) => void): void {
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
                    } else {
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
export function getRepositoryFile(
    urlOrPath: string,
    additionalInfo?: any,
    callback?: (err: any, sources?: any, path?: string) => void,
): void {
    let sources: Record<string, any> = {};
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
    } else if (!urlOrPath) {
        try {
            sources = JSON.parse(fs.readFileSync(`${getDefaultDataDir()}sources.json`).toString());
        } catch {
            sources = {};
        }
        try {
            const sourcesDist = JSON.parse(fs.readFileSync(`${__dirname}/../conf/sources-dist.json`).toString());
            sources = extend(true, sourcesDist, sources);
        } catch {
            // ignore
        }

        for (const s in sources) {
            if (Object.prototype.hasOwnProperty.call(sources, s) && additionalInfo[s] && additionalInfo[s].published) {
                sources[s].published = additionalInfo[s].published;
            }
        }

        _getRepositoryFile(sources, path, (err?: any) => {
            if (err) {
                console.error(`[${new Date().toString()}] ${err}`);
            }
            callback?.(err, sources);
        });
    } else {
        getJson(urlOrPath, (sources: any) => {
            if (sources) {
                for (const s in sources) {
                    if (
                        Object.prototype.hasOwnProperty.call(sources, s) &&
                        additionalInfo[s] &&
                        additionalInfo[s].published
                    ) {
                        sources[s].published = additionalInfo[s].published;
                    }
                }
                setImmediate(() => {
                    _getRepositoryFile(sources, path, (err?: any) => {
                        err && console.error(`[${new Date().toString()}] ${err}`);
                        callback?.(err, sources);
                    });
                });
            } else {
                callback?.(`Cannot read "${urlOrPath}"`, {});
            }
        });
    }
}

// All paths are returned always relative to /node_modules/' + appName + '.js-controller
// the result has always "/" as last symbol
function getDefaultDataDir(): string {
    //var dataDir = __dirname.replace(/\\/g, '/');
    //dataDir = dataDir.split('/');

    // If installed with npm
    if (fs.existsSync(`${__dirname}/../../../node_modules/${appName}.js-controller`)) {
        return `../../${appName}-data/`;
    }
    //dataDir.splice(dataDir.length - 1, 1);
    //dataDir = dataDir.join('/');
    return './data/';
}
