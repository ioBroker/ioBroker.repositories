const gulp    = require('gulp');
const fs      = require('fs');
const exec    = require('child_process').exec;
const del     = require('del');
const request = require('request');
const tools   = require(__dirname + '/../lib/tools.js');

function getLogos(list, destination, callback) {
    if (!list || !list.length) {
        callback && callback();
    } else {
        let task = list.pop();
        console.log('Get ' + task.url + '...');
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

function createStableRepo(done) {
    let latest = require(__dirname + '/../sources-dist.json');
    let stable = require(__dirname + '/../sources-dist-stable.json');
    let pack   = require(__dirname + '/packageProd.json');
    for (let a in stable) {
        if (stable.hasOwnProperty(a)) {
            if (pack.dependencies['iobroker.' + a]) {
                pack.dependencies['iobroker.' + a] = stable[a].version;
            } else {
                delete stable[a];
            }
        }
    }
    if (!fs.existsSync(__dirname + '/public')) {
        fs.mkdirSync(__dirname + '/public');
    }    // update versions
    if (!fs.existsSync(__dirname + '/ioBroker')) {
        fs.mkdirSync(__dirname + '/ioBroker');
    }

    fs.writeFileSync(__dirname + '/public/sources-dist-stable.json', JSON.stringify(stable, null, 2));

    fs.writeFileSync(__dirname + '/ioBroker/package.json', JSON.stringify(pack, null, 2));

    tools.getRepositoryFile(__dirname + '/public/sources-dist-stable.json', latest, function (err, data) {
        if (err) {
            console.error(err);
            process.exit(1);
        }
        // get all icons
        let list = [];
        for (let i in data) {
            if (!data.hasOwnProperty(i) || !data[i].extIcon) continue;
            list.push({url: data[i].extIcon, name: 'logo-' + i.toLowerCase() + '.png'});
            data[i].extIcon = '/imgs/logo-' + i.toLowerCase() + '.png';
        }


        if (!fs.existsSync(__dirname + '/public/imgs')) {
            fs.mkdirSync(__dirname + '/public/imgs');
        }

        console.log('Get images...');
        getLogos(list, __dirname + '/public/imgs/', function () {
            fs.writeFileSync(__dirname + '/public/sources-dist-stable.json', JSON.stringify(data, null, 2));
            fs.writeFileSync(__dirname + '/public/sources-dist.json', JSON.stringify(data, null, 2));

            done();
        });
    });
}

function activateLocalNpm(done) {
    // npm cache clean
    console.log('Clean cache...');
    exec('npm cache clean', function (err, stdout, stderr) {
        if (err) {
            console.error(err);
            process.exit(1);
        } else {
            console.log('Clean cache DONE');
        }
        if (stderr) console.error(stderr);
        console.log(stdout);
        console.log(stderr);
        if (!fs.existsSync(__dirname + '/db')) {
            fs.mkdirSync(__dirname + '/db');
        }
        // set to local npm
        console.log('npm set registry local...');
        exec('npm set registry http://127.0.0.1:5080', function (err, stdout, stderr) {
            if (err) {
                console.error(err);
                process.exit(1);
            } else {
                console.log('npm set registry local DONE');
            }
            // start local npm
            let localNpm = require('local-npm/lib/index')({
                port: 5080,
                pouchPort: 16984,
                logLevel: 'error',
                remote: 'https://registry.npmjs.org',
                remoteSkim: 'https://replicate.npmjs.com',
                url: 'http://127.0.0.1:5080',
                directory: __dirname + '/db'
            });

            console.log('install all packages...');
            exec('npm i --production --ignore-scripts', {
                cwd: __dirname + '/ioBroker'
            }, function (err, stdout, stderr) {
                if (err) {
                    console.error(err);
                    process.exit(1);
                } else {
                    console.log('install all packages DONE');
                }

                // work with result
                console.log('npm set registry remote...');
                exec('npm set registry https://registry.npmjs.org', function (err, stdout, stderr) {
                    if (err) {
                        console.error(err);
                        process.exit(1);
                    } else {
                        console.log('npm set registry remote DONE');
                    }
                    localNpm.shutdown(); // something calls process exit inside
                    done();
                });
            });
        });
    });
}

gulp.task('activateLocalNpmOnly', activateLocalNpm);

gulp.task('createStableRepoOnly', createStableRepo);

gulp.task('0-clean', function () {
    return del([
        'db/**/*',
        // here we use a globbing pattern to match everything inside the `mobile` folder
        'ioBroker/**/*',
        'public/**/*'
    ]);
});

gulp.task('1-createStableRepo', ['0-clean'], createStableRepo);

gulp.task('2-activateLocalNpm', ['1-createStableRepo'], activateLocalNpm);

gulp.task('default', ['0-clean', '1-createStableRepo', '2-activateLocalNpm']);