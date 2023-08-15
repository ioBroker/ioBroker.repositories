'use strict';
const fs = require('fs');
const {
    addLabel,
    deleteLabel,
    getLabels,
    getGithub,
    getUrl,
} = require('./common');

function getPullRequestNumber() {
    if (process.env.GITHUB_REF && process.env.GITHUB_REF.match(/refs\/pull\/\d+\/merge/)) {
        const result = /refs\/pull\/(\d+)\/merge/g.exec(process.env.GITHUB_REF);
        if (!result) {
            throw new Error('Reference not found.');
        }
        return result[1];
    } else if (process.env.GITHUB_EVENT_PATH) {
        const event = JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
        return event.pull_request ? event.pull_request.number : (event.issue ? event.issue.number : '');
    } else {
        throw new Error('Reference not found. process.env.GITHUB_REF and process.env.GITHUB_EVENT_PATH are not set!');
    }
}

async function addLabels(prID, labels) {
    labels.forEach( l=> {
        console.log (`adding label ${l}`);
        addLabel( prID, [l])
    }) 
}

async function delLabels(prID, labels) {
    getLabels(prID)
        .then ( gl => labels.forEach( l=> gl.forEach( cgl => {
                    if (cgl.name === l) {
                        console.log (`deleting label ${l}`);
                        deleteLabel( prID, l)
                    } 
                }) 
            ) 
        )
}

async function doIt() {
    const prID = getPullRequestNumber();

    console.log(`Process PR ${prID}`);

    if (!prID) {
        console.error('Cannot find PR');
        return Promise.reject('Cannot find PR');
    }

    const files = await getGithub(`https://api.github.com/repos/ioBroker/ioBroker.repositories/pulls/${prID}/files`);

    let fileNames = [];
    files.forEach( f=>{fileNames.push(f.filename)});

    console.log('Files changed:');
    fileNames.forEach( f=>{console.log(`    ${f}`)});

    const isLatest = fileNames.includes('sources-dist.json');
    const isStable = fileNames.includes('sources-dist-stable.json')
    const fileCnt = fileNames.length;

    if ( fileCnt === 1 && isLatest) {
        console.log ('    is LATEST PR');
        await delLabels(prID, ['Stable', 'STABLE - brand new', 'CHANGES-BOTH-REPOSITORIES']);        
    } else if ( fileCnt === 1 && isStable) {
        console.log ('    is STABLE PR');
        await delLabels(prID, ['CHANGES-BOTH-REPOSITORIES']);        
        await addLabels(prID, ['Stable']);        
   } else if ( fileCnt === 2 && isLatest && isStable) {
        console.log ('    is DOUBLE PR');
        await delLabels(prID, ['Stable']);
        await addLabels(prID, ['CHANGES-BOTH-REPOSITORIES']);        
    } else if (fileCnt === 0 ) {
        console.log ('    is NOP PR');
        await delLabels(prID, ['Stable', 'STABLE - brand new', 'CHANGES-BOTH-REPOSITORIES']);        
    } else {
        console.log ('    is OTHER PR');
        await delLabels(prID, ['Stable', 'STABLE - brand new', 'CHANGES-BOTH-REPOSITORIES']);        
    }

    return 'done';
}

// activate for debugging purposes
// process.env.GITHUB_REF = 'refs/pull/2348/merge';
// process.env.OWN_GITHUB_TOKEN = 'insert token';
// process.env.GITHUB_EVENT_PATH = __dirname + '/../event.json';

console.log(`process.env.GITHUB_REF        = ${process.env.GITHUB_REF}`);
console.log(`process.env.GITHUB_EVENT_PATH = ${process.env.GITHUB_EVENT_PATH}`);
console.log(`process.env.OWN_GITHUB_TOKEN  = ${(process.env.OWN_GITHUB_TOKEN || '').length}`);

doIt()
    .then(result => console.log(result))
    .catch(e => console.error(e));
