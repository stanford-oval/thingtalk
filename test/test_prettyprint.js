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


import assert from 'assert';

import * as AppGrammar from '../lib/syntax_api';

const TEST_CASES = [
// compound type
`class @org.schema {
  list query local_business(out name : String
                            #_[canonical={
                              base=["name"],
                              passive_verb=["called"]
                            }]
                            #[filterable=false],
                            out rating : {
                              value : Number
                              #_[canonical="v"],
                              count : Number
                              #[foo=true]
                            })
  #[minimal_projection=[]];
}`,

// compound type 2
`class @org.schema {
  list query restaurants(out name : String,
                         out reviews : Array({
                           reviewRating : {
                             ratingValue : Number
                           }
                         }))
  #[minimal_projection=[]];
}`,

// sub function
`class @org.schema {
  list query local_business(out name : String,
                            out rating : {
                              value : Number,
                              count : Number
                            })
  #[minimal_projection=[]];

  list query restaurants extends local_business(out serveCuisine : String)
  #[minimal_projection=[]];
}`,

// entity def
`class @com.example {
  entity restaurant
    #_[description="Restaurant"]
    #[has_ner=true];

  query restaurant(out id : Entity(com.example:restaurant),
                   out geo : Location)
  #[minimal_projection=["id"]];
}`,

// aggregate filter
`@org.schema.restaurant() filter count(review) >= 1;`,

// compute table
`[count(reviews)] of @org.schema.restaurants();`,
`[aggregateRating.reviews filter author == "Bob"] of @org.schema.restaurants();`,
`[aggregateRating.reviews filter author == "Bob" as foo] of @org.schema.restaurants();`,

// device selectors
`@light-bulb(name="bathroom").set_power(power=enum on);`,
`@light-bulb(id="io.home-assistant/http://hassio.local:8123-light.hue_bloom_1"^^tt:device_id("bathroom")).set_power(power=enum on);`,
`@light-bulb(all=true).set_power(power=enum on);`,

`dataset @everything
#[language="en"] {
  query = @org.thingpedia.rss(all=true).get_post()
  #_[utterances=["all rss feeds"]];

  query (p_name : String) = @org.thingpedia.rss(name=p_name).get_post()
  #_[utterances=["$p_name rss feed"]];
}`,

// entity inheritance
`class @com.example {
  entity a extends b, c;
}`,

// enums that are keywords
`dataset @foo {
  action (p : Enum(on, off)) = @light-bulb.set_power(power=p);
}`,

// 
`@org.wikidata.human() filter < place_of_birth / located_in_the_administrative_territorial_entity + > == null^^org.wikidata:administrative_territorial_entity("xx");`
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
            codegenned = ast.prettyprint();
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
