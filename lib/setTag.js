'use strict';

const execSync = require('node:child_process').execSync;

const {
//    addComment,
//    addLabel,
//    getGithub,
    getUrl,
//    getAllComments,
//    deleteComment
} = require('./common');

async function getNpmMeta( pAdapter ) {
  return await getUrl(`https://registry.npmjs.org/iobroker.${pAdapter}`);
};

async function getNpmDistTags(pAdapter) {
  const npmMeta = await getNpmMeta( pAdapter );
  return npmMeta['dist-tags'];
}

async function doIt() {

    const npmTags=await getNpmDistTags(`${process.env.INPUT_ADAPTER}`);
    const npmRelease = npmTags[`${process.env.INPUT_TAG}`] || '0.0.0';
    const targetRelease = `${process.env.INPUT_RELEASE}`;

    if (targetRelease === npmRelease) {
        console.log (`iobroker.${process.env.INPUT_ADAPTER} ${targetRelease} correctly tagged as ${process.env.INPUT_TAG}`)
    } else {
        if (npmRelease === '0.0.0') {
            console.log (`iobroker.${process.env.INPUT_ADAPTER} does not provide a tag ${process.env.INPUT_TAG}`)
        }
        console.log (`iobroker.${process.env.INPUT_ADAPTER} ${targetRelease} need to be tagged as ${process.env.INPUT_TAG}`)
        console.log( `executing npm --//registry.npmjs.org/:_authToken=*** dist-tag add iobroker.${process.env.INPUT_ADAPTER}@${targetRelease} ${process.env.INPUT_TAG}`);
        const cmd = `npm --//registry.npmjs.org/:_authToken=${process.env.NPM_TOKEN} dist-tag add iobroker.${process.env.INPUT_ADAPTER}@${targetRelease} ${process.env.INPUT_TAG}`;
        try {
            const result=execSync( cmd, { encoding: 'utf-8' });
            console.log(result);
        } catch (_e) {
            // console.log (JSON.stringify(e));
        }
    }

    return 'done';
}

// activate for debugging purposes
//process.env.GITHUB_REF = 'refs/pull/2298/merge';
//process.env.OWN_GITHUB_TOKEN = 'add-token-here';
//process.env.GITHUB_EVENT_PATH = __dirname + '/../event.json';

console.log(`process.env.OWN_GITHUB_TOKEN  = ${(process.env.OWN_GITHUB_TOKEN || '').length}`);
console.log(`process.env.NPM_TOKEN         = ${(process.env.NPM_TOKEN || '').length}`);
console.log(`process.env.INPUT_TAG         = ${(process.env.INPUT_TAG || '')}`);
console.log(`process.env.INPUT_ADAPTER     = ${(process.env.INPUT_ADAPTER || '')}`);
console.log(`process.env.INPUT_RELEASE     = ${(process.env.INPUT_RELEASE || '')}`);

doIt()
    .then(result => console.log(result))
    .catch(e => console.error(e));
