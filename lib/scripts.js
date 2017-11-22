'use strict';
const https   = require('https');
const fs      = require('fs');
const request = require('request');
let   tools   = require(__dirname + '/tools.js');

function httpsGet(link, callback) {
    https.get(link, function (res) {
        let statusCode = res.statusCode;

        if (statusCode !== 200) {
            // consume response data to free up memory
            res.resume();
            callback(statusCode, null, link);
        }

        res.setEncoding('utf8');
        let rawData = '';
        res.on('data', function (chunk) {
            rawData += chunk;
        });
        res.on('end', function () {
            callback(null, rawData ? rawData.toString() : null, link);
        });
    }).on('error', function (e) {
        callback(e.message, null, link);
    });
}

function sortRepo(sources) {
	// rebuild order
	let names = [];
	for (let n in sources) {
		if (!sources.hasOwnProperty(n)) continue;
		names.push(n);		
	}	
	let __sources = {};
	names.sort();
	for (let i = 0; i < names.length; i++) {
		__sources[names[i]] = sources[names[i]];
	}
	return __sources;
}

function updateVersion(name, callback, _sources) {
    let cmd = 'npm show ' + tools.appName.toLowerCase() + '.' + name + ' version';
    let exec = require('child_process').exec;
	
	// If update for new adapter => read info about it from latest
	if (!_sources[name]) {
		let latest = JSON.parse(fs.readFileSync(__dirname + '/../sources-dist.json').toString());
		_sources[name] = latest[name];
	}

    exec(cmd, function(error, stdout, stderr){
        if (stderr) {
            console.error('Cannot get version of  ' +  tools.appName + '.' + name + ': ' + stderr);
            callback(stderr, _sources, name, null);
        } else {
            _sources[name].version = stdout.replace('\n', '');
            console.log(tools.appName.toLowerCase() + '.' + name + ' - ' + _sources[name].version);
            callback(null, _sources, name, _sources[name].version);
        }
    });
}

function updateVersions(callback, _sources) {
    if (!_sources) {
        _sources = require(__dirname + '/../sources-dist-stable.json');
        let newSources = require(__dirname + '/../sources-dist.json');
		let names = [];
        for (let n in newSources) {
            if (!newSources.hasOwnProperty(n)) continue;
			names.push(n);
			// do not add automatically new adapters 
            /* if (!_sources[n]) {
				_sources[n] = newSources[n];
				_sources[n].published = new Date().toISOString();
			} else*/
			if (_sources[n] && newSources[n].type !== _sources[n].type) {
                console.log('Update type of "' + n + '"');
                _sources[n].type = newSources[n].type;
            }
        }
		// rebuild order
		_sources = sortRepo(_sources);
    }
    _sources = _sources || require(__dirname + '/../sources-dist-stable.json');
    let count = 0;
    for (let name in _sources) {
        if (!_sources.hasOwnProperty(name)) continue;
        if (!_sources[name].version) {
            count++;
            updateVersion(name, function () {
                setTimeout(updateVersions, 0, callback, _sources);
            }, _sources);
            break;
        }
    }
    if (!count) callback(_sources);
}

function getNpmVersion(adapter) {
    return function (callback) {
        console.log('getNpmVersion: http://registry.npmjs.org/iobroker.' + adapter);
        request('http://registry.npmjs.org/iobroker.' + adapter, (error, state, body) => {
            try {
                let info = JSON.parse(body);
                let last = info['dist-tags'].latest;
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
                let info = JSON.parse(body);
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
        let meta = latest[adapter].meta;
        let owner = meta.match(/\.com\/([-.\d\w_]+)\/ioBroker/i);
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
                let info = JSON.parse(body);
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
    let email = entry.match(/<([-.@\w\d]+)>/);
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

function formatMaintainers (list, authors) {
    if (typeof list === 'object') {
        let result = [];
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
    let task = list.shift();
    result = result || [];
    console.log('Rest: ' + list.length);
    task(r => {
        result.push(r);
        setImmediate(serial, list, result, callback);
    });
}

function createList() {
    request('https://raw.githubusercontent.com/ioBroker/ioBroker.repositories/master/sources-dist-stable.json', (error, state, body) => {
        let stable = JSON.parse(body);
        request('https://raw.githubusercontent.com/ioBroker/ioBroker.repositories/master/sources-dist.json', (error, state, body) => {
            let latest = JSON.parse(body);
            let tasks = [];

            request('http://download.iobroker.net/stat.html', (error, state, body) => {
                let dataAdapters;
                let dataSets;
                if (body) {
                    //
                    // var dataAdapters = { labels:["admin","web","vis", ...],
                    //     datasets: [ {data: [8286,6629,6027,...]};
                    let lines = body.split(/[\r\n]|\n/);
                    lines.forEach(line => {
                        if (line.indexOf('var dataAdapters') !== -1) {
                            dataAdapters = line.substring('var dataAdapters = { labels:'.length, line.length - 1);
                        } else if (!dataSets && line.indexOf('datasets: [') !== -1) {
                            dataSets = line.substring(' datasets: [ {data: '.length, line.length - 4);
                            return false;
                        }
                    });
                    if (dataAdapters && dataSets) {
                        try {
                            dataAdapters = JSON.parse(dataAdapters);
                            dataSets = JSON.parse(dataSets);
                        } catch (e) {
                            dataAdapters = null;
                            dataSets = null;
                        }
                    }
                }

                let t = 0;
                for (let adapter in latest) {
                    if (!latest.hasOwnProperty(adapter)) continue;
                    tasks.push(getNpmVersion(adapter));
                    tasks.push(getGitVersion(latest, adapter));
                    tasks.push(getLatestCommit(latest, adapter));
                    // if (t++ > 3) break;
                }

                getDiscovery(discovery => {
                    serial(tasks, results => {
                        let aList = {};
                        let i = 1;

                        let types = {};
                        let now = new Date();
                        let authors = {};
                        for (let adapter in latest) {
                            let git = results.find(result => result.git && result.adapter === adapter);
                            if (git) {
                                let list = git.info.common.authors;
                                if (typeof list === 'object') {
                                    list.forEach(entry => {
                                        let user;
                                        if (typeof entry === 'object') {
                                            user = entry.name;
                                        } else {
                                            let email = entry.match(/<([-.@\w\d]+)>/);
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
                                    let email = list.match(/<([-.@\w\d]+)>/);
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

                        for (let adapter in latest) {
                            if (!latest.hasOwnProperty(adapter)) continue;
                            let aItem = {};
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

                                let git    = results.find(result => result.git    && result.adapter === adapter);
                                let npm    = results.find(result => result.npm    && result.adapter === adapter);
                                let commit = results.find(result => result.commit && result.adapter === adapter);

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

                                if (dataAdapters) {
                                    let pos = dataAdapters.indexOf(adapter);
                                    if (pos !== -1) {
                                        aItem.installs = dataSets[pos];
                                    }
                                }

                                // Maintainer
                                aItem.maintainers = (git ? formatMaintainers(git.info.common.authors, authors) : '');

                                // Created on
                                if (npm && npm.info.time.created) {
                                    let date = new Date(npm.info.time.created);
                                    aItem.created = date.toISOString();
                                    let sDate =  ('0' + (date.getDate())).slice(-2) + '.' +
                                        ('0' + (date.getMonth() + 1)).slice(-2) + '.' +
                                        date.getFullYear();
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

                        let keys = Object.keys(types);
                        keys.sort();

                        let tTypes = '<select id="filter"><option value="">all</option>';
                        keys.forEach(type => {tTypes += '<option value="' + type + '">' + type + ' - ' + types[type] + '</option>'});
                        tTypes += '</select><br>';

                        now = ('0' + (now.getDate())).slice(-2)  + '.' +
                            ('0' + (now.getMonth() + 1)).slice(-2) + ' ' +
                            ('0' + now.getHours()).slice(-2) + ':' +
                            ('0' + now.getMinutes()).slice(-2);

                        let script = 'var adapters = ' + JSON.stringify(aList, null, 2) + ';\n';
                        script += '\tvar types = ' + JSON.stringify(types, null, 2) + ';\n';

                        fs.writeFileSync(__dirname + '/../list.html', fs.readFileSync(__dirname + '/../list/template.html').toString().replace('<!-- INSERT HERE -->', '(' + now + ') ').replace('//-- INSERT HERE --', script));
                        process.exit();
                    });
                });
            });
        });
    });}

if (module.exports && module.parent) {
    module.exports.init = function (callback) {
        updateVersions(function (sources) {
            if (sources) fs.writeFileSync(__dirname + '/../sources-dist-stable.json', JSON.stringify(sources, null, 2));
			
			let sources_ = JSON.parse(fs.readFileSync(__dirname + '/../sources-dist.json').toString());
			fs.writeFileSync(__dirname + '/../sources-dist.json', JSON.stringify(sortRepo(sources_), null, 2));
			
            callback && callback(sources);
        });
    };
    module.exports.update = function (name, callback, _sources) {
        updateVersion(name, function (err, sources) {
            if (sources) fs.writeFileSync(__dirname + '/../sources-dist-stable.json', JSON.stringify(sources, null, 2));
			
			let sources_ = JSON.parse(fs.readFileSync(__dirname + '/../sources-dist.json').toString());
			fs.writeFileSync(__dirname + '/../sources-dist.json', JSON.stringify(sortRepo(sources_), null, 2));
            
			callback && callback();
        }, _sources);
    };
	module.exports.sort = function () {
		let sources = JSON.parse(fs.readFileSync(__dirname + '/../sources-dist-stable.json').toString());
		fs.writeFileSync(__dirname + '/../sources-dist-stable.json', JSON.stringify(sortRepo(sources), null, 2));
		
		sources = JSON.parse(fs.readFileSync(__dirname + '/../sources-dist.json').toString());
		fs.writeFileSync(__dirname + '/../sources-dist.json', JSON.stringify(sortRepo(sources), null, 2));
	};

	module.exports.list = createList;
} else {
    // update versions for all adapter, which do not have the version
    if (process.argv.indexOf('--init') !== -1) {
        updateVersions(function (err, sources) {
            fs.writeFileSync(__dirname + '/../sources-dist-stable.json', JSON.stringify(sources, null, 2));
        });
    }

    // update version for one adapter
    if (process.argv.indexOf('--update') !== -1) {
        let pos = process.argv.indexOf('--update');
        if (process.argv[pos + 1]) {
            updateVersion(process.argv[pos + 1], function (sources) {
                let file = process.argv.indexOf('--file');
                if (file !== -1 && process.argv[file + 1]) {
                    fs.writeFileSync(file, JSON.stringify(sources, null, 2));
                } else {
                    console.log(JSON.stringify(sources, null, 2));
                }
            });
        } else {
            console.warn('Pleas specify name of adapter to update: script.js --update admin');
            process.exit(1);
        }
    } else if (process.argv.indexOf('--sort') !== -1) {
		let sources = JSON.parse(fs.readFileSync(__dirname + '/../sources-dist-stable.json').toString());
		fs.writeFileSync(__dirname + '/../sources-dist-stable.json', JSON.stringify(sortRepo(sources), null, 2));
		
		sources = JSON.parse(fs.readFileSync(__dirname + '/../sources-dist.json').toString());
		fs.writeFileSync(__dirname + '/../sources-dist.json', JSON.stringify(sortRepo(sources), null, 2));
	} else if (process.argv.indexOf('--list') !== -1) {
        createList();
    }
}