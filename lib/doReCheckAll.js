'use strict';
const { addComment, getGithub } = require('../src/common.mts');

const TEXT_RECHECK = 'RE-CHECK!';

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function doIt() {
    const requiredLabel = (process.env.REQUIRED_LABEL || '').trim();
    const excludeStale = (process.env.EXCLUDE_STALE || 'true').trim() !== 'false';

    console.log(`Required label filter : ${requiredLabel || '(none - all PRs)'}`);
    console.log(`Exclude stale PRs     : ${excludeStale}`);

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

    const targetPRs = allPRs.filter(pr => {
        if (!pr.labels) {
            return false;
        }
        // if a required label is set, the PR must have it
        if (requiredLabel && !pr.labels.some(label => label.name === requiredLabel)) {
            return false;
        }
        // without a required label, fall back to the original behaviour: must have LATEST or STABLE
        if (!requiredLabel && !pr.labels.some(
            label => label.name.toUpperCase().includes('LATEST') || label.name.toUpperCase().includes('STABLE'),
        )) {
            return false;
        }
        // optionally skip stale PRs
        if (excludeStale && pr.labels.some(label => {
            const name = label.name.toLowerCase();
            return name === 'stale' || name === 'stale - marked for closing';
        })) {
            return false;
        }
        return true;
    });

    const filterDesc = requiredLabel ? `label "${requiredLabel}"` : 'LATEST or STABLE label';
    console.log(`Found ${targetPRs.length} open PRs matching filter: ${filterDesc}`);

    let first = true;
    let anyError = false;
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
            anyError = true;
        }
    }

    return anyError ? 'done with errors' : 'done';
}

console.log(`process.env.OWN_GITHUB_TOKEN  = ${(process.env.OWN_GITHUB_TOKEN || '').length}`);
console.log(`process.env.REQUIRED_LABEL    = ${process.env.REQUIRED_LABEL || ''}`);
console.log(`process.env.EXCLUDE_STALE     = ${process.env.EXCLUDE_STALE || ''}`);

doIt()
    .then(result => {
        console.log(result);
        if (result === 'done with errors') {
            process.exit(1);
        }
    })
    .catch(e => {
        console.error(e);
        process.exit(1);
    });
