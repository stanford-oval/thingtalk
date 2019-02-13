"use strict";

const assert = require('assert');
const Parser = require('./test_sr_parser_generator');

async function main() {
    const parser = new Parser();
    assert.strictEqual(parser.parse(['monitor', 'thermostat.get_temp', 'twitter.post', 'param:text', 'qs0']),
    `combine monitor thermostat.get_temp with apply twitter.post string = qs0`);
    assert.strictEqual(parser.parse(['xkcd.get_comic', 'param:number', 'num0', 'notify']),
    `apply xkcd.get_comic number = num0 then notify`);
}
module.exports = main;
if (!module.parent)
    main();
