import fs from 'node:fs';
import path from 'node:path';
import semver from 'semver';
require('node:events').EventEmitter.prototype._maxListeners = 100;
import axios from 'axios';
let extend: any;
let password: any;
let npmVersion: any;
let crypto: any;

// Compare versions
function upToDate(online: string, installed: string): boolean {
    const onlineParts = online.split('.').map(part => parseInt(part, 10));
    const installedParts = installed.split('.').map(part => parseInt(part, 10));

    if (onlineParts[0] > installedParts[0]) {
        return false;
    }
    if (onlineParts[0] === installedParts[0]) {
        if (onlineParts[1] > installedParts[1]) {
            return false;
        }
        if (onlineParts[1] === installedParts[1]) {
            return installedParts[2] >= onlineParts[2];
        }
        return true;
    }
    return true;
}

function encryptPhrase(password: string, phrase: string, callback: (result: any) => void) {
    // encrypt secret
    crypto = crypto || require('crypto');
    const cipher = crypto.createCipher('aes192', password);

    let encrypted = '';
    cipher.on('readable', () => {
        const data = cipher.read();
        if (data) {
            encrypted += data.toString('hex');
        }
    });
    cipher.on('end', () => {
        callback(encrypted);
    });

    cipher.write(phrase);
    cipher.end();
}

function decryptPhrase(password: string, data: any, callback: (result: any) => void) {
    crypto = crypto || require('crypto');
    const decipher = crypto.createDecipher('aes192', password);

    try {
        let decrypted = '';
        decipher.on('readable', () => {
            const data = decipher.read();
            if (data) {
                decrypted += data.toString('utf8');
            }
        });
        decipher.on('error', (error: any) => {
            console.error(`Cannot decode secret: ${error}`);
            callback(null);
        });
        decipher.on('end', function () {
            callback(decrypted);
        });

        decipher.write(data, 'hex');
        decipher.end();
    } catch (e) {
        console.error(`Cannot decode secret: ${e}`);
        callback(null);
    }
}

function getAppName() {
    const parts = __dirname.replace(/\\/g, '/').split('/');
    return parts[parts.length - 2].split('.')[0];
}

/** Derived from the directory name, e.g. 'ioBroker' for ioBroker.repositories. */
export const appName = getAppName();

function rmdirRecursiveSync(path: string) {
    if (fs.existsSync(path)) {
        fs.readdirSync(path).forEach(function (file /*, index*/) {
            const curPath = `${path}/${file}`;
            if (fs.statSync(curPath).isDirectory()) {
                // recurse
                rmdirRecursiveSync(curPath);
            } else {
                // delete file
                fs.unlinkSync(curPath);
            }
        });
        // delete (hopefully) empty folder
        try {
            fs.rmdirSync(path);
        } catch (e) {
            console.log(`Cannot delete directory ${path}: ${e.toString()}`);
        }
    }
}

function findIPs() {
    const ifaces = require('node:os').networkInterfaces();
    const ipArr: string[] = [];
    for (const dev in ifaces) {
        if (!Object.prototype.hasOwnProperty.call(ifaces, dev)) {
            continue;
        }
        /*jshint loopfunc:true */
        ifaces[dev].forEach((details: any) => {
            //noinspection JSUnresolvedVariable
            !details.internal && ipArr.push(details.address);
        });
    }
    return ipArr;
}

function findPath(path: string, url: string) {
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

function getMac(callback: (err: any, mac?: string) => void) {
    const macRegex = /(?:[a-z0-9]{2}[:-]){5}[a-z0-9]{2}/gi;
    const zeroRegex = /(?:[0]{2}[:-]){5}[0]{2}/;
    const command = process.platform.indexOf('win') === 0 ? 'getmac' : 'ifconfig || ip link';

    require('node:child_process').exec(command, (err: any, stdout: string) => {
        if (err) {
            callback(err);
        } else {
            let macAddress;
            let match;
            let result = null;

            while ((match = macRegex.exec(stdout))) {
                macAddress = match[0];
                if (!zeroRegex.test(macAddress) && !result) {
                    result = macAddress;
                }
            }

            if (result === null) {
                callback(new Error(`could not determine the mac address from:\n${stdout}`));
            } else {
                callback(null, result.replace(/-/g, ':').toLowerCase());
            }
        }
    });
}

// Build unique uuid based on MAC address if possible
function uuid(givenMac: any, callback?: any) {
    if (typeof givenMac === 'function') {
        callback = givenMac;
        givenMac = '';
    }

    let mac = givenMac !== null ? givenMac || '' : null;
    let u;

    if (mac === '') {
        const ifaces = require('node:os').networkInterfaces();

        // Find first not empty MAC
        for (const n in ifaces) {
            if (!Object.prototype.hasOwnProperty.call(ifaces, n)) {
                continue;
            }
            for (let c = 0; c < ifaces[n].length; c++) {
                if (ifaces[n][c].mac && ifaces[n][c].mac !== '00:00:00:00:00:00') {
                    mac = ifaces[n][c].mac;
                    break;
                }
            }
            if (mac) {
                break;
            }
        }
    }

    if (mac === '') {
        getMac((err: any, mac?: string) => uuid(mac || null, callback));
        return;
    }

    if (mac) {
        const md5sum = require('node:crypto').createHash('md5');
        md5sum.update(mac);
        mac = md5sum.digest('hex');
        u = `${mac.substring(0, 8)}-${mac.substring(8, 12)}-${mac.substring(12, 16)}-${mac.substring(16, 20)}-${mac.substring(20)}`;
    } else {
        // Returns a RFC4122 compliant v4 UUID https://gist.github.com/LeverOne/1308368 (DO WTF YOU WANT TO PUBLIC LICENSE)
        let a: any;
        let b: any;
        b = a = '';
        while (a++ < 36) {
            b += (a * 51) & 52 ? (a ^ 15 ? 8 ^ (Math.random() * (a ^ 20 ? 16 : 4)) : 4).toString(16) : '-';
        }
        u = b;
    }

    callback(u);
}

function createUuid(_objects: any, callback?: (...args: any[]) => void) {
    let tasks = 2;
    let _uuid: any;
    _objects.getObject('system.user.admin', (err: any, obj: any) => {
        if (err || !obj) {
            password = password || require(`${__dirname}/password`);

            // Default Password for user 'admin' is application name in lower case
            password(getAppName()).hash(null, null, (err: any, res: any) => {
                if (err) {
                    console.error(err);
                }
                // Create user here and not in io-package.js because of hash password
                let tasks = 0;

                tasks++;
                _objects.setObject(
                    'system.user.admin',
                    {
                        type: 'user',
                        common: {
                            name: 'admin',
                            password: res,
                            dontDelete: true,
                            enabled: true,
                        },
                        ts: new Date().getTime(),
                        from: `system.host.${getHostName()}.tools`,
                        native: {},
                    },
                    function () {
                        console.log('object system.user.admin created');
                        if (!--tasks && callback) {
                            callback(_uuid);
                        }
                    },
                );
            });
        } else {
            if (!--tasks && callback) {
                callback(_uuid);
            }
        }
    });

    _objects.getObject('system.meta.uuid', function (err: any, obj: any) {
        if (!err && obj && obj.native && obj.native.uuid) {
            if (!--tasks && callback) {
                callback();
            }
        } else {
            uuid((res: any) => {
                _uuid = res;
                _objects.setObject(
                    'system.meta.uuid',
                    {
                        type: 'meta',
                        common: {
                            name: 'uuid',
                            type: 'uuid',
                        },
                        ts: new Date().getTime(),
                        from: `system.host.${getHostName()}.tools`,
                        native: {
                            uuid: res,
                        },
                    },
                    () => {
                        console.log('object system.meta.uuid created');
                        if (!--tasks && callback) {
                            callback(_uuid);
                        }
                    },
                );
            });
        }
    });
}

// Download file to tmp or return file name directly
function getFile(urlOrPath: string, fileName: string, callback?: (...args: any[]) => void) {
    // If an object was read
    if (
        urlOrPath.substring(0, 'http://'.length) === 'http://' ||
        urlOrPath.substring(0, 'https://'.length) === 'https://'
    ) {
        const tmpFile = `${__dirname}/../tmp/${fileName || `${Math.floor(Math.random() * 0xffffffe)}.zip`}`;
        axios(urlOrPath, { responseType: 'arraybuffer' })
            .then(response => {
                fs.writeFileSync(tmpFile, response.data);
                console.log(`downloaded ${tmpFile}`);
                callback && callback(tmpFile);
            })
            .catch(error => {
                console.log(`Cannot download "${tmpFile}": ${error}`);
                callback && callback(tmpFile);
            });
    } else {
        if (fs.existsSync(urlOrPath)) {
            callback && callback(urlOrPath);
        } else if (fs.existsSync(`${__dirname}/../${urlOrPath}`)) {
            callback && callback(`${__dirname}/../${urlOrPath}`);
        } else if (fs.existsSync(`${__dirname}/../tmp/${urlOrPath}`)) {
            callback && callback(`${__dirname}/../tmp/${urlOrPath}`);
        } else {
            console.log(`File not found: ${urlOrPath}`);
            process.exit(1);
        }
    }
}

// Return content of the json file. Download it or read directly
function getJson(urlOrPath: string, callback?: (...args: any[]) => void) {
    let sources: Record<string, any> = {};
    // If an object was read
    if (urlOrPath && typeof urlOrPath === 'object') {
        callback && callback(urlOrPath);
    } else if (!urlOrPath) {
        console.log('Empty url!');
        callback && callback(null);
    } else {
        if (
            urlOrPath.substring(0, 'http://'.length) === 'http://' ||
            urlOrPath.substring(0, 'https://'.length) === 'https://'
        ) {
            axios(urlOrPath, { timeout: 10000 })
                .then(response => {
                    callback && callback(response.data, urlOrPath);
                })
                .catch(error => {
                    console.log(
                        `Cannot download json from ${urlOrPath}. Error: ${error || (error.response && error.response.data)}`,
                    );
                    callback && callback(null, urlOrPath);
                });
        } else {
            if (fs.existsSync(urlOrPath)) {
                try {
                    sources = JSON.parse(fs.readFileSync(urlOrPath).toString());
                } catch (e) {
                    console.log(`Cannot parse json file from ${urlOrPath}. Error: ${e}`);
                    callback && callback(null, urlOrPath);
                    return;
                }
                callback && callback(sources, urlOrPath);
            } else if (fs.existsSync(`${__dirname}/../${urlOrPath}`)) {
                try {
                    sources = JSON.parse(fs.readFileSync(`${__dirname}/../${urlOrPath}`).toString());
                } catch (e) {
                    console.log(`Cannot parse json file from ${__dirname}/../${urlOrPath}. Error: ${e}`);
                    callback && callback(null, urlOrPath);
                    return;
                }
                callback && callback(sources, urlOrPath);
            } else if (fs.existsSync(`${__dirname}/../tmp/${urlOrPath}`)) {
                try {
                    sources = JSON.parse(fs.readFileSync(`${__dirname}/../tmp/${urlOrPath}`).toString());
                } catch (e) {
                    console.log(`Cannot parse json file from ${__dirname}/../tmp/${urlOrPath}. Error: ${e}`);
                    callback && callback(null, urlOrPath);
                    return;
                }
                callback && callback(sources, urlOrPath);
            } else {
                //if (urlOrPath.indexOf('/example/') === -1) console.log('Json file not found: ' + urlOrPath);
                callback && callback(null, urlOrPath);
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
function extractLicenseInfo(options: any) {
    const { ioPackJson, packJson } = options;
    if (ioPackJson.common.licenseInformation) {
        return ioPackJson.common.licenseInformation;
    }

    if (packJson.license) {
        return { license: packJson.license };
    }

    // hint: pack.licenses is deprecated https://docs.npmjs.com/cli/v10/configuring-npm/package-json#license
    if (packJson.licenses?.length) {
        return { license: packJson.licenses[0].type, link: packJson.licenses[0].url };
    }

    if (ioPackJson.common.license) {
        return { license: ioPackJson.common.license };
    }

    return { license: '' };
}

// Get a list of all installed adapters and controller version on this host
function getInstalledInfo(hostRunningVersion?: string) {
    let i;
    const result: Record<string, any> = {};
    let path = `${__dirname}/../`;
    // Get info about host
    let ioPackage = JSON.parse(fs.readFileSync(`${path}io-package.json`).toString());
    let package_ = fs.existsSync(`${path}package.json`)
        ? JSON.parse(fs.readFileSync(`${path}package.json`).toString())
        : {};
    const regExp = new RegExp(`^${appName}\\.`, 'i');

    const licenseInfo = extractLicenseInfo({ packJson: package_, ioPackJson: ioPackage });

    //noinspection JSUnresolvedVariable
    result[ioPackage.common.name] = {
        controller: true,
        version: ioPackage.common.version,
        icon: ioPackage.common.extIcon || ioPackage.common.icon,
        title: ioPackage.common.title,
        desc: ioPackage.common.desc,
        platform: ioPackage.common.platform,
        keywords: ioPackage.common.keywords,
        readme: ioPackage.common.readme,
        runningVersion: hostRunningVersion,
        licenseInformation: licenseInfo,
        // license and licenseUrl now contained in licenseInfo, but keep it for backward compatibility (14.02.2024)
        license: licenseInfo.license,
        licenseUrl: licenseInfo.link ?? '',
    };
    let dirs;
    if (fs.existsSync(`${__dirname}/../node_modules`)) {
        dirs = fs.readdirSync(`${__dirname}/../node_modules`);
        for (i = 0; i < dirs.length; i++) {
            try {
                path = `${__dirname}/../node_modules/${dirs[i]}/`;
                if (regExp.test(dirs[i]) && fs.existsSync(`${path}io-package.json`)) {
                    ioPackage = JSON.parse(fs.readFileSync(`${path}io-package.json`).toString());
                    package_ = fs.existsSync(`${path}package.json`)
                        ? JSON.parse(fs.readFileSync(`${path}package.json`).toString())
                        : {};
                    //noinspection JSUnresolvedVariable
                    result[ioPackage.common.name] = {
                        controller: false,
                        version: ioPackage.common.version,
                        icon:
                            ioPackage.common.extIcon ||
                            (ioPackage.common.icon ? `/adapter/${dirs[i]}/${ioPackage.common.icon}` : ''),
                        title: ioPackage.common.title,
                        desc: ioPackage.common.desc,
                        platform: ioPackage.common.platform,
                        keywords: ioPackage.common.keywords,
                        readme: ioPackage.common.readme,
                        type: ioPackage.common.type,
                        licenseInformation: licenseInfo,
                        // license and licenseUrl now contained in licenseInfo, but keep it for backward compatibility for older admin (14.02.2024)
                        license: licenseInfo.license,
                        licenseUrl: licenseInfo.link ?? '',
                    };
                }
            } catch (e) {
                console.log(
                    `Cannot read or parse ${__dirname}/../node_modules/${dirs[i]}/io-package.json: ${e.toString()}`,
                );
            }
        }
    }
    if (
        fs.existsSync(`${__dirname}/../../../node_modules/${appName.toLowerCase()}.js-controller`) ||
        fs.existsSync(`${__dirname}/../../../node_modules/${appName}.js-controller`)
    ) {
        dirs = fs.readdirSync(`${__dirname}/../..`);
        for (i = 0; i < dirs.length; i++) {
            try {
                path = `${__dirname}/../../${dirs[i]}/`;
                if (
                    regExp.test(dirs[i]) &&
                    dirs[i].substring(appName.length + 1) !== 'js-controller' &&
                    fs.existsSync(`${path}io-package.json`)
                ) {
                    ioPackage = JSON.parse(fs.readFileSync(`${path}io-package.json`).toString());
                    package_ = fs.existsSync(`${path}package.json`)
                        ? JSON.parse(fs.readFileSync(`${path}package.json`).toString())
                        : {};
                    //noinspection JSUnresolvedVariable
                    result[ioPackage.common.name] = {
                        controller: false,
                        version: ioPackage.common.version,
                        icon:
                            ioPackage.common.extIcon ||
                            (ioPackage.common.icon ? `/adapter/${dirs[i]}/${ioPackage.common.icon}` : ''),
                        title: ioPackage.common.title,
                        desc: ioPackage.common.desc,
                        platform: ioPackage.common.platform,
                        keywords: ioPackage.common.keywords,
                        readme: ioPackage.common.readme,
                        type: ioPackage.common.type,
                        licenseInformation: licenseInfo,
                        // license and licenseUrl now contained in licenseInfo, but keep it for backward compatibility for older admin (14.02.2024)
                        license: licenseInfo.license,
                        licenseUrl: licenseInfo.link ?? '',
                    };
                }
            } catch (e) {
                console.log(
                    `Cannot read or parse ${__dirname}/../node_modules/${dirs[i]}/io-package.json: ${e.toString()}`,
                );
            }
        }
    }
    return result;
}

/**
 * Reads an adapter's npm version
 *
 * @param adapter The adapter to read the npm version from. Null for the root ioBroker packet
 * @param [callback]
 */
function getNpmVersion(adapter: string, callback?: (err: any, version?: string) => void) {
    adapter = adapter ? `${appName}.${adapter}` : appName;
    adapter = adapter.toLowerCase();

    const cliCommand = `npm view ${adapter}@latest version`;

    const exec = require('node:child_process').exec;
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

function getIoPack(sources: any, name: string, callback?: (...args: any[]) => void) {
    getJson(sources[name].meta, function (ioPack: any) {
        const packUrl = sources[name].meta.replace('io-package.json', 'package.json');
        if (!ioPack) {
            sources._helper && sources._helper.failCounter.push(name);
            callback && callback(sources, name);
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

                        callback && callback(sources, name);
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
                            callback && callback(sources, name);
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
                                    callback && callback(sources, name);
                                });
                            } else {
                                callback && callback(sources, name);
                            }
                        }
                    }
                });
            });
        }
    });
}

function _getRepositoryFile(sources: any, path: string, callback: (err?: any, sources?: any) => void) {
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
                callback && callback(`Timeout by read all package.json (${count}) seconds`, sources);
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
                        callback && callback('Looks like there is no internet.', sources);
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
        callback && callback(err, sources);
        callback = null;
    }
}

// Get list of all adapters and controller in some repository file or in /conf/source-dist.json
function getRepositoryFile(
    urlOrPath: string,
    additionalInfo?: any,
    callback?: (err: any, sources?: any, path?: string) => void,
) {
    let sources: Record<string, any> = {};
    let path = '';

    if (typeof additionalInfo === 'function') {
        callback = additionalInfo;
        additionalInfo = {};
    }
    if (!additionalInfo) {
        additionalInfo = {};
    }

    if (!extend) {
        extend = require('node.extend');
    }

    if (urlOrPath) {
        const parts = urlOrPath.split('/');
        path = `${parts.splice(0, parts.length - 1).join('/')}/`;
    }

    // If object was read
    if (urlOrPath && typeof urlOrPath === 'object') {
        callback && callback(null, urlOrPath);
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
                console.error(`[${new Date()}] ${err}`);
            }
            callback && callback(err, sources);
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
                        err && console.error(`[${new Date()}] ${err}`);
                        callback && callback(err, sources);
                    });
                });
            } else {
                callback && callback(`Cannot read "${urlOrPath}"`, {});
            }
        });
    }
}

function sendDiagInfo(obj: any, callback?: (body?: any) => void) {
    axios
        .post(`http://download.${appName}.net/diag.php`, `data=${JSON.stringify(obj)}`, {
            headers: { 'content-type': 'application/x-www-form-urlencoded' },
            timeout: 2000,
        })
        .then(() => typeof callback === 'function' && callback())
        .catch(error => {
            console.log(`Cannot send diag info: ${error}`);
            typeof callback === 'function' && callback();
        });
}

function getAdapterDir(adapter: string, isNpm?: boolean) {
    const parts = __dirname.replace(/\\/g, '/').split('/');
    parts.splice(parts.length - 3, 3);
    const dir = parts.join('/');
    if (adapter.substring(0, appName.length + 1) === `${appName}.`) {
        adapter = adapter.substring(appName.length + 1);
    }

    const cut = (count: number): string => {
        const segments = __dirname.replace(/\\/g, '/').split('/');
        segments.splice(segments.length - count, count);
        return segments.join('/');
    };

    if (
        fs.existsSync(`${dir}/node_modules/${appName}.js-controller`) &&
        fs.existsSync(`${dir}/node_modules/${appName}.${adapter}`)
    ) {
        return `${cut(2)}/${appName}.${adapter}`;
    } else if (fs.existsSync(`${__dirname}/../node_modules/${appName}.${adapter}`)) {
        return `${cut(1)}/node_modules/${appName}.${adapter}`;
    }
    if (isNpm) {
        if (fs.existsSync(`${__dirname}/../../node_modules/${appName}.js-controller`)) {
            return `${cut(2)}/${appName}.${adapter}`;
        }
        return `${cut(1)}/node_modules/${appName}.${adapter}`;
    }
    return `${cut(1)}/adapter/${adapter}`;
}

function getHostName() {
    try {
        const configName = getConfigFileName();
        const config = JSON.parse(fs.readFileSync(configName).toString());
        return config.system ? config.system.hostname || require('node:os').hostname() : require('node:os').hostname();
    } catch {
        return require('node:os').hostname();
    }
}

/**
 * Read a version of system npm
 *
 * @alias getSystemNpmVersion
 * @param callback return result
 *        <pre><code>
 *            function (err, version) {
 *              adapter.log.debug('NPM version is: ' + version);
 *            }
 *        </code></pre>
 */
function getSystemNpmVersion(callback?: (err: any, version?: string) => void) {
    const exec = require('node:child_process').exec;

    // remove local node_modules\.bin dir from a path
    // or we potentially get the wrong npm version
    const newEnv = Object.assign({}, process.env);
    newEnv.PATH = (newEnv.PATH || newEnv.Path || newEnv.path)
        .split(path.delimiter)
        .filter(dir => {
            dir = dir.toLowerCase();
            return !dir.includes('iobroker') || !dir.includes(path.join('node_modules', '.bin'));
        })
        .join(path.delimiter);

    exec('npm -v', { encoding: 'utf8', env: newEnv }, (error: any, stdout: string) => {
        if (stdout) {
            stdout = semver.valid(stdout.trim());
        }
        callback && callback(error, stdout);
    });
}

/**
 * Collects information about host and available adapters
 *
 *  The following info will be collected:
 *    - available adapters
 *    - node.js --version
 *    - npm --version
 *
 * @alias getHostInfo
 * @param objects
 * @param callback return result
 *        <pre><code>
 *            function (err, result) {
 *              adapter.log.debug('Info about host: ' + JSON.stringify(result, null, 2);
 *            }
 *        </code></pre>
 */
function getHostInfo(objects: any, callback?: (err: any, data?: any) => void) {
    const os = require('node:os');
    const cpus = os.cpus();
    const data: Record<string, any> = {
        Platform: os.platform(),
        Architecture: os.arch(),
        CPUs: cpus.length,
        Speed: cpus[0].speed,
        Model: cpus[0].model,
        RAM: os.totalmem(),
        'System uptime': Math.round(os.uptime()),
        'Node.js': process.version,
    };
    let task = 0;
    task++;
    objects.getObject('system.config', (err: any, systemConfig: any) => {
        objects.getObject('system.repositories', (err: any, repos: any) => {
            // Check if repositories exist
            if (!err && repos && repos.native && repos.native.repositories) {
                const repo = repos.native.repositories[systemConfig.common.activeRepo];
                if (repo && repo.json) {
                    data['adapters count'] = Object.keys(repo.json).length;
                }
            }
            if (!--task) {
                callback(err, data);
            }
        });
    });

    if (!npmVersion) {
        task++;
        getSystemNpmVersion((err, version) => {
            data.NPM = `v${version}`;
            npmVersion = version;
            if (!--task) {
                callback(err, data);
            }
        });
    } else {
        data.NPM = npmVersion;
        if (!task) {
            callback(null, data);
        }
    }
}

// All pathes are returned always relative to /node_modules/' + appName + '.js-controller
// the result has always "/" as last symbol
function getDefaultDataDir() {
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

function getConfigFileName(): string {
    const segments = __dirname.replace(/\\/g, '/').split('/');

    // If installed with npm
    if (
        fs.existsSync(`${__dirname}/../../../node_modules/${appName.toLowerCase()}.js-controller`) ||
        fs.existsSync(`${__dirname}/../../../node_modules/${appName}.js-controller`)
    ) {
        // remove /node_modules/' + appName + '.js-controller/lib
        segments.splice(segments.length - 3, 3);
        return `${segments.join('/')}/${appName}-data/${appName}.json`;
    }
    // Remove /lib
    segments.splice(segments.length - 1, 1);
    const configDir = segments.join('/');
    if (fs.existsSync(`${__dirname}/../conf/${appName}.json`)) {
        return `${configDir}/conf/${appName}.json`;
    }
    return `${configDir}/data/${appName}.json`;
}

export {
    findIPs,
    rmdirRecursiveSync,
    getRepositoryFile,
    getIoPack,
    getFile,
    getJson,
    getInstalledInfo,
    sendDiagInfo,
    getAdapterDir,
    getDefaultDataDir,
    getConfigFileName,
    getHostName,
    createUuid,
    getHostInfo,
    upToDate,
    encryptPhrase,
    decryptPhrase,
};
