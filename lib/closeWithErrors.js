'use strict';
const fs = require('node:fs');
const { addComment, closePR, getLabels, getAllComments, lockIssue } = require('./common');

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

    const labelIsSet = await checkLabel(prID, 'CLOSE (checks contain errors)');
    console.log(`label "CLOSE (checks contain errors)" is ${labelIsSet ? '' : 'NOT '}set.`);

    if (!labelIsSet) {
        console.log('Label is not set, nothing to do.');
        return 'done';
    }

    const gitComments = await getAllComments(prID);
    const exists = gitComments.find(comment =>
        comment.body.includes('### Automatic checks have reported errors'),
    );
    console.log(`close-with-errors comment ${exists ? 'exists' : 'does NOT exist.'}`);

    if (!exists) {
        let body = `German text below / Deutscher Text weiter unten\n\n`;

        body += `### Automatic checks have reported errors\n\n`;

        body += `Automatic repository checks have reported several errors for this adapter. Please see the previous comment. `;
        body += `Most likely an issue has been created within the adapter repository too, listing these errors. `;
        body += `This PR will be closed.\n\n`;

        body += `**THANKS a lot for spending your time to develop an adapter for ioBroker.**\n\n`;

        body += `But please note that fixing the errors reported is mandatory for the adapter to be reviewed. So ...\n\n`;

        body += `- Please fix all errors reported.\n`;
        body += `- Please try to fix all warnings as far as possible.\n`;
        body += `- Please review all suggestions.\n\n`;

        body += `After fixing the errors / warnings, please perform a verification that all errors are fixed by using the repository checker at `;
        body += `www.iobroker.net and by commenting \`@iobroker-bot recheck\` at the checker issue within the repository. `;
        body += `Verify that all errors are fixed.\n\n`;

        body += `**DO NOT CREATE A NEW PR UNLESS ALL ERRORS ARE FIXED**\n\n`;

        body += `In addition, please verify that the adapter uses the standard test-and-release.yml workflow as created by the create-adapter command. `;
        body += `This workflow is also available at the ioBroker.examples repository. `;
        body += `Please note that standard test scripts provided in directory ./test and standard testing commands contained within package.json `;
        body += `are also mandatory for an adapter to be accepted at the repository.\n\n`;

        body += `**Please ask at our development channels at Telegram or Discord if you have any questions, some errors are not clear or you need any other help.** `;
        body += `Invite links are available at https://www.iobroker.dev. `;
        body += `(Telegram starters channel can be reached here: https://t.me/+gsX-e8k4mLtmZjZk. Developers will help for sure there.)\n\n`;

        body += `---\n\n`;

        body += `### Automatische Prüfungen haben Fehler gemeldet\n\n`;

        body += `Automatische Repository-Überprüfungen haben mehrere Fehler für diesen Adapter gemeldet. Bitte den vorherigen Kommentar beachten. `;
        body += `Höchstwahrscheinlich wurde auch ein Issue im Adapter-Repository erstellt, das diese Fehler auflistet. `;
        body += `Dieser PR wird geschlossen.\n\n`;

        body += `**HERZLICHEN DANK für die aufgewendete Zeit zur Entwicklung eines Adapters für ioBroker.**\n\n`;

        body += `Bitte beachten, dass die Behebung der gemeldeten Fehler zwingend erforderlich ist, damit der Adapter überprüft werden kann. Daher ...\n\n`;

        body += `- Bitte alle gemeldeten Fehler beheben.\n`;
        body += `- Bitte alle Warnungen so weit wie möglich beheben.\n`;
        body += `- Bitte alle Vorschläge prüfen.\n\n`;

        body += `Nach der Behebung der Fehler / Warnungen bitte eine Überprüfung durchführen, ob alle Fehler behoben sind, indem der Repository-Checker unter `;
        body += `www.iobroker.net verwendet und \`@iobroker-bot recheck\` als Kommentar im Checker-Issue des Repositories hinterlassen wird. `;
        body += `Bitte überprüfen, dass alle Fehler behoben sind.\n\n`;

        body += `**BITTE KEINEN NEUEN PR ERSTELLEN, BEVOR ALLE FEHLER BEHOBEN SIND**\n\n`;

        body += `Bitte zusätzlich überprüfen, dass der Adapter den Standard test-and-release.yml Workflow verwendet, wie er vom create-adapter Befehl erstellt wird. `;
        body += `Dieser Workflow ist auch im ioBroker.examples Repository verfügbar. `;
        body += `Bitte beachten, dass auch Standard-Testskripte im Verzeichnis ./test und Standard-Testbefehle in der package.json `;
        body += `zwingend erforderlich sind, damit ein Adapter in das Repository aufgenommen wird.\n\n`;

        body += `**Bei Fragen, unklaren Fehlermeldungen oder sonstigem Hilfebedarf stehen die Entwicklungskanäle auf Telegram oder Discord zur Verfügung.** `;
        body += `Einladungslinks sind unter https://www.iobroker.dev zu finden. `;
        body += `(Der Telegram Starter-Kanal ist hier erreichbar: https://t.me/+gsX-e8k4mLtmZjZk. Dort wird sicher geholfen.)\n`;

        try {
            console.log(`adding close-with-errors comment to PR ${prID}`);
            await addComment(prID, body);
        } catch (e) {
            console.error(`warning: cannot add comment to PR ${prID}:`);
            console.log(`           ${e}`);
        }
    }

    try {
        console.log(`closing PR ${prID}`);
        await closePR(prID);
    } catch (e) {
        console.error(`warning: cannot close PR ${prID}:`);
        console.log(`           ${e}`);
    }

    try {
        console.log(`locking PR ${prID}`);
        await lockIssue(prID);
    } catch (e) {
        console.error(`warning: cannot lock PR ${prID}:`);
        console.log(`           ${e}`);
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
