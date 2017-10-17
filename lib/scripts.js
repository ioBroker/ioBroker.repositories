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
                callback({adapter: adapter, version: info.common.version, desc: info.common.desc, git: true, info: info});
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

function formatMaintainer(entry) {
    if (!entry) return '';
    if (typeof entry === 'object') {
        return '<a href="mailto:' + entry.email + '">' + (entry.name || '').trim() + '</a>';
    }
    let email = entry.match(/<([-.@\w\d]+)>/);
    if (email) {
        return '<a href="mailto:' + email[1] + '">' + entry.replace(email[0], '').trim() + '</a>';
    } else {
        return entry;
    }
}

function formatMaintainers (list) {
    if (typeof list === 'object') {
        let result = [];
        list.forEach(entry => result.push(formatMaintainer(entry)));
        return result.join('<br>');
    } else {
        return formatMaintainer(list);
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
    let latest = require(__dirname + '/../sources-dist.json');
    let stable = require(__dirname + '/../sources-dist-stable.json');

    let tasks = [];

    let t = 0;
    for (let adapter in latest) {
        if (!latest.hasOwnProperty(adapter)) continue;
        tasks.push(getNpmVersion(adapter));
        tasks.push(getGitVersion(latest, adapter));
        tasks.push(getLatestCommit(latest, adapter));
        // if (t++ > 3) break;
    }

    serial(tasks, results => {
        let text = '<table class="table-list">';
        text += '<tr><th class="header-index"></th><th class="header-img"></th><th class="header-name">Name</th><th class="header-desc">Description</th><th class="header-type">Type</th><th class="header-maintainer">Maintainer</th><th class="header-version">Versions</th></tr>';
        let i = 1;

        let types = {};

        for (let adapter in latest) {
            if (!latest.hasOwnProperty(adapter)) continue;

            try {
                types[latest[adapter].type] = types[latest[adapter].type] || 0;
                types[latest[adapter].type]++;

                text += '<tr class="type-all type-' + latest[adapter].type + '">';
                // index
                text += '<td class="header-index">' + (i++) + '</td>';
                // image
                if (latest[adapter].icon) {
                    text += '<td><img src="' + latest[adapter].icon + '" width="64px"/></td>';
                } else {
                    text += '<td></td>';
                }
                // Name
                text += '<td><a href="' + latest[adapter].meta.replace('raw.githubusercontent' , 'github').replace('/master/io-package.json', '') + '" target="_blank">' + adapter + '</a></td>';

                let git    = results.find(result => result.git && result.adapter === adapter);
                let npm    = results.find(result => result.npm && result.adapter === adapter);
                let commit = results.find(result => result.commit && result.adapter === adapter);

                // Description
                text += '<td>' + (git ? (git.desc.en || git.desc) : '-') + '</td>';

                // Type
                text += '<td><span style="' + (git && latest[adapter].type !== git.info.common.type ? 'color: red' : '') + '" title="' +
                    (git && latest[adapter].type !== git.info.common.type ? 'git: ' + git.info.common.type + ', repo: ' + latest[adapter].type : '')
                    + '">' + latest[adapter].type + '</span></td>';

                // Maintainer
                text += '<td>' + (git ? formatMaintainers(git.info.common.authors) : '-') + '</td>';

                // Version
                text += '<td><table class="table-version"><tr><td>github:</td><td>' + (git ? git.version + ' ' + (commit ? getInterval(commit.date) : ''): '-.-.-') + '</td></tr>' +
                    '<tr><td>latest:</td><td>' + (npm ? npm.version + ' ' + getInterval(npm.date) : '-.-.-') + '</td></tr>' +
                    '<tr><td>stable:</td><td>' + (stable[adapter] ? stable[adapter].version + ' ' + (npm ? getInterval(npm.info.time[stable[adapter].version]) : '') : '-.-.-') + '</td></tr></table></td>';

                text += '</tr>\n';

            } catch (e) {
                console.error(e);
            }
        }
        text += '</table>';
        let keys = Object.keys(types);
        keys.sort();

        let tTypes = '<select id="filter"><option value="">all</option>';
        keys.forEach(type => {tTypes += '<option value="' + type + '">' + type + ' - ' + types[type] + '</option>'});
        tTypes += '</select><br>';

        fs.writeFileSync(__dirname + '/../list.html', fs.readFileSync(__dirname + '/../list/template.html').toString().replace('// -- INSERT HERE --', '(' + new Date().toISOString() + ') ' + tTypes + text));
        process.exit();
    });
}

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