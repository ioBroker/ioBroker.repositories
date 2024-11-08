'use strict';
const execSync = require('node:child_process').execSync;

const {
    getUrl,
} = require('./common');

const ADAPTER_LIST = [
  'admin',
  'discovery',
  'js-controller',
  'backitup'
];

async function getStableRepo() {
    return await getUrl('https://raw.githubusercontent.com/ioBroker/ioBroker.repositories/master/sources-dist-stable.json');
}

async function getNpmMeta( pAdapter ) {
  return await getUrl(`https://registry.npmjs.org/iobroker.${pAdapter}`);
}

async function getNpmDistTags(pAdapter) {
  const npmMeta = await getNpmMeta( pAdapter );
  return npmMeta['dist-tags'];
}

async function doIt() {
    const stable = await getStableRepo();
    for (const adapter in stable) {
        if (ADAPTER_LIST.includes(adapter)) {
	        console.log (`\nchecking ${adapter} ...`);

            const npmTags = await getNpmDistTags(adapter);
            const repoRelease = stable[adapter].version;
            const npmRelease = npmTags.stable;
            //console.log( `repo: ${repoRelease} - npm: ${npmRelease}`);
            if (repoRelease === npmRelease) {
                console.log (`${adapter} ${repoRelease} correctly tagged as stable`)
            } else {
                console.log (`${adapter} ${repoRelease} need to be tagged as stable`);
                console.log( `executing npm --//registry.npmjs.org/:_authToken=*** dist-tag add iobroker.${adapter}@${repoRelease} stable`);
                const cmd = `npm --//registry.npmjs.org/:_authToken=${process.env.NPM_TOKEN} dist-tag add iobroker.${adapter}@${repoRelease} stable`;
                try {
                    const result = execSync(cmd, { encoding: 'utf-8' });
                    console.log(result);
                } catch (_e) {
                    // console.log (JSON.stringify(e));
                }
            }
        }
    }

    return 'done';
}

// activate for debugging purposes
//process.env.GITHUB_REF = 'refs/pull/2298/merge';
//process.env.OWN_GITHUB_TOKEN = 'add-token-here';
//process.env.GITHUB_EVENT_PATH = __dirname + '/../event.json';

//console.log(`process.env.GITHUB_REF        = ${process.env.GITHUB_REF}`);
//console.log(`process.env.GITHUB_EVENT_PATH = ${process.env.GITHUB_EVENT_PATH}`);
console.log(`process.env.OWN_GITHUB_TOKEN  = ${(process.env.OWN_GITHUB_TOKEN || '').length}`);
console.log(`process.env.NPM_TOKEN         = ${(process.env.NPM_TOKEN || '').length}`);

doIt()
    .then(result => console.log(result))
    .catch(e => console.error(e));
