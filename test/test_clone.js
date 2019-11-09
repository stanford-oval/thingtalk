// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Almond
//
// Copyright 2019 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Silei Xu <silei@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const assert = require('assert');
const AppGrammar = require('../lib/grammar_api');
const { prettyprint } = require('../lib/prettyprint');

const TEST_CASES = [
// device selectors
`now => @light-bulb(name="bathroom").set_power(power=enum(on));`,
`now => @light-bulb(id="io.home-assistant/http://hassio.local:8123-light.hue_bloom_1", name="bathroom").set_power(power=enum(on));`,
`now => @light-bulb(all=true).set_power(power=enum(on));`
];

function main() {
    TEST_CASES.forEach((code, i) => {
        console.log('# Test Case ' + (i+1));

        let ast;
        try {
            ast = AppGrammar.parse(code);
            //console.log(String(ast.statements));
        } catch(e) {
            console.error('Parsing failed');
            console.error(code);
            console.error(e);
            return;
        }

        let codegenned;
        try {
            codegenned = prettyprint(ast.clone(), true);
            assert.strictEqual(code, codegenned);
        } catch(e) {
            console.error('Prettyprint failed');
            console.error('Prettyprinted:');
            console.error(codegenned);
            console.error('====\nCode:');
            console.error(code);
            console.error('====');
            console.error(e.stack);
            if (process.env.TEST_MODE)
                throw e;
        }
    });
}
module.exports = main;
if (!module.parent)
    main();
