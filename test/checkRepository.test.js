'use strict';
const assert = require('node:assert');

const {
    findReservedAdapterNames,
} = require('../lib/checkRepository_checkAdapterNames');
const {
    checkAdapterRepositoryFiles,
} = require('../lib/checkRepository_checkAdapterRepositoryFiles');

describe('checkRepository helpers', () => {
    it('finds all reserved adapter names in latest data', () => {
        const failures = findReservedAdapterNames({
            alias: {},
            good: {},
            'ioBroker.self': {},
            _repoInfo: {},
        });

        assert.deepStrictEqual(failures, ['alias', 'ioBroker.self']);
    });

    it('checks all adapter repository files before failing', async () => {
        const started = [];
        const result = await checkAdapterRepositoryFiles(
            {
                valid: {
                    meta: 'https://example.com/valid/io-package.json',
                    icon: 'https://example.com/valid/icon.png',
                    type: 'general',
                },
                brokenName: {
                    meta: 'https://example.com/broken-name/io-package.json',
                    icon: 'https://example.com/broken-name/icon.png',
                    type: 'general',
                },
                brokenIcon: {
                    meta: 'https://example.com/broken-icon/io-package.json',
                    icon: 'https://example.com/broken-icon/icon.png',
                    type: 'logic',
                },
                _repoInfo: {},
            },
            {
                concurrency: 1,
                getJson: async url => {
                    if (url.includes('broken-name')) {
                        return {
                            common: {
                                name: 'otherName',
                                type: 'wrongType',
                            },
                        };
                    }

                    return {
                        common: {
                            name: url.includes('broken-icon') ? 'brokenIcon' : 'valid',
                            type: url.includes('broken-icon') ? 'logic' : 'general',
                        },
                    };
                },
                getUrl: async url => {
                    if (url.includes('broken-icon')) {
                        throw new Error('HTTP 404');
                    }
                },
                logOptions: {
                    enabled: true,
                    logger: message => started.push(message),
                    now: () => '2026-05-20T00:00:00.000Z',
                },
            },
        );

        assert.deepStrictEqual(result.failingAdapters.sort(), ['brokenIcon', 'brokenName']);
        assert.deepStrictEqual(
            result.errors,
            [
                'Adapter "brokenName" common.name mismatch in io-package.json: "otherName"',
                'Adapter "brokenName" common.type mismatch: repository="general" io-package.json="wrongType"',
                'Adapter "brokenIcon" icon "https://example.com/broken-icon/icon.png" could not be fetched: HTTP 404',
            ],
        );
        assert.deepStrictEqual(
            started.sort(),
            [
                '[2026-05-20T00:00:00.000Z] Checking adapter "brokenIcon"',
                '[2026-05-20T00:00:00.000Z] Checking adapter "brokenName"',
                '[2026-05-20T00:00:00.000Z] Checking adapter "valid"',
            ],
        );
    });
});
