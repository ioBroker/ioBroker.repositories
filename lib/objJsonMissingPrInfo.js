'use strict';
const fs = require('node:fs');
const { addComment, deleteComment, getLabels, getAllComments } = require('./common');

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

async function doIt() {
    const prID = getPullRequestNumber();

    console.log(`Process PR ${prID}`);

    if (!prID) {
        console.error('Cannot find PR');
        return Promise.reject('Cannot find PR');
    }

    const labelIsSet = await checkLabel(prID, 'obj-json missing');
    console.log(`label obj-json missing is ${labelIsSet ? '' : 'NOT '}set.`);

    const gitComments = await getAllComments(prID);
    let exists = gitComments.find(comment =>
        comment.body.includes('### object dump is missing'),
    );
    console.log(`informational comment ${exists ? 'exists' : 'does NOT exist.'}`);

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
        let body = `This PR comment contains information in English and German. / Dieser PR-Kommentar enthält Informationen auf Englisch und Deutsch.\n`;
        body += `The German translation is provided below. / Die deutsche Übersetzung ist weiter unten zu finden.\n\n`;

        body += `### object dump is missing\n\n`;

        body += `Please process the request specified at comment "ioBroker repository information about New at LATEST tagging" earlier:\n\n`;

        body += `To verify the object structure of this adapter during REVIEW please export the object structure of a working installation `;
        body += `and attach the file to this PR. You find a guide how to export the object struture here: `;
        body += `https://github.com/ioBroker/ioBroker.repochecker/blob/master/OBJECTDUMP.md. `;
        body += `The data must be attached as a file named "adaptername.0.json". `;
        body += `Do not paste the export directly into your comment as this will prohibit automatic processing.\n\n`;

        body += `Review will not be stated as long as object dump is missing.\n\n`;

        body += `Thanks for your cooperation.\n\n`;

        body += `---\n\n`;

        body += `### Objektexport fehlt\n\n`;

        body += `Bitte bearbeite die Anforderung, die im Kommentar "ioBroker repository information about New at LATEST tagging" beschrieben wurde:\n\n`;

        body += `Um die Objektstruktur dieses Adapters während des REVIEWs zu überprüfen, exportiere bitte die Objektstruktur einer funktionierenden Installation `;
        body += `und füge die Datei diesem PR bei. Eine Anleitung zum Exportieren der Objektstruktur findest du hier: `;
        body += `https://github.com/ioBroker/ioBroker.repochecker/blob/master/OBJECTDUMP_de.md. `;
        body += `Die Daten müssen als Datei mit dem Namen "adaptername.0.json" angehängt werden. `;
        body += `Füge den Export NICHT direkt in deinen Kommentar ein, da dies die automatische Verarbeitung verhindert.\n\n`;

        body += `Das Review wird nicht gestartet, solange der Objektexport fehlt.\n\n`;

        body += `Vielen Dank für deine Mitarbeit.\n\n`;

        try {
            console.log(`adding information comment to PR ${prID}`);
            await addComment(prID, body);
        } catch (e) {
            console.error(`warning: cannot add comment to PR ${prID}:`);
            console.log(`           ${e}`);
        }
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
