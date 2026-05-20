'use strict';
const {
    getRepositoryEntries,
    loadRepository,
    logAdapterStart,
    logCheck,
    logDownload,
} = require('./checkRepository_common');

async function fetchJson(url) {
    const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
    if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
    }
    return response.json();
}

async function fetchUrl(url) {
    const response = await fetch(url, {
        method: 'GET',
        redirect: 'follow',
        signal: AbortSignal.timeout(30000),
    });
    if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
    }
    await response.arrayBuffer();
}

async function mapWithConcurrency(entries, concurrency, worker) {
    let index = 0;

    async function runNext() {
        if (index >= entries.length) {
            return;
        }

        const currentIndex = index;
        index++;
        await worker(entries[currentIndex], currentIndex);
        await runNext();
    }

    const workers = [];
    const limit = Math.min(concurrency, entries.length);
    for (let i = 0; i < limit; i++) {
        workers.push(runNext());
    }
    await Promise.all(workers);
}

async function checkAdapterRepositoryFiles(repository, options = {}) {
    const {
        getJson = fetchJson,
        getUrl = fetchUrl,
        concurrency = 10,
        logOptions,
    } = options;
    const entries = getRepositoryEntries(repository);
    const errors = [];
    const failingAdapters = new Set();
    const metaCache = new Map();
    const iconCache = new Map();

    await mapWithConcurrency(entries, concurrency, async ([name, entry]) => {
        logAdapterStart(name, logOptions);

        try {
            if (!metaCache.has(entry.meta)) {
                metaCache.set(
                    entry.meta,
                    (async () => {
                        try {
                            const response = await getJson(entry.meta);
                            logDownload(entry.meta, true, logOptions, { adapter: name });
                            return response;
                        } catch (error) {
                            logDownload(entry.meta, false, logOptions, { adapter: name, error: error.message });
                            throw error;
                        }
                    })(),
                );
            }
            const ioPackage = await metaCache.get(entry.meta);
            logCheck(name, 'metaDownload', { url: entry.meta }, true, logOptions);

            const matchesName = ioPackage?.common?.name === name;
            logCheck(name, 'metaCommonName', { expected: name, actual: ioPackage?.common?.name }, matchesName, logOptions);

            if (!matchesName) {
                errors.push(
                    `Adapter "${name}" common.name mismatch in io-package.json: "${ioPackage?.common?.name}"`,
                );
                failingAdapters.add(name);
            }

            const matchesType = ioPackage?.common?.type === entry.type;
            logCheck(
                name,
                'metaCommonType',
                { expected: entry.type, actual: ioPackage?.common?.type },
                matchesType,
                logOptions,
            );

            if (!matchesType) {
                errors.push(
                    `Adapter "${name}" common.type mismatch: repository="${entry.type}" io-package.json="${ioPackage?.common?.type}"`,
                );
                failingAdapters.add(name);
            }
        } catch (error) {
            logCheck(name, 'metaDownload', { url: entry.meta, error: error.message }, false, logOptions);
            errors.push(`Adapter "${name}" meta "${entry.meta}" could not be fetched: ${error.message}`);
            failingAdapters.add(name);
        }

        try {
            if (!iconCache.has(entry.icon)) {
                iconCache.set(
                    entry.icon,
                    (async () => {
                        try {
                            await getUrl(entry.icon);
                            logDownload(entry.icon, true, logOptions, { adapter: name });
                        } catch (error) {
                            logDownload(entry.icon, false, logOptions, { adapter: name, error: error.message });
                            throw error;
                        }
                    })(),
                );
            }
            await iconCache.get(entry.icon);
            logCheck(name, 'iconDownload', { url: entry.icon }, true, logOptions);
        } catch (error) {
            logCheck(name, 'iconDownload', { url: entry.icon, error: error.message }, false, logOptions);
            errors.push(`Adapter "${name}" icon "${entry.icon}" could not be fetched: ${error.message}`);
            failingAdapters.add(name);
        }
    });

    return {
        errors,
        failingAdapters: [...failingAdapters],
    };
}

async function run() {
    const latest = loadRepository('sources-dist.json');
    const result = await checkAdapterRepositoryFiles(latest);

    for (const error of result.errors) {
        console.error(error);
    }

    if (result.errors.length) {
        console.error(`Adapters with repository file errors: ${result.failingAdapters.join(', ')}`);
        process.exit(1);
    }

    console.log('sources-dist.json: repository file checks passed.');
}

if (require.main === module) {
    run().catch(error => {
        console.error(error);
        process.exit(1);
    });
}

module.exports = {
    checkAdapterRepositoryFiles,
};
