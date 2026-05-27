'use strict';

const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { checkObjectStructure } = require('../lib/checkObjectStructure');

describe('checkObjectStructure', () => {
    it('writes a report and aborts on invalid JSON', () => {
        const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'check-object-'));
        const filePath = path.join(tempDir, 'shelly.0.json');

        fs.writeFileSync(filePath, '{"broken":', 'utf8');

        const result = checkObjectStructure(filePath, { adapter: 'shelly' });

        assert.ok(fs.existsSync(result.reportPath));
        const report = fs.readFileSync(result.reportPath, 'utf8');
        assert.match(report, /Input file is not valid JSON/);
        assert.ok(result.errorCount > 0);
    });

    it('aborts when root object keys do not match _id', () => {
        const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'check-object-'));
        const filePath = path.join(tempDir, 'shelly.0.json');

        const dump = {
            'shelly.0.info': {
                _id: 'shelly.0.wrong',
                type: 'channel',
                common: {},
                native: {},
                from: 'system.adapter.shelly.0',
                ts: 1,
                acl: {},
                user: 'system.user.admin',
            },
        };

        fs.writeFileSync(filePath, JSON.stringify(dump, null, 2), 'utf8');

        const result = checkObjectStructure(filePath, { adapter: 'shelly' });

        const report = fs.readFileSync(result.reportPath, 'utf8');
        assert.match(report, /expected object with matching _id/);
        assert.match(report, /Processing aborted/);
        assert.ok(result.errorCount > 0);
    });

    it('reports missing intermediate objects and unknown roles', () => {
        const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'check-object-'));
        const filePath = path.join(tempDir, 'badname.json');

        const dump = {
            'test.0': {
                _id: 'test.0',
                type: 'device',
                common: {},
                native: {},
                from: 'system.adapter.test.0',
                ts: 1,
                acl: {},
                user: 'system.user.admin',
            },
            'test.0.channel.state': {
                _id: 'test.0.channel.state',
                type: 'state',
                common: {
                    name: 'state',
                    type: 'boolean',
                    role: 'unknown.role',
                    read: true,
                    write: false,
                },
                native: {},
                from: 'system.adapter.test.0',
                ts: 1,
                acl: {},
                user: 'system.user.admin',
            },
        };

        fs.writeFileSync(filePath, JSON.stringify(dump, null, 2), 'utf8');

        const result = checkObjectStructure(filePath, { adapter: 'test' });

        const report = fs.readFileSync(result.reportPath, 'utf8');
        assert.match(report, /Filename "badname.json" does not match required pattern/);
        assert.match(report, /missing intermediate object "test.0.channel"/);
        assert.match(report, /unknown role "unknown.role"/);
        assert.ok(result.errorCount > 0);
        assert.ok(result.warningCount > 0);
    });
});
