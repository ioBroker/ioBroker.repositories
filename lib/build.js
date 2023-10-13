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
const axios = require('axios');

function getStats(cb) {
    if (cb) {
        axios('http://iobroker.live/statistics.json')
            .then(response => cb(null,response.data.adapters));
    } else {
        return axios('http://iobroker.live/statistics.json')
            .then(response => response.data.adapters);
    }
}

function getImages(list, destination, callback) {
    if (!list || !list.length) {
        callback && callback();
    } else {
        const name = list.pop();
        if (!fs.existsSync(destination + name.name + '.svg')) {
            console.log('IMG: ' + name.name);
            axios(`http://img.shields.io/npm/v/iobroker.${name.name}.svg?style=flat-square`, {responseType: 'arraybuffer'})
                .then(response => {
                    if (response.data) {
                        fs.writeFile(`${destination + name.name}.svg`, response.data, 'binary', err => {
                            err && console.error(`Cannot save file "${destination}${name.name}.svg: ${err}`);
                            setTimeout(() => getImages(list, destination, callback), 100);
                        });
                    } else {
                        console.error(`Got empty file "http://img.shields.io/npm/v/iobroker.${name.name}.svg?style=flat-square`);
                        setTimeout(getImages, 100, list, destination, callback);
                    }
                })
                .catch(error => {
                    console.error(`Cannot get URL "http://img.shields.io/npm/v/iobroker.${name.name}.svg?style=flat-square: ${error}`);
                    setTimeout(getImages, 100, list, destination, callback);
                });
        } else {
            setImmediate(getImages, list, destination, callback);
        }
    }
}

function getLicenses(list, destination, callback) {
    if (!list || !list.length) {
        callback && callback();
    } else {
        const name = list.pop();
        axios(`https://img.shields.io/github/license/${name}.svg?style=flat-square`, {responseType: 'arraybuffer'})
            .then(response =>  {
                if (response.data) {
                    fs.writeFile(`${destination}license-${name}.svg`, response.data, 'binary', err => {
                        err && console.error(`Cannot save file "${destination}license-${name}.svg: ${err}`);
                        setTimeout(() => getLicenses(list, destination, callback), 100);
                    });
                } else {
                    console.error(`Got empty file "http://img.shields.io/npm/v/iobroker.${name.name}.svg?style=flat-square`);
                    setTimeout(() => getLicenses(list, destination, callback), 100);
                }
            })
            .catch(error => {
                console.error(`Cannot get URL "http://img.shields.io/npm/v/iobroker.${name.name}.svg?style=flat-square: ${error}`);
                setTimeout(() => getLicenses(list, destination, callback), 100);
            });
    }
}

function getLogos(list, destination, callback) {
    if (!list || !list.length) {
        callback && callback();
    } else {
        const task = list.pop();
        axios(task.url, {responseType: 'arraybuffer'})
            .then(response =>  {
                if (response.data) {
                    fs.writeFile(destination + task.name, response.data, 'binary', err => {
                        if (err) {
                            console.error(`Cannot save file "${destination}${task.name}: ${err}`);
                        }
                        setTimeout(() => getLogos(list, destination, callback), 100);
                    });
                } else {
                    console.error(`Got empty URL "${task.url}`);
                    setTimeout(() => getLogos(list, destination, callback), 100);
                }
            })
            .catch(error => {
                console.error(`Cannot get URL "${task.url}: ${error}`);
                setTimeout(() => getLogos(list, destination, callback), 100);
            });
    }
}

function processRepository(data, argv, cb) {
    let output  = false;
    let waitEnd = 0;
    for (let a = 0; a < argv.length; a++) {
        if (argv[a] === '--latest') {
            output = true;
        } else
        if (argv[a] === '--stable') {
            output = true;
        } else
        if (argv[a] === '--json') {
            console.log(JSON.stringify(data, null, 2));
            output = true;
        }
        if (argv[a] === '--versions') {
            let count = 0;
            for (const v in data) {
                if (!data.hasOwnProperty(v) || v.startsWith('_')) {
                    continue;
                }
                console.log(`${++count}. ${v}: ${data[v].version}`);
            }
            output = true;
        } else
        if (argv[a] === '--list') {
            let count = 1;
            for (const b in data) {
                if (!data.hasOwnProperty(b) || b.startsWith('_')) {
                    continue;
                }
                if (typeof data[b].desc === 'object') {
                    console.log(`${count}. ${b}: ${data[b].desc.en}`);
                } else
                    console.log(`${count}. ${b}: ${data[b].desc}`);

                count++;
            }
            output = true;
        } else
        if (argv[a] === '--shortlist') {
            for (const s in data) {
                if (!data.hasOwnProperty(s) || s.startsWith('_')) {
                    continue;
                }
                console.log(s);
            }
            output = true;
        } else
        if (argv[a] === '--shields' && argv[a + 1]) {
            if (argv[a + 1][argv[a + 1].length - 1] !== '/') {
                argv[a + 1] += '/';
            }
            const list = [];
            for (const j in data) {
                if (!data.hasOwnProperty(j) || j.startsWith('_')) {
                    continue;
                }
                list.push({name: j, meta: data[j].meta});
            }
            waitEnd++;
            if (!fs.existsSync(argv[a + 1])) {
                fs.mkdirSync(argv[a + 1]);
            }

            getImages(list, argv[a + 1], () => !--waitEnd && cb && cb());
        } else
        if (argv[a] === '--logos' && argv[a + 1]) {
            if (argv[a + 1][argv[a + 1].length - 1] !== '/') {
                argv[a + 1] += '/';
            }
            const list = [];
            for (const i in data) {
                if (!data.hasOwnProperty(i) || i.startsWith('_')) {
                    continue;
                }
                list.push({url: data[i].extIcon, name: `logo-${i.toLowerCase()}.png`});
            }
            waitEnd++;
            if (!fs.existsSync(argv[a + 1])) {
                fs.mkdirSync(argv[a + 1]);
            }

            getLogos(list, argv[a + 1], () => !--waitEnd && cb && cb());
        } else
        if (argv[a] === '--licenses' && argv[a + 1]) {
            if (argv[a + 1][argv[a + 1].length - 1] !== '/') {
                argv[a + 1] += '/';
            }
            const _list = [];
            for (const l in data) {
                if (!data.hasOwnProperty(l) || l.startsWith('_')) {
                    continue;
                }
                // process: https://raw.githubusercontent.com/ioBroker/ioBroker.socketio/master/io-package.json
                const parts = data[l].meta.split('/');

                _list.push(parts[3] + '/' + parts[4]);
            }
            waitEnd++;
            if (!fs.existsSync(argv[a + 1])) {
                fs.mkdirSync(argv[a + 1]);
            }

            getLicenses(_list, argv[a + 1], () => !--waitEnd && cb && cb());
        }
    }
    !output && console.log(JSON.stringify(data, null, 2));
    !waitEnd && cb && cb();
}

if (module.exports && module.parent) {
    module.exports.getLogos          = getLogos;
    module.exports.getImages         = getImages;
    module.exports.processRepository = processRepository;
    module.exports.getStats          = getStats;
} else {
    // update both repositories
    const updatePublishes = require('./scripts').updatePublishes;

    // todo save old files and process only changes

    tools.getRepositoryFile(`https://raw.githubusercontent.com/${tools.appName}/${tools.appName}.repositories/master/sources-dist.json`, (err, latest) => {
        if (err) {
            console.error(err);
            if (!latest) {
                process.exit(1);
            }
        }
        if (!latest || !Object.keys(latest).length) {
            console.error('Something wrong with latest repo: empty');
            process.exit(1);
        }
        tools.getRepositoryFile(`https://raw.githubusercontent.com/${tools.appName}/${tools.appName}.repositories/master/sources-dist-stable.json`, latest, (err, stable) => {
            if (err) {
                console.error(err);
                if (!stable) {
                    process.exit(1);
                }
            }
            if (!stable || !Object.keys(stable).length) {
                console.error('Something wrong with stable repo: empty');
                process.exit(1);
            }
            getStats((err, stats) => {
                if (stats) {
                    for (const adapter in stats) {
                        if (!adapter.startsWith('_') && stats.hasOwnProperty(adapter) && stable[adapter]) {
                            stable[adapter].stat = stats[adapter];
                        }
                    }
                    for (const adapter in stats) {
                        if (!adapter.startsWith('_') && stats.hasOwnProperty(adapter) && latest[adapter]) {
                            latest[adapter].stat = stats[adapter];
                        }
                    }
                }

                // 2018.01.04 temporary fix for admin2. Remove it later
                for (const adapter in stable) {
                    if (!adapter.startsWith('_') && stable.hasOwnProperty(adapter) && typeof stable[adapter].title === 'object') {
                        stable[adapter].titleLang = stable[adapter].titleLang || stable[adapter].title;
                        stable[adapter].title     = stable[adapter].title.en  || stable[adapter].title.toString();
                    }
                }
                for (const adapter in latest) {
                    if (!adapter.startsWith('_') && latest.hasOwnProperty(adapter) && typeof latest[adapter].title === 'object') {
                        latest[adapter].titleLang = latest[adapter].titleLang || latest[adapter].title;
                        latest[adapter].title     = latest[adapter].title.en  || latest[adapter].title.toString();
                    }
                }

                // reset versionDate information
                for (const adapter in stable) {
                    if (!adapter.startsWith('_') && stable.hasOwnProperty(adapter) && stable[adapter].versionDate) {
                        delete stable[adapter].versionDate;
                    }
                }
                for (const adapter in latest) {
                    if (!adapter.startsWith('_') && latest.hasOwnProperty(adapter) && latest[adapter].versionDate) {
                        delete latest[adapter].versionDate;
                    }
                }

                updatePublishes((latest, stable) => {
                    // save latest
                    let pos = process.argv.indexOf('--latest');
                    if (pos !== -1 && process.argv[pos + 1]) {
                        // save stable
                        fs.writeFileSync(process.argv[pos + 1], JSON.stringify(latest, null, 2));
                    } else {
                        fs.writeFileSync(__dirname + '/../sources-dist.json', JSON.stringify(latest, null, 2));
                    }
                    fs.writeFileSync(__dirname + '/../sources-dist.old.json', JSON.stringify(latest, null, 2));

                    // save stable
                    pos = process.argv.indexOf('--stable');
                    if (pos !== -1 && process.argv[pos + 1]) {
                        // save stable
                        fs.writeFileSync(process.argv[pos + 1], JSON.stringify(stable, null, 2));
                    } else {
                        fs.writeFileSync(__dirname + '/../sources-dist-stable.json', JSON.stringify(stable, null, 2));
                    }
                    fs.writeFileSync(__dirname + '/../sources-dist-stable.old.json', JSON.stringify(latest, null, 2));

                    processRepository(latest, process.argv, () =>
                        process.exit());
                }, latest, stable);
            });
        });
    });
}
