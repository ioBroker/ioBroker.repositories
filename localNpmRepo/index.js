const express        = require('express');
const fs             = require('fs');
const os             = require('os');
const argv           = require('optimist').argv;
const createLocalNpm = require('local-npm/lib/index');
// --port=5081 --ip=192.168.1.1 --url=http://myURL:5080 --npmPort=5080

function getIpAddresses () {
    const ifaces = os.networkInterfaces();
    const result = [];
    for (const iface in ifaces) {
        if (!ifaces.hasOwnProperty(iface)) {
            continue;
        }
        const _iface = ifaces[iface];
        for (let alias = 0; alias < _iface.length; alias++) {
            const _alias = _iface[alias];

            if ('IPv4' !== _alias.family || _alias.internal !== false || _alias.address === 'localhost' || _alias.address === '127.0.0.1') {
                continue;
            }

            result.push(_alias.address);
        }
    }
    return result.length ? result : null;
}

const app     = express();
let ipAddr    = argv.ip;
const port    = argv.port    || 5081;
const npmPort = argv.npmPort || 5080;
let url       = argv.url || (`http://localhost:${npmPort}`);

if (!url.match(/:(\d+)\/?/)) {
    url = `${url.replace(/:$/, '')}:${npmPort}`;
}

if (!fs.existsSync(`${__dirname}/db`)) {
    console.error('No DB with npm packets found.');
    process.exit(1);
}

if (!fs.existsSync(`${__dirname}/public/sources-dist-stable.json`)) {
    console.error('please build first repository: npm i, gulp');
    process.exit(1);
}

if (!ipAddr) {
    const ip = getIpAddresses();
    if (!ip) {
        console.error('No IP addresses found!');
        process.exit(2);
    }
    if (ip.length >= 1) {
        console.warn(`More than one IP address found. Take first: ${ip[0]}`);
        ipAddr = ip[0];
    }
}

const file = require(__dirname + '/public/sources-dist-stable.json');
for (const a in file) {
    if (file.hasOwnProperty(a) && file[a].extIcon) {
        file[a].extIcon = `http://${ipAddr}:${port}${file[a].extIcon}`;
    }
}

app.get('/', (req, res) => res.json(file));
app.get('/sources-dist.json', (req, res) => res.json(file));
app.get('/sources-dist-stable.json', (req, res) => res.json(file));
app.use('/imgs', express.static(`${__dirname}/public/imgs`));

app.listen(port, () => {
    console.log(`Repo started on http://${ipAddr}:${port}`);
    console.log(`http://${ipAddr}:${port}/sources-dist.json`);
});

// start local npm
const localNpm = createLocalNpm({
    port:           npmPort,
    pouchPort:      16984,
    logLevel:       'error',
    remote:         'https://registry.npmjs.org',
    remoteSkim:     'https://replicate.npmjs.com',
    url:            url,
    directory:      `${__dirname}/db`
});

console.log(`To activate this repository, write: "npm set registry http://${ipAddr}:${npmPort}" on the system, where you want to install ioBroker.`);
console.log('To use normal npm again, write "npm set registry https://registry.npmjs.org"');
console.log(`Add additional repository after the install of ioBroker: "iobroker repo addset http://${ipAddr}:${port}/sources-dist.json"`);