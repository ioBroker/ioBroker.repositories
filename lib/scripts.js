'use strict';
const fs      = require('fs');
const path    = require('path');
const axios   = require('axios');
const tools   = require('./tools');
const builds  = require('./build');
const semver  = require('semver');
const URL     = require('url').URL;

const latestJsonPath = path.join(__dirname, '../sources-dist.json');
const stableJsonPath = path.join(__dirname, '../sources-dist-stable.json');

function requestPromise(url) {
    return axios(url)
        .then(data => data.data);
}

function sortRepo(sources) {
    // rebuild order
    const names = Object.keys(sources);
    const __sources = {};
    names.sort();
    names.forEach(name => {
        const obj = sources[name];
        __sources[name] = {
            meta: obj.meta,
            icon: obj.icon,
            url: obj.url,
            type: obj.type,
            version: obj.version,
            published: obj.published,
            versionDate: obj.versionDate
        };
        Object.keys(__sources[name]).forEach(attr => !__sources[name][attr] && delete __sources[name][attr]);
    });
    return __sources;
}

/**
 * @param {string} adapterName
 */
function getNpmApiUrl(adapterName) {
    return `https://registry.npmjs.org/${tools.appName.toLowerCase()}.${adapterName}`;
}

function updateVersions2(latest, stable) {
    Object.keys(stable).forEach(name => {
        if (stable[name].type !== latest[name].type) {
            console.log(`Update type of "${name}"`);
            stable[name].type = latest[name].type;
        }
    });

    // rebuild order
    stable = sortRepo(stable);
    latest = sortRepo(latest);
    return {stable, latest};
}

// function updateVersions(latest, stable, callback, _index) {
//     if (_index === undefined) {
//         for (const name in stable) {
//             if (!stable.hasOwnProperty(name)) continue;

//             if (stable[name].type !== latest[name].type) {
//                 console.log('Update type of "' + name + '"');
//                 stable[name].type = latest[name].type;
//             }
//         }
//         // rebuild order
//         stable = sortRepo(stable);
//         latest = sortRepo(latest);
//         _index = 0;
//     }

//     const names = Object.keys(latest);

//     // dates are no more required in repos.
//     if (true || _index >= names.length) {
//         callback(latest, stable);
//     } else {
//         const name = names[_index];
//         console.log(`[${_index}/${names.length}] process ${name}`);
//         const url = getNpmApiUrl(name);

//         request(url, (error, state, body) => {
//             if (error) {
//                 console.error('Cannot get version of  ' + tools.appName + '.' + name + ': ' + error);
//             } else {
//                 body = JSON.parse(body);
//                 const times = body.time;

//                 if (latest[name].published !== times.created) {
//                     console.log(`Updated latest published for ${name} from ${latest[name].published} to ${times.created}`);
//                     latest[name].published = times.created;
//                 }
//                 if (latest[name].versionDate !== times.modified) {
//                     console.log(`Updated latest versionDate for ${name} from ${latest[name].versionDate} to ${times.modified}`);
//                     latest[name].versionDate = times.modified;
//                 }
//                 latest[name].versionDate = times.modified;
//                 if (stable[name]) {
//                     if (!stable[name].published) {
//                         console.log(`Updated stable published for ${name} to ${times.created}`);
//                         stable[name].published = times.created;
//                     }
//                     if (stable[name].versionDate !== times[stable[name].version]) {
//                         console.log(`Updated stable versionDate for ${name} from ${stable[name].versionDate} to ${times[stable[name].version]}`);
//                         stable[name].versionDate = times[stable[name].version];
//                     }
//                 }
//             }

//             setTimeout(updateVersions, 100, latest, stable, callback, _index + 1);
//         });
//     }
// }

/**
 * @param {string} adapterName
 */
function getNpmVersion(adapterName) {
    return callback => {
        const url = getNpmApiUrl(adapterName);
        // console.log('getNpmVersion: ' + url);
        axios(url)
            .then(data => {
                try {
                    const info = data.data;
                    const last = info['dist-tags'].latest;
                    callback({ adapter: adapterName, version: last, npm: true, info: info, date: new Date(info.time[last]) });
                } catch (e) {
                    callback({ adapter: adapterName });
                }
            });
    };
}

/**
 * @param {string} adapterName
 */
function getNpmVersionAsync(adapterName) {
    return new Promise((resolve, reject) =>
        getNpmVersion(adapterName)(result => {
            if (result && typeof result.version === 'string') {
                resolve(result.version);
            } else {
                reject(new Error(`Could not find latest version for ${adapterName}!`));
            }
        }));
}

function getGitVersion(latest, adapter) {
    return function (callback) {
        // console.log('getGitVersion: ' + latest[adapter].meta);
        axios(latest[adapter].meta)
            .then(data => {
                try {
                    const info = data.data;
                    callback({ adapter: adapter, license: info.common.license, version: info.common.version, desc: info.common.desc, git: true, info: info });
                } catch (e) {
                    console.error(`Cannot parse GIT for "${adapter}": ${e}`);
                    callback({ adapter: adapter });
                }
            });
    };
}

function getLatestCommit(latest, adapter) {
    return function (callback) {
        // https://raw.githubusercontent.com/husky-koglhof/ioBroker.hmm/master/io-package.json
        const meta = latest[adapter].meta;
        const owner = meta.match(/\.com\/([-.\d\w_]+)\/ioBroker/i);
        if (!owner) {
            console.error('Cannot find owner in ' + meta);
            return callback({adapter});
        }
        console.log(`getLatestCommit: https://api.github.com/repos/${owner[1]}/ioBroker.${adapter}/commits`);
        axios({
            url: `https://api.github.com/repos/${owner[1]}/ioBroker.${adapter}/commits`,
            headers: {
                'User-Agent': 'request'
            }
        })
            .then(data => {
                const info = data.data;
                if (info && info[0] && info[0].commit) {
                    callback({adapter, commit: true, date: new Date(info[0].commit.author.date) });
                } else {
                    callback({adapter});
                }
            })
            .catch(e => {
                console.error(`Cannot get latest commit "${adapter}": ${e}`);
                callback({adapter});
            });
    };
}

function formatMaintainer(entry, authors) {
    if (!entry) return '';
    if (typeof entry === 'object') {
        let name = (entry.name || '').trim();
        if (authors[name.toLowerCase()]) {
            name += '(' + authors[name.toLowerCase()] + ')';
        }
        return '<a href="mailto:' + entry.email + '">' + name + '</a>';
    }
    const email = entry.match(/<([-.@\w\d]+)>/);
    if (email) {
        let name = entry.replace(email[0], '').trim();
        if (authors[name.toLowerCase()]) {
            name += '(' + authors[name.toLowerCase()] + ')';
        }
        return '<a href="mailto:' + email[1] + '">' + name + '</a>';
    } else {
        let name = entry;
        if (authors[name.toLowerCase()]) {
            name += '(' + authors[name.toLowerCase()] + ')';
        }
        return name;
    }
}

function formatMaintainers(list, authors) {
    if (typeof list === 'object') {
        const result = [];
        list.forEach(entry => result.push(formatMaintainer(entry, authors)));
        return result.join('<br>');
    } else {
        return formatMaintainer(list, authors);
    }
}

function getDiscovery() {
    return requestPromise('https://github.com/ioBroker/ioBroker.discovery/tree/master/lib/adapters')
        .then(body => {
            let adapters = body.match(/<a\shref="\/ioBroker\/ioBroker.discovery\/blob\/master\/lib\/adapters\/([-_\w\d]+)\.js/g);
            if (adapters) {
                adapters = adapters.map(a => a.match(/([-_\w\d]+)\.js/)[1]);
            }
            return adapters;
        });
}

// broken down to for easier understanding
function serial(list, result, callback) {
    if (typeof result === 'function') {
        callback = result;
        result = [];
    }
    if (!list || !list.length) {
        callback && callback(result);
        return;
    }
    const task = list.shift();
    result = result || [];
    console.log('Rest: ' + list.length);
    task(r => {
        result.push(r);
        setImmediate(serial, list, result, callback);
    });
}

function createList() {
    let stable;
    let latest;
    let stats;

    return requestPromise('https://raw.githubusercontent.com/ioBroker/ioBroker.repositories/master/sources-dist-stable.json')
        .then(body => JSON.parse(body))
        .then(_stable => {
            stable = _stable;
            return requestPromise('https://raw.githubusercontent.com/ioBroker/ioBroker.repositories/master/sources-dist.json');
        })
        .then(body => JSON.parse(body))
        .then(_latest => {
            latest = _latest;
            return builds.getStats();
        })
        .then(_stats => {
            stats = _stats;
            return getDiscovery();
        })
        .then(discovery => {
            const tasks = [];
            Object.keys(latest).forEach(adapter => {
                // if (t++ > 3) return;
                tasks.push(getNpmVersion(adapter));
                tasks.push(getGitVersion(latest, adapter));
                tasks.push(getLatestCommit(latest, adapter));
            });

            return new Promise(resolve =>
                serial(tasks, results => {
                    const aList = {};

                    const types = {};
                    let now = new Date();
                    const authors = {};
                    for (const adapter in latest) {
                        const git = results.find(result => result.git && result.adapter === adapter);
                        if (git) {
                            const list = git.info.common.authors;
                            if (typeof list === 'object') {
                                list.forEach(entry => {
                                    let user;
                                    if (typeof entry === 'object') {
                                        user = entry.name;
                                    } else {
                                        const email = entry.match(/<([-.@\w\d]+)>/);
                                        if (email) {
                                            user = entry.replace(email[0], '').trim();
                                        } else {
                                            user = entry.trim();
                                        }
                                    }
                                    if (!user) return;
                                    user = user.toLowerCase();
                                    authors[user] = authors[user] || 0;
                                    authors[user]++;
                                });
                            } else if (list) {
                                let user;
                                const email = list.match(/<([-.@\w\d]+)>/);
                                if (email) {
                                    user = list.replace(email[0], '').trim();
                                } else {
                                    user = list.trim();
                                }
                                if (!user) return;
                                user = user.toLowerCase();
                                authors[user] = authors[user] || 0;
                                authors[user]++;
                            }
                        }
                    }

                    Object.keys(latest).forEach(adapter => {
                        const aItem = {};
                        try {
                            types[latest[adapter].type] = types[latest[adapter].type] || 0;
                            types[latest[adapter].type]++;

                            // image
                            if (latest[adapter].icon) {
                                aItem.icon = latest[adapter].icon;
                            }
                            // Name
                            aItem.link = latest[adapter].meta.replace('raw.githubusercontent', 'github').replace('/master/io-package.json', '').replace('/main/io-package.json', '');

                            const git = results.find(result => result.git && result.adapter === adapter);
                            const npm = results.find(result => result.npm && result.adapter === adapter);
                            const commit = results.find(result => result.commit && result.adapter === adapter);

                            // Description
                            aItem.desc = (git && git.desc ? (git.desc.en || git.desc) : '');

                            // License
                            aItem.license = (git && git.license) || (npm && (npm.info.license || (npm.info.licenses && npm.info.licenses[0].type)));

                            // Type
                            aItem.type = latest[adapter].type;
                            aItem.typeTitle = (git && latest[adapter].type !== git.info.common.type ? 'git: ' + git.info.common.type + ', repo: ' + latest[adapter].type : '');
                            aItem.typeError = (git && latest[adapter].type !== git.info.common.type);

                            // Discovery
                            if (discovery && discovery.includes(adapter)) {
                                aItem.discovery = true;
                            }

                            // Material
                            aItem.materialize = (git && git.info && git.info.common) ? git.info.common.materialize || git.info.common.noConfig || git.info.common.onlyWWW : false;

                            if (stats && stats[adapter]) {
                                aItem.installs = stats[adapter];
                            }

                            // Maintainer
                            aItem.maintainers = (git ? formatMaintainers(git.info.common.authors, authors) : '');

                            // Created on
                            if (npm && npm.info.time.created) {
                                const date = new Date(npm.info.time.created);
                                aItem.created = date.toISOString();
                            }

                            // Version
                            aItem.versions = {
                                github: (git ? git.version : ''),
                                githubDate: commit && commit.date,
                                latest: (npm ? npm.version : ''),
                                latestDate: npm && npm.date,
                                stable: (stable[adapter] ? stable[adapter].version : ''),
                                stableDate: npm && stable[adapter] && npm.info.time[stable[adapter].version]
                            };

                            aList[adapter] = aItem;
                        } catch (e) {
                            console.error(e);
                        }
                    });

                    const keys = Object.keys(types);
                    keys.sort();

                    now = ('0' + (now.getDate())).slice(-2) + '.' +
                        ('0' + (now.getMonth() + 1)).slice(-2) + ' ' +
                        ('0' + now.getHours()).slice(-2) + ':' +
                        ('0' + now.getMinutes()).slice(-2);

                    let script = `var adapters = ${JSON.stringify(aList, null, 2)};\n`;
                    script += `\tvar types = ${JSON.stringify(types, null, 2)};\n`;

                    const text = fs.readFileSync(__dirname + '/../list/template.html').toString().replace('<!-- INSERT HERE -->', '(' + now + ') ').replace('//-- INSERT HERE --', script);

                    resolve(text);
                }));
        });
}

/**
 * Finds the git repo for the given adapter name
 * @param {string} adapterName
 * @returns {Promise<string>}
 */
function findGitRepo(adapterName) {
    const url = getNpmApiUrl(adapterName);
    // console.log('findGitRepo: ' + url);
    return axios(url)
        .then(data => {
            const info = data.data;
            if (!info || info.error || !info.repository || typeof info.repository.url !== 'string') {
                throw new Error(`Could not find git repo for ${adapterName}!`);
            }
            /** @type {string} */
            return info.repository.url
                .replace(/^git\+/, '')
                .replace(/\.git$/, '')
                .replace(/\/+$/, '')
            ;
        });
}

/**
 * Turns a repository URL into the corresponding meta URL, e.g.
 * https://github.com/AlCalzone/ioBroker.zwave2 --> https://raw.githubusercontent.com/AlCalzone/ioBroker.zwave2/master/io-package.json
 * @param {string} repoUrl
 * @returns {string}
 */
function getMetaUrl(repoUrl, branch) {
    const url = new URL(repoUrl);
    url.host = 'raw.githubusercontent.com';
    url.pathname += `/${branch || 'master'}/io-package.json`;
    return url.toString();
}

/**
 * Retrieves the external icon URL for a given meta URL
 * @param {string} metaUrl
 * @returns {Promise<string>}
 */
function getIconUrl(metaUrl) {
    // console.log('getIconUrl: ' + metaUrl);
    return axios(metaUrl)
        .then(data => {
            const info = data.data;
            if (!info || info.error || !info.common || typeof info.common.extIcon !== 'string') {
                throw new Error(`Could not parse adapter meta at ${metaUrl}`);
            }
            /** @type {string} */
            return info.common.extIcon;
        });
}

/**
 * Checks if a given version exists on npm for a given adapter
 * @param {string} adapterName The adapter name to check the version for
 * @param {string} version The version we want to check for existence
 */
function npmVersionExists(adapterName, version) {
    const url = getNpmApiUrl(adapterName);
    // console.log('npmVersionExists: ' + url);
    return axios(url)
        .then(data => {
            const info = data.data;
            if (!info || info.error || !info.versions) {
                throw new Error(`Could not check npm versions for ${adapterName}!`);
            }
            return version in info.versions;
        });
}

function repoToJsonSorted(repo) {
    return JSON.stringify(sortRepo(repo), null, 2);
}

/**
 * Reads a repo file and returns a parsed JSON object
 * @param {string} repoPath The path to the repo file
 * @returns {Promise<Record<string, any>>}
 */
function readRepo(repoPath) {
    return new Promise((resolve, reject) => {
        fs.readFile(repoPath, (err, data) => {
            if (err) reject(err);
            else resolve(JSON.parse(data.toString()));
        });
    });
}

function readLatestRepo() {
    return readRepo(latestJsonPath);
}

function readStableRepo() {
    return readRepo(stableJsonPath);
}

/**
 * Writes a repo object into a repo file, while automatically sorting the repo
 * @param {string} repoPath The path to the repo file
 * @param {Record<string, any>} repoContent The content to write into the repo file
 * @returns {Promise<void>}
 */
function writeRepo(repoPath, repoContent) {
    return new Promise((resolve, reject) => {
        fs.writeFile(repoPath, repoToJsonSorted(repoContent), (err) => {
            if (err) reject(err);
            else resolve();
        });
    });
}

function writeLatestRepo(latestContent) {
    return writeRepo(latestJsonPath, latestContent);
}

function writeStableRepo(stableContent) {
    return writeRepo(stableJsonPath, stableContent);
}

async function init() {
    let latest = await readLatestRepo();
    let stable = await readStableRepo();

    ({latest, stable} = updateVersions2(latest, stable));

    await writeLatestRepo(latest);
    await writeStableRepo(stable);
}

async function sort() {
    const latest = await readLatestRepo();
    await writeLatestRepo(latest);

    const stable = await readStableRepo();
    await writeStableRepo(stable);
}

function findMainBranch(owner, adapterName) {
    // https://api.github.com/repos/<owner>/<repo-name>
    return axios(`https://api.github.com/repos/${owner}/${tools.appName}.${adapterName}`)
        .then(data => data.data.default_branch);
}

/**
 * Adds the given adapter to latest repo
 * @param {string} adapterName
 * @param {string} type The type of the adapter
 */
async function addToLatest(adapterName, type) {
    const gitRepo = await findGitRepo(adapterName);
    const mainBranch = await findMainBranch(gitRepo.match(/\/([-._a-zA-Z0-9]+)\/ioBroker/)[1], adapterName);
    const metaUrl = getMetaUrl(gitRepo, mainBranch);
    const iconUrl = await getIconUrl(metaUrl);

    const latest = await readLatestRepo();
    if (adapterName in latest) throw new Error(`${adapterName} is already in latest!`);
    latest[adapterName] = {
        meta: metaUrl,
        icon: iconUrl,
        type
    };
    await writeLatestRepo(latest);
}

/**
 * Adds the given adapter to the stable repo
 * @param {string} adapterName
 * @param {string} version The version that should be added to the stable repo
 */
async function addToStable(adapterName, version) {

    if (!semver.valid(version)) throw new Error(`${version} is not a valid version!`);
    if (!(await npmVersionExists(adapterName, version))) {
        throw new Error(`Cannot add ${adapterName}@${version} to stable because it is not yet on npm!`);
    }

    const stable = await readStableRepo();
    if (adapterName in stable) throw new Error(`${adapterName} is already in stable!`);
    const latest = await readLatestRepo();
    if (!(adapterName in latest)) throw new Error(`Cannot add ${adapterName} to stable because it is not yet in the latest repo!`);

    stable[adapterName] = {
        ...latest[adapterName],
        version
    };

    await writeStableRepo(stable);
}

/**
 * Updates or adds the given adapter to the stable repo
 * @param {string} adapterName
 * @param {string} version The version that should be set to the stable repo
 */
async function updateStable(adapterName, version) {

    if (!semver.valid(version)) throw new Error(`${version} is not a valid version!`);
    if (!(await npmVersionExists(adapterName, version))) {
        throw new Error(`Cannot update ${adapterName} to ${version} in stable because it is not yet on npm!`);
    }

    const stable = await readStableRepo();
    if (!(adapterName in stable)) return addToStable(adapterName, version);
    const latest = await readLatestRepo();
    if (!(adapterName in latest)) throw new Error(`Cannot update ${adapterName} in stable because it is not yet in the latest repo!`);

    stable[adapterName] = {
        ...latest[adapterName],
        version
    };

    await writeStableRepo(stable);
}

async function removeDates() {
    const stable = await readStableRepo();
    Object.keys(stable).forEach(name => {
        delete stable[name].published;
        delete stable[name].versionDate;
    });
    await writeStableRepo(stable);

    const latest = await readStableRepo();
    Object.keys(latest).forEach(name => {
        delete latest[name].published;
        delete latest[name].versionDate;
    });
    await writeLatestRepo(latest);
}

function fail(reason) {
    console.error();
    console.error('ERROR: ' + reason);
    console.error();
    process.exit(1);
}

if (module.exports && module.parent) {
    module.exports = {
        init,
        sort,
        list: createList,
        nodates: removeDates,
        addToLatest,
        addToStable,
        updateStable
    };
} else {
    // Wrapping the following code in an IIAFE allows us to use async
    (async () => {
        const argv = require('minimist')(process.argv.slice(2));
        // update versions for all adapter, which do not have the version
        if (argv._.includes('init')) {
            init().then(() => process.exit());
        } else if (argv._.includes('nodates')) {
            await removeDates();
        } else if (argv._.includes('sort')) {
            await sort();
        } else if (argv._.indexOf('list') !== -1) {
            const file = argv._[argv._.indexOf('list') + 1] || (__dirname + '/../list.html');
            const text = await createList(file);
            fs.writeFileSync(file, text);
            process.exit();
        } else if (argv._.includes('addToStable')) {
            const name = argv.name;
            let version = argv.version;
            if (typeof name !== 'string') fail('Please specify the adapter name!');
            if (typeof version !== 'string') {
                // Try to look up the latest version
                console.log('No version specified, adding latest version to stable...');
                try {
                    version = await getNpmVersionAsync(name);
                } catch (e) {
                    fail(e.message);
                }
            }
            addToStable(name, version).catch(e => fail(e.message));
        } else if (argv._.includes('updateStable')) {
            const name = argv.name;
            let version = argv.version;
            if (typeof name !== 'string') fail('Please specify the adapter name!');
            if (typeof version !== 'string') {
                // Try to look up the latest version
                console.log('No version specified, setting latest version to stable...');
                try {
                    version = await getNpmVersionAsync(name);
                } catch (e) {
                    fail(e.message);
                }
            }
            updateStable(name, version).catch(e => fail(e.message));
        } else if (argv._.includes('addToLatest')) {
            const {name, type} = argv;
            if (typeof name !== 'string') {
                fail('Please specify the adapter name!');
            }
            if (typeof type !== 'string') {
                fail('Please specify the adapter type!');
            }
            addToLatest(name, type)
                .catch(e => fail(e.message));
        }
    })();
}
