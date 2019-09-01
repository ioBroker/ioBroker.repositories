const fs = require('fs');
const semver = require('semver');
require('events').EventEmitter.prototype._maxListeners = 100;
let request;
let extend;
let password;
let npmVersion;
let crypto;

// Compare versions
function upToDate(online, installed) {
    online = online.split('.');
    installed = installed.split('.');
    online[0] = parseInt(online[0], 10);
    installed[0] = parseInt(installed[0], 10);
    if (online[0] > installed[0]) {
        return false;
    } else if (online[0] === installed[0]) {
        online[1]    = parseInt(online[1], 10);
        installed[1] = parseInt(installed[1], 10);

        if (online[1] > installed[1]) {
            return false;
        } else if (online[1] === installed[1]) {
            online[2]    = parseInt(online[2], 10);
            installed[2] = parseInt(installed[2], 10);
            return installed[2] >= online[2];
        } else {
            return true;
        }
    } else {
        return true;
    }
}

function encryptPhrase(password, phrase, callback) {
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

function decryptPhrase(password, data, callback) {
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
        decipher.on('error', error => {
            console.error('Cannot decode secret: ' + error);
            callback(null);
        });
        decipher.on('end', function () {
            callback(decrypted);
        });

        decipher.write(data, 'hex');
        decipher.end();
    } catch (e) {
        console.error('Cannot decode secret: ' + e);
        callback(null);
    }
}

function getAppName() {
    const parts = __dirname.replace(/\\/g, '/').split('/');
    return parts[parts.length - 2].split('.')[0];
}

function rmdirRecursiveSync(path) {
    if (fs.existsSync(path)) {
        fs.readdirSync(path).forEach(function (file/*, index*/) {
            const curPath = path + '/' + file;
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
            console.log('Cannot delete directory ' + path + ': ' + e.toString());
        }
    }
}

function findIPs() {
    const ifaces = require('os').networkInterfaces();
    const ipArr = [];
    for (const dev in ifaces) {
        if (!ifaces.hasOwnProperty(dev)) continue;
        /*jshint loopfunc:true */
        ifaces[dev].forEach(function (details) {
            //noinspection JSUnresolvedVariable
            if (!details.internal) ipArr.push(details.address);
        });
    }
    return ipArr;
}

function findPath(path, url) {
    if (!url) return '';
    if (url.substring(0, 'http://'.length)  === 'http://' ||
        url.substring(0, 'https://'.length) === 'https://') {
        return url;
    } else {
        if (path.substring(0, 'http://'.length)  === 'http://' ||
            path.substring(0, 'https://'.length) === 'https://') {
            return (path + url).replace(/\/\//g, '/').replace('http:/', 'http://').replace('https:/', 'https://');
        } else {
            if (url && url[0] === '/') {
                return __dirname + '/..' + url;
            } else {
                return __dirname + '/../' + path + url;
            }
        }
    }
}

function getMac(callback) {
    const macRegex  = /(?:[a-z0-9]{2}[:-]){5}[a-z0-9]{2}/ig;
    const zeroRegex = /(?:[0]{2}[:-]){5}[0]{2}/;
    const command   = (process.platform.indexOf('win') === 0) ? 'getmac' : 'ifconfig || ip link';

    require('child_process').exec(command, function(err, stdout, stderr) {
        if (err) {
            callback(err);
        } else {
            let macAddress;
            let match;
            let result = null;

            while (match = macRegex.exec(stdout)) {
                macAddress = match[0];
                if (!zeroRegex.test(macAddress) && !result) result = macAddress;
            }

            if (result === null) {
                callback(new Error('could not determine the mac address from:\n' + stdout));
            } else {
                callback(null, result.replace(/-/g, ':').toLowerCase());
            }
        }
    });
}

// Build unique uuid based on MAC address if possible
function uuid(givenMac, callback) {
    if (typeof givenMac === 'function') {
        callback = givenMac;
        givenMac = '';
    }

    let mac = (givenMac !== null) ? (givenMac || '') : null;
    let u;

    if (mac === '') {
        const ifaces = require('os').networkInterfaces();

        // Find first not empty MAC
        for (const n in ifaces) {
            if (!ifaces.hasOwnProperty(n)) continue;
            for (let c = 0; c < ifaces[n].length; c++) {
                if (ifaces[n][c].mac && ifaces[n][c].mac !== '00:00:00:00:00:00') {
                    mac = ifaces[n][c].mac;
                    break;
                }
            }
            if (mac) break;
        }
    }

    if (mac === '') {
        getMac(function(err, mac) {
            uuid(mac || null, callback);
        });
        return;
    }

    if (mac) {
        const md5sum = require('crypto').createHash('md5');
        md5sum.update(mac);
        mac = md5sum.digest('hex');
        u = mac.substring(0, 8) + '-' + mac.substring(8, 12) + '-' + mac.substring(12, 16) + '-' + mac.substring(16, 20) + '-' + mac.substring(20);
    } else {
        // Returns a RFC4122 compliant v4 UUID https://gist.github.com/LeverOne/1308368 (DO WTF YOU WANT TO PUBLIC LICENSE)
        let a;
        let b;
        b = a = '';
        while (a++ < 36) {
            b += ((a * 51) & 52) ? (a ^ 15 ? 8 ^ Math.random() * (a ^ 20 ? 16 : 4) : 4).toString(16) : '-';
        }
        u = b;
    }

    callback(u);
}

function createUuid(_objects, callback) {
    let tasks = 2;
    let _uuid;
    _objects.getObject('system.user.admin', function (err, obj) {
        if (err || !obj) {
            password = password || require(__dirname + '/password');

            // Default Password for user 'admin' is application name in lower case
            password(getAppName()).hash(null, null, function (err, res) {
                if (err) console.error(err);
                // Create user here and not in io-package.js because of hash password
                let tasks = 0;

                tasks++;
                _objects.setObject('system.user.admin', {
                    type: 'user',
                    common: {
                        name:      'admin',
                        password:   res,
                        dontDelete: true,
                        enabled:    true
                    },
                    ts: new Date().getTime(),
                    from: 'system.host.' + getHostName() + '.tools',
                    native: {}
                }, function () {
                    console.log('object system.user.admin created');
                    if (!--tasks && callback) callback(_uuid);
                });
            });
        } else {
            if (!--tasks && callback) callback(_uuid);
        }
    });

    _objects.getObject('system.meta.uuid', function (err, obj) {
        if (!err && obj && obj.native && obj.native.uuid) {
            if (!--tasks && callback) callback();
        } else {
            uuid(function (res) {
                _uuid = res;
                _objects.setObject('system.meta.uuid', {
                    type: 'meta',
                    common: {
                        name: 'uuid',
                        type: 'uuid'
                    },
                    ts: new Date().getTime(),
                    from: 'system.host.' + getHostName() + '.tools',
                    native: {
                        uuid: res
                    }
                }, function () {
                    console.log('object system.meta.uuid created');
                    if (!--tasks && callback) callback(_uuid);
                });
            });
        }
    });
}

// Download file to tmp or return file name directly
function getFile(urlOrPath, fileName, callback) {
    if (!request) request = require('request');

    // If object was read
    if (urlOrPath.substring(0, 'http://'.length) === 'http://' ||
        urlOrPath.substring(0, 'https://'.length) === 'https://') {
        const tmpFile = __dirname + '/../tmp/' + (fileName || Math.floor(Math.random() * 0xFFFFFFE) + '.zip');
        request(urlOrPath).on('error', function (error) {
            console.log('Cannot download "' + tmpFile + '": ' + error);
            if (callback) callback(tmpFile);
        }).pipe(fs.createWriteStream(tmpFile)).on('close', function () {
            console.log('downloaded ' + tmpFile);
            if (callback) callback(tmpFile);
        });
    } else {
        if (fs.existsSync(urlOrPath)) {
            if (callback) callback(urlOrPath);
        } else
        if (fs.existsSync(__dirname + '/../' + urlOrPath)) {
            if (callback) callback(__dirname + '/../' + urlOrPath);
        } else if (fs.existsSync(__dirname + '/../tmp/' + urlOrPath)) {
            if (callback) callback(__dirname + '/../tmp/' + urlOrPath);
        } else {
            console.log('File not found: ' + urlOrPath);
            process.exit(1);
        }
    }
}

// Return content of the json file. Download it or read directly
function getJson(urlOrPath, callback) {
    if (!request) request = require('request');
    let sources = {};
    // If object was read
    if (urlOrPath && typeof urlOrPath === 'object') {
        if (callback) callback(urlOrPath);
    } else
    if (!urlOrPath) {
        console.log('Empty url!');
        if (callback) callback(null);
    } else {
        if (urlOrPath.substring(0, 'http://'.length) === 'http://' ||
            urlOrPath.substring(0, 'https://'.length) === 'https://') {
            request({url: urlOrPath, timeout: 10000}, function (error, response, body) {
                if (error || !body || response.statusCode !== 200) {
                    console.log('Cannot download json from ' + urlOrPath + '. Error: ' + (error || body));
                    if (callback) callback(null, urlOrPath);
                    return;
                }
                try {
                    sources = JSON.parse(body);
                } catch (e) {
                    console.log('Json file is invalid on ' + urlOrPath);
                    if (callback) callback(null, urlOrPath);
                    return;
                }

                if (callback) callback(sources, urlOrPath);
            }).on('error', function (error) {
                //console.log('Cannot download json from ' + urlOrPath + '. Error: ' + error);
                //if (callback) callback(null, urlOrPath);
            });
        } else {
            if (fs.existsSync(urlOrPath)) {
                try {
                    sources = JSON.parse(fs.readFileSync(urlOrPath));
                } catch (e) {
                    console.log('Cannot parse json file from ' + urlOrPath + '. Error: ' + e);
                    if (callback) callback(null, urlOrPath);
                    return;
                }
                if (callback) callback(sources, urlOrPath);
            } else
            if (fs.existsSync(__dirname + '/../' + urlOrPath)) {
                try {
                    sources = JSON.parse(fs.readFileSync(__dirname + '/../' + urlOrPath));
                }catch (e) {
                    console.log('Cannot parse json file from ' + __dirname + '/../' + urlOrPath + '. Error: ' + e);
                    if (callback) callback(null, urlOrPath);
                    return;
                }
                if (callback) callback(sources, urlOrPath);
            } else if (fs.existsSync(__dirname + '/../tmp/' + urlOrPath)) {
                try {
                    sources = JSON.parse(fs.readFileSync(__dirname + '/../tmp/' + urlOrPath));
                } catch (e) {
                    console.log('Cannot parse json file from ' + __dirname + '/../tmp/' + urlOrPath + '. Error: ' + e);
                    if (callback) callback(null, urlOrPath);
                    return;
                }
                if (callback) callback(sources, urlOrPath);
            } else {
                //if (urlOrPath.indexOf('/example/') === -1) console.log('Json file not found: ' + urlOrPath);
                if (callback) callback(null, urlOrPath);
            }
        }
    }
}

// Get list of all installed adapters and controller version on this host
function getInstalledInfo(hostRunningVersion) {
    let i;
    const result = {};
    let path = __dirname + '/../';
    // Get info about host
    let ioPackage = JSON.parse(fs.readFileSync(path + 'io-package.json'));
    let package_   = fs.existsSync(path + 'package.json') ? JSON.parse(fs.readFileSync(path + 'package.json')) : {};
    const regExp = new RegExp('^' + module.exports.appName + '\\.', 'i');

    //noinspection JSUnresolvedVariable
    result[ioPackage.common.name] = {
        controller:     true,
        version:        ioPackage.common.version,
        icon:           ioPackage.common.extIcon || ioPackage.common.icon,
        title:          ioPackage.common.title,
        desc:           ioPackage.common.desc,
        platform:       ioPackage.common.platform,
        keywords:       ioPackage.common.keywords,
        readme:         ioPackage.common.readme,
        runningVersion: hostRunningVersion,
        license:        ioPackage.common.license ? ioPackage.common.license : ((package_.licenses && package_.licenses.length) ? package_.licenses[0].type : ''),
        licenseUrl:     (package_.licenses && package_.licenses.length) ? package_.licenses[0].url : ''
    };
    let dirs;
    if (fs.existsSync(__dirname + '/../node_modules')) {
        dirs = fs.readdirSync(__dirname + '/../node_modules');
        for (i = 0; i < dirs.length; i++) {
            try {
                path = __dirname + '/../node_modules/' + dirs[i] + '/';
                if (regExp.test(dirs[i]) && fs.existsSync(path + 'io-package.json')) {
                    ioPackage = JSON.parse(fs.readFileSync(path + 'io-package.json'));
                    package_   = fs.existsSync(path + 'package.json') ? JSON.parse(fs.readFileSync(path + 'package.json')) : {};
                    //noinspection JSUnresolvedVariable
                    result[ioPackage.common.name] = {
                        controller: false,
                        version:    ioPackage.common.version,
                        icon:       ioPackage.common.extIcon || (ioPackage.common.icon ? '/adapter/' + dirs[i] + '/' + ioPackage.common.icon : ''),
                        title:      ioPackage.common.title,
                        desc:       ioPackage.common.desc,
                        platform:   ioPackage.common.platform,
                        keywords:   ioPackage.common.keywords,
                        readme:     ioPackage.common.readme,
                        type:       ioPackage.common.type,
                        license:    ioPackage.common.license ? ioPackage.common.license : ((package_.licenses && package_.licenses.length) ? package_.licenses[0].type : ''),
                        licenseUrl: (package_.licenses && package_.licenses.length) ? package_.licenses[0].url : ''
                    };
                }
            } catch (e) {
                console.log('Cannot read or parse ' + __dirname + '/../node_modules/' + dirs[i] + '/io-package.json: ' + e.toString());
            }
        }
    }
    if (fs.existsSync(__dirname + '/../../../node_modules/' + module.exports.appName.toLowerCase() + '.js-controller') ||
        fs.existsSync(__dirname + '/../../../node_modules/' + module.exports.appName + '.js-controller')) {
        dirs = fs.readdirSync(__dirname + '/../..');
        for (i = 0; i < dirs.length; i++) {
            try {
                path = __dirname + '/../../' + dirs[i] + '/';
                if (regExp.test(dirs[i]) && dirs[i].substring(module.exports.appName.length + 1) !== 'js-controller' &&
                    fs.existsSync(path + 'io-package.json')) {
                    ioPackage = JSON.parse(fs.readFileSync(path + 'io-package.json'));
                    package_   = fs.existsSync(path + 'package.json') ? JSON.parse(fs.readFileSync(path + 'package.json')) : {};
                    //noinspection JSUnresolvedVariable
                    result[ioPackage.common.name] = {
                        controller: false,
                        version:    ioPackage.common.version,
                        icon:       ioPackage.common.extIcon || (ioPackage.common.icon ? '/adapter/' + dirs[i] + '/' + ioPackage.common.icon : ''),
                        title:      ioPackage.common.title,
                        desc:       ioPackage.common.desc,
                        platform:   ioPackage.common.platform,
                        keywords:   ioPackage.common.keywords,
                        readme:     ioPackage.common.readme,
                        type:       ioPackage.common.type,
                        license:    ioPackage.common.license ? ioPackage.common.license : ((package_.licenses && package_.licenses.length) ? package_.licenses[0].type : ''),
                        licenseUrl: (package_.licenses && package_.licenses.length) ? package_.licenses[0].url : ''
                    };
                }
            } catch (e) {
                console.log('Cannot read or parse ' + __dirname + '/../node_modules/' + dirs[i] + '/io-package.json: ' + e.toString());
            }
        }
    }
    return result;
}

/**
 * Reads an adapter's npm version
 * @param {string | null} adapter The adapter to read the npm version from. Null for the root ioBroker packet
 * @param {(err: Error | null, version: string) => void} [callback]
 */
function getNpmVersion(adapter, callback) {
    adapter = adapter ? module.exports.appName + '.' + adapter : module.exports.appName;
    adapter = adapter.toLowerCase();

    const cliCommand = `npm view ${adapter}@latest version`;

    const exec = require('child_process').exec;
    exec(cliCommand, {timeout: 2000}, (error, stdout, stderr) => {
        let version;
        if (error) {
            // command failed
            if (typeof callback === 'function') {
                callback(error);
                return;
            }
        } else if (stdout) {
            version = semver.valid(stdout.trim());
        }
        if (typeof callback === 'function') callback(null, version);
    });
}

function getIoPack(sources, name, callback) {
    getJson(sources[name].meta, function (ioPack) {
        const packUrl = sources[name].meta.replace('io-package.json', 'package.json');
        if (!ioPack) {
            if (sources._helper) sources._helper.failCounter.push(name);
            if (callback) callback(sources, name);
        } else {
            setImmediate(function () {
                getJson(packUrl, function (pack) {
                    const version = sources[name].version;
                    const type    = sources[name].type;
                    // If installed from git or something else
                    // js-controller is exception, because can be installed from npm and from git
                    if (sources[name].url && name !== 'js-controller') {
                        if (ioPack && ioPack.common) {
                            sources[name] = extend(true, sources[name], ioPack.common);

                            // overwrite type of adapter from repository
                            if (type) {
                                sources[name].type = type;
                            }
                            if (pack && pack.licenses && pack.licenses.length) {
                                if (!sources[name].license)    sources[name].license    = pack.licenses[0].type;
                                if (!sources[name].licenseUrl) sources[name].licenseUrl = pack.licenses[0].url;
                            }
                        }

                        if (callback) callback(sources, name);
                    } else {
                        if (ioPack && ioPack.common) {
                            sources[name] = extend(true, sources[name], ioPack.common);
                            if (pack && pack.licenses && pack.licenses.length) {
                                if (!sources[name].license)    sources[name].license    = pack.licenses[0].type;
                                if (!sources[name].licenseUrl) sources[name].licenseUrl = pack.licenses[0].url;
                            }
                        }

                        // overwrite type of adapter from repository
                        if (type) {
                            sources[name].type = type;
                        }

                        if (version) {
                            sources[name].version = version;
                            if (callback) callback(sources, name);
                        } else {
                            if (sources[name].meta.substring(0, 'http://'.length)  === 'http://' ||
                            sources[name].meta.substring(0, 'https://'.length) === 'https://') {
                            //installed from npm
                                getNpmVersion(name, function (err, version) {
                                    if (err) console.error(err);

                                    if (version) {
                                        sources[name].version = version;
                                    } else {
                                        sources[name].version = 'npm error';
                                    }
                                    if (callback) callback(sources, name);
                                });
                            } else {
                                if (callback) callback(sources, name);
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
            if (!sources.hasOwnProperty(_name)) continue;
            count++;
        }
        sources._helper = {failCounter: []};

        sources._helper.timeout = setTimeout(function () {
            if (sources._helper) {
                delete sources._helper;
                for (const __name in sources) {
                    if (!sources.hasOwnProperty(__name)) continue;
                    if (sources[__name].processed !== undefined) delete sources[__name].processed;
                }
                if (callback) callback('Timeout by read all package.json (' + count + ') seconds', sources);
                callback = null;
            }
        }, count * 2000);
    }

    for (const name in sources) {
        if (!sources.hasOwnProperty(name)) continue;
        if (sources[name].processed || name === '_helper') continue;

        sources[name].processed = true;
        if (sources[name].url)  sources[name].url  = findPath(path, sources[name].url);
        if (sources[name].meta) sources[name].meta = findPath(path, sources[name].meta);
        if (sources[name].icon) sources[name].icon = findPath(path, sources[name].icon);

        if (!sources[name].name && sources[name].meta) {
            console.log('Read ' + name + '...');
            getIoPack(sources, name, function (ignore/*, name*/) {
                if (sources._helper) {
                    if (sources._helper.failCounter.length > 10) {
                        clearTimeout(sources._helper.timeout);
                        delete sources._helper;
                        for (const _name in sources) {
                            if (!sources.hasOwnProperty(_name)) continue;
                            if (sources[_name].processed !== undefined) delete sources[_name].processed;
                        }
                        if (callback) callback('Looks like there is no internet.', sources);
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
            err = 'Following packages cannot be read: ' + sources._helper.failCounter.join(', ');
        }
        clearTimeout(sources._helper.timeout);
        delete sources._helper;
        for (const __name in sources) {
            if (!sources.hasOwnProperty(__name)) continue;
            if (sources[__name].processed !== undefined) delete sources[__name].processed;
        }
        if (callback) callback(err, sources);
        callback = null;
    }
}

// Get list of all adapters and controller in some repository file or in /conf/source-dist.json
function getRepositoryFile(urlOrPath, additionalInfo, callback) {
    let sources = {};
    let path =    '';

    if (typeof additionalInfo === 'function') {
        callback = additionalInfo;
        additionalInfo = {};
    }
    if (!additionalInfo) additionalInfo = {};

    if (!extend) extend = require('node.extend');

    if (urlOrPath) {
        const parts = urlOrPath.split('/');
        path  = parts.splice(0, parts.length - 1).join('/') + '/';
    }

    // If object was read
    if (urlOrPath && typeof urlOrPath === 'object') {
        if (callback) callback(null, urlOrPath);
    } else
    if (!urlOrPath) {
        try {
            sources = JSON.parse(fs.readFileSync(getDefaultDataDir() + 'sources.json'));
        } catch (e) {
            sources = {};
        }
        try {
            const sourcesDist = JSON.parse(fs.readFileSync(__dirname + '/../conf/sources-dist.json'));
            sources = extend(true, sourcesDist, sources);
        } catch (e) {

        }

        for (const s in sources) {
            if (sources.hasOwnProperty(s) && additionalInfo[s] && additionalInfo[s].published) {
                sources[s].published = additionalInfo[s].published;
            }
        }

        _getRepositoryFile(sources, path, err => {
            if (err) console.error('[' + new Date() + '] ' + err);
            if (callback) callback(err, sources);
        });
    } else {
        getJson(urlOrPath, sources => {
            if (sources) {
                for (const s in sources) {
                    if (sources.hasOwnProperty(s) && additionalInfo[s] && additionalInfo[s].published) {
                        sources[s].published = additionalInfo[s].published;
                    }
                }
                setImmediate(() => {
                    _getRepositoryFile(sources, path, function (err) {
                        if (err) console.error('[' + new Date() + '] ' + err);
                        if (callback) callback(err, sources);
                    });
                });
            } else {
                if (callback) callback('Cannot read "' + urlOrPath + '"', {});
            }
        });
    }
}

function sendDiagInfo(obj, callback) {
    if (!request) request = require('request');
    request.post({
        url:    'http://download.' + module.exports.appName + '.net/diag.php',
        method: 'POST',
        headers: {'content-type': 'application/x-www-form-urlencoded'},
        body:    'data=' + JSON.stringify(obj),
        timeout: 2000
    }, function (err, response, body) {
        /*if (err || !body || response.statusCode !== 200) {

        }*/
        if (typeof callback === 'function') callback();
    }).on('error', function (error) {
        console.log('Cannot send diag info: ' + error.message);
        if (typeof callback === 'function') callback(error);
    });
}

function getAdapterDir(adapter, isNpm) {
    const parts   = __dirname.replace(/\\/g, '/').split('/');
    parts.splice(parts.length - 3, 3);
    let dir = parts.join('/');
    if (adapter.substring(0, module.exports.appName.length + 1) === module.exports.appName + '.') adapter = adapter.substring(module.exports.appName.length + 1);

    if (fs.existsSync(dir + '/node_modules/' + module.exports.appName + '.js-controller') &&
        fs.existsSync(dir + '/node_modules/' + module.exports.appName + '.' + adapter)) {
        dir = __dirname.replace(/\\/g, '/').split('/');
        dir.splice(dir.length - 2, 2);
        return dir.join('/') + '/' + module.exports.appName + '.' + adapter;
    } else if (fs.existsSync(__dirname + '/../node_modules/' + module.exports.appName + '.' + adapter)) {
        dir = __dirname.replace(/\\/g, '/').split('/');
        dir.splice(dir.length - 1, 1);
        return dir.join('/') + '/node_modules/' + module.exports.appName + '.' + adapter;
    } else {
        if (isNpm) {
            if (fs.existsSync(__dirname + '/../../node_modules/' + module.exports.appName + '.js-controller')) {
                dir = __dirname.replace(/\\/g, '/').split('/');
                dir.splice(dir.length - 2, 2);
                return dir.join('/') + '/' + module.exports.appName + '.' + adapter;
            } else {
                dir = __dirname.replace(/\\/g, '/').split('/');
                dir.splice(dir.length - 1, 1);
                return dir.join('/') + '/node_modules/' + module.exports.appName + '.' + adapter;
            }
        } else {
            dir = __dirname.replace(/\\/g, '/').split('/');
            dir.splice(dir.length - 1, 1);
            return dir.join('/') + '/adapter/' + adapter;
        }
    }
}

function getHostName() {
    try {
        const configName = getConfigFileName();
        const config = JSON.parse(fs.readFileSync(configName));
        return config.system ? config.system.hostname || require('os').hostname() : require('os').hostname();
    } catch (err) {
        return require('os').hostname();
    }
}

/**
 * Read version of system npm
 *
 * @alias getSystemNpmVersion
 * @memberof Tools
 * @param {function} callback return result
 *        <pre><code>
 *            function (err, version) {
 *              adapter.log.debug('NPM version is: ' + version);
 *            }
 *        </code></pre>
 */
function getSystemNpmVersion(callback) {
    const exec = require('child_process').exec;

    // remove local node_modules\.bin dir from path
    // or we potentially get a wrong npm version
    const newEnv = Object.assign({}, process.env);
    newEnv.PATH = (newEnv.PATH || newEnv.Path || newEnv.path)
        .split(path.delimiter)
        .filter(dir => {
            dir = dir.toLowerCase();
            if (dir.indexOf('iobroker') > -1 && dir.indexOf(path.join('node_modules', '.bin')) > -1) return false;
            return true;
        })
        .join(path.delimiter)
    ;

    exec('npm -v', { encoding: 'utf8', env: newEnv }, function (error, stdout) {//, stderr) {
        if (stdout) stdout = semver.valid(stdout.trim());
        if (callback) callback(error, stdout);
    });
}

/**
 * Collects information about host and available adapters
 *
 *  Following info will be collected:
 *    - available adapters
 *    - node.js --version
 *    - npm --version
 *
 * @alias getHostInfo
 * @memberof Tools
 * @param {object} objects
 * @param {function} callback return result
 *        <pre><code>
 *            function (err, result) {
 *              adapter.log.debug('Info about host: ' + JSON.stringify(result, null, 2);
 *            }
 *        </code></pre>
 */
function getHostInfo(objects, callback) {
    const os = require('os');
    const cpus = os.cpus();
    const data = {
        'Platform':     os.platform(),
        'Architecture': os.arch(),
        'CPUs':         cpus.length,
        'Speed':        cpus[0].speed,
        'Model':        cpus[0].model,
        'RAM':          os.totalmem(),
        'System uptime': Math.round(os.uptime()),
        'Node.js':      process.version
    };
    let task = 0;
    task++;
    objects.getObject('system.config', function (err, systemConfig) {
        objects.getObject('system.repositories', function (err, repos) {
            // Check if repositories exists
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
        getSystemNpmVersion(function (err, version) {
            data['NPM'] = 'v' + version;
            npmVersion = version;
            if (!--task) {
                callback(err, data);
            }

        });
    } else {
        data['NPM'] = npmVersion;
        if (!task) {
            callback(null, data);
        }
    }
}

// All pathes are returned always relative to /node_modules/' + module.exports.appName + '.js-controller
// the result has always "/" as last symbol
function getDefaultDataDir() {
    //var dataDir = __dirname.replace(/\\/g, '/');
    //dataDir = dataDir.split('/');

    // If installed with npm
    if (fs.existsSync(__dirname + '/../../../node_modules/' + module.exports.appName + '.js-controller')) {
        return '../../' + module.exports.appName + '-data/';
    } else {
        //dataDir.splice(dataDir.length - 1, 1);
        //dataDir = dataDir.join('/');
        return './data/';
    }
}

function getConfigFileName() {
    let configDir = __dirname.replace(/\\/g, '/');
    configDir = configDir.split('/');

    // If installed with npm
    if (fs.existsSync(__dirname + '/../../../node_modules/' + module.exports.appName.toLowerCase() + '.js-controller') ||
        fs.existsSync(__dirname + '/../../../node_modules/' + module.exports.appName + '.js-controller')) {
        // remove /node_modules/' + module.exports.appName + '.js-controller/lib
        configDir.splice(configDir.length - 3, 3);
        configDir = configDir.join('/');
        return configDir + '/' + module.exports.appName + '-data/' + module.exports.appName + '.json';
    } else {
        // Remove /lib
        configDir.splice(configDir.length - 1, 1);
        configDir = configDir.join('/');
        if (fs.existsSync(__dirname + '/../conf/' + module.exports.appName + '.json')) {
            return configDir + '/conf/' + module.exports.appName + '.json';
        } else {
            return configDir + '/data/' + module.exports.appName + '.json';
        }
    }
}

module.exports.findIPs =            findIPs;
module.exports.rmdirRecursiveSync = rmdirRecursiveSync;
module.exports.getRepositoryFile =  getRepositoryFile;
module.exports.getIoPack =          getIoPack;
module.exports.getFile =            getFile;
module.exports.getJson =            getJson;
module.exports.getInstalledInfo =   getInstalledInfo;
module.exports.sendDiagInfo =       sendDiagInfo;
module.exports.getAdapterDir =      getAdapterDir;
module.exports.getDefaultDataDir =  getDefaultDataDir;
module.exports.getConfigFileName =  getConfigFileName;
module.exports.getHostName =        getHostName;
module.exports.appName =            getAppName();
module.exports.createUuid =         createUuid;
module.exports.getHostInfo =        getHostInfo;
module.exports.upToDate =           upToDate;
module.exports.encryptPhrase =      encryptPhrase;
module.exports.decryptPhrase =      decryptPhrase;