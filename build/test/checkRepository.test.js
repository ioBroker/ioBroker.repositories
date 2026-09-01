"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_assert_1 = __importDefault(require("node:assert"));
const checkRepository_checkAdapterNames_1 = require("../checkRepository_checkAdapterNames");
const checkRepository_checkAdapterRepositoryFiles_1 = require("../checkRepository_checkAdapterRepositoryFiles");
const checkRepository_common_1 = require("../checkRepository_common");
describe('checkRepository helpers', () => {
    it('finds all reserved adapter names in latest data', () => {
        const failures = (0, checkRepository_checkAdapterNames_1.findReservedAdapterNames)({
            alias: {},
            good: {},
            'ioBroker.self': {},
            _repoInfo: {},
        });
        node_assert_1.default.deepStrictEqual(failures, ['alias', 'ioBroker.self']);
    });
    it('checks all adapter repository files before failing', async () => {
        const started = [];
        const result = await (0, checkRepository_checkAdapterRepositoryFiles_1.checkAdapterRepositoryFiles)({
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
        }, {
            concurrency: 1,
            getJson: async (url) => {
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
            getUrl: async (url) => {
                if (url.includes('broken-icon')) {
                    throw new Error('HTTP 404');
                }
            },
            logOptions: {
                enabled: true,
                logger: (message) => started.push(message),
                now: () => '2026-05-20T00:00:00.000Z',
            },
        });
        node_assert_1.default.deepStrictEqual(result.failingAdapters.sort(), ['brokenIcon', 'brokenName']);
        node_assert_1.default.deepStrictEqual(result.errors, [
            'Adapter "brokenName" common.name mismatch in io-package.json: "otherName"',
            'Adapter "brokenName" common.type mismatch: repository="general" io-package.json="wrongType"',
            'Adapter "brokenIcon" icon "https://example.com/broken-icon/icon.png" could not be fetched: HTTP 404',
        ]);
        const startLogs = started.filter((line) => line.includes('Checking adapter')).sort();
        node_assert_1.default.deepStrictEqual(startLogs, [
            '[2026-05-20T00:00:00.000Z] Checking adapter "brokenIcon"',
            '[2026-05-20T00:00:00.000Z] Checking adapter "brokenName"',
            '[2026-05-20T00:00:00.000Z] Checking adapter "valid"',
        ]);
        node_assert_1.default.ok(started.some((line) => line.includes('download url="https://example.com/valid/io-package.json"')));
        node_assert_1.default.ok(started.some((line) => line.includes('download url="https://example.com/broken-icon/icon.png"')));
        node_assert_1.default.ok(started.some((line) => line.includes('adapter="brokenName" check="metaCommonName"')));
        node_assert_1.default.ok(started.some((line) => line.includes('adapter="brokenIcon" check="iconDownload"')));
    });
    it('formats debug check logs with adapter, check, parameters and result', () => {
        const logs = [];
        (0, checkRepository_common_1.logCheck)('myAdapter', 'attributeType', { attribute: 'meta', value: 'https://example.com/io-package.json' }, true, {
            enabled: true,
            logger: (message) => logs.push(message),
            now: () => '2026-05-20T00:00:00.000Z',
        });
        node_assert_1.default.deepStrictEqual(logs, [
            '[2026-05-20T00:00:00.000Z] adapter="myAdapter" check="attributeType" parameters={"attribute":"meta","value":"https://example.com/io-package.json"} result=ok',
        ]);
    });
});
