'use strict';

/*
 *
 * This script scans all adapters listed at latest and stable repository and verifies that
 *   - all adapters listed at stable repository are also listed at latest repository
 *   - GitHub adapter repositories are accessible
 *   - GitHub adapter repositories are not archived
 *
 *   If any of those checks fails an issue is created at ioBroker.repositories requesting a fix
 *
 * Note:
 *   Running this script locally requires environment variable OWN_GITHUB_TOKEN to be set to avoid hitting rate limits
 *
 */

const {
    getGithub,
    getUrl,
    createIssue
} = require('./common');

async function getLatestRepo() {
    return await getUrl('http://repo.iobroker.live/sources-dist-latest.json');
}

async function getStableRepo() {
    return await getUrl('http://repo.iobroker.live/sources-dist.json');
}

async function getStats() {
    return await getUrl('https://www.iobroker.net/data/statistics.json');
}

async function checkRepos(latest, stable, stats) {
    const result = [];
    let count;
    let idx;

    count = Object.keys(stable).length;
    idx=0;
    console.log ('');
    console.log ('processing STABLE repository');
    for (const adapter in stable) {
        idx = idx + 1;
        if (adapter.startsWith('_')) {
	      console.log (`SKIPPING ${adapter} (${idx}/${count})`);
        } else {
	      const parts = stable[adapter].meta.split('/');
            const owner = parts[3];
	      console.log (`checking ${adapter} (${idx}/${count})`);
            if (!latest[adapter]) {
                console.log(`   ***   ${adapter} only in stable repository`);
                const item = {
                    adapter: adapter,
                    owner: owner,
			  installs: stats.adapters[adapter],
			  stable_only: true,
                };
		    console.log (`   ***   ${adapter} only at stable repository (${stats.adapters[adapter]} installs)`);
                result.push(item);
		}
        }
    }

    count = Object.keys(latest).length;
    idx = 0;
    console.log ('');
    console.log ('processing LATEST repository');
    for (const adapter in latest) {
        idx = idx + 1;
        if (adapter.startsWith('_')) {
	      console.log (`SKIPPING ${adapter} (${idx}/${count})`);
        } else {
	      const parts = latest[adapter].meta.split('/');
            const owner = parts[3];
	      console.log (`checking ${adapter} (${idx}/${count}) - ${owner}/ioBroker.${adapter}`);

	      try {
                const json = await getGithub(`https://api.github.com/repos/${owner}/ioBroker.${adapter}`);
                if (json.archived) {
                    const item = {
                        adapter: adapter,
                        owner: owner,
			      installs: stats.adapters[adapter],
                        archived: true,
                    };
		        console.log (`   ***   ${adapter} is archived (${stats.adapters[adapter]} installs)`);
                    result.push(item);
                }
            } catch (e) {
		        console.log (`   ***   error retrieving infos for ${adapter}`);
		        console.log (`   ***   ${e}`);
                    const item = {
                        adapter: adapter,
                        owner: owner,
			      installs: stats.adapters[adapter],
                        error: true,
				e: e,
                    };
                    result.push(item);
            }
        }
    };
    return result;
}

async function generateIssue(adapter, stableFile) {
    let issues;
    issues = await getGithub(`https://api.github.com/repos/ioBroker/ioBroker.repositories/issues`);

    const title = `[CHECK] Adapter ${adapter.adapter} needs verification`;
    issues = issues.filter(i => i.state === 'open' && i.title.includes(title));
    if (!issues.length) {
        let body = `# Adapter ${adapter.adapter} needs verification:\n\n`;
	  if ( adapter.stable_only) {
            body += `Adapter is listed at stable repository only\n`;
	  };
	  if ( adapter.archived) {
            body += `Repository ${adapter.owner}/ioBroker.${adapter.adapter} is archived\n`;
	  };
	  if ( adapter.error) {
            body += `Retrieving data from repository ${adapter.owner}/ioBroker.${adapter.adapter} failed\n`;
            body += `${e}\n`;
	  };
	  body += '\n';
        body += `Adapter ${adapter.adapter} is currently installed ${adapter.installs} times\n`;

	  body += '\n';
	  if ( adapter.stable_only) {
            body *= `- [ ] add adapter to latest repository if adapter repository is valid\n`;
	  };
	  if ( adapter.archived) {
            body += `- [ ] verify that repository https://github.com/${adapter.owner}/ioBroker.${adapter.adapter} is really archived\n`;
            body += `- [ ] check if adapter has been migrated but links are not yet updated at repository\n`;
            body += `      fix links at repository if this is causing the problem\n`;
            body += `- [ ] decide if adapter should (and can) be moved to community-adapters (current usage ${adapter.installs} installs)\n`;
            body += `- [ ] move adapter to iobroker-community-adapters\n`;
            body += `\n`,
            body += `  or \n`,
            body += `\n`,
            body += `- [ ] create deprecation news at admin iF required\n`;
            body += `- [ ] set reminder to remove from stable (typical after 14 day up to one months)\n`;		  
            body += `- [ ] remove from stable\n`;
            body += `- [ ] set reminder to remove from latest (typical after 3 months)\n`;		  
            body += `- [ ] remove from latest\n`;
        };
	  if ( adapter.error) {
            body += `- [ ] check repository ${adapter.owner}\ioBroker.${adapter.adapter}\n`;
            body += `- [ ] remove adapter from repositories if adapter repository invalid\n`;
	  };

        console.log(`\n`);
        console.log(`CREATE ISSUE for ioBroker.${adapter.adapter}: ${title}\n`);
        console.log(`${body}`);

        try {
            await createIssue('ioBroker', 'ioBroker.repositories', {title, body});
	  } catch (e) {
            console.log(`error: Cannot create issue for adapter ${adapter.adapter}:`);
            console.log(`       ${e}`);
        };
    } else {
         console.log(`ISSUE for ioBroker.${adapter.adapter} already exists`);
    }
}


async function doIt() {
    const latest = await getLatestRepo();
    const stable = await getStableRepo();
    const stats  = await getStats();
    const result = await checkRepos(latest, stable, stats);

    console.log (`The following adapters should be checked:`);
    for (const adapter of result) {
        console.log (`    ${adapter.owner}/ioBroker.${adapter.adapter}`);
    }
    for (const adapter of result) {
        await generateIssue(adapter);
    }
}

doIt()
    .then(result => console.log('done'))
    .catch(e => console.error(e));
