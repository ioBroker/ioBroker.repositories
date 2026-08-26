import axios, { type AxiosRequestConfig } from 'axios';

/**
 * Thin wrappers around the GitHub REST API. Every URL is hardcoded to this repository, except
 * createIssue(), which files issues in the adapter repositories.
 *
 * Responses are returned as `any` on purpose - these are third party payloads and typing them is
 * follow-up work.
 */

/** A pull request or issue number. Callers pass both the numeric and the string form. */
type IssueId = string | number;

function authHeaders(): Record<string, string> {
    return {
        Authorization: process.env.OWN_GITHUB_TOKEN ? `token ${process.env.OWN_GITHUB_TOKEN}` : 'none',
        'user-agent': 'Action script',
    };
}

export function addLabel(prID: IssueId, labels: string[]): Promise<any> {
    return axios
        .post(
            `https://api.github.com/repos/ioBroker/ioBroker.repositories/issues/${prID}/labels`,
            {
                labels,
            },
            {
                headers: authHeaders(),
            },
        )
        .then(response => response.data);
}

export function deleteLabel(prID: IssueId, label: string): Promise<any> {
    let url = `labels/${label}`;
    if (prID) {
        url = `issues/${prID}/labels/${label}`;
    }
    return axios
        .delete(`https://api.github.com/repos/ioBroker/ioBroker.repositories/${url}`, {
            headers: authHeaders(),
        })
        .then(response => response.data);
}

export function getLabels(prID: IssueId): Promise<any> {
    let url = `labels`;
    if (prID) {
        url = `issues/${prID}/labels`;
    }
    return axios(`https://api.github.com/repos/ioBroker/ioBroker.repositories/${url}`, {
        headers: authHeaders(),
    }).then(response => response.data);
}

export function createLabel(name: string, description: string, color: string): Promise<any> {
    return axios
        .post(
            `https://api.github.com/repos/ioBroker/ioBroker.repositories/labels`,
            {
                name: `${name}`,
                description: `${description}`,
                color: `${color}`,
            },
            {
                headers: authHeaders(),
            },
        )
        .then(response => response.data);
}

export function updateLabel(name: string, description: string, color: string): Promise<any> {
    return axios
        .patch(
            `https://api.github.com/repos/ioBroker/ioBroker.repositories/labels/${name}`,
            {
                description: `${description}`,
                color: `${color}`,
            },
            {
                headers: authHeaders(),
            },
        )
        .then(response => response.data);
}

export function addComment(prID: IssueId, body: string): Promise<any> {
    return axios
        .post(
            `https://api.github.com/repos/ioBroker/ioBroker.repositories/issues/${prID}/comments`,
            { body },
            {
                headers: authHeaders(),
            },
        )
        .then(response => response.data);
}

export function getAllComments(prID: IssueId): Promise<any> {
    ///repos/:owner/:repo/issues/:issue_number/comments
    return axios(`https://api.github.com/repos/ioBroker/ioBroker.repositories/issues/${prID}/comments?per_page=100`, {
        headers: authHeaders(),
    }).then(response => response.data);
}

export function deleteComment(prID: IssueId, commentID: IssueId): Promise<any> {
    ///repos/:owner/:repo/issues/:issue_number/comments
    return axios
        .delete(`https://api.github.com/repos/ioBroker/ioBroker.repositories/issues/comments/${commentID}`, {
            headers: authHeaders(),
        })
        .then(response => response.data);
}

export function createIssue(owner: string, adapter: string, json: any): Promise<any> {
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
    return axios
        .post(`https://api.github.com/repos/${owner}/${adapter}/issues`, json, {
            headers: authHeaders(),
        })
        .then(response => response.data);
}

export function getGithub(url: string, raw?: boolean): Promise<any> {
    const options: AxiosRequestConfig = {
        headers: authHeaders(),
    };
    // unauthenticated requests must not send the literal 'none' - GitHub rejects that
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

export function getUrl(url: string, asText?: boolean): Promise<any> {
    console.log(`Read ${url}`);
    return axios(url, asText ? { transformResponse: (x: any) => x } : {}).then(response => response.data);
}

export function triggerWorkflow(workflow: string, ref?: string): Promise<any> {
    return axios
        .post(
            `https://api.github.com/repos/ioBroker/ioBroker.repositories/actions/workflows/${workflow}/dispatches`,
            { ref: ref || 'master' },
            {
                headers: authHeaders(),
            },
        )
        .then(response => response.data);
}

export function closePR(prID: IssueId): Promise<any> {
    return axios
        .patch(
            `https://api.github.com/repos/ioBroker/ioBroker.repositories/pulls/${prID}`,
            { state: 'closed' },
            {
                headers: authHeaders(),
            },
        )
        .then(response => response.data);
}

export function lockIssue(prID: IssueId): Promise<any> {
    return axios
        .put(
            `https://api.github.com/repos/ioBroker/ioBroker.repositories/issues/${prID}/lock`,
            { lock_reason: 'resolved' },
            {
                headers: authHeaders(),
            },
        )
        .then(response => response.data);
}
