'use strict';
const fs = require('node:fs');
const {
    addComment,
    deleteComment,
    getLabels,
    getAllComments,
} = require('./common');

function getPullRequestNumber() {
    if (process.env.GITHUB_REF && process.env.GITHUB_REF.match(/refs\/pull\/\d+\/merge/)) {
        const result = /refs\/pull\/(\d+)\/merge/g.exec(process.env.GITHUB_REF);
        if (!result) {
            throw new Error('Reference not found.');
        }
        return result[1];
    }
    if (process.env.GITHUB_EVENT_PATH) {
        const event = JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
        return event.pull_request ? event.pull_request.number : (event.issue ? event.issue.number : '');
    }

    throw new Error('Reference not found. process.env.GITHUB_REF and process.env.GITHUB_EVENT_PATH are not set!');
}

async function checkLabel(prID, label) {
    const lbls = await getLabels(prID);
    for ( const lbl of lbls) {
        console.log (`checking "${lbl.name}"`);
        if (lbl.name === label) {
            return true;
        }
    }
    return false;
}

async function doIt() {
    const prID = getPullRequestNumber();

    console.log(`Process PR ${prID}`);

    if (!prID) {
        console.error('Cannot find PR');
        return Promise.reject('Cannot find PR');
    }

    const labelIsSet = await checkLabel (prID, 'new at LATEST');
    console.log (`label new at LATEST is ${labelIsSet ? '' : 'NOT '}set.`);

    const gitComments = await getAllComments(prID);
    let exists = gitComments.find(comment => comment.body.includes('## ioBroker repository information about New at LATEST tagging'));
    console.log (`informational comment ${labelIsSet ? 'exists' : 'does NOT exist.'}`);

    if (exists && !labelIsSet) {
        try {
            console.log(`deleting comment ${exists.id} from PR ${prID}`);
            await deleteComment(prID, exists.id);
        } catch (e) {
            console.error(`warning: cannot delete comment from PR ${prID}:`);
            console.log(`           ${e}`);
        }
    }

    if (!exists && labelIsSet) {
        let body = `## ioBroker repository information about New at LATEST tagging\n\n`;

        body += `Thanks for spending your time and providing a new adapter for ioBroker.\n\n`;

        body += `Your adapter will get a manual review as soon as possible. Please stand by - this might last one or two weeks. `;
        body += `Feel free to continue your work and create new releases. `;
        body += `You do NOT need to close or update this PR in case of new releases.\n\n`;

        body += `In the meantime please check any feedback issues logged by automatic adapter checker and try to fix them. `
        body += `And please check the following information if not yet done:\n`;

        body += `- https://github.com/ioBroker/ioBroker.repositories?tab=readme-ov-file#requirements-for-adapter-to-get-added-to-the-latest-repository\n`;
        body += `- https://github.com/ioBroker/ioBroker.repositories?tab=readme-ov-file#development-and-coding-best-practices\n`;
        body += `- https://github.com/iobroker-community-adapters/responsive-design-initiative/tree/main#responsive-design-initiative\n`;

        body += `\n\n`;
        body += `**Important:**\n`;
        body += `\n`;
        body += `To verify the object structure of this adapter during REVIEW please export the object structure of a working installation `;
        body += `and attach the file to this PR. You find a guide how to export the object struture here: `;
        body += `https://github.com/ioBroker/ioBroker.repochecker/blob/master/OBJECTDUMP.md\n`;

        body += `\n\n`;
        body += `You will find the results of the review and eventually issues / suggestions as a comment to this PR. `;
        body += `So please keep this PR watched.\n\n`;

        body += `If you have any urgent questions feel free to ask.\n`;
        body += `mcm1957\n\n`;
        
        body += `@simatec Please take a look in respect to responsive design. Thanks\n\n`;
        
        try {
            console.log(`adding information comment to PR ${prID}`);
            await addComment(prID, body);
        } catch (e) {
            console.error(`warning: cannot add comment to PR ${prID}:`);
            console.log(`           ${e}`);
        };
    }

    return 'done';
}

// activate for debugging purposes
// process.env.GITHUB_REF = 'refs/pull/2725/merge';
// process.env.OWN_GITHUB_TOKEN = 'insert token';
// process.env.GITHUB_EVENT_PATH = __dirname + '/../event.json';

console.log(`process.env.GITHUB_REF        = ${process.env.GITHUB_REF}`);
console.log(`process.env.GITHUB_EVENT_PATH = ${process.env.GITHUB_EVENT_PATH}`);
console.log(`process.env.OWN_GITHUB_TOKEN  = ${(process.env.OWN_GITHUB_TOKEN || '').length}`);

doIt()
    .then(result => console.log(result))
    .catch(e => console.error(e));
