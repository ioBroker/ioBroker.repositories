const gulp    = require('gulp');
const fs      = require('fs');
const exec    = require('child_process').exec;
const del     = require('del');
const request = require('request');

if (!fs.existsSync(__dirname + '/tools.js')) {
    fs.writeFileSync(__dirname + '/tools.js', fs.readFileSync(__dirname + '/../lib/tools.js'));
}

const tools = require(__dirname + '/tools.js');

function getLogos(list, destination, callback) {
    if (!list || !list.length) {
        callback && callback();
    } else {
        const task = list.pop();
        console.log('Get ' + task.url + '...');
        request.get({url: task.url, encoding: 'binary'}, (error, response, body) => {
            if (!error && body) {
                fs.writeFile(destination + task.name, body, 'binary', err => {
                    if (err) {
                        console.error('Cannot save file "' + destination + task.name + ': ' + err);
                    }
                    setTimeout(() => {
                        getLogos(list, destination, callback);
                    }, 100);
                });
            } else {
                console.error('Cannot get URL "' + task.url + ':' + error);
                setTimeout(() => {
                    getLogos(list, destination, callback);
                }, 100);
            }
        });
    }
}

function createRepo(done) {
    const stable     = require(__dirname + '/../sources-dist-stable.json');
    const packStable = Object.assign({}, require(__dirname + '/packageProd.json'));

    // update versions

    // process stable repo
    packStable.dependencies =  {
        'node-gyp': '*'
    };

    for (const a in stable) {
        if (stable.hasOwnProperty(a)) {
            packStable.dependencies['iobroker.' + a] = stable[a].version;
        }
    }

    if (!fs.existsSync(__dirname + '/public')) {
        fs.mkdirSync(__dirname + '/public');
    }
    if (!fs.existsSync(__dirname + '/ioBroker')) {
        fs.mkdirSync(__dirname + '/ioBroker');
    }

    fs.writeFileSync(__dirname + '/public/sources-dist-stable.json', JSON.stringify(stable, null, 2));
    fs.writeFileSync(__dirname + '/ioBroker/package-stable.json',    JSON.stringify(packStable, null, 2));

    tools.getRepositoryFile(__dirname + '/public/sources-dist-stable.json', (err, data) => {
        if (err) {
            console.error(err);
            process.exit(1);
        }
        // get all icons
        const list = [];
        for (const i in data) {
            if (!data.hasOwnProperty(i) || !data[i].extIcon) continue;
            list.push({url: data[i].extIcon, name: 'logo-' + i.toLowerCase() + '.png'});
            data[i].extIcon = '/imgs/logo-' + i.toLowerCase() + '.png';
        }


        if (!fs.existsSync(__dirname + '/public/imgs')) {
            fs.mkdirSync(__dirname + '/public/imgs');
        }

        console.log('Get images...');
        getLogos(list, __dirname + '/public/imgs/', () => {
            fs.writeFileSync(__dirname + '/public/sources-dist-stable.json', JSON.stringify(data, null, 2));
            done();
        });
    });
}

function callInstall(done) {
    exec('npm i --production --ignore-scripts', {
        cwd: __dirname + '/ioBroker'
    }, err => {
        if (err) {
            console.error(err);
            process.exit(1);
        } else {
            console.log('install all packages DONE');
        }
        done();
    });
}

function activateLocalNpm(done) {
    // npm cache clean
    console.log('Clean cache...');
    exec('npm cache clean --force', (err, stdout, stderr) => {
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
        exec('npm set registry http://127.0.0.1:5080', err => {
            if (err) {
                console.error(err);
                process.exit(1);
            } else {
                console.log('npm set registry local DONE');
            }
            // start local npm
            const localNpm = require('local-npm/lib/index')({
                port: 5080,
                pouchPort: 16984,
                logLevel: 'error',
                remote: 'https://registry.npmjs.org',
                remoteSkim: 'https://replicate.npmjs.com',
                url: 'http://127.0.0.1:5080',
                directory: __dirname + '/db'
            });

            console.log('install all latest packages...');
            fs.writeFileSync(__dirname + '/ioBroker/package.json', fs.readFileSync(__dirname + '/ioBroker/package-stable.json'));
            callInstall(() => {
                // work with result
                console.log('npm set registry remote...');
                exec('npm set registry https://registry.npmjs.org', err => {
                    if (err) {
                        console.error(err);
                        process.exit(1);
                    } else {
                        console.log('npm set registry remote DONE');
                    }
                    console.log('Now you can zip: zip -r ../localNpm.zip ../localNpmRepo');
                    localNpm.shutdown(); // something calls process exit inside
                    done();
                });
            });
        });
    });
}

gulp.task('activateLocalNpmOnly', activateLocalNpm);

gulp.task('createRepoOnly', createRepo);

gulp.task('0-clean', function () {
    return del([
        'db/**/*',
        'ioBroker/**/*',
        'public/**/*'
    ]);
});

gulp.task('1-createRepo', ['0-clean'], createRepo);

gulp.task('2-activateLocalNpm', ['1-createRepo'], activateLocalNpm);

gulp.task('default', ['0-clean', '1-createRepo', '2-activateLocalNpm']);