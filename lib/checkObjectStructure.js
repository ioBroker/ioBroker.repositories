'use strict';

/**
 * checkObjectStructure.js
 *
 * GitHub Actions script triggered by:
 *   - workflow_dispatch  (manual, PR number supplied via env PR_NUMBER)
 *   - pull_request_target (opened / synchronize / reopened)
 *   - issue_comment       (created / edited on a PR)
 *
 * What it does:
 *   1. Fetches the PR body and all PR comments.
 *   2. Scans every text body for Markdown image/link attachments whose
 *      filename matches *.json  (GitHub stores uploaded files under
 *      https://github.com/…/files/… and renders them as plain links).
 *   3. Logs every detected filename.
 *   4. Downloads the *latest* (most recently attached) JSON file.
 *   5. Passes the parsed content to @iobroker/repochecker's
 *      checkObjectStructure() and posts a formatted comment with the result.
 */

const fs   = require('fs');
const os   = require('os');
const path = require('path');

const axios    = require('axios');
const unzipper = require('unzipper');

const { addComment, getGithub } = require('./common');
const { checkObjectStructure }  = require('@iobroker/repochecker/lib/objectStructure');

// ── helpers ────────────────────────────────────────────────────────────────

/**
 * Extract all GitHub file-attachment URLs whose filename ends in .json.
 * GitHub renders attachments in Markdown as either:
 *   [filename.json](https://github.com/.../files/12345/filename.json)
 * or an inline image variant, but the URL always contains the filename.
 *
 * Returns an array of { filename, url } objects in document order.
 */
function extractJsonAttachments(text) {
    if (!text) return [];

    // Match both Markdown links and bare URLs that look like GitHub uploads
    // Pattern covers:
    //   [any text](URL/filename.json)
    //   https://github.com/.../files/.../something.json
    const ATTACHMENT_REGEX =
        /(?:\[[^\]]*\]\(|(https?:\/\/[^\s)]+))(https?:\/\/github\.com\/[^\s)]+\/files\/[^\s)]*\.json)/gi;

    // Also catch the simpler rendered form: bare link or markdown link
    const LINK_REGEX = /\[([^\]]+\.json)\]\((https?:\/\/[^\s)]+)\)/gi;

    const results = [];
    const seen    = new Set();

    let m;

    // Markdown links: [name.json](url)  or  [label](url/name.json)
    LINK_REGEX.lastIndex = 0;
    while ((m = LINK_REGEX.exec(text)) !== null) {
        const label = m[1];
        const url   = m[2];
        // Accept if the label ends in .json OR the url path ends in .json
        if (label.endsWith('.json') || url.split('?')[0].endsWith('.json')) {
            const filename = url.split('/').pop().split('?')[0] || label;
            if (!seen.has(url)) {
                seen.add(url);
                results.push({ filename, url });
            }
        }
    }

    // Bare GitHub file URLs not wrapped in Markdown
    const BARE_URL_REGEX = /https?:\/\/github\.com\/[^\s)>]+\/files\/[^\s)>]*\.json/gi;
    BARE_URL_REGEX.lastIndex = 0;
    while ((m = BARE_URL_REGEX.exec(text)) !== null) {
        const url      = m[0];
        const filename = url.split('/').pop().split('?')[0];
        if (!seen.has(url)) {
            seen.add(url);
            results.push({ filename, url });
        }
    }

    return results;
}

/**
 * Download a file from `url` and save it to `destPath`.
 * Follows redirects (axios does this automatically).
 */
async function downloadFile(url, destPath) {
    const response = await axios({
        url,
        method:       'GET',
        responseType: 'arraybuffer',
        headers: {
            Authorization: process.env.OWN_GITHUB_TOKEN
                ? `token ${process.env.OWN_GITHUB_TOKEN}`
                : undefined,
            'user-agent': 'Action script',
        },
        maxRedirects: 10,
    });
    fs.writeFileSync(destPath, Buffer.from(response.data));
}

/**
 * Format the CheckResult from checkObjectStructure() into a Markdown comment.
 */
function formatComment(result, filename) {
    const lines = [];

    lines.push(`## 🔍 Object Structure Check – \`${filename}\``);
    lines.push('');
    lines.push(`**Adapter:** \`${result.adapter}\`  |  **Objects checked:** ${result.objectCount}`);
    lines.push('');

    if (result.errors.length === 0 && result.warnings.length === 0) {
        lines.push('✅ **No errors or warnings found. Great job!**');
        return lines.join('\n');
    }

    if (result.errors.length > 0) {
        lines.push(`### ❌ Errors (${result.errors.length})`);
        lines.push('');
        lines.push('| Code | Message |');
        lines.push('|------|---------|');
        for (const { code, message } of result.errors) {
            // Escape pipe characters inside table cells
            lines.push(`| \`${code}\` | ${message.replace(/\|/g, '\\|')} |`);
        }
        lines.push('');
    }

    if (result.warnings.length > 0) {
        lines.push(`### ⚠️ Warnings (${result.warnings.length})`);
        lines.push('');
        lines.push('| Code | Message |');
        lines.push('|------|---------|');
        for (const { code, message } of result.warnings) {
            lines.push(`| \`${code}\` | ${message.replace(/\|/g, '\\|')} |`);
        }
        lines.push('');
    }

    return lines.join('\n');
}

/**
 * Derive the adapter name from the JSON filename.
 * Convention: the file is usually named like  adapterName.objects.json
 * or adapterName.json, so we strip known suffixes and return what remains.
 */
function adapterNameFromFilename(filename) {
    return filename
        .replace(/\.objects\.json$/i, '')
        .replace(/\.json$/i, '')
        .replace(/^iobroker\./i, '');
}

// ── main ──────────────────────────────────────────────────────────────────

async function doIt() {
    const prNumber = parseInt(process.env.PR_NUMBER, 10);
    if (!prNumber || isNaN(prNumber)) {
        throw new Error('PR_NUMBER environment variable is missing or not a valid integer.');
    }

    console.log(`\n=== checkObjectStructure – PR #${prNumber} ===\n`);

    // 1. Fetch PR body + all comments
    const pr = await getGithub(
        `https://api.github.com/repos/ioBroker/ioBroker.repositories/pulls/${prNumber}`,
    );

    const commentsRaw = await getGithub(
        `https://api.github.com/repos/ioBroker/ioBroker.repositories/issues/${prNumber}/comments?per_page=100`,
    );

    // 2. Build an ordered list of { filename, url, timestamp }
    //    PR body has no explicit timestamp; treat it as epoch 0 so comments always supersede it.
    const allAttachments = [];

    const bodyAttachments = extractJsonAttachments(pr.body || '');
    for (const att of bodyAttachments) {
        allAttachments.push({ ...att, timestamp: new Date(pr.created_at).getTime() });
    }

    for (const comment of commentsRaw) {
        const commentAttachments = extractJsonAttachments(comment.body || '');
        for (const att of commentAttachments) {
            allAttachments.push({ ...att, timestamp: new Date(comment.created_at).getTime() });
        }
    }

    // 3. Log every detected filename
    if (allAttachments.length === 0) {
        console.log('No *.json file attachments found in PR body or comments. Nothing to do.');
        return 'no-attachments';
    }

    console.log(`Detected ${allAttachments.length} JSON attachment(s):`);
    for (const att of allAttachments) {
        const ts = new Date(att.timestamp).toISOString();
        console.log(`  • ${att.filename}  [${ts}]  ${att.url}`);
    }

    // 4. Pick the latest attachment (highest timestamp = most recently posted)
    allAttachments.sort((a, b) => b.timestamp - a.timestamp);
    const latest = allAttachments[0];
    console.log(`\nProcessing latest attachment: ${latest.filename}`);

    // 5. Download to a temp directory
    const tmpDir  = fs.mkdtempSync(path.join(os.tmpdir(), 'checkObjectStructure-'));
    const tmpFile = path.join(tmpDir, latest.filename);

    console.log(`Downloading to: ${tmpFile}`);
    await downloadFile(latest.url, tmpFile);
    console.log('Download complete.');

    // 6. Read and parse the JSON
    let objects;
    try {
        const raw = fs.readFileSync(tmpFile, 'utf8');
        objects   = JSON.parse(raw);
    } catch (e) {
        throw new Error(`Failed to parse ${latest.filename} as JSON: ${e.message}`);
    }

    // 7. Run the structure check
    const adapter = adapterNameFromFilename(latest.filename);
    console.log(`Running checkObjectStructure for adapter: "${adapter}"`);

    const result = checkObjectStructure(objects, adapter);

    console.log(`\nResult – errors: ${result.errors.length}, warnings: ${result.warnings.length}`);
    if (result.errors.length > 0) {
        console.log('\nErrors:');
        for (const e of result.errors) console.log(`  [${e.code}] ${e.message}`);
    }
    if (result.warnings.length > 0) {
        console.log('\nWarnings:');
        for (const w of result.warnings) console.log(`  [${w.code}] ${w.message}`);
    }

    // 8. Post a formatted comment to the PR
    const commentBody = formatComment(result, latest.filename);
    await addComment(prNumber, commentBody);
    console.log('\nComment posted successfully.');

    // 9. Cleanup temp directory
    try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch (_) {
        // non-fatal
    }

    return 'done';
}

console.log(`OWN_GITHUB_TOKEN length: ${(process.env.OWN_GITHUB_TOKEN || '').length}`);
console.log(`PR_NUMBER: ${process.env.PR_NUMBER}`);

doIt()
    .then(result => {
        console.log(`\nResult: ${result}`);
        process.exit(0);
    })
    .catch(e => {
        console.error(`\nFatal error: ${e.message || e}`);
        process.exit(1);
    });
