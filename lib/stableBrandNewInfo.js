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

    const labelIsSet = await checkLabel (prID, 'STABLE - brand new');
    console.log (`label STABLE - BRAND NEW is ${labelIsSet ? '' : 'NOT '}set.`);

    const gitComments = await getAllComments(prID);
    let exists = gitComments.find(comment => comment.body.includes('## ioBroker repository information about STABLE-BRAND-NEW tagging'));
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
        let body = `## ioBroker repository information about STABLE-BRAND-NEW tagging\n\n`;
        body += `Your PR has been tagged with the label STABLE - BRAND NEW. This indicates that the release requested to be added to the `;
        body += `stable repository seems to be too young for immediate processing.\n\n`;
        body += `Normally, a release should be available at LATEST repository for at least one or two weeks without any serious issues `;
        body += `detected within this timeframe. Your release seems to be younger than 7 days.`;
        body += `Your PR will be kept in evidence and will be merged approximately one week after creation of the release without any further `;
        body += `action required by you.\n\n`;
        body += `**IMPORTANT:**\n`;
        body += `Of course, it is possible to release a new version immediately if it is a hotfix for a serious problem, i.e. some errors `;
        body += `cause adapter crashes or incompatible api changes of external websites blocking normal usage. In this case, `;
        body += `please indicate this fact as a comment and mention mcm1957 and eventually Apollon77 explicitly. Please describe the reason `;
        body += `(i.e. by referencing an issue). Hotfixes should minimize the changes, even dependency updates should be avoided if `;
        body += `not related to the fix. New functionality and major (breaking) updates are most likely never a hotfix.\n\n`;
        body += `Please note that ANY (even hotfixes) should be available at latest repository for at least 1 day and have some (few) installations `;
        body += `to avoid hotfixes with serious problems at stable repository. Exceptions to this minimal delay must be discussed `;
        body += `individually.\n\n`;
        body += `Feel free to contact me (mcm1957) if you have any more questions.`;
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
