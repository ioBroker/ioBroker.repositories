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

gulp.task('activateLocalNpm', function (done) {
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
                localNpm.shutdown();
                console.log('npm set registry remote...');
                exec('npm set registry https://registry.npmjs.org', function (err, stdout, stderr) {
                    if (err) {
                        console.error(err);
                        process.exit(1);
                    } else {
                        console.log('npm set registry remote DONE');
                    }
                    done();
                });
            });
        });
    });
});

gulp.task('clean', function (){
    return del([
        'db/**/*',
        // here we use a globbing pattern to match everything inside the `mobile` folder
        'ioBroker/node_modules/**/*'
    ]);
});

gulp.task('createStableRepo', function (done) {
    fs.readFileSync(__dirname + '/../sources-dist-stable.json', function (err, resp, body) {
        let latest = JSON.parse(body);
        tools.getRepositoryFile(__dirname + '/../sources-dist-stable.json', latest, function (err, data) {
            if (err) {
                console.error(err);
                process.exit(1);
            }
            // get all icons
            let list = [];
            for (let i in data) {
                if (!data.hasOwnProperty(i)) continue;
                list.push({url: data[i].extIcon, name: 'logo-' + i.toLowerCase() + '.png'});
                data[i].extIcon = '%%LOCAL_SERVER%%/imgs/logo-' + i.toLowerCase() + '.png';
            }

            if (!fs.existsSync(__dirname + '/public')) {
                fs.mkdirSync(__dirname + '/public');
            }
            if (!fs.existsSync(__dirname + '/public/imgs')) {
                fs.mkdirSync(__dirname + '/public/imgs');
            }

            getLogos(list, __dirname + '/public/imgs/', function () {
                fs.writeFileSync(__dirname + '/public/sources-dist-stable.json', JSON.stringify(data, null, 2));
                fs.writeFileSync(__dirname + '/public/sources-dist.json', JSON.stringify(data, null, 2));

                done();
            });
        });
    });
});

gulp.task('default', ['clean', 'activateLocalNpm']);