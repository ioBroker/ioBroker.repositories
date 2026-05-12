'use strict';
const assert = require('node:assert');
const fs = require('node:fs');
const axios = require('axios');
let latest;
let stable;
// let axiosCounter = 0;

console.log(`OWN_GITHUB_TOKEN: ${process.env.OWN_GITHUB_TOKEN}`);
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

const reservedAdapterNames = ['config', 'system', 'alias', 'design', 'all', 'self'];

describe('Test Repository', () => {
    it('Test Repository: latest', done => {
        const text = fs.readFileSync(`${__dirname}/../sources-dist.json`);
        try {
            latest = JSON.parse(text);
        } catch (e) {
            assert.equal(e, null, 'Error parsing sources-dist.json');
        }
        done();
    });

    it('Test Repository: stable', done => {
        const text = fs.readFileSync(`${__dirname}/../sources-dist-stable.json`);
        try {
            stable = JSON.parse(text);
        } catch (e) {
            assert.equal(e, null, 'Error parsing sources-dist-stable.json');
        }
        done();
    });

    it('Check reserved names', done => {
        stable ||= require('../sources-dist-stable.json');
        latest ||= require('../sources-dist.json');
        // check stable names
        let id = Object.keys(stable).find(id =>
            reservedAdapterNames.includes(id.replace('iobroker.', '').replace('ioBroker.')),
        );
        assert.ok(!id, `Found reserved name in stable: ${id}`);
        // check the latest names
        id = Object.keys(latest).find(id =>
            reservedAdapterNames.includes(id.replace('iobroker.', '').replace('ioBroker.')),
        );
        assert.ok(!id, `Found reserved name in latest: ${id}`);
        done();
    });

    it('Test Repository: compare types', async () => {
        stable ||= require('../sources-dist-stable.json');
        latest ||= require('../sources-dist.json');

        for (const id in stable) {
            if (Object.prototype.hasOwnProperty.call(stable, id) && id !== '_repoInfo') {
                assert.equal(id, id.toLowerCase(), `Adapter id ${id} is not lowercase`);
                assert.notEqual(latest[id], undefined, `${id} not in latest but in stable`);
                assert.notEqual(latest[id].type, undefined, `${id} missing type in latest`);
                assert.notEqual(latest[id].type, '', `${id} has empty type in latest`);
                assert.equal(latest[id].type, stable[id].type, `${id} type mismatch: latest(${latest[id].type}) vs stable(${stable[id].type})`);
            }
        }
        // compare types with io-package.json
        const len = Object.keys(latest).length;
        let i = 0;
        for (const id in latest) {
            if (Object.prototype.hasOwnProperty.call(latest, id) && id !== '_repoInfo') {
                assert.equal(id, id.toLowerCase(), `Adapter id ${id} is not lowercase`);
                if (latest[id].meta?.match(/io-package\.json$/)) {
                    const response = await request(latest[id].meta);
                    console.log(`[${i}/${len}] Check ${id}`);
                    const pack = response.data;
                    if (pack?.common && pack.common.type !== latest[id].type) {
                        console.error(`Types in "${id}" are not equal: ${pack.common.type} !== ${latest[id].type}`);
                    }
                }
            }
            i++;
        }
    }).timeout(1200000);

    it('Test Repository: Versions in latest', done => {
        latest ||= require('../sources-dist.json');
        for (const name in latest) {
            if (!Object.prototype.hasOwnProperty.call(latest, name) || name === '_repoInfo') {
                continue;
            }
            /*assert.ok(latest[name].published, `${name} missing published date`);

            if (new Date(latest[name].published).toString() === 'Invalid Date') {
                console.error(`Adapter ${name} has invalid published date: "${latest[name].published}"`);
            }

            assert.notEqual(new Date(latest[name].published).toString(), 'Invalid Date', `${name} has invalid published date`);

            if (new Date(latest[name].versionDate).toString() === 'Invalid Date') {
                console.error(`Adapter ${name} has invalid versionDate: "${latest[name].versionDate}"`);
            }

            assert.ok(latest[name].versionDate, `${name} missing versionDate`);
            assert.notEqual(new Date(latest[name].versionDate).toString(), 'Invalid Date', `${name} has invalid versionDate`);
*/
            assert.ok(latest[name].meta, `${name} missing meta in latest`);
            assert.ok(!latest[name].meta.match(/\s/), `${name} meta has spaces in latest`);

            if (name !== 'js-controller') {
                if (!latest[name].icon) {
                    console.error(`Adapter ${name} has no icon in latest`);
                }
                assert.ok(latest[name].icon, `${name} missing icon in latest`);
                assert.ok(!latest[name].icon.match(/\s/), `${name} icon has spaces in latest`);
            }
        }
        done();
    });

    it('Test Repository: Versions in stable', done => {
        stable ||= require('../sources-dist-stable.json');
        for (const name in stable) {
            if (!Object.prototype.hasOwnProperty.call(stable, name) || name === '_repoInfo') {
                continue;
            }
            /*if (new Date(stable[name].published).toString() === 'Invalid Date') {
                console.error(`Adapter ${name} has invalid published: "${stable[name].published}"`);
            }
            assert.ok(stable[name].published, `${name} missing published date in stable`);
            assert.notEqual(new Date(stable[name].published).toString(), 'Invalid Date', `${name} has invalid published date in stable`);

            if (new Date(stable[name].versionDate).toString() === 'Invalid Date') {
                console.error(`Adapter ${name} has invalid versionDate: "${stable[name].versionDate}"`);
            }
            assert.ok(stable[name].versionDate, `${name} missing versionDate in stable`);
            assert.notEqual(new Date(stable[name].versionDate).toString(), 'Invalid Date', `${name} has invalid versionDate in stable`);
*/
            if (!stable[name].version) {
                console.error(`Adapter ${name} has no version in stable`);
            }
            assert.ok(stable[name].version, `${name} missing version in stable`);
            assert.ok(!stable[name].version.match(/\s/), `${name} version has spaces in stable`);

            assert.ok(stable[name].meta, `${name} missing meta in stable`);
            assert.ok(!stable[name].meta.match(/\s/), `${name} meta has spaces in stable`);

            if (name !== 'js-controller') {
                if (!stable[name].icon) {
                    console.error(`Adapter ${name} has no icon in stable`);
                }

                assert.ok(stable[name].icon, `${name} missing icon in stable`);
                assert.ok(!stable[name].icon.match(/\s/), `${name} icon has spaces in stable`);
            }
        }
        done();
    });

    it('Test Repository: Compare stable and latest', done => {
        stable ||= require('../sources-dist-stable.json');
        latest ||= require('../sources-dist.json');
        for (const name in stable) {
            if (!Object.prototype.hasOwnProperty.call(stable, name) || name === '_repoInfo') {
                continue;
            }

            if (!latest[name]) {
                console.error(`Adapter ${name} is in stable but not in latest`);
            }
            // latest must have all stable adapters and more unstable
            assert.ok(latest[name], `${name} is in stable but not in latest`);

            assert.strictEqual(latest[name].meta, stable[name].meta, `${name} meta mismatch stable vs latest`);
            assert.strictEqual(latest[name].icon, stable[name].icon, `${name} icon mismatch stable vs latest`);
            assert.strictEqual(latest[name].type, stable[name].type, `${name} type mismatch stable vs latest`);
        }

        done();
    });

    it('Test Repository: check latest vs. stable', done => {
        stable ||= require('../sources-dist-stable.json');
        latest ||= require('../sources-dist.json');
        console.log();
        for (const id in latest) {
            if (
                Object.prototype.hasOwnProperty.call(latest, id) &&
                !Object.prototype.hasOwnProperty.call(stable, id) &&
                id !== '_repoInfo'
            ) {
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
            if (!Object.prototype.hasOwnProperty.call(repos, id) || id === '_repoInfo') {
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
                if (res.common.name !== id && id !== 'admin') {
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
                } catch (err) {
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
        latest ||= require('../sources-dist.json');
        await checkRepos('latest', latest);
    }).timeout(3600000);

    it('Test all Packages in stable are loadable via http and name is equal to io-package.json are ', async () => {
        stable ||= require('../sources-dist-stable.json');
        await checkRepos('stable', stable);
    }).timeout(3600000);
});
