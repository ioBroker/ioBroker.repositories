const request = require('request');

function addLabel(prID, labels) {
    return new Promise((resolve, reject) => {
        const url = `https://api.github.com/repos/ioBroker/ioBroker.repositories/issues/${prID}/labels`;
        const options = {
            url,
            method: 'POST',
            headers: {
                Authorization: `token ${process.env.OWN_GITHUB_TOKEN}`,
                'user-agent': 'Action script'
            },
            json: {labels}
        };

        request(options, (error, response, body) => {
            if (!error && (response.statusCode === 200 || response.statusCode === 201)) {
                resolve();
            } else {
                reject('Cannot add label: ' + (error || response.statusCode));
            }
        });
    });
}

function addComment(prID, body) {
    return new Promise((resolve, reject) => {
        const url = `https://api.github.com/repos/ioBroker/ioBroker.repositories/issues/${prID}/comments`;
        const options = {
            url,
            method: 'POST',
            headers: {
                Authorization: `token ${process.env.OWN_GITHUB_TOKEN}`,
                'user-agent': 'Action script'
            },
            json: {body}
        };

        request(options, (error, response, body) => {
            if (!error && (response.statusCode === 200 || response.statusCode === 201)) {
                resolve();
            } else {
                reject('Cannot add comment: ' + (error || response.statusCode));
            }
        });
    });
}

function getAllComments(prID) {
    ///repos/:owner/:repo/issues/:issue_number/comments
    return new Promise((resolve, reject) => {
        const url = `https://api.github.com/repos/ioBroker/ioBroker.repositories/issues/${prID}/comments`;
        const options = {
            url,
            method: 'GET',
            headers: {
                Authorization: `token ${process.env.OWN_GITHUB_TOKEN}`,
                'user-agent': 'Action script'
            }
        };

        request(options, (error, response, body) => {
            if (!error && (response.statusCode === 200 || response.statusCode === 201)) {
                resolve(JSON.parse(body));
            } else {
                reject('Cannot getAllComments: ' + (error || response.statusCode));
            }
        });
    });
}

function deleteComment(prID, commentID) {
///repos/:owner/:repo/issues/:issue_number/comments
    return new Promise((resolve, reject) => {
        const url = `https://api.github.com/repos/ioBroker/ioBroker.repositories/issues/comments/${commentID}`;
        const options = {
            url,
            method: 'DELETE',
            headers: {
                Authorization: `token ${process.env.OWN_GITHUB_TOKEN}`,
                'user-agent': 'Action script'
            }
        };

        request(options, (error, response, body) => {
            if (!error && (response.statusCode === 200 || response.statusCode === 201 || response.statusCode === 204)) {
                resolve();
            } else {
                reject('Cannot delete comment: ' + (error || response.statusCode));
            }
        });
    });
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
    return new Promise((resolve, reject) => {
        const url = `https://api.github.com/repos/${owner}/${adapter}/issues`;
        const options = {
            url,
            method: 'POST',
            headers: {
                Authorization: `token ${process.env.OWN_GITHUB_TOKEN}`,
                'user-agent': 'Action script'
            },
            json
        };

        request(options, (error, response, body) => {
            if (!error && (response.statusCode === 200 || response.statusCode === 201)) {
                resolve();
            } else {
                reject(`cannot create issue for ${url}: ${error || (response.statusCode === 410 && JSON.stringify(body.message)) || JSON.stringify(body)}`);
            }
        });
    });
}

function getGithub(url) {
    return new Promise((resolve, reject) =>
        request({
            url,
            headers: {
                Authorization: `token ${process.env.OWN_GITHUB_TOKEN}`,
                'user-agent': 'Action script'
            }
        }, (error, response, body) => {
            if (!error && (response.statusCode === 200 || response.statusCode === 201)) {
                resolve(body);
            } else {
                reject(`Cannot getGithub "${url}": ${error || response.statusCode}`);
            }
        }));
}

function getUrl(url) {
    return new Promise((resolve, reject) => {
        console.log('Read ' + url);
        request(url, (error, response, body) => {
            if (!error && (response.statusCode === 200 || response.statusCode === 201)) {
                resolve(body);
            } else {
                reject(`Cannot getUrl: ${url}, ${error || response.statusCode}`);
            }
        });
    });
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
