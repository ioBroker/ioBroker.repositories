const express = require('express');
const fs      = require('fs');
const os      = require('os');
const argv    = require('optimist').argv;
// --port=3000 --ip=192.168.1.1

function getIpAddresses () {
    let ifaces = os.networkInterfaces();
    let result = [];
    for (let iface in ifaces) {
        if (!ifaces.hasOwnProperty(iface)) continue;
        let _iface = ifaces[iface];
        for (let alias = 0; alias < _iface.length; alias++) {
            let _alias = _iface[alias];

            if ('IPv4' !== _alias.family || _alias.internal !== false) {
                continue;
            }

            result.push(_alias.address);
        }
    }
    return result.length ? result : null;
}

let app    = express();
let ipAddr = argv.ip;
let port   = argv.port || 3000;

if (!fs.existsSync(__dirname + '/public/sources-dist.json')) {
    console.error('please build first repository: npm i, gulp createStableRepo');
    process.exit(1);
}

if (!ipAddr) {
    let ip = getIpAddresses();
    if (!ip) {
        console.error('No IP addresses found!');
        process.exit(2);
    }
    if (ip.length > 1) {
        console.warn('More than one IP address found. Take firts: ' + ip[0]);
        ipAddr = ip[0];
    }
}

let file = require(__dirname + '/public/sources-dist.json');
for (let a in file) {
    if (file.hasOwnProperty(a) && file[a].extIcon) {
        file[a].extIcon = 'http://' + ipAddr + ':' + port + file[a].extIcon;
    }
}

app.get('/', function (req, res) {
    res.json(file);
});
app.get('/sources-dist.json', function (req, res) {
    res.json(file);
});
app.get('/sources-dist-stable.json', function (req, res) {
    res.json(file);
});
app.use('/imgs', express.static(__dirname + '/public/imgs'));

app.listen(port, function () {
    console.log('Repo started on http://' + ipAddr + ':' + port);
    console.log('http://' + ipAddr + ':' + port + '/sources-dist.json');
});

// start local npm
let localNpm = require('local-npm/lib/index')({
    port:           5080,
    pouchPort:      16984,
    logLevel:       'error',
    remote:         'https://registry.npmjs.org',
    remoteSkim:     'https://replicate.npmjs.com',
    url:            'http://127.0.0.1:5080',
    directory:      __dirname + '/db'
});