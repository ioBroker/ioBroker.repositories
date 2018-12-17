'use strict';
let expect    = require('chai').expect;
const fs      = require('fs');
const request = require('request');
let latest;
let stable;

describe('Test Repository', function() {
    it('Test Repository: latest', function (done) {
        let text = fs.readFileSync(__dirname + '/../sources-dist.json');
        try {
            latest = JSON.parse(text);
        } catch (e) {
            expect(e).to.be.null;
        }
        done();
    });

    it('Test Repository: stable', function (done) {
        let text = fs.readFileSync(__dirname + '/../sources-dist-stable.json');
        try {
            stable = JSON.parse(text);
        } catch (e) {
            expect(e).to.be.null;
        }
        done();
    });

    it('Test Repository: compare types', function (done) {
        this.timeout(120000);
        for (let id in stable) {
            if (stable.hasOwnProperty(id)) {
                expect(stable[id]).to.be.equal(stable[id].toLowerCase());
                expect(latest[id], id + ' not in latest but in stable').to.be.not.undefined;
                expect(latest[id].type).to.be.not.undefined;
                expect(latest[id].type).to.be.not.equal('');
                expect(latest[id].type).to.be.equal(stable[id].type);
            }
        }
        let count = 0;
        // compare types with io-package.json
        for (let id in latest) {
            if (latest.hasOwnProperty(id)) {
                expect(latest[id]).to.be.equal(latest[id].toLowerCase());
                if (latest[id].meta && latest[id].meta.match(/io-package\.json$/)) {
                    count++;
                    (function (_type, _id) {
                        // console.log('Check "' + _id + '"');
                        request(latest[_id].meta, function (error, response, body) {
                            let pack;
                            try {
                                pack = JSON.parse(body);
                            } catch (e) {
                                console.error('Cannot parse pack "' + _id + '": ' + e);
                                expect(e).to.be.null;
                            }

                            if (pack && pack.common && pack.common.type !== _type) {
                                console.error('Types in "' + _id + '" are not equal: ' + pack.common.type  + ' !== ' + _type);
                            }

                            /*expect(pack).to.be.not.undefined;
                            expect(pack.common).to.be.not.undefined;
                            expect(pack.common.type).to.be.equal(_type);*/

                            if (!--count) {
                                done();
                            }
                            // console.log('Only ' + count + ' urls left');
                        });
                    })(latest[id].type, id);
                }
            }
        }
        if (!count) done();
    });

    it('Test Repository: check latest vs. stable', function (done) {
        console.log();
        for (let id in latest) {
            if (latest.hasOwnProperty(id) && !stable.hasOwnProperty(id)) {
                console.log('Info: Adapter "' + id + '" is not in stable.')
            }
        }
        done();
    });

});
