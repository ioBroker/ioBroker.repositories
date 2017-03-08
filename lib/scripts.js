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

function updateVersion(name, callback, _sources) {
    var cmd = 'npm show ' + tools.appName.toLowerCase() + '.' + name + ' version';
    var exec = require('child_process').exec;

    exec(cmd, function(error, stdout, stderr){
        if (stderr) {
            console.error('host.' + hostname + ' Cannot get version of  ' +  tools.appName + '.' + name + ': ' + code);
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
        for (var n in newSources) {
            if (!newSources.hasOwnProperty(n)) continue;
            if (!_sources[n]) _sources[n] = newSources[n];
        }
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

// update versions for all adapter, which do not have the version
if (process.argv.indexOf('--init') !== -1) {
    updateVersions(function (sources) {
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
}