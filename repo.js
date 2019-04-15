'use strict';
const scripts = require(__dirname + '/lib/scripts.js');
const fs = require('fs');

if (process.argv[2]) {
    scripts.updateVersion(process.argv[2], (error, sources, name, version) => {
        fs.writeFileSync(__dirname + '/sources-dist-stable.json', JSON.stringify(sources, null, 2));

    }, require(__dirname + '/sources-dist-stable.json'));
} else {
    console.log('Please define adapter name to update');
}