'use strict';
const { addComment, getGithub } = require('./common');

const TEXT_RECHECK = 'RE-CHECK!';

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function doIt() {
    // read all open PRs (paginated)
    let page = 1;
    let allPRs = [];
    let prs;
    do {
        prs = await getGithub(
            `https://api.github.com/repos/ioBroker/ioBroker.repositories/pulls?state=open&per_page=100&page=${page}`,
        );
        allPRs = allPRs.concat(prs);
        page++;
    } while (prs.length === 100);

    console.log(`Found ${allPRs.length} open PRs`);

    // filter PRs with labels containing 'LATEST' or 'STABLE' (case-insensitive)
    const targetPRs = allPRs.filter(
        pr =>
            pr.labels &&
            pr.labels.some(
                label => label.name.toUpperCase().includes('LATEST') || label.name.toUpperCase().includes('STABLE'),
            ),
    );

    console.log(`Found ${targetPRs.length} open PRs with LATEST or STABLE label`);

    let first = true;
    for (const pr of targetPRs) {
        if (!first) {
            console.log('Waiting 30 seconds before next comment...');
            await sleep(30000);
        }
        first = false;

        const labelNames = pr.labels.map(l => l.name).join(', ');
        console.log(`Adding "${TEXT_RECHECK}" comment to PR #${pr.number} (labels: ${labelNames})`);
        try {
            await addComment(pr.number, TEXT_RECHECK);
            console.log(`Successfully added "${TEXT_RECHECK}" comment to PR #${pr.number}`);
        } catch (e) {
            console.error(`Cannot add comment to PR #${pr.number}: ${e}`);
        }
    }

    return 'done';
}

console.log(`process.env.OWN_GITHUB_TOKEN  = ${(process.env.OWN_GITHUB_TOKEN || '').length}`);

doIt()
    .then(result => console.log(result))
    .catch(e => console.error(e));
