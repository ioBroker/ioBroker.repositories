'use strict';
const {
    addLabel,
    createLabel,
    deleteLabel,
    getLabels,
    getAllComments,
    getGithub,
} = require('./common');

async function doIt() {
    let labels = await getLabels('');
    labels = labels.forEach( (l)=> { 
        const result = /^(\d\d)\.(\d\d)\.(\d\d\d\d)$/g.exec(l.name);
        if (result) {
            let targetTs=new Date(result[3], result[2]-1, result[1], 0, 0, 0).getTime();
            const nowTs = new Date().getTime();
            if ( nowTs > targetTs + 2* 24*60*60*1000) {
                console.log(`Label ${l.name} is outdated and will be removed`);
                deleteLabel('', l.name);
            }
        };     
    });
    
    const issues = await getGithub(`https://api.github.com/repos/iobroker/ioBroker.repositories/issues`);
    for (const issue of issues ) {
        if (issue.labels.find(label => label.name === 'STABLE - brand new')) {
            console.log(`checking PR ${issue.number}`);
            const comments= await getAllComments( issue.number );

            let found=false;
            let comment;

            comment = comments.find( c => /created (\d+\.\d+\.\d+)/g.exec(c.body));
            if (comment) {
                const result = /created (\d+)\.(\d+)\.(\d+)/g.exec(comment.body);
                if (result) {
                    let targetTs=new Date(result[3], result[2]-1, result[1], 0, 0, 0).getTime();
                    targetTs += (7 * 86400 * 1000);
                    const dateStr = new Date(targetTs).toLocaleDateString();
                    const nowTs = new Date().getTime();
                    if ( nowTs < targetTs ) {
                        console.log(`    will merged after ${dateStr}`);
                        const label = `${dateStr}`;
                        let labels = await getLabels('');
                        labels = labels.filter( (f) => { return f.name===`${label}`} );
                        if (!labels.length) {
                                console.log(`    will create label $label}`);
                                await createLabel(`${label}`, `remind after ${dateStr}`, `ffffff`);
                            }
                        await addLabel(issue.number, [`${label}`]);
                    } else {
                        console.log(`    should be merged now (deadline ${dateStr})`);
                        await addLabel(issue.number, ['⚠️check']);
                    }
                }
                found=true;
            }

            comment = comments.find( c => /reminder (\d+\.\d+\.\d+)/g.exec(c.body));
            if (comment) {
                const result = /reminder (\d+)\.(\d+)\.(\d+)/g.exec(comment.body);
                if (result) {
                    let targetTs=new Date(result[3], result[2]-1, result[1], 0, 0, 0).getTime();
                    const dateStr = new Date(targetTs).toLocaleDateString();
                    const nowTs = Date.now();
                    if ( nowTs < targetTs ) {
                        console.log(`    will remind at ${dateStr}`);
                        const label = `${dateStr}`;
                        let labels = await getLabels('');
                        labels = labels.filter( (f) => { return f.name===`${label}`} );
                        if (!labels.length) {
                            console.log(`    will create label ${label}`);
                            await createLabel(`${label}`, `remind after ${dateStr}`, `ffffff`);
                        }
                        await addLabel(issue.number, [`${label}`]);
                    } else {
                        console.log(`    should be checked now (deadline ${dateStr})`);
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
    return 'done';
}

// activate for debugging purposes
// process.env.GITHUB_REF = 'refs/pull/2348/merge';
// process.env.OWN_GITHUB_TOKEN = 'insert here';
// process.env.GITHUB_EVENT_PATH = __dirname + '/../event.json';

//console.log(`process.env.GITHUB_REF        = ${process.env.GITHUB_REF}`);
//console.log(`process.env.GITHUB_EVENT_PATH = ${process.env.GITHUB_EVENT_PATH}`);
console.log(`process.env.OWN_GITHUB_TOKEN  = ${(process.env.OWN_GITHUB_TOKEN || '').length}`);

doIt()
    .then(result => console.log(result))
    .catch(e => console.error(e));
