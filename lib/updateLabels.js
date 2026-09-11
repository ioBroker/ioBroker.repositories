'use strict';
const fs = require('node:fs');
const axios = require('axios');

//
// This workflow manages the "check" labels of open LATEST PRs.
//
// Implemented deliberately self-contained: it does NOT use src/common.mts or any other
// TypeScript module - all GitHub API access is done locally within this file.
//

const REPO = 'ioBroker/ioBroker.repositories';

// labels relevant for this workflow
const LABEL_NEW_AT_LATEST = 'new at LATEST';

const LABEL_AI_OK = 'ai-checked ✔';
const LABEL_AI_FAIL = 'ai-checked ❌';
const LABEL_AI_MISSING = 'ai-check missing';

const LABEL_RD_OK = 'rd-checked ✔';
const LABEL_RD_FAIL = 'rd-checked ❌';
const LABEL_RD_MISSING = 'rd-check missing';

const LABEL_AUTO_OK = 'auto-checked ✔';
const LABEL_OBJECTS_OK = 'objects ✔';

const LABEL_LGTM = 'lgtm';
const LABEL_BYPASS = 'bypass';

const LABEL_WIP = '⌛wip⌛';
const LABEL_OK = '✔ok✔';

function authHeaders() {
    return {
        Authorization: process.env.OWN_GITHUB_TOKEN ? `token ${process.env.OWN_GITHUB_TOKEN}` : 'none',
        'user-agent': 'Action script',
    };
}

function getGithub(url) {
    const options = { headers: authHeaders() };
    // unauthenticated requests must not send the literal 'none' - GitHub rejects that
    if (!process.env.OWN_GITHUB_TOKEN) {
        delete options.headers.Authorization;
    }
    return axios(url, options).then(response => response.data);
}

function addLabelApi(prID, labels) {
    return axios
        .post(
            `https://api.github.com/repos/${REPO}/issues/${prID}/labels`,
            { labels },
            { headers: authHeaders() },
        )
        .then(response => response.data);
}

function deleteLabelApi(prID, label) {
    return axios
        .delete(`https://api.github.com/repos/${REPO}/issues/${prID}/labels/${encodeURIComponent(label)}`, {
            headers: authHeaders(),
        })
        .then(response => response.data);
}

function getPullRequestNumber() {
    if (process.env.GITHUB_REF && process.env.GITHUB_REF.match(/refs\/pull\/\d+\/merge/)) {
        const result = /refs\/pull\/(\d+)\/merge/g.exec(process.env.GITHUB_REF);
        if (result) {
            return result[1];
        }
    }
    if (process.env.GITHUB_EVENT_PATH) {
        const event = JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
        return event.pull_request ? event.pull_request.number : event.issue ? event.issue.number : '';
    }

    return '';
}

//
// Small helper working on a live set of the labels currently attached to a PR.
// It applies the change on GitHub, logs it and keeps the local set in sync so that
// later checks in the same run see the effect of earlier changes.
//
async function ensureLabel(prID, labels, label) {
    if (labels.has(label)) {
        return;
    }
    console.log(`    adding label '${label}'`);
    await addLabelApi(prID, [label]);
    labels.add(label);
}

async function removeLabelIfPresent(prID, labels, label) {
    if (!labels.has(label)) {
        return;
    }
    console.log(`    removing label '${label}'`);
    await deleteLabelApi(prID, label);
    labels.delete(label);
}

async function processPr(issue) {
    const prID = issue.number;
    console.log(`processing PR ${prID} (${issue.title})`);

    const labels = new Set((issue.labels || []).map(l => (typeof l === 'string' ? l : l.name)));

    if (!labels.has(LABEL_NEW_AT_LATEST)) {
        console.log(`    label '${LABEL_NEW_AT_LATEST}' not attached - nothing to do`);
        return;
    }

    // ai-check
    if (labels.has(LABEL_AI_OK) || labels.has(LABEL_AI_FAIL)) {
        await removeLabelIfPresent(prID, labels, LABEL_AI_MISSING);
    } else {
        await ensureLabel(prID, labels, LABEL_AI_MISSING);
    }

    // rd-check
    if (labels.has(LABEL_RD_OK) || labels.has(LABEL_RD_FAIL)) {
        await removeLabelIfPresent(prID, labels, LABEL_RD_MISSING);
    } else {
        await ensureLabel(prID, labels, LABEL_RD_MISSING);
    }

    // overall wip/ok state - honor changes applied above via the live 'labels' set
    const allChecksPresent =
        labels.has(LABEL_AI_OK) &&
        labels.has(LABEL_RD_OK) &&
        labels.has(LABEL_AUTO_OK) &&
        labels.has(LABEL_OBJECTS_OK);
    const overridden = labels.has(LABEL_LGTM) || labels.has(LABEL_BYPASS);

    if (!allChecksPresent && !overridden) {
        await ensureLabel(prID, labels, LABEL_WIP);
        await removeLabelIfPresent(prID, labels, LABEL_OK);
    } else {
        await ensureLabel(prID, labels, LABEL_OK);
        await removeLabelIfPresent(prID, labels, LABEL_WIP);
    }
}

async function doIt() {
    const prID = getPullRequestNumber();

    // The issues endpoint returns PRs too (a PR is an issue with a 'pull_request' member)
    // and delivers the attached labels inline, so no extra request per PR is needed.
    let issues = await getGithub(`https://api.github.com/repos/${REPO}/issues?state=open&per_page=100`);
    issues = issues.filter(issue => issue.pull_request);

    if (prID) {
        console.log(`triggered for single PR ${prID}`);
        issues = issues.filter(issue => issue.number == prID);
        if (!issues.length) {
            console.log(`PR ${prID} is not an open PR - nothing to do`);
            return 'done';
        }
    } else {
        console.log(`triggered manually or by schedule - processing all ${issues.length} open PRs`);
    }

    for (const issue of issues) {
        await processPr(issue);
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
