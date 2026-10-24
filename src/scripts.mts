import fs from 'node:fs';
import path from 'node:path';
import axios from 'axios';
import * as builds from './build.mts';
import semver from 'semver';
import { URL } from 'node:url';
import minimist from 'minimist';
import type { AdapterType } from './types.mts';

const latestJsonPath = path.normalize(path.join(import.meta.dirname, '../sources-dist.json'));
const stableJsonPath = path.normalize(path.join(import.meta.dirname, '../sources-dist-stable.json'));

function requestPromise(url: string) {
    return axios(url).then(data => data.data);
}

function sortRepo(sources: Record<string, any>) {
    // rebuild order
    const names = Object.keys(sources);
    const __sources: Record<string, any> = {};
    names.sort();
    names.forEach(name => {
        const obj = sources[name];

        if (name.startsWith('_')) {
            __sources[name] = obj;
        } else {
            __sources[name] = {
                meta: obj.meta,
                icon: obj.icon,
                url: obj.url,
                type: obj.type,
                version: obj.version,
                published: obj.published,
                versionDate: obj.versionDate,
            };
            Object.keys(__sources[name]).forEach(attr => !__sources[name][attr] && delete __sources[name][attr]);
        }
    });
    return __sources;
}

/**
 * @param adapterName
 */
function getNpmApiUrl(adapterName: string) {
    return `https://registry.npmjs.org/iobroker.${adapterName}`;
}

function updateVersions2(latest: any, stable: any) {
    Object.keys(stable).forEach(name => {
        if (!name.startsWith('_') && stable[name].type !== latest[name].type) {
            console.log(`Update type of "${name}"`);
            stable[name].type = latest[name].type;
        }
    });

    // rebuild order
    stable = sortRepo(stable);
    latest = sortRepo(latest);
    return { stable, latest };
}

// function updateVersions(latest, stable, callback, _index) {
//     if (_index === undefined) {
//         for (const name in stable) {
//             if (!stable.hasOwnProperty(name)) continue;

//             if (stable[name].type !== latest[name].type) {
//                 console.log('Update type of "' + name + '"');
//                 stable[name].type = latest[name].type;
//             }
//         }
//         // rebuild order
//         stable = sortRepo(stable);
//         latest = sortRepo(latest);
//         _index = 0;
//     }

//     const names = Object.keys(latest);

//     // dates are no more required in repos.
//     if (true || _index >= names.length) {
//         callback(latest, stable);
//     } else {
//         const name = names[_index];
//         console.log(`[${_index}/${names.length}] process ${name}`);
//         const url = getNpmApiUrl(name);

//         request(url, (error, state, body) => {
//             if (error) {
//                 console.error('Cannot get version of ioBroker.' + name + ': ' + error);
//             } else {
//                 body = JSON.parse(body);
//                 const times = body.time;

//                 if (latest[name].published !== times.created) {
//                     console.log(`Updated latest published for ${name} from ${latest[name].published} to ${times.created}`);
//                     latest[name].published = times.created;
//                 }
//                 if (latest[name].versionDate !== times.modified) {
//                     console.log(`Updated latest versionDate for ${name} from ${latest[name].versionDate} to ${times.modified}`);
//                     latest[name].versionDate = times.modified;
//                 }
//                 latest[name].versionDate = times.modified;
//                 if (stable[name]) {
//                     if (!stable[name].published) {
//                         console.log(`Updated stable published for ${name} to ${times.created}`);
//                         stable[name].published = times.created;
//                     }
//                     if (stable[name].versionDate !== times[stable[name].version]) {
//                         console.log(`Updated stable versionDate for ${name} from ${stable[name].versionDate} to ${times[stable[name].version]}`);
//                         stable[name].versionDate = times[stable[name].version];
//                     }
//                 }
//             }

//             setTimeout(updateVersions, 100, latest, stable, callback, _index + 1);
//         });
//     }
// }

/**
 * @param adapterName
 */
function getNpmVersion(adapterName: string) {
    return (callback: (result: any) => void) => {
        const url = getNpmApiUrl(adapterName);
        // console.log('getNpmVersion: ' + url);
        axios(url)
            .then(data => {
                try {
                    const info = data.data;
                    const last = info['dist-tags'].latest;
                    callback({ adapter: adapterName, version: last, npm: true, info, date: new Date(info.time[last]) });
                } catch {
                    callback({ adapter: adapterName });
                }
            })
            .catch(e => {
                // without this handler one failed request (403, 404, network) ends the whole run
                console.error(`Cannot read npm info of "${adapterName}": ${e.message}`);
                callback({ adapter: adapterName });
            });
    };
}

/**
 * @param adapterName
 */
function getNpmVersionAsync(adapterName: string) {
    return new Promise((resolve, reject) =>
        getNpmVersion(adapterName)((result: any) => {
            if (result && typeof result.version === 'string') {
                resolve(result.version);
            } else {
                reject(new Error(`Could not find latest version for ${adapterName}!`));
            }
        }),
    );
}

function getGitVersion(latest: any, adapter: string) {
    return function (callback: (result: any) => void) {
        // console.log('getGitVersion: ' + latest[adapter].meta);
        axios(latest[adapter].meta)
            .then(data => {
                try {
                    const info = data.data;
                    callback({
                        adapter,
                        license: info.common.license,
                        version: info.common.version,
                        desc: info.common.desc,
                        git: true,
                        info,
                    });
                } catch (e) {
                    console.error(`Cannot parse GIT for "${adapter}": ${e}`);
                    callback({ adapter });
                }
            })
            .catch(e => {
                console.error(`Cannot read io-package.json of "${adapter}": ${e.message}`);
                callback({ adapter });
            });
    };
}

// ---------- latest commit of every adapter (GitHub API) ----------
//
// Without a token the GitHub API answers 60 requests per hour, then 403 - one run can therefore refresh
// the commit date of roughly 60 adapters only. The dates are cached in a file between the runs: a run
// asks for the adapters whose cached date is the oldest (never asked ones first, equally old ones in
// random order), stops asking after the first 403/429 and keeps the cached date for everything else.
// Run after run this walks through the whole list. With OWN_GITHUB_TOKEN set the limit is 5000/hour
// and every adapter is refreshed in one go.
const commitCachePath = path.normalize(path.join(import.meta.dirname, '../commitDates.json'));

/** Headers for api.github.com - authenticated when OWN_GITHUB_TOKEN is set (5000 instead of 60 requests/hour) */
function githubApiHeaders(): Record<string, string> {
    const headers: Record<string, string> = { 'User-Agent': 'request' };
    if (process.env.OWN_GITHUB_TOKEN) {
        headers.Authorization = `token ${process.env.OWN_GITHUB_TOKEN}`;
    }
    return headers;
}

interface CommitCacheEntry {
    /** ISO date of the newest commit */
    date: string;
    /** ISO date of the last successful request to GitHub */
    checked: string;
}

type CommitCache = Record<string, CommitCacheEntry>;

function readCommitCache(): CommitCache {
    try {
        const cache = JSON.parse(fs.readFileSync(commitCachePath, 'utf8'));
        return cache && typeof cache === 'object' && !Array.isArray(cache) ? cache : {};
    } catch {
        return {};
    }
}

function writeCommitCache(cache: CommitCache): void {
    try {
        fs.writeFileSync(commitCachePath, JSON.stringify(cache, null, 2));
    } catch (e) {
        console.error(`Cannot write ${commitCachePath}: ${e.message}`);
    }
}

/**
 * The order in which GitHub is asked: never checked adapters first, then the longest unchecked ones.
 * Equally old entries are shuffled, so the same adapters do not always end up behind the rate limit.
 */
function commitQueryOrder(adapters: string[], cache: CommitCache): string[] {
    const checkedAt = (adapter: string): number =>
        cache[adapter] ? new Date(cache[adapter].checked).getTime() || 0 : 0;
    return (
        adapters
            .map(adapter => ({ adapter, random: Math.random() }))
            .sort((a, b) => a.random - b.random)
            .map(item => item.adapter)
            // Array.prototype.sort is stable, so the shuffled order survives among equal timestamps
            .sort((a, b) => checkedAt(a) - checkedAt(b))
    );
}

let commitsBlocked = false;
let commitsFetched = 0;
let commitsSkipped = 0;

function getLatestCommit(latest: any, adapter: string) {
    return function (callback: (result: any) => void) {
        // https://raw.githubusercontent.com/husky-koglhof/ioBroker.hmm/master/io-package.json
        const meta = latest[adapter].meta;
        const owner = meta.match(/\.com\/([-.\d\w_]+)\/ioBroker/i);
        if (!owner) {
            console.error(`Cannot find owner in ${meta}`);
            return callback({ adapter });
        }

        if (commitsBlocked) {
            commitsSkipped++;
            return callback({ adapter });
        }

        // only the newest commit is needed
        const url = `https://api.github.com/repos/${owner[1]}/ioBroker.${adapter}/commits?per_page=1`;
        console.log(`getLatestCommit: ${url}`);
        axios({ url, headers: githubApiHeaders() })
            .then(data => {
                const date = new Date(data.data?.[0]?.commit?.author?.date);
                if (!isNaN(date.getTime())) {
                    commitsFetched++;
                    callback({ adapter, commit: true, date });
                } else {
                    callback({ adapter });
                }
            })
            .catch(e => {
                const status = e.response?.status;
                if (status === 403 || status === 429) {
                    // rate limit reached - every following adapter keeps its cached commit date
                    commitsBlocked = true;
                    console.error(
                        `GitHub API answered ${status} for "${adapter}" - no further commit requests in this run`,
                    );
                } else {
                    console.error(`Cannot get latest commit "${adapter}": ${e}`);
                }
                callback({ adapter });
            });
    };
}

// The maintainer strings come from the adapters' io-package.json, so they are third party
// input which ends up as HTML in the generated list.html - escape it.
function escapeHtml(text: unknown) {
    return String(text === undefined || text === null ? '' : text).replace(
        /[&<>"']/g,
        char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char],
    );
}

function formatMaintainer(entry: any, authors: Record<string, number>) {
    if (!entry) {
        return '';
    }
    if (typeof entry === 'object') {
        let name = (entry.name || '').trim();
        if (authors[name.toLowerCase()]) {
            name += `(${authors[name.toLowerCase()]})`;
        }
        return `<a href="mailto:${escapeHtml(entry.email)}">${escapeHtml(name)}</a>`;
    }
    const email = entry.match(/<([^<>\s]+)>/);
    if (email) {
        let name = entry.replace(email[0], '').trim();
        if (authors[name.toLowerCase()]) {
            name += `(${authors[name.toLowerCase()]})`;
        }
        return `<a href="mailto:${escapeHtml(email[1])}">${escapeHtml(name)}</a>`;
    }
    let name = entry;
    if (authors[name.toLowerCase()]) {
        name += `(${authors[name.toLowerCase()]})`;
    }
    return escapeHtml(name);
}

function formatMaintainers(list: any, authors: Record<string, number>) {
    if (typeof list === 'object') {
        const result: string[] = [];
        list.forEach((entry: any) => result.push(formatMaintainer(entry, authors)));
        return result.join('<br>');
    }
    return formatMaintainer(list, authors);
}

// The list of adapters ioBroker.discovery can find. It used to be scraped out of the rendered GitHub
// tree page, which broke without a trace when that adapter moved its sources (lib/adapters ->
// src/lib/adapters, .js -> .ts) - ask the contents API for the directory listing instead.
function getDiscovery(): Promise<string[] | null> {
    return axios({
        url: 'https://api.github.com/repos/ioBroker/ioBroker.discovery/contents/src/lib/adapters',
        headers: githubApiHeaders(),
    })
        .then(data => data.data)
        .then((files: any[]) =>
            (files || [])
                .filter(file => file.type === 'file' && /\.[jt]s$/.test(file.name))
                .map((file: any) => file.name.replace(/\.[jt]s$/, '')),
        )
        .catch((e: any): null => {
            // this only decorates every adapter with one flag - it must not kill the whole page
            console.error(`Cannot read the discovery adapters: ${e.message}`);
            return null;
        });
}

// broken down to for easier understanding
function serial(list: any[], result: any, callback?: (result?: any) => void) {
    if (typeof result === 'function') {
        callback = result;
        result = [];
    }
    if (!list?.length) {
        callback?.(result);
        return;
    }
    const task = list.shift();
    result ||= [];
    console.log(`Rest: ${list.length}`);
    task((r: any) => {
        result.push(r);
        setImmediate(serial, list, result, callback);
    });
}

function createList() {
    let stable: any;
    let latest: any;
    let stats: any;

    return requestPromise(
        'https://raw.githubusercontent.com/ioBroker/ioBroker.repositories/master/sources-dist-stable.json',
    )
        .then(_stable => {
            stable = _stable;
            return requestPromise(
                'https://raw.githubusercontent.com/ioBroker/ioBroker.repositories/master/sources-dist.json',
            );
        })
        .then(_latest => {
            latest = _latest;
            return builds.getStats();
        })
        .then(_stats => {
            stats = _stats;
            return getDiscovery();
        })
        .then(discovery => {
            const commitCache = readCommitCache();
            commitsBlocked = false;
            commitsFetched = 0;
            commitsSkipped = 0;

            const adapters = Object.keys(latest).filter((adapter: string) => !adapter.startsWith('_'));
            const tasks: any[] = [];
            adapters.forEach((adapter: string) => {
                tasks.push(getNpmVersion(adapter));
                tasks.push(getGitVersion(latest, adapter));
            });
            // the GitHub API is rate limited: ask for the adapters with the oldest cached commit date first
            commitQueryOrder(adapters, commitCache).forEach(adapter => tasks.push(getLatestCommit(latest, adapter)));

            return new Promise<string>(resolve =>
                serial(tasks, (results: any) => {
                    const aList: Record<string, any> = {};

                    const types: Partial<Record<AdapterType, number>> = {};
                    const now = new Date();
                    const authors: Record<string, number> = {};
                    for (const adapter in latest) {
                        const git = results.find((result: any) => result.git && result.adapter === adapter);
                        if (git) {
                            const list = git.info.common.authors;
                            if (typeof list === 'object') {
                                list.forEach((entry: any) => {
                                    let user;
                                    if (typeof entry === 'object') {
                                        user = entry.name;
                                    } else {
                                        const email = entry.match(/<([^<>\s]+)>/);
                                        if (email) {
                                            user = entry.replace(email[0], '').trim();
                                        } else {
                                            user = entry.trim();
                                        }
                                    }
                                    if (!user) {
                                        return;
                                    }
                                    user = user.toLowerCase();
                                    authors[user] ||= 0;
                                    authors[user]++;
                                });
                            } else if (list) {
                                let user;
                                const email = list.match(/<([^<>\s]+)>/);
                                if (email) {
                                    user = list.replace(email[0], '').trim();
                                } else {
                                    user = list.trim();
                                }
                                if (!user) {
                                    return;
                                }
                                user = user.toLowerCase();
                                authors[user] ||= 0;
                                authors[user]++;
                            }
                        }
                    }

                    Object.keys(latest).forEach((adapter: string) => {
                        if (adapter.startsWith('_')) {
                            return;
                        }
                        const aItem: {
                            link?: string;
                            icon?: string;
                            desc?: string;
                            license?: string;
                            type?: AdapterType;
                            typeTitle?: string;
                            typeError?: boolean;
                            discovery?: boolean;
                            installs?: number;
                            maintainers?: string;
                            created?: string;
                            versions?: {
                                github?: string;
                                githubDate?: string;
                                latest?: string;
                                latestDate?: string;
                                stable?: string;
                                stableDate?: string;
                            };
                        } = {};
                        try {
                            const type: AdapterType = latest[adapter].type;
                            types[type] = (types[type] || 0) + 1;

                            // image
                            if (latest[adapter].icon) {
                                aItem.icon = latest[adapter].icon;
                            }
                            // Name
                            aItem.link = latest[adapter].meta
                                .replace('raw.githubusercontent', 'github')
                                .replace('/master/io-package.json', '')
                                .replace('/main/io-package.json', '');

                            const git = results.find((result: any) => result.git && result.adapter === adapter);
                            const npm = results.find((result: any) => result.npm && result.adapter === adapter);
                            const commit = results.find((result: any) => result.commit && result.adapter === adapter);
                            if (commit) {
                                commitCache[adapter] = { date: commit.date.toISOString(), checked: now.toISOString() };
                            }

                            // Description
                            aItem.desc = git?.desc ? git.desc.en || git.desc : '';

                            // License
                            aItem.license = git?.license || (npm && (npm.info.license || npm.info.licenses?.[0].type));

                            // Type
                            aItem.type = type;
                            aItem.typeTitle =
                                git && type !== git.info.common.type
                                    ? `git: ${git.info.common.type}, repo: ${type}`
                                    : '';
                            aItem.typeError = git && type !== git.info.common.type;

                            // Discovery
                            if (discovery?.includes(adapter)) {
                                aItem.discovery = true;
                            }

                            if (stats?.[adapter]) {
                                aItem.installs = stats[adapter];
                            }

                            // Maintainer
                            aItem.maintainers = git ? formatMaintainers(git.info.common.authors, authors) : '';

                            // Created on
                            if (npm?.info?.time?.created) {
                                const date = new Date(npm.info.time.created);
                                aItem.created = date.toISOString();
                            }

                            // Version
                            aItem.versions = {
                                github: git ? git.version : '',
                                githubDate: commit?.date || commitCache[adapter]?.date,
                                latest: npm ? npm.version : '',
                                latestDate: npm?.date,
                                stable: stable[adapter] ? stable[adapter].version : '',
                                stableDate: stable[adapter] && npm?.info.time[stable[adapter].version],
                            };

                            aList[adapter] = aItem;
                        } catch (e) {
                            console.error(e);
                        }
                    });

                    // adapters that left the repository do not need a cached date any longer
                    Object.keys(commitCache).forEach(adapter => !latest[adapter] && delete commitCache[adapter]);
                    writeCommitCache(commitCache);
                    console.log(
                        `Commit dates: ${commitsFetched} fetched from GitHub${
                            commitsBlocked ? `, ${commitsSkipped} taken from ${commitCachePath} (rate limit)` : ''
                        }`,
                    );

                    const keys = Object.keys(types);
                    keys.sort();

                    const pad2 = (value: number) => String(value).padStart(2, '0');
                    const nowText = `${pad2(now.getDate())}.${pad2(now.getMonth() + 1)} ${pad2(now.getHours())}:${pad2(now.getMinutes())}`;

                    // The data is injected into a <script> block of list/template.html. A literal
                    // '</script>' in an adapter description would close that block early and spill the
                    // rest of the data into the document as text, so escape every '<' in the JSON.
                    const toScriptJson = (data: unknown) => JSON.stringify(data, null, 2).replace(/</g, '\\u003c');

                    let script = `var adapters = ${toScriptJson(aList)};\n`;
                    script += `\tvar types = ${toScriptJson(types)};\n`;

                    const text = fs
                        .readFileSync(`${import.meta.dirname}/../list/template.html`)
                        .toString()
                        .replace('<!-- INSERT HERE -->', `(${nowText}) `)
                        .replace('//-- INSERT HERE --', script);

                    resolve(text);
                }),
            );
        });
}

/**
 * Finds the git repo for the given adapter name
 *
 * @param adapterName
 * @returns
 */
function findGitRepo(adapterName: string) {
    const url = getNpmApiUrl(adapterName);
    // console.log('findGitRepo: ' + url);
    return axios(url).then(data => {
        const info = data.data;
        if (!info || info.error || !info.repository || typeof info.repository.url !== 'string') {
            throw new Error(`Could not find git repo for ${adapterName}!`);
        }
        return info.repository.url
            .replace(/^git\+/, '')
            .replace(/\.git$/, '')
            .replace(/\/+$/, '');
    });
}

/**
 * Turns a repository URL into the corresponding meta URL, e.g.
 * https://github.com/AlCalzone/ioBroker.zwave2 --> https://raw.githubusercontent.com/AlCalzone/ioBroker.zwave2/master/io-package.json
 *
 * @param repoUrl
 * @returns
 */
function getMetaUrl(repoUrl: string, branch: string) {
    const url = new URL(repoUrl);
    url.host = 'raw.githubusercontent.com';
    url.pathname += `/${branch || 'master'}/io-package.json`;
    return url.toString();
}

/**
 * Retrieves the external icon URL for a given meta URL
 *
 * @param metaUrl
 * @returns
 */
function getIconUrl(metaUrl: string) {
    // console.log('getIconUrl: ' + metaUrl);
    return axios(metaUrl).then(data => {
        const info = data.data;
        if (!info || info.error || !info.common || typeof info.common.extIcon !== 'string') {
            throw new Error(`Could not parse adapter meta at ${metaUrl}`);
        }
        return info.common.extIcon;
    });
}

/**
 * Checks if a given version exists on npm for a given adapter
 *
 * @param adapterName The adapter name to check the version for
 * @param version The version we want to check for existence
 */
function npmVersionExists(adapterName: string, version: string) {
    const url = getNpmApiUrl(adapterName);
    // console.log('npmVersionExists: ' + url);
    return axios(url).then(data => {
        const info = data.data;
        if (!info || info.error || !info.versions) {
            throw new Error(`Could not check npm versions for ${adapterName}!`);
        }
        return version in info.versions;
    });
}

function repoToJsonSorted(repo: Record<string, any>) {
    return JSON.stringify(sortRepo(repo), null, 2);
}

/**
 * Reads a repo file and returns a parsed JSON objec
 *
 * @param repoPath The path to the repo file
 * @returns
 */
function readRepo(repoPath: string): Promise<Record<string, any>> {
    return new Promise<Record<string, any>>((resolve, reject) => {
        fs.readFile(repoPath, (err, data) => {
            if (err) {
                reject(err);
            } else {
                resolve(JSON.parse(data.toString()));
            }
        });
    });
}

function readLatestRepo() {
    return readRepo(latestJsonPath);
}

function readStableRepo() {
    return readRepo(stableJsonPath);
}

/**
 * Writes a repo object into a repo file, while automatically sorting the repo
 *
 * @param repoPath The path to the repo file
 * @param repoContent The content to write into the repo file
 * @returns
 */
function writeRepo(repoPath: string, repoContent: Record<string, any>): Promise<void> {
    return new Promise<void>((resolve, reject) => {
        // Keep the trailing newline. Every write used to strip it, so each run of sort/addToLatest/...
        // produced a spurious "no newline at end of file" diff. The CI formatting check accepts both.
        fs.writeFile(repoPath, `${repoToJsonSorted(repoContent)}\n`, err => {
            if (err) {
                reject(err);
            } else {
                resolve();
            }
        });
    });
}

function writeLatestRepo(latestContent: Record<string, any>) {
    return writeRepo(latestJsonPath, latestContent);
}

function writeStableRepo(stableContent: Record<string, any>) {
    return writeRepo(stableJsonPath, stableContent);
}

async function init() {
    let latest = await readLatestRepo();
    let stable = await readStableRepo();

    ({ latest, stable } = updateVersions2(latest, stable));

    await writeLatestRepo(latest);
    await writeStableRepo(stable);
}

async function sort() {
    const latest = await readLatestRepo();
    await writeLatestRepo(latest);

    const stable = await readStableRepo();
    await writeStableRepo(stable);
}

function findMainBranch(owner: string, adapterName: string) {
    // https://api.github.com/repos/<owner>/<repo-name>
    return axios(`https://api.github.com/repos/${owner}/iobroker.${adapterName}`).then(
        data => data.data.default_branch,
    );
}

/**
 * Adds the given adapter to the latest repo
 *
 * @param adapterName
 * @param type The type of the adapter
 */
async function addToLatest(adapterName: string, type: AdapterType) {
    const gitRepo = await findGitRepo(adapterName);
    const mainBranch = await findMainBranch(gitRepo.match(/\/([-._a-zA-Z0-9]+)\/ioBroker/)[1], adapterName);
    const metaUrl = getMetaUrl(gitRepo, mainBranch);
    const iconUrl = await getIconUrl(metaUrl);

    const latest = await readLatestRepo();
    if (adapterName in latest) {
        throw new Error(`${adapterName} is already in latest!`);
    }
    latest[adapterName] = {
        meta: metaUrl,
        icon: iconUrl,
        type,
    };
    await writeLatestRepo(latest);
}

/**
 * Adds the given adapter to the stable repo
 *
 * @param adapterName
 * @param version The version that should be added to the stable repo
 */
async function addToStable(adapterName: string, version: string) {
    if (!semver.valid(version)) {
        throw new Error(`${version} is not a valid version!`);
    }
    if (!(await npmVersionExists(adapterName, version))) {
        throw new Error(`Cannot add ${adapterName}@${version} to stable because it is not yet on npm!`);
    }

    const stable = await readStableRepo();
    if (adapterName in stable) {
        throw new Error(`${adapterName} is already in stable!`);
    }
    const latest = await readLatestRepo();
    if (!(adapterName in latest)) {
        throw new Error(`Cannot add ${adapterName} to stable because it is not yet in the latest repo!`);
    }

    stable[adapterName] = {
        ...latest[adapterName],
        version,
    };

    await writeStableRepo(stable);
}

/**
 * Updates or adds the given adapter to the stable repo
 *
 * @param adapterName
 * @param version The version that should be set to the stable repo
 */
async function updateStable(adapterName: string, version: string) {
    if (!semver.valid(version)) {
        throw new Error(`${version} is not a valid version!`);
    }
    if (!(await npmVersionExists(adapterName, version))) {
        throw new Error(`Cannot update ${adapterName} to ${version} in stable because it is not yet on npm!`);
    }

    const stable = await readStableRepo();
    if (!(adapterName in stable)) {
        return addToStable(adapterName, version);
    }
    const latest = await readLatestRepo();
    if (!(adapterName in latest)) {
        throw new Error(`Cannot update ${adapterName} in stable because it is not yet in the latest repo!`);
    }

    stable[adapterName] = {
        ...latest[adapterName],
        version,
    };

    await writeStableRepo(stable);
}

async function removeDates() {
    const stable = await readStableRepo();
    Object.keys(stable).forEach(name => {
        if (name.startsWith('_')) {
            return;
        }
        delete stable[name].published;
        delete stable[name].versionDate;
    });
    await writeStableRepo(stable);

    const latest = await readLatestRepo();
    Object.keys(latest).forEach(name => {
        if (name.startsWith('_')) {
            return;
        }
        delete latest[name].published;
        delete latest[name].versionDate;
    });
    await writeLatestRepo(latest);
}

function fail(reason: string) {
    console.error();
    console.error(`ERROR: ${reason}`);
    console.error();
    process.exit(1);
}

function usage(): void {
    console.error('Usage: node src/scripts.mts <command> [options]');
    console.error();
    console.error('Commands:');
    console.error('  init                                              set the version for adapters that have none');
    console.error('  sort                                              re-sort and re-normalize both repository files');
    console.error('  nodates                                           drop published/versionDate from both files');
    console.error('  list [--file <path>]                              build the public adapter list');
    console.error('  addToLatest --name <name> --type <type>           add an adapter to sources-dist.json');
    console.error('  addToStable --name <name> [--version <version>]   add an adapter to sources-dist-stable.json');
    console.error('  updateStable --name <name> [--version <version>]  change the stable version of an adapter');
    console.error();
    console.error('Every command is also accepted as a flag, e.g. `--sort` instead of `sort`.');
}

export { init, sort, createList as list, removeDates as nodates, addToLatest, addToStable, updateStable };

// ESM replacement for the `require.main === module` guard: the block below is the command line entry
// point and must not run when another module imports this file.
if (process.argv[1] && path.resolve(process.argv[1]) === import.meta.filename) {
    // Wrapping the following code in an IIAFE allows us to use async
    (async () => {
        const argv = minimist(process.argv.slice(2));
        // Accept every command both as positional (`scripts.mts sort`, the form package.json uses) and as
        // flag (`--sort`). Only one of the two was honoured per command before, so half of the npm scripts
        // fell through the chain and exited silently with code 0.
        const isCommand = (name: string): boolean => argv._.includes(name) || !!argv[name];

        // update versions for all adapters, which do not have the version
        if (isCommand('init')) {
            init().then(() => process.exit());
        } else if (isCommand('nodates')) {
            await removeDates();
        } else if (isCommand('sort')) {
            await sort();
        } else if (isCommand('list')) {
            // the target file may be given as `--file <path>` or as the value of `--list <path>`
            let file = `${import.meta.dirname}/../list.html`;
            if (typeof argv.file === 'string') {
                file = argv.file;
            } else if (typeof argv.list === 'string') {
                file = argv.list;
            }
            const text = await createList();
            fs.writeFileSync(file, text);
            process.exit();
        } else if (isCommand('addToStable')) {
            const name = argv.name;
            let version = argv.version;
            if (typeof name !== 'string') {
                fail('Please specify the adapter name!');
            }
            if (typeof version !== 'string') {
                // Try to look up the latest version
                console.log('No version specified, adding latest version to stable...');
                try {
                    version = await getNpmVersionAsync(name);
                } catch (e) {
                    fail(e.message);
                }
            }
            addToStable(name, version).catch(e => fail(e.message));
        } else if (isCommand('updateStable')) {
            const name = argv.name;
            let version = argv.version;
            if (typeof name !== 'string') {
                fail('Please specify the adapter name!');
            }
            if (typeof version !== 'string') {
                // Try to look up the latest version
                console.log('No version specified, setting latest version to stable...');
                try {
                    version = await getNpmVersionAsync(name);
                } catch (e) {
                    fail(e.message);
                }
            }
            updateStable(name, version).catch(e => fail(e.message));
        } else if (isCommand('addToLatest')) {
            const { name, type } = argv;
            if (typeof name !== 'string') {
                fail('Please specify the adapter name!');
            }
            if (typeof type !== 'string') {
                fail('Please specify the adapter type!');
            }
            addToLatest(name, type).catch(e => fail(e.message));
        } else {
            usage();
            fail(`Unknown command: ${process.argv.slice(2).join(' ') || '(none)'}`);
        }
    })();
}
