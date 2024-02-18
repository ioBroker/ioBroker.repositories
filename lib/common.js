const axios = require('axios');

function addLabel(prID, labels) {
    return axios.post(`https://api.github.com/repos/ioBroker/ioBroker.repositories/issues/${prID}/labels`,
        {
            labels
        },
        {
            headers: {
                Authorization: process.env.OWN_GITHUB_TOKEN ? `token ${process.env.OWN_GITHUB_TOKEN}` : 'none',
                'user-agent': 'Action script'
            }
        })
        .then(response => response.data);
}

function deleteLabel(prID, label) {
    let url = `labels/${label}`;
    if (prID) {
        url= `issues/${prID}/labels/${label}`
    }
    return axios.delete(`https://api.github.com/repos/ioBroker/ioBroker.repositories/${url}`, {
        headers: {
            Authorization: process.env.OWN_GITHUB_TOKEN ? `token ${process.env.OWN_GITHUB_TOKEN}` : 'none',
            'user-agent': 'Action script'
        }
    })
    .then(response => response.data);
}

function getLabels(prID) {
    let url = `labels`;
    if (prID) {
        url= `issues/${prID}/labels`
    }
    return axios(`https://api.github.com/repos/ioBroker/ioBroker.repositories/${url}`,
        {
            headers: {
                Authorization: process.env.OWN_GITHUB_TOKEN ? `token ${process.env.OWN_GITHUB_TOKEN}` : 'none',
                'user-agent': 'Action script'
            }
        })
        .then(response => response.data )
}

function createLabel(name, description, color) {
        return axios.post(`https://api.github.com/repos/ioBroker/ioBroker.repositories/labels`,
        {
            'name': `${name}`,
            'description': `${description}`,
            'color': `${color}`
        },
        {
            headers: {
                Authorization: process.env.OWN_GITHUB_TOKEN ? `token ${process.env.OWN_GITHUB_TOKEN}` : 'none',
                'user-agent': 'Action script'
            }
        })
        .then(response => response.data);
}

function updateLabel(name, description, color) {
    return axios.patch(`https://api.github.com/repos/ioBroker/ioBroker.repositories/labels/${name}`,
    {
        'description': `${description}`,
        'color': `${color}`
    },
    {
        headers: {
            Authorization: process.env.OWN_GITHUB_TOKEN ? `token ${process.env.OWN_GITHUB_TOKEN}` : 'none',
            'user-agent': 'Action script'
        }
    })
    .then(response => response.data);
}
function addComment(prID, body) {
    return axios.post(`https://api.github.com/repos/ioBroker/ioBroker.repositories/issues/${prID}/comments`, {body},
        {
            headers: {
                Authorization: process.env.OWN_GITHUB_TOKEN ? `token ${process.env.OWN_GITHUB_TOKEN}` : 'none',
                'user-agent': 'Action script'
            },
        })
        .then(response => response.data);
}

function getAllComments(prID) {
    ///repos/:owner/:repo/issues/:issue_number/comments
    return axios(`https://api.github.com/repos/ioBroker/ioBroker.repositories/issues/${prID}/comments?per_page=100`, {
        headers: {
            Authorization: process.env.OWN_GITHUB_TOKEN ? `token ${process.env.OWN_GITHUB_TOKEN}` : 'none',
            'user-agent': 'Action script'
        }
    })
        .then(response => response.data);
}

function deleteComment(prID, commentID) {
///repos/:owner/:repo/issues/:issue_number/comments
    return axios.delete(`https://api.github.com/repos/ioBroker/ioBroker.repositories/issues/comments/${commentID}`, {
        headers: {
            Authorization: process.env.OWN_GITHUB_TOKEN ? `token ${process.env.OWN_GITHUB_TOKEN}` : 'none',
            'user-agent': 'Action script'
        }
    })
        .then(response => response.data);
}

function createIssue(owner, adapter, json) {
    /*
    {
      "title": "Found a bug",
      "body": "I'm having a problem with this.",
      "assignees": [
        "octocat"
      ],
      "milestone": 1,
      "labels": [
        "bug"
      ]
    }
*/
    return axios.post(`https://api.github.com/repos/${owner}/${adapter}/issues`, json, {
        headers: {
            Authorization: process.env.OWN_GITHUB_TOKEN ? `token ${process.env.OWN_GITHUB_TOKEN}` : 'none',
            'user-agent': 'Action script'
        },
    })
        .then(response => response.data);
}

function getGithub(url, raw) {
    const options = {
        headers: {
            Authorization: process.env.OWN_GITHUB_TOKEN ? `token ${process.env.OWN_GITHUB_TOKEN}` : 'none',
            'user-agent': 'Action script'
        },
    };
    if (!process.env.OWN_GITHUB_TOKEN) {
        delete options.headers.Authorization;
    }
    if (raw) {
        options.transformResponse = [];
    }

    return axios(url, options)
        .then(response => response.data)
        .catch(e => {
            console.error(`Cannot read ${url}: ${e}`);
            throw e;
        });
}

function getUrl(url, asText) {
    console.log(`Read ${url}`);
    return axios(url, asText ? {transformResponse: x => x} : {})
        .then(response => response.data);
}

module.exports = {
    addComment,
    addLabel,
    createLabel,
    deleteLabel,
    updateLabel,
    getGithub,
    getUrl,
    createIssue,
    deleteComment,
    getAllComments,
    getLabels
};
