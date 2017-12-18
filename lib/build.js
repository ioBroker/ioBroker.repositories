// This help script creates repository with full information
// additionally it can collect all the npm version images in some folder
// Usage:
//  --file fileName - Output of repository into specified file
//  --json - Print json repository in the console
//  --versions - show all current versions in the console
//  --list - list of all adapters with descriptions in the console
//          1. admin: Opens a webserver for the ioBroker admin UI
//          2. artnet: Control DMX512 Devices via an Art-Net node
//          ...
//  --shortlist - print list of all adapters in the console
//          admin
//          artnet
//          b-control-em
//          chromecast
//          ...
//  --shields folderName - save all npm versions images into specified folder
//  --logos folderName - save all logos of all adapters into specified folder under logo-adapter.png

const tools   = require('./tools.js');
const fs      = require('fs');
require('events').EventEmitter.prototype._maxListeners = 300;
process.setMaxListeners(0);
const request = require('request');

function getStats(cb) {
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
        let result = {};
        dataAdapters && dataAdapters.forEach((val, i) => result[val] = dataSets[i]);
        cb(null, result)
    });
}

function getImages(list, destination, callback) {
    if (!list || !list.length) {
        callback && callback();
    } else {
        let name = list.pop();
        request.get({url: 'http://img.shields.io/npm/v/iobroker.' + name.name + '.svg?style=flat-square', encoding: 'binary'}, function (error, response, body) {
            if (!error && body) {
                fs.writeFile(destination + name.name + '.svg', body, 'binary', function (err) {
                    if (err) console.error('Cannot save file "' + destination + name.name + '.svg: ' + err);

                    setTimeout(function () {
                        getImages(list, destination, callback);
                    }, 100);
                });
            } else {
                console.error('Cannot get URL "http://img.shields.io/npm/v/iobroker.' + name.name + '.svg?style=flat-square: ' + error);
                setTimeout(function () {
                    getImages(list, destination, callback);
                }, 100);
            }
        });
    }
}

function getLicenses(list, destination, callback) {
    if (!list || !list.length) {
        callback && callback();
    } else {
        let name = list.pop();
        request.get({url: 'https://img.shields.io/github/license/' + name + '.svg?style=flat-square', encoding: 'binary'}, function (error, response, body) {
            if (!error && body) {
                fs.writeFile(destination + 'license-' + name + '.svg', body, 'binary', function (err) {
                    if (err) {
                        console.error('Cannot save file "' + destination + 'license-' + name + '.svg: ' + err);
                    }
                    setTimeout(function () {
                        getLicenses(list, destination, callback);
                    }, 100);
                });
            } else {
                console.error('Cannot get URL "https://img.shields.io/github/license/' + name + '.svg?style=flat-square: ' + error);
                setTimeout(function () {
                    getLicenses(list, destination, callback);
                }, 100);
            }
        });
    }
}

function getLogos(list, destination, callback) {
    if (!list || !list.length) {
        callback && callback();
    } else {
        let task = list.pop();
        request.get({url: task.url, encoding: 'binary'}, function (error, response, body) {
            if (!error && body) {
                fs.writeFile(destination + task.name, body, 'binary', function (err) {
                    if (err) {
                        console.error('Cannot save file "' + destination + task.name + ': ' + err);
                    }
                    setTimeout(function () {
                        getLogos(list, destination, callback);
                    }, 100);
                });
            } else {
                console.error('Cannot get URL "' + task.url + ':' + error);
                setTimeout(function () {
                    getLogos(list, destination, callback);
                }, 100);
            }
        });
    }
}

function processRepository(data, argv, cb) {
    let output  = false;
    let waitEnd = 0;
    for (let a = 0; a < argv.length; a++) {
        if (argv[a] === '--file' && argv[a + 1]) {
            if (data && typeof data === 'object' && data.admin) {
                fs.writeFileSync(argv[a + 1], JSON.stringify(data, null, 2));
            } else {
                console.error('Cannot get repository');
            }
            output = true;
        }
        if (argv[a] === '--json') {
            console.log(JSON.stringify(data, null, 2));
            output = true;
        }
        if (argv[a] === '--versions') {
            for (let v in data) {
                if (!data.hasOwnProperty(v)) continue;
                console.log(count + '. ' + v + ': ' + data[v].version);
            }
            output = true;
        }
        if (argv[a] === '--list') {
            let count = 1;
            for (let b in data) {
                if (!data.hasOwnProperty(b)) continue;
                if (typeof data[b].desc === 'object') {
                    console.log(count + '. ' + b + ': ' + data[b].desc.en);
                } else
                    console.log(count + '. ' + b + ': ' + data[b].desc);

                count++;
            }
            output = true;
        }
        if (argv[a] === '--shortlist') {
            for (let s in data) {
                if (!data.hasOwnProperty(s)) continue;
                console.log(s);
            }
            output = true;
        }
        if (argv[a] === '--shields' && argv[a + 1]) {
            if (argv[a + 1][argv[a + 1].length - 1] !== '/') {
                argv[a + 1] += '/';
            }
            let list = [];
            for (let j in data) {
                if (!data.hasOwnProperty(j)) continue;
                list.push({name: j, meta: data[j].meta});
            }
            waitEnd++;
            if (!fs.existsSync(argv[a + 1])) fs.mkdirSync(argv[a + 1]);

            getImages(list, argv[a + 1], function () {
                if (!--waitEnd && cb) cb();
            });
        }
        if (argv[a] === '--logos' && argv[a + 1]) {
            if (argv[a + 1][argv[a + 1].length - 1] !== '/') {
                argv[a + 1] += '/';
            }
            let list = [];
            for (let i in data) {
                if (!data.hasOwnProperty(i)) continue;
                list.push({url: data[i].extIcon, name: 'logo-' + i.toLowerCase() + '.png'});
            }
            waitEnd++;
            if (!fs.existsSync(argv[a + 1])) fs.mkdirSync(argv[a + 1]);

            getLogos(list, argv[a + 1], function () {
                if (!--waitEnd && cb) cb();
            });
        }
        if (argv[a] === '--licenses' && argv[a + 1]) {
            if (argv[a + 1][argv[a + 1].length - 1] !== '/') {
                argv[a + 1] += '/';
            }
            let _list = [];
            for (let l in data) {
                if (!data.hasOwnProperty(l)) continue;
                // process: https://raw.githubusercontent.com/ioBroker/ioBroker.socketio/master/io-package.json
                let parts = data[l].meta.split('/');

                _list.push(parts[3] + '/' + parts[4]);
            }
            waitEnd++;
            if (!fs.existsSync(argv[a + 1])) fs.mkdirSync(argv[a + 1]);

            getLicenses(_list, argv[a + 1], function () {
                if (!--waitEnd && cb) cb();
            });
        }
    }
    if (!output) console.log(JSON.stringify(data, null, 2));
    if (!waitEnd && cb) cb();
}

if (module.exports && module.parent) {
    module.exports.getLogos          = getLogos;
    module.exports.getImages         = getImages;
    module.exports.processRepository = processRepository;
    module.exports.getStats          = getStats;
} else {
    if (process.argv.indexOf('--latest') === -1) {
        tools.getRepositoryFile('https://raw.githubusercontent.com/' + tools.appName + '/' + tools.appName + '.repositories/master/sources-dist-stable.json', function (err, data) {
            if (err) {
                console.error(err);
                if (!data) process.exit(1);
            }
            getStats(function (err, stats) {
                if (stats) {
                    for (let adapter in stats) {
                        if (stats.hasOwnProperty(adapter) && data[adapter]) {
                            data[adapter].stat = stats[adapter];
                        }
                    }
                }
                processRepository(data, process.argv, function () {
                    process.exit();
                });
            });
        });
    } else {
        request('https://raw.githubusercontent.com/' + tools.appName + '/' + tools.appName + '.repositories/master/sources-dist-stable.json', function (err, resp, body) {
            let latest = JSON.parse(body);
            tools.getRepositoryFile('https://raw.githubusercontent.com/' + tools.appName + '/' + tools.appName + '.repositories/master/sources-dist.json', latest, function (err, data) {
                if (err) {
                    console.error(err);
                    if (!data) process.exit(1);
                }
                getStats(function (err, stats) {
                    if (stats) {
                        for (let adapter in stats) {
                            if (stats.hasOwnProperty(adapter) && data[adapter]) {
                                data[adapter].common.stat = stats[adapter];
                            }
                        }
                    }
                    processRepository(data, process.argv, function () {
                        process.exit();
                    });
                });
            });
        });
    }
}