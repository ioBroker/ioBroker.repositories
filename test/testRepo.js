'use strict';
const expect = require('chai').expect;
const fs     = require('fs');
const axios  = require('axios');
let latest;
let stable;
let axiosCounter = 0;

console.log( `OWN_GITHUB_TOKEN: ${process.env.OWN_GITHUB_TOKEN}`);
// axios.defaults.headers = {
//     'Authorization': process.env.OWN_GITHUB_TOKEN ? `token ${process.env.OWN_GITHUB_TOKEN}` : 'none',
// };
if (process.env.OWN_GITHUB_TOKEN) {
    axios.defaults.headers.common['Authorization'] = `Bearer ${process.env.OWN_GITHUB_TOKEN}`;
}

async function request(url) {
    // axiosCounter++;
    // if (axiosCounter % 5) {
    //     await new Promise(resolve => setTimeout(resolve, 300));
    // }
    await new Promise(resolve => setTimeout(resolve, 1000));
    return axios(url);
}

const reservedAdapterNames = [
    'config',
    'system',
    'alias',
    'design',
    'all',
    'self',
];

describe('Test Repository', () => {
    it('Test Repository: latest', done => {
        const text = fs.readFileSync(__dirname + '/../sources-dist.json');
        try {
            latest = JSON.parse(text);
        } catch (e) {
            expect(e).to.be.null;
        }
        done();
    });

    it('Test Repository: stable', done => {
        const text = fs.readFileSync(__dirname + '/../sources-dist-stable.json');
        try {
            stable = JSON.parse(text);
        } catch (e) {
            expect(e).to.be.null;
        }
        done();
    });

    it('Check reserved names', done => {
        stable = stable || require('../sources-dist-stable.json');
        latest = latest || require('../sources-dist.json');
        // check stable names
        let id = Object.keys(stable).find(id => reservedAdapterNames.includes(id.replace('iobroker.', '').replace('ioBroker.')));
        expect(id).to.be.not.ok;
        // check latest names
        id = Object.keys(latest).find(id => reservedAdapterNames.includes(id.replace('iobroker.', '').replace('ioBroker.')));
        expect(id).to.be.not.ok;
        done();
    });

    it('Test Repository: compare types', async () => {
        stable = stable || require('../sources-dist-stable.json');
        latest = latest || require('../sources-dist.json');

        for (const id in stable) {
            if (stable.hasOwnProperty(id) && id !== '_repoInfo') {
                expect(id).to.be.equal(id.toLowerCase());
                expect(latest[id], `${id} not in latest but in stable`).to.be.not.undefined;
                expect(latest[id].type).to.be.not.undefined;
                expect(latest[id].type).to.be.not.equal('');
                expect(latest[id].type).to.be.equal(stable[id].type);
            }
        }
        // compare types with io-package.json
        const len = Object.keys(latest).length;
        let i = 0;
        for (const id in latest) {
            if (latest.hasOwnProperty(id) && id !== '_repoInfo') {
                expect(id).to.be.equal(id.toLowerCase());
                if (latest[id].meta && latest[id].meta.match(/io-package\.json$/)) {
                    const response = await request(latest[id].meta);
                    console.log(`[${i}/${len}] Check ${id}`);
                    const pack = response.data;
                    if (pack && pack.common && pack.common.type !== latest[id].type) {
                        console.error(`Types in "${id}" are not equal: ${pack.common.type} !== ${latest[id].type}`);
                    }
                }
            }
            i++;
        }
    }).timeout(1200000);

    it('Test Repository: Versions in latest', done => {
        latest = latest || require('../sources-dist.json');
        for (const name in latest) {
            if (!latest.hasOwnProperty(name) || name === '_repoInfo') {
                continue;
            }
            /*expect(!!latest[name].published).to.be.true;

            if (new Date(latest[name].published).toString() === 'Invalid Date') {
                console.error(`Adapter ${name} has invalid published date: "${latest[name].published}"`);
            }

            expect(new Date(latest[name].published).toString()).to.be.not.equal('Invalid Date');

            if (new Date(latest[name].versionDate).toString() === 'Invalid Date') {
                console.error(`Adapter ${name} has invalid versionDate: "${latest[name].versionDate}"`);
            }

            expect(!!latest[name].versionDate).to.be.true;
            expect(new Date(latest[name].versionDate).toString()).to.be.not.equal('Invalid Date');
*/
            expect(!!latest[name].meta).to.be.true;
            expect(!latest[name].meta.match(/\s/)).to.be.true;

            if (name !== 'js-controller') {
                if (!latest[name].icon) {
                    console.error(`Adapter ${name} has no icon in latest`);
                }
                expect(!!latest[name].icon).to.be.true;
                expect(!latest[name].icon.match(/\s/)).to.be.true;
            }
        }
        done();
    });

    it('Test Repository: Versions in stable', done => {
        stable = stable || require('../sources-dist-stable.json');
        for (const name in stable) {
            if (!stable.hasOwnProperty(name) || name === '_repoInfo') {
                continue;
            }
            /*if (new Date(stable[name].published).toString() === 'Invalid Date') {
                console.error(`Adapter ${name} has invalid published: "${stable[name].published}"`);
            }
            expect(!!stable[name].published).to.be.true;
            expect(new Date(stable[name].published).toString()).to.be.not.equal('Invalid Date');

            if (new Date(stable[name].versionDate).toString() === 'Invalid Date') {
                console.error(`Adapter ${name} has invalid versionDate: "${stable[name].versionDate}"`);
            }
            expect(!!stable[name].versionDate).to.be.true;
            expect(new Date(stable[name].versionDate).toString()).to.be.not.equal('Invalid Date');
*/
            if (!stable[name].version) {
                console.error(`Adapter ${name} has no version in stable`);
            }
            expect(!!stable[name].version).to.be.true;
            expect(!stable[name].version.match(/\s/)).to.be.true;

            expect(!!stable[name].meta).to.be.true;
            expect(!stable[name].meta.match(/\s/)).to.be.true;

            if (name !== 'js-controller') {
                if (!stable[name].icon) {
                    console.error(`Adapter ${name} has no icon in stable`);
                }

                expect(!!stable[name].icon).to.be.true;
                expect(!stable[name].icon.match(/\s/)).to.be.true;
            }
        }
        done();
    });

    it('Test Repository: Compare stable and latest', done => {
        stable = stable || require('../sources-dist-stable.json');
        latest = latest || require('../sources-dist.json');
        for (const name in stable) {
            if (!stable.hasOwnProperty(name) || name === '_repoInfo') {
                continue;
            }

            if (!latest[name]) {
                console.error(`Adapter ${name} is in stable but not in latest`);
            }
            // latest must have all stable adapters and more unstable
            expect(!!latest[name]).to.be.true;

            expect(latest[name].meta).to.be.equal(stable[name].meta);
            expect(latest[name].icon).to.be.equal(stable[name].icon);
            expect(latest[name].type).to.be.equal(stable[name].type);
        }

        done();
    });

    it('Test Repository: check latest vs. stable', done => {
        stable = stable || require('../sources-dist-stable.json');
        latest = latest || require('../sources-dist.json');
        console.log();
        for (const id in latest) {
            if (latest.hasOwnProperty(id) && !stable.hasOwnProperty(id) && id !== '_repoInfo') {
                console.log(`Info: Adapter "${id}" is not in stable.`);
            }
        }
        done();
    });

    const cache = {};

    async function checkRepos(name, repos) {
        let error = false;
        const len = Object.keys(repos).length;
        let i = 0;
        for (const id in repos) {
            if (!repos.hasOwnProperty(id) || id === '_repoInfo') {
                continue;
            }
            const repo = repos[id];
            console.log(`${name}: [${i}/${len}] Check ${id}`);

            try {
                if (!cache[repo.meta]) {
                    const response = await request(repo.meta);
                    cache[repo.meta] = response.data;
                }
                const res = cache[repo.meta];
                if (res.common.name !== id && id !== 'admin' && id !== 'admin-2') {
                    console.error(`adapter names are not equal: ${id} !== ${res.common.name}`);
                    error = true;
                }
                if (res.common.type !== repo.type) {
                    console.info(`adapter types are not equal in ${id}: ${repo.type} !== ${res.common.type}`);
                }
            } catch (err) {
                console.error(`Meta of adapter ${id}: ${repo.meta} not gettable - ${err}`);
                error = true;
            }
            if (repo.icon && !cache[repo.icon]) {
                try {
                    await request(repo.icon);
                    cache[repo.icon] = true;
                } catch(err){
                    console.error(`Icon of adapter ${id}: ${repo.icon} not gettable - ${err}`);
                    error = true;
                }
            }
            //console.info('done with adapter ' + id);
            i++;
        }
        if (error) {
            throw 'Error occurred, see console output';
        }
    }

    it('Test all Packages in latest are loadable via http and name is equal to io-package.json are ', async () => {
        latest = latest || require('../sources-dist.json');
        await checkRepos('latest', latest);
    }).timeout(3600000);

    it('Test all Packages in stable are loadable via http and name is equal to io-package.json are ', async () => {
        stable = stable || require('../sources-dist-stable.json');
        await checkRepos('stable', stable)
    }).timeout(3600000);
});
