"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.addLabel = addLabel;
exports.deleteLabel = deleteLabel;
exports.getLabels = getLabels;
exports.createLabel = createLabel;
exports.updateLabel = updateLabel;
exports.addComment = addComment;
exports.getAllComments = getAllComments;
exports.deleteComment = deleteComment;
exports.createIssue = createIssue;
exports.getGithub = getGithub;
exports.getUrl = getUrl;
exports.triggerWorkflow = triggerWorkflow;
exports.closePR = closePR;
exports.lockIssue = lockIssue;
const axios_1 = __importDefault(require("axios"));
function authHeaders() {
    return {
        Authorization: process.env.OWN_GITHUB_TOKEN ? `token ${process.env.OWN_GITHUB_TOKEN}` : 'none',
        'user-agent': 'Action script',
    };
}
function addLabel(prID, labels) {
    return axios_1.default
        .post(`https://api.github.com/repos/ioBroker/ioBroker.repositories/issues/${prID}/labels`, {
        labels,
    }, {
        headers: authHeaders(),
    })
        .then(response => response.data);
}
function deleteLabel(prID, label) {
    let url = `labels/${label}`;
    if (prID) {
        url = `issues/${prID}/labels/${label}`;
    }
    return axios_1.default
        .delete(`https://api.github.com/repos/ioBroker/ioBroker.repositories/${url}`, {
        headers: authHeaders(),
    })
        .then(response => response.data);
}
function getLabels(prID) {
    let url = `labels`;
    if (prID) {
        url = `issues/${prID}/labels`;
    }
    return (0, axios_1.default)(`https://api.github.com/repos/ioBroker/ioBroker.repositories/${url}`, {
        headers: authHeaders(),
    }).then(response => response.data);
}
function createLabel(name, description, color) {
    return axios_1.default
        .post(`https://api.github.com/repos/ioBroker/ioBroker.repositories/labels`, {
        name: `${name}`,
        description: `${description}`,
        color: `${color}`,
    }, {
        headers: authHeaders(),
    })
        .then(response => response.data);
}
function updateLabel(name, description, color) {
    return axios_1.default
        .patch(`https://api.github.com/repos/ioBroker/ioBroker.repositories/labels/${name}`, {
        description: `${description}`,
        color: `${color}`,
    }, {
        headers: authHeaders(),
    })
        .then(response => response.data);
}
function addComment(prID, body) {
    return axios_1.default
        .post(`https://api.github.com/repos/ioBroker/ioBroker.repositories/issues/${prID}/comments`, { body }, {
        headers: authHeaders(),
    })
        .then(response => response.data);
}
function getAllComments(prID) {
    ///repos/:owner/:repo/issues/:issue_number/comments
    return (0, axios_1.default)(`https://api.github.com/repos/ioBroker/ioBroker.repositories/issues/${prID}/comments?per_page=100`, {
        headers: authHeaders(),
    }).then(response => response.data);
}
function deleteComment(prID, commentID) {
    ///repos/:owner/:repo/issues/:issue_number/comments
    return axios_1.default
        .delete(`https://api.github.com/repos/ioBroker/ioBroker.repositories/issues/comments/${commentID}`, {
        headers: authHeaders(),
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
    return axios_1.default
        .post(`https://api.github.com/repos/${owner}/${adapter}/issues`, json, {
        headers: authHeaders(),
    })
        .then(response => response.data);
}
function getGithub(url, raw) {
    const options = {
        headers: authHeaders(),
    };
    // unauthenticated requests must not send the literal 'none' - GitHub rejects that
    if (!process.env.OWN_GITHUB_TOKEN) {
        delete options.headers.Authorization;
    }
    if (raw) {
        options.transformResponse = [];
    }
    return (0, axios_1.default)(url, options)
        .then(response => response.data)
        .catch(e => {
        console.error(`Cannot read ${url}: ${e}`);
        throw e;
    });
}
function getUrl(url, asText) {
    console.log(`Read ${url}`);
    return (0, axios_1.default)(url, asText ? { transformResponse: (x) => x } : {}).then(response => response.data);
}
function triggerWorkflow(workflow, ref) {
    return axios_1.default
        .post(`https://api.github.com/repos/ioBroker/ioBroker.repositories/actions/workflows/${workflow}/dispatches`, { ref: ref || 'master' }, {
        headers: authHeaders(),
    })
        .then(response => response.data);
}
function closePR(prID) {
    return axios_1.default
        .patch(`https://api.github.com/repos/ioBroker/ioBroker.repositories/pulls/${prID}`, { state: 'closed' }, {
        headers: authHeaders(),
    })
        .then(response => response.data);
}
function lockIssue(prID) {
    return axios_1.default
        .put(`https://api.github.com/repos/ioBroker/ioBroker.repositories/issues/${prID}/lock`, { lock_reason: 'resolved' }, {
        headers: authHeaders(),
    })
        .then(response => response.data);
}
