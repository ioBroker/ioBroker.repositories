'use strict';
const fs = require('node:fs');
const { addComment, deleteComment, deleteLabel, getLabels, getAllComments } = require('../src/common.mts');

const LABEL_REQUEST = 'ai-precheck ?';
const LABEL_DONE = 'ai-prechecked ✔';

// hidden markers used to identify comments created by this workflow
const MARKER_REQUEST = '<!-- ai-precheck-request -->';
const MARKER_THANKS = '<!-- ai-prechecked-thanks -->';

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

async function checkLabel(prID, label) {
    const lbls = await getLabels(prID);
    for (const lbl of lbls) {
        console.log(`checking "${lbl.name}"`);
        if (lbl.name === label) {
            return true;
        }
    }
    return false;
}

function getRequestBody() {
    let body = `${MARKER_REQUEST}\n`;
    body += `*This comment is also available in German below. / Dieser Kommentar ist auch auf Deutsch weiter unten verfügbar.*\n\n`;
    body += `---\n\n`;

    body += `Dear developer,\n\n`;
    body += `If you are using an AI-supported development environment, please consider performing a pre-check of your adapter using AI support. `;
    body += `The following skill can be used with *Claude* to perform a first review of your adapter. `;
    body += `Please fix all findings as far as possible, but keep in mind that Claude or any other AI might be wrong and detect findings which are at least unusual. `;
    body += `So it is completely fine to comment on findings if you think they are incorrect.\n\n`;

    body += `You may use this skill:\n`;
    body += `https://github.com/iobroker-bot-orga/myClaude/blob/main/Skills/review-adapter-for-io-broker/SKILL.md\n\n`;

    body += `The skill should trigger when using this prompt:\n`;
    body += `\`Review adapter ADAPTER-URL\`\n\n`;

    body += `It is recommended to attach the latest object dump to the session, although it should not be required.\n\n`;

    body += `Please attach the final report created after fixing the detected issues.\n\n`;

    body += `A normal review will be performed anyway, but things will be faster and a pre-review will likely save some time, `;
    body += `as it is likely that one or more review passes can be avoided.\n\n`;

    body += `> [!NOTE]\n`;
    body += `> **Please note:**\n`;
    body += `> Performing such a pre-review is not required — it is only requested as help to reduce the review workload. `;
    body += `It is not required that you use AI if you do not use it already. A normal review will start anyway as soon as time allows.\n\n`;

    body += `---\n\n`;

    body += `Liebe Entwicklerin, lieber Entwickler,\n\n`;
    body += `Wenn du eine KI-unterstützte Entwicklungsumgebung verwendest, würden wir dich bitten, eine Vorprüfung deines Adapters mit KI-Unterstützung durchzuführen. `;
    body += `Der folgende Skill kann mit *Claude* verwendet werden, um eine erste Überprüfung deines Adapters durchzuführen. `;
    body += `Bitte behebe alle gefundenen Probleme so weit wie möglich, aber beachte, dass Claude oder eine andere KI falsch liegen und Dinge als ungewöhnlich einstufen kann. `;
    body += `Es ist also völlig in Ordnung, Befunde zu kommentieren, wenn du der Meinung bist, dass sie falsch sind.\n\n`;

    body += `Du kannst diesen Skill verwenden:\n`;
    body += `https://github.com/iobroker-bot-orga/myClaude/blob/main/Skills/review-adapter-for-io-broker/SKILL.md\n\n`;

    body += `Der Skill sollte mit folgendem Prompt ausgelöst werden:\n`;
    body += `\`Review adapter ADAPTER-URL\`\n\n`;

    body += `Es wird empfohlen, den aktuellen Objekt-Dump der Session beizufügen, obwohl dies nicht zwingend erforderlich ist.\n\n`;

    body += `Bitte füge den abschließenden Bericht, der nach der Behebung der erkannten Probleme erstellt wurde, diesem PR bei.\n\n`;

    body += `Eine normale Überprüfung wird in jedem Fall durchgeführt, aber die Dinge werden schneller gehen und eine Vorprüfung wird wahrscheinlich Zeit sparen, `;
    body += `da es wahrscheinlich ist, dass ein oder mehrere Überprüfungsdurchläufe vermieden werden können.\n\n`;

    body += `> [!NOTE]\n`;
    body += `> **Bitte beachte:**\n`;
    body += `> Die Durchführung einer solchen Vorprüfung ist nicht erforderlich — sie wird nur als Hilfe zur Reduzierung des Überprüfungsaufwands gebeten. `;
    body += `Es ist nicht erforderlich, dass du KI verwendest, wenn du das ohnehin nicht tust. Eine normale Überprüfung wird in jedem Fall gestartet, sobald es die Zeit erlaubt.\n`;

    return body;
}

async function doIt() {
    const prID = getPullRequestNumber();

    console.log(`Process PR ${prID}`);

    if (!prID) {
        console.error('Cannot find PR');
        return Promise.reject('Cannot find PR');
    }

    const requestLabelIsSet = await checkLabel(prID, LABEL_REQUEST);
    const doneLabelIsSet = await checkLabel(prID, LABEL_DONE);
    console.log(`label "${LABEL_REQUEST}" is ${requestLabelIsSet ? '' : 'NOT '}set.`);
    console.log(`label "${LABEL_DONE}" is ${doneLabelIsSet ? '' : 'NOT '}set.`);

    const gitComments = await getAllComments(prID);
    const requestComment = gitComments.find(comment => comment.body.includes(MARKER_REQUEST));
    const thanksComment = gitComments.find(comment => comment.body.includes(MARKER_THANKS));
    console.log(`ai-precheck request comment ${requestComment ? 'exists' : 'does NOT exist'}.`);
    console.log(`ai-prechecked thanks comment ${thanksComment ? 'exists' : 'does NOT exist'}.`);

    async function removeComment(comment, name) {
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

    async function createComment(body, name) {
        try {
            console.log(`adding ${name} comment to PR ${prID}`);
            await addComment(prID, body);
        } catch (e) {
            console.error(`warning: cannot add ${name} comment to PR ${prID}:`);
            console.log(`           ${e}`);
        }
    }

    async function removeLabel(label) {
        try {
            console.log(`removing label "${label}" from PR ${prID}`);
            await deleteLabel(prID, encodeURIComponent(label));
        } catch (e) {
            console.error(`warning: cannot remove label "${label}" from PR ${prID}:`);
            console.log(`           ${e}`);
        }
    }

    if (doneLabelIsSet) {
        // 'ai-prechecked ✔' present: remove request comment, remove 'ai-precheck ?' label, add thank-you comment
        await removeComment(requestComment, 'ai-precheck-request');
        if (requestLabelIsSet) {
            await removeLabel(LABEL_REQUEST);
        }
        if (!thanksComment) {
            await createComment(`${MARKER_THANKS}\nThanks for performing a pre-review!`, 'ai-prechecked-thanks');
        }
    } else if (requestLabelIsSet) {
        // 'ai-precheck ?' present: add request comment if not already there
        if (!requestComment) {
            await createComment(getRequestBody(), 'ai-precheck-request');
        }
    } else {
        // neither label present: remove request comment if it exists
        await removeComment(requestComment, 'ai-precheck-request');
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
