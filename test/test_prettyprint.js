// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingTalk
//
// Copyright 2019-2020 The Board of Trustees of the Leland Stanford Junior University
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
"use strict";

const assert = require('assert');
const AppGrammar = require('../lib/grammar_api');
const { prettyprint } = require('../lib/prettyprint');

const TEST_CASES = [
// compound type
`class @org.schema {
  list query local_business(out name: String
                            #_[canonical={
                              base=["name"],
                              passive_verb=["called"]
                            }]
                            #[filterable=false],
                            out rating: {
                              value: Number
                              #_[canonical="v"],
                              count: Number
                              #[foo=true]
                            })
  #[minimal_projection=[]];
}
`,

// sub function
`class @org.schema {
  list query local_business(out name: String,
                            out rating: {
                              value: Number,
                              count: Number
                            })
  #[minimal_projection=[]];

  list query restaurants extends local_business(out serveCuisine: String)
  #[minimal_projection=[]];
}
`,

// entity def
`class @com.example {
  entity restaurant
    #_[description="Restaurant"]
    #[has_ner=true];

  query restaurant(out id: Entity(com.example:restaurant),
                   out geo: Location)
  #[minimal_projection=["id"]];
}
`,

// aggregate filter
`now => (@org.schema.restaurant()), count(review) >= 1 => notify;`,

// compute table
`now => compute (count(reviews)) of (@org.schema.restaurant()) => notify;`,
`now => compute ((aggregateRating.reviews) filter { author == "Bob" }) of (@org.schema.restaurants()) => notify;`,
`now => [foo] of (compute ((aggregateRating.reviews) filter { author == "Bob" }) as foo of (@org.schema.restaurants())) => notify;`,

// device selectors
`now => @light-bulb(name="bathroom").set_power(power=enum(on));`,
`now => @light-bulb(id="io.home-assistant/http://hassio.local:8123-light.hue_bloom_1", name="bathroom").set_power(power=enum(on));`,
`now => @light-bulb(all=true).set_power(power=enum(on));`,

`dataset @everything language "en" {
  query := @org.thingpedia.rss(all=true).get_post()
  #_[utterances=["all rss feeds"]];

  query (p_name :String) := @org.thingpedia.rss(name=p_name).get_post()
  #_[utterances=["$p_name rss feed"]];
}
`,
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
            codegenned = prettyprint(ast, true);
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
