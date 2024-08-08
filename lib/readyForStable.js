'use strict';
const {
    getGithub,
    getUrl,
    createIssue
} = require('./common');

const axios = require('axios');
const semver = require('semver');

const TITLE = 'Update stable version in repo';

const ONE_DAY = 3600000 * 24;

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
function getLatestRepo() {
    return getUrl('http://repo.iobroker.live/sources-dist-latest.json');
}

function getStableRepo() {
    return getUrl('http://repo.iobroker.live/sources-dist.json');
}

function getMasterStableAsTextFile() {
    return getUrl('https://raw.githubusercontent.com/ioBroker/ioBroker.repositories/master/sources-dist-stable.json', true);
}

function getStats() {
    return getUrl('https://www.iobroker.net/data/statistics.json');
}

function triggerRepoCheck(adapter) {
    const url = `${adapter.owner}/ioBroker.${adapter.adapter}`;
    console.log(`trigger rep checker for ${url}`);
    // curl -L -X POST -H "Accept: application/vnd.github+json" -H "Authorization: Bearer ghp_xxxxxxxx" https://api.github.com/repos/iobroker-bot-orga/check-tasks/dispatches -d "{\"event_type\": \"check-repository\", \"client_payload\": {\"url\": \"mcm1957/iobroker.weblate-test\"}}"
    return axios.post(`https://api.github.com/repos/iobroker-bot-orga/check-tasks/dispatches`, {"event_type": "check-repository", "client_payload": {"url": url}},
        {
            headers: {
                Authorization: `bearer ${process.env.IOBBOT_GITHUB_TOKEN}`,
                Accept: 'application/vnd.github+json',
                'user-agent': 'Action script'
            },
        })
        .then(response => response.data)
        .catch(e => console.error(e));
}

function addComment(owner, adapter, id, body) {
    return axios.post(`https://api.github.com/repos/${owner}/ioBroker.${adapter}/issues/${id}/comments`, {body},
        {
            headers: {
                Authorization: process.env.OWN_GITHUB_TOKEN ? `token ${process.env.OWN_GITHUB_TOKEN}` : 'none',
                'user-agent': 'Action script'
            },
        })
        .then(response => response.data);
}

function closeIssue(owner, adapter, id) {
    return axios.patch(`https://api.github.com/repos/${owner}/ioBroker.${adapter}/issues/${id}`,
	    {
            'state' : 'close'
        },
        {
            headers: {
                Authorization: process.env.OWN_GITHUB_TOKEN ? `token ${process.env.OWN_GITHUB_TOKEN}` : 'none',
                'user-agent': 'Action script'
            },
        })
        .then(response => response.data);
}

async function checkIssues(latest, stable, stats, result) {
    for (const adapter in latest) {
        if (!adapter.startsWith('_')) {
	    //console.log (`\n[DEBUG] checking ${latest[adapter].meta}\n`);
            const parts = latest[adapter].meta.split('/');
            const owner = parts[3];
            let issues = await getGithub(`https://api.github.com/repos/${owner}/ioBroker.${adapter}/issues`);
            issues = issues.filter(i => i.state === 'open' && i.title.includes(TITLE));
            for (const issue of issues) {
                const issueId = issues[0].number;
                console.log(`\n${adapter}: [ https://www.github.com/${owner}/iobroker.${adapter} ]`);
                const res = result.filter(r => r.adapter === adapter);
                let newTitle = '';
                if (res.length) newTitle = `${TITLE} from ${res[0].stable.version} to ${res[0].latest.version}`;
                if (issue.title === newTitle) {
                    console.log(`    ${issue.title} detected - issue still valid`);
                    const labels = await getGithub(`https://api.github.com/repos/${owner}/ioBroker.${adapter}/issues/${issueId}/labels`);
                    for (let i = 0; i < labels.length; i++) {
                        if (labels[i].name === 'stale') {
                            console.log(`    issue marked as stale, will try to refresh`);
                            const comment = `This issue seems to be still valid. So it should not be flagged stale.\n` +
                            `Please consider processing the issue\n`+
                            `@mcm1957 for evidence`;
                            try {
                                addComment(owner, adapter, issueId, comment);
                            } catch (e) {
                                console.log(`error adding comment to ${issueId}`);
                                console.log(e.toString());
                            }
                            console.log(`    comment added to ${issueId}`);
                        }
                    }       
                } else {
                    console.log(`    ${issue.title} detected`);
                    // "Update stable version in repo from 1.0.1 to 1.0.2"
                    const matches = issue.title.match(/^Update stable version in repo (from (\d+\.\d+\.\d+) )?to (\d+\.\d+\.\d+)/);
                    if (matches && matches.length) {
                        issue.from = matches[2];
                        issue.to = matches[3];

                        if (stable[adapter] && semver.gte(stable[adapter].version, issue.to)) {
                            console.log(`    adapter is already at stable version ${stable[adapter].version}`);
                            const comment = `This issue seems to be outdated.\n\n` +
                                `This issue suggests to update the stable version of this adapter to ${issue.to} but the current ` +
                                `stable version is already ${stable[adapter].version}.\n\n` +
                                `So this issue should be closed.\n\n` +
                                `@mcm1957 for evidence`;
                            try {
                                addComment(owner, adapter, issueId, comment);
                            } catch (e) {
                                console.log(`error adding comment to ${issueId}`);
                                console.log(e.toString());
                            }
                            console.log(`    comment added to ${issueId}`);
                            try {
                                closeIssue(owner, adapter, issueId);
                            } catch (e) {
                                console.log(`error closing issue ${issueId}`);
                                console.log(e.toString());
                            }
                            console.log(`    issue ${issueId} closed`);
                        } else if (res.length && semver.gt(res[0].latest.version, issue.to) && res[0].latest.version.match(/^\d+\.\d+\.\d+$/)) { // ignore -alpha.x
                            console.log(`    adapter should be updated to ${res[0].latest.version} now`);
                            const comment = `This issue seems to be outdated.\n\n` +
                                `This issue suggests to update the stable version of this adapter to ${issue.to} but in the meantime ` +
                                `an update to version ${res[0].latest.version} is suggested.\n\n` +
                                `So this issue will be closed and replaced by an updated one.\n\n` +
                                `@mcm1957 for evidence`;
                            try {
                                addComment(owner, adapter, issueId, comment);
                            } catch (e) {
                                console.log(`error adding comment to ${issueId}`);
                                console.log(e.toString());
                            }
                            console.log(`    comment added to ${issueId}`);
                            try {
                                closeIssue(owner, adapter, issueId);
                            } catch (e) {
                                console.log(`error closing issue ${issueId}`);
                                console.log(e.toString());
                            }
                            console.log(`    issue ${issueId} closed`);
                        } else {
                            console.log(`    adapter should still be updated as requested to ${issue.to}`);
                        }
                    } else {
                        console.log(`    cannot parse issue title please check manually`);
                    }
                }
            }
        }
    }
}

async function getDiff(latest, stable, stats) {
    const result = [];

    Object.keys(latest)
        .forEach(adapter => {
            if (!adapter.startsWith('_') && !stable[adapter] ) {
				if ( !stats.versions[adapter] ) {
					console.log(`\nWARNING: Adapter ${adapter} not yet provides statistics`);
					return;
				}

                const now = new Date();
                const latestTime = new Date(latest[adapter].versionDate);
                //const stableTime = new Date(stable[adapter].versionDate);
                //const daysDiff = Math.floor((latestTime.getTime() - stableTime.getTime()) / ONE_DAY);

                const parts = latest[adapter].meta.split('/');
                const item = {
                    adapter,
                    installs: stats.adapters[adapter],
                    owner: parts[3],
                    latest: {
                        installs: stats.versions[adapter][latest[adapter].version],
                        percent: Math.round((stats.versions[adapter][latest[adapter].version] / stats.adapters[adapter]) * 10000) / 100,
                        time: latestTime,
                        version: latest[adapter].version,
                        old: Math.floor((now.getTime() - latestTime.getTime()) / ONE_DAY)
                    },
                    stable: {
                        installs: 0,
                        percent: 0,
                        time: null,
                        version: '0.0.0',
                        old: 0
                    },
                    daysDiff: null
                };

                console.log(`\nchecking ioBroker.${adapter} [ https://github.com/${item.owner}/ioBroker.${item.adapter} ] ...`);
                console.log(`    Adapter not yet listed at stable repository`);
                console.log(`    Version:  stable=${item.stable.version} (${item.stable.old} days old) => latest=${item.latest.version} (${item.latest.old} days old)`);
                console.log(`    Installs: stable=${item.stable.installs} (${item.stable.percent}%), latest=${item.latest.installs} (${item.latest.percent}%), total=${item.installs}`);

                // ---- CONDITIONS for stable 1-3
                if (// 1. if the latest version is older than 30 days
                    (now.getTime() - latestTime.getTime()) > 30 * ONE_DAY
                ) {
                    console.log('  + should be published');
                    result.push(item);
                } else {
                    console.log('  - too young for publishing');
                }
            }
        });

    Object.keys(stable)
        .forEach(adapter => {
            if (!adapter.startsWith('_') && stable[adapter].version !== latest[adapter].version) {

                const now = new Date();
                const latestTime = new Date(latest[adapter].versionDate);
                const stableTime = new Date(stable[adapter].versionDate);
                const daysDiff = Math.floor((latestTime.getTime() - stableTime.getTime()) / ONE_DAY);

                const parts = latest[adapter].meta.split('/');
                const item = {
                    adapter,
                    installs: stats.adapters[adapter],
                    owner: parts[3],
                    latest: {
                        installs: stats.versions[adapter][latest[adapter].version],
                        percent: Math.round((stats.versions[adapter][latest[adapter].version] / stats.adapters[adapter]) * 10000) / 100,
                        time: latestTime,
                        version: latest[adapter].version,
                        old: Math.floor((now.getTime() - latestTime.getTime()) / ONE_DAY)
                    },
                    stable: {
                        installs: stats.versions[adapter][stable[adapter].version],
                        percent: Math.round((stats.versions[adapter][stable[adapter].version] / stats.adapters[adapter]) * 10000) / 100,
                        time: stableTime,
                        version: stable[adapter].version,
                        old: Math.floor((now.getTime() - stableTime.getTime()) / ONE_DAY)
                    },
                    daysDiff
                };

                console.log(`\nchecking ioBroker.${adapter} [ https://github.com/${item.owner}/ioBroker.${item.adapter} ] ...`);
                console.log(`    Version:  stable=${item.stable.version} (${item.stable.old} days old) => latest=${item.latest.version} (${item.latest.old} days old)`);
                console.log(`    Installs: stable=${item.stable.installs} (${item.stable.percent}%), latest=${item.latest.installs} (${item.latest.percent}%), total=${item.installs}`);

                // ---- CONDITIONS for stable 1-3
                if (// 1. if the latest version is older than two weeks
                    (now.getTime() - latestTime.getTime()) > 15 * ONE_DAY &&
                    // 2a. If difference between the latest and the stable version is more than 1 month
                    // 2b. or if the latest version is older than one month
                    (daysDiff > 30 || (now.getTime() - latestTime.getTime()) > 30 * ONE_DAY)) {

                    // 3a. if the latest version is used by more than 5 percent of the users
                    // 3b. or if the latest version is older 30 days
                    if ((item.latest.percent > 5) ||
                        ((now.getTime() - latestTime.getTime()) > 30 * ONE_DAY)
                    ) {
                        console.log('  + should be updated');
                        result.push(item);
                    } else {
                        console.log('  - too few users (percent limit missed)');
                    }
                } else {
                    console.log('  - too young for update');
                }
            }
        });

    return result;
}

function generateIssue(adapter, stableFile) {
    // get open issues
    return getGithub(`https://api.github.com/repos/${adapter.owner}/ioBroker.${adapter.adapter}/issues`)
        .then(json => json.filter(i => i.state === 'open' && i.title.includes(TITLE)))
        .then(issues => {
            if (issues.length) {
                console.log(`Skipping ${adapter.adapter} - issue already exists`);
            } else if (!adapter.latest.version.match(/^\d+\.\d+\.\d+$/)) {
                console.log(`Skipping ${adapter.adapter} - release ${adapter.latest.version} is no stable release`);
            } else {
                // find line count
                const lines = stableFile.split('\n');
                // find line number
                let num;
                for (let i = 0; i < lines.length; i++) {
                    const reg = new RegExp(`^\\s*"${adapter.adapter}":\\s{$`);
                    if (reg.test(lines[i])) {
                        num = i + 1;
                        break;
                    }
                }

                let body = '';
                if ( adapter.stable.version === '0.0.0' ) {
                    body += `# Think about adding version ${adapter.latest.version} to stable repository.\n`;
                } else {
                    body += `# Think about update stable version to ${adapter.latest.version}\n`;
                }
                body += `**Version**: stable=**${adapter.stable.version}** (${adapter.stable.old} days old) => latest=**${adapter.latest.version}** (${adapter.latest.old} days old)\n`;
                body += `**Installs**: stable=**${adapter.stable.installs}** (${adapter.stable.percent}%), latest=**${adapter.latest.installs}** (${adapter.latest.percent}%), total=**${adapter.installs}**\n\n`;
                body += `Click to use [developer portal](https://www.iobroker.dev/adapter/${adapter.adapter}/releases)\n`;
                if (num !== undefined) {
                    body += `Click to [edit](https://github.com/ioBroker/ioBroker.repositories/edit/master/sources-dist-stable.json#L${num})\n`;
                } else {
                    body += `Click to [edit](https://github.com/ioBroker/ioBroker.repositories/edit/master/sources-dist-stable.json)\n`;
                }
                body += '\n';
                body += '**Do not close this issue manually as a new issue will be created if condition for update still exists.**\n';
                body += '\n';
                body += `Please drop a comment if any reason exists which blocks updating to version ${adapter.latest.version} at this time.\n`;
                body += '\n\n';
                body += 'Note: This is an automatically generated message and not personally authored by bluefox!\n';
                body += '      @mcm1957 for evidence';
                console.log(`CREATE ISSUE for ioBroker.${adapter.adapter} [ https://www.github.com/${adapter.owner}/ioBroker.${adapter.adapter} ]:`);
                console.log(`${TITLE} from ${adapter.stable.version} to ${adapter.latest.version}\n\n ${body}`);
                console.log(``);

                return createIssue(adapter.owner, `ioBroker.${adapter.adapter}`,  {
                    title: `${TITLE} from ${adapter.stable.version} to ${adapter.latest.version}`,
                    body
                })
                    .catch(e => console.error(`Cannot create issue for "${adapter.adapter}": ${e}`));
            }
        });
}

async function doIt() {
	const latest = await getLatestRepo();
	const stable = await getStableRepo();
	const stats  = await getStats();
	const master = await getMasterStableAsTextFile();
	const result = await getDiff(latest, stable, stats);

	console.log(`\nchecking issues...`);
	await checkIssues(latest, stable, stats, result);

	console.log(`\ncreating issues...`);
	for (const adapter of result) {
		await generateIssue(adapter, master);
	}

	console.log(`\ntrigger repository checks...`);
	for (const adapter of result) {
        	await triggerRepoCheck(adapter);
		console.log('waiting 60s ...');
		await sleep(60000); // limit to 1 call per minute
	}

	return ('done');
}

doIt()
    .then(result => console.log(result))
    .catch(e => { console.error(e); exit(-1)});
