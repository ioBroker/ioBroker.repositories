import fs from 'node:fs';
import { addComment, deleteComment, deleteLabel, getLabels, getAllComments } from './common';

const LABEL_OK = 'rd-checked ✔';
const LABEL_FAILED = 'rd-checked ❌';

// hidden markers used to identify comments created by this workflow
const MARKER_OK = '<!-- rd-checked-ok -->';
const MARKER_FAILED = '<!-- rd-checked-failed -->';

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
        return event.pull_request ? event.pull_request.number : event.issue ? event.issue.number : '';
    }

    throw new Error('Reference not found. process.env.GITHUB_REF and process.env.GITHUB_EVENT_PATH are not set!');
}

async function checkLabel(prID: string, label: string) {
    const lbls = await getLabels(prID);
    for (const lbl of lbls) {
        console.log(`checking "${lbl.name}"`);
        if (lbl.name === label) {
            return true;
        }
    }
    return false;
}

function getOkBody() {
    let body = `${MARKER_OK}\n`;
    body += `:white_check_mark: Responsive check for adminUI was successful.\n`;
    return body;
}

function getFailedBody() {
    let body = `${MARKER_FAILED}\n`;
    body += `:x: Responsive check for adminUI was not successful.\n\n`;
    body += `Please check and correct responsive design of adminUI. `;
    body += `A guide can be found at the following repository: `;
    body += `https://github.com/iobroker-community-adapters/responsive-design-initiative. `;
    body += `Testing is described here: `;
    body += `https://github.com/iobroker-community-adapters/responsive-design-initiative/blob/main/developer_guide_optimizing_responsive_design.md\n`;
    return body;
}

async function doIt() {
    const prID = getPullRequestNumber();

    console.log(`Process PR ${prID}`);

    if (!prID) {
        console.error('Cannot find PR');
        return Promise.reject('Cannot find PR');
    }

    const okLabelIsSet = await checkLabel(prID, LABEL_OK);
    const failedLabelIsSet = await checkLabel(prID, LABEL_FAILED);
    console.log(`label "${LABEL_OK}" is ${okLabelIsSet ? '' : 'NOT '}set.`);
    console.log(`label "${LABEL_FAILED}" is ${failedLabelIsSet ? '' : 'NOT '}set.`);

    const gitComments = await getAllComments(prID);
    const okComment = gitComments.find((comment: any) => comment.body.includes(MARKER_OK));
    const failedComment = gitComments.find((comment: any) => comment.body.includes(MARKER_FAILED));
    console.log(`RD-OK comment ${okComment ? 'exists' : 'does NOT exist'}.`);
    console.log(`RD-FAILED comment ${failedComment ? 'exists' : 'does NOT exist'}.`);

    async function removeComment(comment: any, name: string) {
        if (!comment) {
            return;
        }
        try {
            console.log(`deleting ${name} comment ${comment.id} from PR ${prID}`);
            await deleteComment(prID, comment.id);
        } catch (e) {
            console.error(`warning: cannot delete ${name} comment from PR ${prID}:`);
            console.log(`           ${e}`);
        }
    }

    async function createComment(body: string, name: string) {
        try {
            console.log(`adding ${name} comment to PR ${prID}`);
            await addComment(prID, body);
        } catch (e) {
            console.error(`warning: cannot add ${name} comment to PR ${prID}:`);
            console.log(`           ${e}`);
        }
    }

    async function removeLabel(label: string) {
        try {
            console.log(`removing label "${label}" from PR ${prID}`);
            await deleteLabel(prID, encodeURIComponent(label));
        } catch (e) {
            console.error(`warning: cannot remove label "${label}" from PR ${prID}:`);
            console.log(`           ${e}`);
        }
    }

    if (okLabelIsSet) {
        // 'rd-checked ✔' present: ensure RD-OK comment, drop RD-FAILED comment and 'rd-checked ❌' label
        await removeComment(failedComment, 'RD-FAILED');
        if (!okComment) {
            await createComment(getOkBody(), 'RD-OK');
        }
        if (failedLabelIsSet) {
            await removeLabel(LABEL_FAILED);
        }
    } else if (failedLabelIsSet) {
        // 'rd-checked ❌' present (and 'rd-checked ✔' not): ensure RD-FAILED comment, drop RD-OK comment
        await removeComment(okComment, 'RD-OK');
        if (!failedComment) {
            await createComment(getFailedBody(), 'RD-FAILED');
        }
    } else {
        // none of the labels present: remove any existing comments
        await removeComment(okComment, 'RD-OK');
        await removeComment(failedComment, 'RD-FAILED');
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
