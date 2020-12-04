// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingTalk
//
// Copyright 2019 The Board of Trustees of the Leland Stanford Junior University
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//    http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
//
// Author: Silei Xu <silei@cs.stanford.edu>


import assert from 'assert';
import * as AppGrammar from '../lib/syntax_api';

const TEST_CASES = [
// device selectors
`@light-bulb(name="bathroom").set_power(power=enum(on));`,
`@light-bulb(id="io.home-assistant/http://hassio.local:8123-light.hue_bloom_1"^^tt:device_id("bathroom")).set_power(power=enum(on));`,
`@light-bulb(all=true).set_power(power=enum(on));`
];

export default function main() {
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
            codegenned = ast.clone().prettyprint();
            assert.strictEqual(codegenned, code);
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
if (!module.parent)
    main();
