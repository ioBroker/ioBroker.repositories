const axios = require('axios');

function addLabel(prID, labels) {
    return axios.post(`https://api.github.com/repos/ioBroker/ioBroker.repositories/issues/${prID}/labels`,
        {
            labels
        },
        {
            headers: {
                Authorization: `token ${process.env.OWN_GITHUB_TOKEN}`,
                'user-agent': 'Action script'
            }
        })
        .then(response => response.data);
}

function addComment(prID, body) {
    return axios.post(`https://api.github.com/repos/ioBroker/ioBroker.repositories/issues/${prID}/comments`, {body},
        {
            headers: {
                Authorization: `token ${process.env.OWN_GITHUB_TOKEN}`,
                'user-agent': 'Action script'
            },
        })
        .then(response => response.data);
}

function getAllComments(prID) {
    ///repos/:owner/:repo/issues/:issue_number/comments
    return axios(`https://api.github.com/repos/ioBroker/ioBroker.repositories/issues/${prID}/comments`, {
        headers: {
            Authorization: `token ${process.env.OWN_GITHUB_TOKEN}`,
            'user-agent': 'Action script'
        }
    })
        .then(response => response.data);
}

function deleteComment(prID, commentID) {
///repos/:owner/:repo/issues/:issue_number/comments
    return axios.delete(`https://api.github.com/repos/ioBroker/ioBroker.repositories/issues/comments/${commentID}`, {
        headers: {
            Authorization: `token ${process.env.OWN_GITHUB_TOKEN}`,
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
            Authorization: `token ${process.env.OWN_GITHUB_TOKEN}`,
            'user-agent': 'Action script'
        },
    })
        .then(response => response.data);
}

function getGithub(url) {
    return axios(url, {
        headers: {
            Authorization: `token ${process.env.OWN_GITHUB_TOKEN}`,
            'user-agent': 'Action script'
        },
    })
        .then(response => response.data);
}

function getUrl(url) {
    console.log('Read ' + url);
    return axios(url)
        .then(response => response.data);
}

module.exports = {
    addComment,
    addLabel,
    getGithub,
    getUrl,
    createIssue,
    deleteComment,
    getAllComments
};
