'use strict';
const {
    addLabel,
    getAllComments,
    getGithub,
} = require('./common');



async function doIt() {
    const issues = await getGithub(`https://api.github.com/repos/iobroker/ioBroker.repositories/issues`);
    for (const issue of issues ) {
        if ( issue.labels.find(label => label.name === 'STABLE - brand new') ) {
            console.log(`checking PR ${issue.number}`);
            const comments= await getAllComments( issue.number );
            const comment = comments.find( c => /created (\d+\.\d+\.\d+)/g.exec(c.body));
            if (comment) {
                const result = /created (\d+)\.(\d+)\.(\d+)/g.exec(comment.body);
                if (result) {
                    let targetTs=new Date(result[3], result[2]-1, result[1], 0, 0, 0).getTime();
                    targetTs += (7 * 86400 * 1000);
                    const dateStr = new Date(targetTs).toLocaleDateString();
                    const nowTs = new Date().getTime();
                    if ( nowTs < targetTs ) {
                        console.log(`    will merged after ${dateStr}`);
                    } else {
                        console.log(`    should be merged now (deadline ${dateStr})`);
                        await addLabel( issue.number, '⚠️check');
                    }
                };
            } else {
                console.log(`    no date found`);                
            }
        }
    }
    return 'done';
}

// activate for debugging purposes
// process.env.GITHUB_REF = 'refs/pull/2348/merge';
// process.env.OWN_GITHUB_TOKEN = 'insert token';
// process.env.GITHUB_EVENT_PATH = __dirname + '/../event.json';

//console.log(`process.env.GITHUB_REF        = ${process.env.GITHUB_REF}`);
//console.log(`process.env.GITHUB_EVENT_PATH = ${process.env.GITHUB_EVENT_PATH}`);
//console.log(`process.env.OWN_GITHUB_TOKEN  = ${(process.env.OWN_GITHUB_TOKEN || '').length}`);

doIt()
    .then(result => console.log(result))
    .catch(e => console.error(e));
