'use strict';
//const fs = require('fs');
const execSync = require('child_process').execSync;

const {
//    addComment,
//    addLabel,
//    getGithub,
    getUrl,
//    getAllComments,
//    deleteComment
} = require('./common');

const STABLE_JSON = 'sources-dist-stable.json';
const ADAPTER_LIST = [
  'admin',
  'discovery',
  'js-controller',
  'backitup'
];

async function getStableRepo() {
    return await getUrl('http://repo.iobroker.live/sources-dist.json');
}

async function getNpmMeta( pAdapter ) {
  return await getUrl(`https://registry.npmjs.org/iobroker.${pAdapter}`);
};

async function getNpmDisttags(pAdapter) {
  const npmMeta = await getNpmMeta( pAdapter );
  return npmMeta['dist-tags'];
};

function getPullRequestNumber() {
    if (process.env.GITHUB_REF && process.env.GITHUB_REF.match(/refs\/pull\/\d+\/merge/)) {
        const result = /refs\/pull\/(\d+)\/merge/g.exec(process.env.GITHUB_REF);
        if (!result) {
            console.log ('GITHUB_REF not found or not parseable.');
            return null;
        }
        return result[1];
    } else if (process.env.GITHUB_EVENT_PATH) {
        const event = JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
        return event.pull_request ? event.pull_request.number : (event.issue ? event.issue.number : '');
    } else {
        console.log ('GITHUB_REF and process.env.GITHUB_EVENT_PATH are not set!');
        return null;
    }
}

async function doIt() {

    const prID = getPullRequestNumber();
    console.log(`Process PR ${prID}`);

    if (prID) {
        const files = await getGithub(`https://api.github.com/repos/ioBroker/ioBroker.repositories/pulls/${prID}/files`);
        console.log('Files changed:');
        files.forEach( f=>{console.log(`    ${f}`)});
        const isStable = files.includes(`${STABLE_JSON}`)
        if (!isStable)
        {
            return 'No changes to stable repository detected';
    	}
    } else {
	  console.log(`scanning ${STABLE_JSON} ...`);
    }

    const stable=await getStableRepo();
    for (const adapter in stable) {
        if (ADAPTER_LIST.includes( adapter )) {
	        console.log (`\nchecking ${adapter} ...`);

            const npmTags=await getNpmDisttags(adapter);
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
                    const result=execSync( cmd, { encoding: 'utf-8' });
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

console.log(`process.env.GITHUB_REF        = ${process.env.GITHUB_REF}`);
console.log(`process.env.GITHUB_EVENT_PATH = ${process.env.GITHUB_EVENT_PATH}`);
console.log(`process.env.OWN_GITHUB_TOKEN  = ${(process.env.OWN_GITHUB_TOKEN || '').length}`);
console.log(`process.env.NPM_TOKEN         = ${(process.env.NPM_TOKEN || '').length}`);

doIt()
    .then(result => console.log(result))
    .catch(e => console.error(e));
