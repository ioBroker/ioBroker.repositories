'use strict';
const {
    getGithub,
    getUrl,
    createIssue
} = require('./common');

const TITLE = 'Update stable version in repo';

const ONE_DAY = 3600000 * 24;

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

function getDiff(latest, stable, stats) {
    const result = [];
    Object.keys(stable)
        .forEach(adapter => {
            if (!adapter.startsWith('_') && stable[adapter].version !== latest[adapter].version) {
                const now = new Date();
                const latestTime = new Date(latest[adapter].versionDate);
                const stableTime = new Date(stable[adapter].versionDate);
                const daysDiff = Math.floor((latestTime.getTime() - stableTime.getTime()) / ONE_DAY);

                // ---- CONDITIONS for stable 1-3
                if (// 1. if latest version is older than two weeks
                    (now.getTime() - latestTime.getTime()) > 15 * ONE_DAY &&
                    // 2a. If difference between latest and stable mor than 1 month
                    // 2b. or if latest version older than one month
                    (daysDiff > 30 || (now.getTime() - latestTime.getTime()) > 30 * ONE_DAY)) {
                    const parts = latest[adapter].meta.split('/');
                    const item = {
                        adapter,
                        installs: stats.adapters[adapter],
                        owner: parts[parts.length - 4],
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
                    // 3. if the latest version is used by more than 10 percent of users
                    if (item.latest.percent > 10) {
                        result.push(item);
                    }
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
            if (!issues.length) {
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

                let body = `# Think about update stable version to ${adapter.latest.version}\n`;
                body += `**Version**: stable=**${adapter.stable.version}** (${adapter.stable.old} days old) => latest=**${adapter.latest.version}** (${adapter.latest.old} days old)\n`;
                body += `**Installs**: stable=**${adapter.stable.installs}** (${adapter.stable.percent}%), latest=**${adapter.latest.installs}** (${adapter.latest.percent}%), total=**${adapter.installs}**\n`;
                if (num !== undefined) {
                    body += `Click to [edit](https://github.com/ioBroker/ioBroker.repositories/edit/master/sources-dist-stable.json#L${num})\n`;
                } else {
                    body += `Click to [edit](https://github.com/ioBroker/ioBroker.repositories/edit/master/sources-dist-stable.json\n`;
                }

                console.log(`CREATE ISSUE for ioBroker.${adapter.adapter}: ${body}`);

                return createIssue(adapter.owner, `ioBroker.${adapter.adapter}`,  {
                    title: `${TITLE} from ${adapter.stable.version} to ${adapter.latest.version}`,
                    body
                }).catch(e =>
                    console.error(`Cannot create issue for "${adapter.adapter}": ${e}`));
            }
        });
}

// to do close opened issues
getLatestRepo()
    .then(async latest => {
        const stable = await getStableRepo();
        const stats  = await getStats();
        const master = await getMasterStableAsTextFile();
        const result = getDiff(latest, stable, stats);
        console.log( `The following adapters should be checked for an update at stable repository:`);
        for (const adapter of result) {
            console.log( `ioBroker.${adapter.adapter} [ https://github.com/${adapter.owner}/ioBroker.${adapter.adapter} ]`);
            await generateIssue(adapter, master);
        }
    })
    .catch(e =>
        console.error(`ERROR: ${e}`));
