'use strict';
const fs = require('node:fs');
const {
    addLabel,
    createLabel,
    deleteLabel,
    updateLabel,
    getLabels,
    getAllComments,
    getGithub,
} = require('./common');

const usedLabels = [];

function getPullRequestNumber() {
    if (process.env.GITHUB_REF && process.env.GITHUB_REF.match(/refs\/pull\/\d+\/merge/)) {
        const result = /refs\/pull\/(\d+)\/merge/g.exec(process.env.GITHUB_REF);
        if (result) {
            return result[1];
        }
    }
    if (process.env.GITHUB_EVENT_PATH) {
        const event = JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
        return event.pull_request ? event.pull_request.number : (event.issue ? event.issue.number : '');
    }

    return '';
}

async function cleanupLabels(){
    let labels = await getLabels('');
    labels.forEach( (l)=> { 
        const result = /^(\d?\d)\.(\d?\d)\.(\d\d\d\d)$/g.exec(l.name);
        if (result) {
            let targetTs=new Date(result[3], result[2]-1, result[1], 0, 0, 0).getTime();
            const nowTs = new Date().getTime();
            if ( nowTs > targetTs + 2* 24*60*60*1000) {
                if (usedLabels.includes( l.name )) {
                    console.log(`    ${l.name} is outdated but still in use`);
                }
                else {
                    console.log(`    ${l.name} is outdated and will be removed`);
                    deleteLabel('', l.name);
                }
            }
        };     
    });
}

async function cleanupIssueLabels( pIssues ){
    for (const issue of pIssues ) {
        console.log(`cleanup PR ${issue.number}`);
        issue.labels.forEach((l) => {
            const result = /^(\d?\d)\.(\d?\d)\.(\d\d\d\d)$/g.exec(l.name);
            if (result) {
                if (usedLabels.includes( `${issue.number}-${l.name}` )) {
                    console.log(`    ${l.name} still valid`);
                } else {
                    console.log(`    ${l.name} will be removed`);
                    deleteLabel(issue.number, l.name);    
                }
            }
           }) 
    }
}

async function addUsedLabels( issueNumber, label ) {
    if (! usedLabels.includes( label ) ) {
        usedLabels.push( label );
    };
    if (! usedLabels.includes( `${issueNumber}-${label}` ) ) {
        usedLabels.push( `${issueNumber}-${label}` );
    };
}

async function addLabelToIssue( label, issue ) {
    let labels = await getLabels('');
    labels = labels.filter( (f) => { return f.name===`${label}`} );
    if (!labels.length) {
        console.log(`    will create label ${label}`);
        await createLabel(`${label}`, `remind after ${label}`, `ffffff`);
    }

    await addUsedLabels( issue.number, label );
    await addLabel( issue.number, [`${label}`] );

}

async function handleBrandNew( pIssues ){
    for (const issue of pIssues ) {
        if (issue.labels.find(label => label.name === 'STABLE - brand new')) {
            console.log(`checking PR ${issue.number}`);
            const comments= await getAllComments( issue.number );

            let found=false;
            let comment;

            comment = comments.findLast( c => /created (\d+\.\d+\.\d+)/g.exec(c.body));
            if (comment) {
                const result = /created (\d+)\.(\d+)\.(\d+)/g.exec(comment.body);
                if (result) {
                    let targetTs=new Date(result[3], result[2]-1, result[1], 0, 0, 0).getTime();
                    targetTs += (7 * 86400 * 1000);
                    const dateStr = new Date(targetTs).toLocaleDateString('de-DE', {year: 'numeric', month: 'numeric', day: 'numeric',});
                    const nowTs = new Date().getTime();
                    const label = `${dateStr}`;

                    await addLabelToIssue( label, issue );

                    if ( nowTs < targetTs ) {
                        console.log(`    will merged after ${dateStr}`);
                        await updateLabel(`${label}`, `remind after ${dateStr}`, `ffffff`);
                    } else {
                        console.log(`    should be merged now (deadline ${dateStr})`);
                        await updateLabel(`${label}`, `remind after ${dateStr}`, `ff0000`);
                        await addLabel(issue.number, ['⚠️check']);
                    }
                }
                found=true;
            }

            comment = comments.findLast( c => /reminder (\d+\.\d+\.\d+)/g.exec(c.body));
            if (comment) {
                const result = /reminder (\d+)\.(\d+)\.(\d+)/g.exec(comment.body);
                if (result) {
                    let targetTs=new Date(result[3], result[2]-1, result[1], 0, 0, 0).getTime();
                    const dateStr = new Date(targetTs).toLocaleDateString('de-DE', {year: 'numeric', month: 'numeric', day: 'numeric',});
                    const nowTs = Date.now();
                    const label = `${dateStr}`;

                    await addLabelToIssue( label, issue );

                    if ( nowTs < targetTs ) {
                        console.log(`    will remind at ${dateStr}`);
                        await updateLabel(`${label}`, `remind after ${dateStr}`, `ffffff`);
                    } else {
                        console.log(`    should be checked now (deadline ${dateStr})`);
                        await updateLabel(`${label}`, `remind after ${dateStr}`, `ff0000`);
                        await addLabel(issue.number, ['⚠️check']);
                    }
                }
                found = true;
            }

            if (!found) {
                console.log(`    no date found`);
                await addLabel( issue.number, ['⚠️check']);
            }
        }
    }
}

async function handleOthers(pIssues){
    for (const issue of pIssues ) {
        if (! issue.labels.find(label => label.name === 'STABLE - brand new')) {
            console.log(`checking PR ${issue.number}`);
            const comments= await getAllComments( issue.number );

            let comment = comments.findLast( c => /reminder (\d+\.\d+\.\d+)/g.exec(c.body));
            if (comment) {
                const result = /reminder (\d+)\.(\d+)\.(\d+)/g.exec(comment.body);
                if (result) {
                    let targetTs=new Date(result[3], result[2]-1, result[1], 0, 0, 0).getTime();
                    const dateStr = new Date(targetTs).toLocaleDateString('de-DE', {year: 'numeric', month: 'numeric', day: 'numeric',});
                    const nowTs = Date.now();
                    const label = `${dateStr}`;

                    await addLabelToIssue( label, issue );

                    if ( nowTs < targetTs ) {
                        console.log(`    will remind at ${dateStr}`);
                        await updateLabel(`${label}`, `remind after ${dateStr}`, `ffffff`);
                    } else {
                        console.log(`    should be checked now (deadline ${dateStr})`);
                        await updateLabel(`${label}`, `remind after ${dateStr}`, `ff0000`);
                    }
                }
            }
        }
    }
}

async function doIt() {
    // read all issues
    let issues = await getGithub(`https://api.github.com/repos/iobroker/ioBroker.repositories/issues?per_page=100`);
 
    // check if we have a prId
    const prID = getPullRequestNumber();
    if ( prID ) {
        console.log(`processing PR ${prID}`);
        issues = issues.filter( (issue) => issue.number == prID ); 
    } else {
        console.log(`process all Issues`);
    }

    // process STABLE-brand new tagged issues
    console.log ('');
    console.log ('process STABLE-brand-new issues');
    await handleBrandNew( issues );

    // process other reminders
    console.log ('');
    console.log ('process normal issues');
    await handleOthers( issues );

    // cleanup labels
    console.log ('');
    console.log ('cleanup labels already set');
    await cleanupIssueLabels( issues );

    console.log ('');
    if ( prID ) {
        console.log ('check for outdated labels skipped');
    } else {
        console.log ('checking for outdated labels');
        await cleanupLabels();
    }

    return 'done';
}

// activate for debugging purposes
// process.env.GITHUB_REF = 'refs/pull/3003/merge';
// process.env.OWN_GITHUB_TOKEN = 'insert here';
// process.env.GITHUB_EVENT_PATH = __dirname + '/../event.json';

console.log(`process.env.GITHUB_REF        = ${process.env.GITHUB_REF}`);
console.log(`process.env.GITHUB_EVENT_PATH = ${process.env.GITHUB_EVENT_PATH}`);
console.log(`process.env.OWN_GITHUB_TOKEN  = ${(process.env.OWN_GITHUB_TOKEN || '').length}`);

doIt()
    .then(result => console.log(result))
    .catch(e => console.error(e));
