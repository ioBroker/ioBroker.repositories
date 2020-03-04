const request = require('request');

function addLabel(prID, labels) {
    return new Promise((resolve, reject) => {
        const url = `https://api.github.com/repos/ioBroker/ioBroker.repositories/issues/${prID}/labels`;
        const options = {
            url,
            method: 'POST',
            headers: {
                Authorization: `token ${process.env.GITHUB_TOKEN}`,
                'user-agent': 'Action script'
            },
            json: {labels}
        };

        request(options, (error, response, body) => {
            if (!error && (response.statusCode === 200 || response.statusCode === 201)) {
                resolve();
            } else {
                reject(error);
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
                Authorization: `token ${process.env.GITHUB_TOKEN}`,
                'user-agent': 'Action script'
            },
            json: {body}
        };

        request(options, (error, response, body) => {
            if (!error && (response.statusCode === 200 || response.statusCode === 201)) {
                resolve();
            } else {
                reject(error);
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
                Authorization: `token ${process.env.GITHUB_TOKEN}`,
                'user-agent': 'Action script'
            },
            json
        };

        request(options, (error, response, body) => {
            if (!error && (response.statusCode === 200 || response.statusCode === 201)) {
                resolve();
            } else {
                reject(error);
            }
        });
    });
}

function getGithub(url) {
    return new Promise((resolve, reject) =>
        request({
            url,
            headers: {
                Authorization: `token ${process.env.GITHUB_TOKEN}`,
                'user-agent': 'Action script'
            }
        }, (error, response, body) => {
            if (!error && (response.statusCode === 200 || response.statusCode === 201)) {
                resolve(body);
            } else {
                reject(error);
            }
        }));
}

function getUrl(url) {
    return new Promise((resolve, reject) =>
        request(url, (error, response, body) => {
            if (!error && (response.statusCode === 200 || response.statusCode === 201)) {
                resolve(body);
            } else {
                reject(error);
            }
        }));
}

module.exports = {
    addComment,
    addLabel,
    getGithub,
    getUrl,
    createIssue
};
