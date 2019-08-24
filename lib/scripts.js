'use strict';
const https   = require('https');
const fs      = require('fs');
const request = require('request');
const tools   = require('./tools');
const builds  = require('./build');

function sortRepo(sources) {
    // rebuild order
    const names = [];
    for (const n in sources) {
        if (!sources.hasOwnProperty(n)) continue;
        names.push(n);		
    }	
    const __sources = {};
    names.sort();
    for (let i = 0; i < names.length; i++) {
        const obj = sources[names[i]];
        __sources[names[i]] = {
            meta: obj.meta,
            icon: obj.icon,
            type: obj.type,
            version: obj.version,
            published: obj.published,
            versionDate: obj.versionDate
        };
        Object.keys(__sources[names[i]]).forEach(attr => !__sources[names[i]][attr] && delete __sources[names[i]][attr]);
    }
    return __sources;
}

function updateVersions(latest, stable, callback, _index) {
    if (_index === undefined) {
        for (const name in stable) {
            if (!stable.hasOwnProperty(name)) continue;

            if (stable[name].type !== latest[name].type) {
                console.log('Update type of "' + name + '"');
                stable[name].type = latest[name].type;
            }
        }
        // rebuild order
        stable = sortRepo(stable);
        latest = sortRepo(latest);
        _index = 0;
    }

    const names = Object.keys(latest);

    if (_index >= names.length) {
        callback(latest, stable);
    } else {
        const name = names[_index];
        console.log(`[${_index}/${names.length}] process ${name}`);
        const url = `https://registry.npmjs.org/${tools.appName.toLowerCase()}.${name}`;

        request(url, (error, state, body) => {
            if (error) {
                console.error('Cannot get version of  ' +  tools.appName + '.' + name + ': ' + error);
            } else {
                body = JSON.parse(body);
                const times = body.time;

                if (latest[name].published !== times.created) {
                    console.log(`Updated latest published for ${name} from ${latest[name].published} to ${times.created}`);
                    latest[name].published = times.created;
                }
                if (latest[name].versionDate !== times.modified) {
                    console.log(`Updated latest versionDate for ${name} from ${latest[name].versionDate} to ${times.modified}`);
                    latest[name].versionDate = times.modified;
                }
                latest[name].versionDate = times.modified;
                if (stable[name]) {
                    if (!stable[name].published) {
                        console.log(`Updated stable published for ${name} to ${times.created}`);
                        stable[name].published = times.created;
                    }
                    if (stable[name].versionDate !== times[stable[name].version]) {
                        console.log(`Updated stable versionDate for ${name} from ${stable[name].versionDate} to ${times[stable[name].version]}`);
                        stable[name].versionDate = times[stable[name].version];
                    }
                }
            }

            setTimeout(updateVersions, 100, latest, stable, callback, _index + 1);
        });
    }
}

function getNpmVersion(adapter) {
    return function (callback) {
        console.log('getNpmVersion: http://registry.npmjs.org/iobroker.' + adapter);
        request('http://registry.npmjs.org/iobroker.' + adapter, (error, state, body) => {
            try {
                const info = JSON.parse(body);
                const last = info['dist-tags'].latest;
                callback({adapter: adapter, version: last, npm: true, info: info, date: new Date(info.time[last])});
            } catch (e) {
                callback({adapter: adapter});
            }
        });
    };
}

function getGitVersion(latest, adapter) {
    return function (callback) {
        console.log('getGitVersion: ' + latest[adapter].meta);
        request(latest[adapter].meta, (error, state, body) => {
            try {
                const info = JSON.parse(body);
                callback({adapter: adapter, license: info.common.license, version: info.common.version, desc: info.common.desc, git: true, info: info});
            } catch (e) {
                console.error('Cannot parse GIT for "' + adapter + '": ' + e);
                callback({adapter: adapter});
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
            return resolve({adapter: adapter});
        }
        console.log('getLatestCommit: https://api.github.com/repos/' + owner[1] + '/ioBroker.' + adapter + '/commits');
        request({
            url: 'https://api.github.com/repos/' + owner[1] + '/ioBroker.' + adapter + '/commits',
            headers: {
                'User-Agent': 'request'
            }
        }, (error, state, body) => {
            try {
                const info = JSON.parse(body);
                if (info && info[0] && info[0].commit) {
                    callback({adapter: adapter, commit: true, date: new Date(info[0].commit.author.date)});
                } else {
                    callback({adapter: adapter});
                }
            } catch (e) {
                console.error('Cannot get latest commit "'  +adapter + '": ' + body);
                callback({adapter: adapter});
            }
        });
    };
}

function formatMaintainer(entry, authors) {
    if (!entry) return '';
    if (typeof entry === 'object') {
        let name = (entry.name || '').trim();
        if (authors[name.toLowerCase()]) name += '(' +   authors[name.toLowerCase()] + ')';
        return '<a href="mailto:' + entry.email + '">' + name + '</a>';
    }
    const email = entry.match(/<([-.@\w\d]+)>/);
    if (email) {
        let name = entry.replace(email[0], '').trim();
        if (authors[name.toLowerCase()]) name += '(' +   authors[name.toLowerCase()] + ')';
        return '<a href="mailto:' + email[1] + '">' + name + '</a>';
    } else {
        let name = entry;
        if (authors[name.toLowerCase()]) name += '(' +   authors[name.toLowerCase()] + ')';
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

function getInterval(date) {
    if (!date) return '';
    if (typeof date === 'string') date = new Date(date);

    let days = new Date().getTime() - date.getTime();
    days /= 24 * 3600000;
    days = Math.floor(days);
    if (days < 100) {
        return 'for ' + days + ' days';
    } else {
        return 'for ' + Math.floor(days / 30) + ' months';
    }
}

function getDiscovery(callback) {
    request('https://github.com/ioBroker/ioBroker.discovery/tree/master/lib/adapters', (error, status, body) => {
        let adapters = body.match(/<a\shref="\/ioBroker\/ioBroker.discovery\/blob\/master\/lib\/adapters\/([-_\w\d]+)\.js/g);
        if (adapters) {
            adapters = adapters.map(a => a.match(/([-_\w\d]+)\.js/)[1]);
        }
        callback && callback(adapters);
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

function createList(fileName) {
    request('https://raw.githubusercontent.com/ioBroker/ioBroker.repositories/master/sources-dist-stable.json', (error, state, body) => {
        const stable = JSON.parse(body);
        request('https://raw.githubusercontent.com/ioBroker/ioBroker.repositories/master/sources-dist.json', (error, state, body) => {
            const latest = JSON.parse(body);
            const tasks = [];
            builds.getStats(function (err, stats) {
                for (const adapter in latest) {
                    if (!latest.hasOwnProperty(adapter)) continue;
                    tasks.push(getNpmVersion(adapter));
                    tasks.push(getGitVersion(latest, adapter));
                    tasks.push(getLatestCommit(latest, adapter));
                    // if (t++ > 3) break;
                }

                getDiscovery(discovery => {
                    serial(tasks, results => {
                        const aList = {};
                        let i = 1;

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

                        for (const adapter in latest) {
                            if (!latest.hasOwnProperty(adapter)) continue;
                            const aItem = {};
                            try {
                                types[latest[adapter].type] = types[latest[adapter].type] || 0;
                                types[latest[adapter].type]++;

                                // index
                                i++;
                                // image
                                if (latest[adapter].icon) {
                                    aItem.icon = latest[adapter].icon;
                                }
                                // Name
                                aItem.link = latest[adapter].meta.replace('raw.githubusercontent' , 'github').replace('/master/io-package.json', '');

                                const git    = results.find(result => result.git    && result.adapter === adapter);
                                const npm    = results.find(result => result.npm    && result.adapter === adapter);
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
                                if (discovery && discovery.indexOf(adapter) !== -1) {
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
                                    github:     (git ? git.version : ''),
                                    githubDate: commit && commit.date,
                                    latest:     (npm ? npm.version : ''),
                                    latestDate: npm && npm.date,
                                    stable:     (stable[adapter] ? stable[adapter].version : ''),
                                    stableDate: npm && stable[adapter] && npm.info.time[stable[adapter].version]
                                };

                                aList[adapter] = aItem;
                            } catch (e) {
                                console.error(e);
                            }
                        }

                        const keys = Object.keys(types);
                        keys.sort();

                        now = ('0' + (now.getDate())).slice(-2)  + '.' +
                              ('0' + (now.getMonth() + 1)).slice(-2) + ' ' +
                              ('0' + now.getHours()).slice(-2) + ':' +
                              ('0' + now.getMinutes()).slice(-2);

                        let script = 'var adapters = ' + JSON.stringify(aList, null, 2) + ';\n';
                        script += '\tvar types = ' + JSON.stringify(types, null, 2) + ';\n';

                        fs.writeFileSync(fileName || __dirname + '/../list.html', fs.readFileSync(__dirname + '/../list/template.html').toString().replace('<!-- INSERT HERE -->', '(' + now + ') ').replace('//-- INSERT HERE --', script));
                        process.exit();
                    });
                });
            });
        });
    });
}

function init(callback) {
    let latest = require('../sources-dist');
    let stable = require('../sources-dist-stable');

    updateVersions(latest, stable, (latest, stable) => {
        fs.writeFileSync(__dirname + '/../sources-dist.json',        JSON.stringify(latest, null, 2));
        fs.writeFileSync(__dirname + '/../sources-dist-stable.json', JSON.stringify(stable, null, 2));
        callback && callback(latest, stable);
    });
}
function sort() {
    let sources = require('../sources-dist-stable');
    fs.writeFileSync(__dirname + '/../sources-dist-stable.json', JSON.stringify(sortRepo(sources), null, 2));

    sources = require('../sources-dist');
    fs.writeFileSync(__dirname + '/../sources-dist.json', JSON.stringify(sortRepo(sources), null, 2));
}

if (module.exports && module.parent) {
    module.exports.init = init;
    module.exports.sort = sort;
    module.exports.list = createList;
} else {
    // update versions for all adapter, which do not have the version
    if (process.argv.indexOf('--init') !== -1) {
        init(() => process.exit());
    } else if (process.argv.indexOf('--sort') !== -1) {
        sort();
    } else if (process.argv.indexOf('--list') !== -1) {
        const file = process.argv.indexOf('--list');
        if (process.argv[file + 1]) {
            createList(process.argv[file + 1]);
        } else {
            createList(__dirname + '/../list.html');
        }
    }
}