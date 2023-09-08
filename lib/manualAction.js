'use strict';

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

console.log ('manual action started');
await closeIssue( 'Mic-M', 'ioBroker.logparser', '41');