'use strict';
let expect    = require('chai').expect;
const fs      = require('fs');
const request = require('request');
const rq      = require('request-promise-native');
let latest;
let stable;

describe('Test Repository', function () {
    it('Test Repository: latest', done => {
        let text = fs.readFileSync(__dirname + '/../sources-dist.json');
        try {
            latest = JSON.parse(text);
        } catch (e) {
            expect(e).to.be.null;
        }
        done();
    });

    it('Test Repository: stable', done => {
        let text = fs.readFileSync(__dirname + '/../sources-dist-stable.json');
        try {
            stable = JSON.parse(text);
        } catch (e) {
            expect(e).to.be.null;
        }
        done();
    });

    it('Test Repository: compare types', async () => {
        for (let id in stable) {
            if (stable.hasOwnProperty(id)) {
                expect(id).to.be.equal(id.toLowerCase());
                expect(latest[id], id + ' not in latest but in stable').to.be.not.undefined;
                expect(latest[id].type).to.be.not.undefined;
                expect(latest[id].type).to.be.not.equal('');
                expect(latest[id].type).to.be.equal(stable[id].type);
            }
        }
        // compare types with io-package.json
        const len = Object.keys(latest).length;
        let i = 0;
        for (let id in latest) {
            if (latest.hasOwnProperty(id)) {
                expect(id).to.be.equal(id.toLowerCase());
                if (latest[id].meta && latest[id].meta.match(/io-package\.json$/)) {
                    const pack = await rq(latest[id].meta, {method: 'GET', json: true});
                    console.log(`[${i}/${len}] Check ${id}`);
                    if (pack && pack.common && pack.common.type !== latest[id].type) {
                        console.error('Types in "' + id + '" are not equal: ' + pack.common.type  + ' !== ' + latest[id].type);
                    }
                }
            }
            i++;
        }
    }).timeout(360000);

    it('Test Repository: check latest vs. stable', done => {
        console.log();
        for (let id in latest) {
            if (latest.hasOwnProperty(id) && !stable.hasOwnProperty(id)) {
                console.log('Info: Adapter "' + id + '" is not in stable.')
            }
        }
        done();
    });
	
	async function checkRepos(name, repos) {
		let error = false;
        const len = Object.keys(repos).length;
        let i = 0;
		for (let id in repos) {
		    if (!repos.hasOwnProperty(id)) continue;
			let repo = repos[id];
            console.log(`${name}: [${i}/${len}] Check ${id}`);

			try {
				let res = await rq(repo.meta, {method: 'GET', json: true});
				if (res.common.name !== id && id !== 'admin' && id !== 'admin-2') {
					console.error('adapter names are not equal: ' + id  + ' !== ' + res.common.name);
					error = true;
				}
				if (res.common.type !== repo.type) {
					console.info('adapter types are not equal in ' + id  + ': ' + repo.type + ' !== ' + res.common.type);
				}
			} catch(err){
				console.error('Meta of adapter ' + id + ': ' + repo.meta + ' not getable');
				error = true;
			}
			if (repo.icon) {
				try {
					let res = await rq(repo.icon, { method: 'GET', json: true });
				} catch(err){
					console.error('Icon of adapter ' + id + ': ' + repo.icon + ' not getable');
					error = true;
				}
			}
			//console.info('done with adapter ' + id);
            i++;
        }
		if (error) {
            throw 'Error occured, see console output';
        }
	}
	
	it('Test all Packages in latest are loadable via http and name is equal to io-package.json are ', async () =>
        await checkRepos('latest', latest)
    ).timeout(360000);
	
	it('Test all Packages in stable are loadable via http and name is equal to io-package.json are ', async () =>
        await checkRepos('stable', stable)
    ).timeout(360000);

});
