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
 *   2. Scans every text body for GitHub user-attachment links whose
 *      filename matches *.json.
 *      Only genuine GitHub file uploads are accepted:
 *        https://github.com/user-attachments/files/<id>/<name>.json
 *      Links to external websites or other GitHub pages are ignored.
 *   3. Logs every detected filename.
 *   4. If no matching attachment is found, exits silently (no PR comment).
 *   5. Downloads the *latest* (most recently attached) JSON file.
 *   6. Logs the full text content of the downloaded file.
 *   7. Passes the parsed content to @iobroker/repochecker's
 *      checkObjectStructure() and posts a formatted comment with the result.
 */

const fs   = require('fs');
const os   = require('os');
const path = require('path');

const axios = require('axios');

const { addComment, getGithub } = require('./common');
const { checkObjectStructure }  = require('@iobroker/repochecker/lib/objectStructure');

// ── helpers ────────────────────────────────────────────────────────────────

/**
 * Extract GitHub user-attachment links whose filename ends in .json.
 *
 * GitHub renders uploaded file attachments in Markdown as:
 *   [filename.json](https://github.com/user-attachments/files/<id>/filename.json)
 *
 * Only this specific URL pattern is accepted.  Links to any external website,
 * raw.githubusercontent.com, or other GitHub pages are intentionally ignored.
 *
 * @param  {string} text - Raw Markdown body of a PR description or comment.
 * @returns {{ filename: string, url: string }[]}  In document order, no duplicates.
 */
function extractJsonAttachments(text) {
    if (!text) return [];

    // Matches Markdown links where the URL is a GitHub user-attachment upload
    // and the filename (last path segment) ends with .json.
    //
    // URL shape:  https://github.com/user-attachments/files/<numeric-id>/<name>.json
    //
    // The link label is intentionally unconstrained – GitHub uses the filename
    // as the label, but we rely on the URL for correctness.
    const UPLOAD_REGEX =
        /\[([^\]]*)\]\((https:\/\/github\.com\/user-attachments\/files\/\d+\/([^\s)]+\.json))\)/gi;

    const results = [];
    const seen    = new Set();
    let m;

    while ((m = UPLOAD_REGEX.exec(text)) !== null) {
        const url      = m[2];
        const filename = m[3]; // last path segment, e.g. "hannah.json"

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

    lines.push('<###checkObjectStructure comment###>'); // 

    lines.push('German explanation can be found at end of comment.');    
    lines.push('Eine deutsche Erläuterung der Fehlercodes befindet sich am Ende des Kommentars.');    
    lines.push('');
    lines.push('');
    lines.push(`## 🔍 Object Structure Check – \`${filename}\``);
    lines.push('');
    lines.push(`**Adapter:** \`${result.adapter}\`  |  **Objects checked:** ${result.objectCount}`);
    lines.push('');
    lines.push(`This is an automatic check ob object structures provided by attached file \`${filename}\``.);
    lines.push('An explanation of errors in english and german can be found at the end of the comment.');    



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
    //    PR body gets the PR's own created_at timestamp.
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
        console.log('No GitHub user-attachment *.json files found in PR body or comments. Nothing to do.');
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

    // 6. Read the raw file text and log it so it is visible in the Actions run log
    let raw;
    try {
        raw = fs.readFileSync(tmpFile, 'utf8');
    } catch (e) {
        throw new Error(`Failed to read ${latest.filename}: ${e.message}`);
    }

    console.log(`\n──── Downloaded file content: ${latest.filename} ────`);
    console.log(raw);
    console.log('──── End of file content ────\n');

    // 7. Parse the JSON
    let objects;
    try {
        objects = JSON.parse(raw);
    } catch (e) {
        throw new Error(`Failed to parse ${latest.filename} as JSON: ${e.message}`);
    }

    // 8. Run the structure check
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

    // 9. Post a formatted comment to the PR
    const commentBody = formatComment(result, latest.filename);
    await addComment(prNumber, commentBody);
    console.log('\nComment posted successfully.');

    // 10. Cleanup temp directory
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
