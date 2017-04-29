var https = require('https');
var fs = require('fs');
var tools = require(__dirname + '/tools.js');

function httpsGet(link, callback) {
    https.get(link, function (res) {
        var statusCode = res.statusCode;

        if (statusCode !== 200) {
            // consume response data to free up memory
            res.resume();
            callback(statusCode, null, link);
        }

        res.setEncoding('utf8');
        var rawData = '';
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
	var names = [];
	for (var n in sources) {
		if (!sources.hasOwnProperty(n)) continue;
		names.push(n);		
	}	
	var __sources = {};
	names.sort();
	for (var i = 0; i < names.length; i++) {
		__sources[names[i]] = sources[names[i]];
	}
	return __sources;
}

function updateVersion(name, callback, _sources) {
    var cmd = 'npm show ' + tools.appName.toLowerCase() + '.' + name + ' version';
    var exec = require('child_process').exec;

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
        var newSources = require(__dirname + '/../sources-dist.json');
		var names = [];
        for (var n in newSources) {
            if (!newSources.hasOwnProperty(n)) continue;
			names.push(n);
            if (!_sources[n]) {
				_sources[n] = newSources[n];
				_sources[n].published = new Date().toISOString();
			} else
			if (newSources[n].type !== _sources[n].type) {
                console.log('Update type of "' + n + '"');
                _sources[n].type = newSources[n].type;
            }
        }
		// rebuild order
		_sources = sortRepo(_sources);
    }
    _sources = _sources || require(__dirname + '/../sources-dist-stable.json');
    var count = 0;
    for (var name in _sources) {
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

if (module.exports) {
    module.exports.init = function (callback) {
        updateVersions(function (sources) {
            if (sources) fs.writeFileSync(__dirname + '/../sources-dist-stable.json', JSON.stringify(sources, null, 2));
			
			var sources_ = JSON.parse(fs.readFileSync(__dirname + '/../sources-dist.json').toString());
			fs.writeFileSync(__dirname + '/../sources-dist.json', JSON.stringify(sortRepo(sources_), null, 2));
			
            callback && callback(sources);
        });
    };
    module.exports.update = function (name, callback, _sources) {
        updateVersion(name, function (err, sources) {
            if (sources) fs.writeFileSync(__dirname + '/../sources-dist-stable.json', JSON.stringify(sources, null, 2));
			
			var sources_ = JSON.parse(fs.readFileSync(__dirname + '/../sources-dist.json').toString());
			fs.writeFileSync(__dirname + '/../sources-dist.json', JSON.stringify(sortRepo(sources_), null, 2));
            
			callback && callback();
        }, _sources);
    };
	module.exports.sort = function () {
		var sources = JSON.parse(fs.readFileSync(__dirname + '/../sources-dist-stable.json').toString());
		fs.writeFileSync(__dirname + '/../sources-dist-stable.json', JSON.stringify(sortRepo(sources), null, 2));
		
		sources = JSON.parse(fs.readFileSync(__dirname + '/../sources-dist.json').toString());
		fs.writeFileSync(__dirname + '/../sources-dist.json', JSON.stringify(sortRepo(sources), null, 2));
	};
} else {
    // update versions for all adapter, which do not have the version
    if (process.argv.indexOf('--init') !== -1) {
        updateVersions(function (err, sources) {
            fs.writeFileSync(__dirname + '/../sources-dist-stable.json', JSON.stringify(sources, null, 2));
        });
    }

    // update version for one adapter
    if (process.argv.indexOf('--update') !== -1) {
        var pos = process.argv.indexOf('--update');
        if (process.argv[pos + 1]) {
            updateVersion(process.argv[pos + 1], function (sources) {
                var file = process.argv.indexOf('--file');
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
		var sources = JSON.parse(fs.readFileSync(__dirname + '/../sources-dist-stable.json').toString());
		fs.writeFileSync(__dirname + '/../sources-dist-stable.json', JSON.stringify(sortRepo(sources), null, 2));
		
		sources = JSON.parse(fs.readFileSync(__dirname + '/../sources-dist.json').toString());
		fs.writeFileSync(__dirname + '/../sources-dist.json', JSON.stringify(sortRepo(sources), null, 2));
	}
}