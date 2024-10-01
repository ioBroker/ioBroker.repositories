const axios = require('axios');

// check if all adapters in stable have the version attribute
// and published attribute
if (process.argv.includes('--init')) {
    const scripts = require('./lib/scripts');
    scripts.init().catch(e => console.error(e));
} else if (process.argv.includes('--stable')) {
    const build = require('./lib/build');
    const tools = require('./lib/tools');
    tools.getRepositoryFile(`https://raw.githubusercontent.com/${tools.appName}/${tools.appName}.repositories/master/sources-dist-stable.json`, (err, data) => {
        if (err) {
            console.error(err);
            if (!data) {
                process.exit(1);
            }
        }
        build.getStats((err, stats) => {
            if (stats) {
                for (const adapter in stats) {
                    if (stats.hasOwnProperty(adapter) && data[adapter]) {
                        data[adapter].stat = stats[adapter];
                    }
                }
            }
            build.processRepository(data, ['--file', '/var/www/download/sources-dist-latest.json'], () => {});
        });
    });
} else if (process.argv.includes('--latest')) {
    const build = require('./lib/build');
    const tools = require('./lib/tools');
    axios(`https://raw.githubusercontent.com/${tools.appName}/${tools.appName}.repositories/master/sources-dist-stable.json`)
        .then(response => {
            const latest = response.data;
            tools.getRepositoryFile(`https://raw.githubusercontent.com/${tools.appName}/${tools.appName}.repositories/master/sources-dist.json`, latest, (err, data) => {
                if (err) {
                    console.error(err);
                    !data && process.exit(1);
                }
                build.getStats((err, stats) => {
                    if (stats) {
                        Object.keys(stats).forEach(adapter => {
                            if (data[adapter]) {
                                data[adapter].stat = stats[adapter];
                            }
                        });
                    }
                    build.processRepository(data, ['--file', '/var/www/download/sources-dist.json', '--shields', '/var/www/download/img'], () => {});
                });
            });
        });
} else if (process.argv.includes('--sort')) {
    const scripts = require('./lib/scripts');
    scripts.sort().catch(e => console.error(e));
} else if (process.argv.includes('--nodates')) {
    const scripts = require('./lib/scripts');
    scripts.nodates().catch(e => console.error(e));
}
