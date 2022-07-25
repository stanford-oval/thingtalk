// -*- mode: typescript; indent-tabs-mode: nil; js-basic-offArray: 4 -*-
//
// This file is part of ThingTalk
//
// Copyright 2022 The Board of Trustees of the Leland Stanford Junior University
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
// Author: Shicheng Liu <shicheng@cs.stanford.edu>

import * as Grammar from '../lib/syntax_api';
// import SchemaRetriever from '../lib/schema';

import _mockSchemaDelegate from './mock_schema_delegate';
import { applyLevenshteinWrapper } from '../lib/ast';
// const schemaRetriever = new SchemaRetriever(_mockSchemaDelegate, null, true);

const TEST_CASES = [
    // basics: adding an operation
    ["@com.twitter.post();",
     "$cont @com.twitter.post() filter name == 'Chinese';",
     "@com.twitter.post() filter name == 'Chinese';"
    ],
    ["@com.twitter.post();",
     "$cont [name] of @com.twitter.post();",
     "[name] of @com.twitter.post();"
    ],
    ["@com.twitter.post();",
     "$cont sort (stars asc of @com.twitter.post());",
     "sort (stars asc of @com.twitter.post());"
    ],
    ["@com.twitter.post();",
     "$cont [address] of sort (stars asc of (@com.twitter.post() filter name == 'Chinese'));",
     "[address] of sort (stars asc of (@com.twitter.post() filter name == 'Chinese'));"
    ],
    ["@com.yelp.restaurant() filter cuisine =~ 'chinese';",
     "$cont [address] of @com.yelp.restaurant();",
     "[address] of @com.yelp.restaurant() filter cuisine =~ 'chinese';"
    ],
    ["[address] of @com.yelp.restaurant();",
     "$cont @com.yelp.restaurant() filter cuisine =~ 'chinese';",
     "[address] of @com.yelp.restaurant() filter cuisine =~ 'chinese';"
    ],
    ["@com.yelp.restaurant();",
     "$cont [rating >= 4] of @com.yelp.restaurant();",
     "[rating >= 4] of @com.yelp.restaurant();"
    ],
    ["@com.yelp.restaurant();",
     "$cont [distance(location, $location.current_location)] of @com.yelp.restaurant();",
     "[distance(location, $location.current_location)] of @com.yelp.restaurant();"
    ],
    ["@com.yelp.restaurant();",
     "$cont [count(reviews)] of @com.yelp.restaurant();",
     "[count(reviews)] of @com.yelp.restaurant();"
    ],
    ["@com.yelp.restaurant() filter cuisine =~ 'chinese';",
     "$cont count(@com.yelp.restaurant());",
     "count(@com.yelp.restaurant() filter cuisine =~ 'chinese');"
    ],
    ["@org.wikidata.people();",
     "$cont @org.wikidata.people(), place_of_birth/located_in_admin_entity == 'Palo Alto';",
     "@org.wikidata.people(), place_of_birth/located_in_admin_entity == 'Palo Alto';"
    ],
    ["[reviews] of @com.yelp.restaurant();",
     "$cont [reviews filter rating == 1] of @com.yelp.restaurant();",
     "[reviews filter rating == 1] of @com.yelp.restaurant();"
    ],
    ["@com.yelp.restaurant();",
     "$cont sort(rating desc of @com.yelp.restaurant());",
     "sort(rating desc of @com.yelp.restaurant());"
    ],
    ["@com.yelp.restaurant();",
     "$cont sort(rating desc of @com.yelp.restaurant())[1];",
     "sort(rating desc of @com.yelp.restaurant())[1];"
    ],
    ["@com.yelp.restaurant();",
     "$cont @com.yelp.restaurant()[1];",
     "@com.yelp.restaurant()[1];"
    ],


    // basic: changing a schema
    // NOTE: i copied these from the sheet for completeness
    //       but this is what needs to be discussed next
    //       using result of previous query
    //       for reason, this cannot parse
    // ["@com.yelp.restaurant();",
    //  "$cont @com.yelp.book(id=$context.result.id);",
    //  "@com.yelp.book(id=$context.result.id);"
    // ],
    // ["@com.yelp.restaurant();",
    //  "$cont @com.yelp.book(id=$context.result.result);",
    //  "@com.yelp.book(id=$context.result.result);"
    // ],

    // basic: retaining an operation
    //        unlikely to occur in deployment, but added for completeness
    ["@com.twitter.post() filter name == 'Chinese';",
     "$cont @com.twitter.post();",
     "@com.twitter.post() filter name == 'Chinese';"
    ],
    ["[name] of @com.twitter.post();",
     "$cont @com.twitter.post();",
     "[name] of @com.twitter.post();"
    ],
    ["sort (stars asc of @com.twitter.post());",
     "$cont @com.twitter.post();",
     "sort (stars asc of @com.twitter.post());"
    ],
    ["[address] of sort (stars asc of (@com.twitter.post() filter name == 'Chinese'));",
     "$cont @com.twitter.post();",
     "[address] of sort (stars asc of (@com.twitter.post() filter name == 'Chinese'));"
    ],


    // modifying or adding filters
    ["@com.twitter.post() filter name == 'Japanese';",
     "$cont @com.twitter.post() filter name == 'Chinese';",
     "@com.twitter.post() filter name == 'Chinese';"
    ],
    ["(count(@com.twitter.post() filter name == 'Japanese')) filter place == 'Palo Alto';",
    "$cont @com.twitter.post() filter name == 'Chinese';",
    "(count(@com.twitter.post() filter name == 'Chinese')) filter place == 'Palo Alto';"
    ],
    ["count(@com.twitter.post() filter name == 'Japanese');",
    "$cont @com.twitter.post() filter name == 'Chinese';",
     "count(@com.twitter.post() filter name == 'Chinese');"
    ],
    ["@com.twitter.post() filter name == 'Japanese';",
    "$cont [post_name] of @com.twitter.post();",
    "[post_name] of @com.twitter.post() filter name == 'Japanese';"
    ],
    ["[address] of sort (stars asc of (@com.twitter.post() filter name == 'Chinese'));",
    "$cont @com.twitter.post() filter name == 'Japanese';",
    "[address] of sort (stars asc of (@com.twitter.post() filter name == 'Japanese'));"
    ],
    ["@com.yelp.restaurant() filter cuisine =~ 'chinese';",
     "$cont @com.yelp.restaurant(), rating >= 4;",
     "@com.yelp.restaurant() filter cuisine =~ 'chinese' && rating >= 4;"
    ],

    // modifying projections
    ["[author] of @com.twitter.post();",
    "$cont [name] of @com.twitter.post();",
    "[name] of @com.twitter.post();"
    ],
    ["[author] of @com.twitter.post();",
    "$cont [name] of (@com.twitter.post() filter location == 'Palo Alto');",
    "[name] of (@com.twitter.post() filter location == 'Palo Alto');"
    ],
    ["[author] of (@com.twitter.post() filter location == 'Mountain View');",
    "$cont [name] of (@com.twitter.post() filter location == 'Palo Alto');",
    "[name] of (@com.twitter.post() filter location == 'Palo Alto');"
    ],
    ["[author] of (sort (stars asc of @com.twitter.post() filter location == 'Mountain View'));",
    "$cont [name] of (@com.twitter.post() filter location == 'Palo Alto');",
    "[name] of (@com.twitter.post() filter location == 'Palo Alto');"
    ],
    ["[author] of (sort (stars asc of @com.twitter.post() filter location == 'Mountain View'));",
    "$cont [name] of @com.twitter.post();",
    "[name] of (sort (stars asc of @com.twitter.post() filter location == 'Mountain View'));"
    ],

    // joins
    ["@com.theater() filter location == 'Palo Alto';",
    "$cont [actor.name, theater.name] of (@com.theater() join @com.actors());",
    "[actor.name, theater.name] of (@com.theater() join @com.actors()) filter location == 'Palo Alto';"
    ],
    ["avg(reviews of sort(stars desc of (@com.theater() filter location == 'Palo Alto'))[1:5]);",
    "$cont [actor.name, theater.name] of (@com.theater() join @com.actors());",
    "[actor.name, theater.name] of sort(stars desc of ((@com.theater() join @com.actors()) filter location == 'Palo Alto'))[1:5];"
    ],
    ["@com.theater() filter location == 'Palo Alto';",
     "$cont [first.id, second.stars] of (@com.theater() join @com.movies()) filter first.movie == second.id;",
     "[first.id, second.stars] of (@com.theater() join @com.movies()) filter first.movie == second.id && location == 'Palo Alto';"
    ],

    // chain expression
    ["sort (stars asc of @com.twitter.post() filter location == 'Mountain View') => [name] of @com.yelp();",
    "$cont [name] of (@com.twitter.post() filter location == 'Palo Alto');",
    "[name] of (@com.twitter.post() filter location == 'Palo Alto');"
    ],
    ["[name] of @com.yelp() => [author] of (sort (stars asc of @com.twitter.post() filter location == 'Mountain View'));",
    "$cont [name] of (@com.twitter.post() filter location == 'Palo Alto');",
    "[name] of (@com.twitter.post() filter location == 'Palo Alto');"
    ],
    ["@com.yelp() filter name == 'ThingTalk' => sort (stars asc of @com.twitter.post() filter location == 'Mountain View');",
    "$cont @com.twitter.post() filter location == 'Palo Alto' => @com.yelp() filter name == 'ThingTalk_';",
    "sort (stars asc of @com.twitter.post() filter location == 'Palo Alto') => @com.yelp() filter name == 'ThingTalk_';"
    ],
    ["[address] of @com.yelp() => [author] of (sort (stars asc of @com.twitter.post() filter location == 'Mountain View'));",
    "$cont @com.twitter.post() filter location == 'Palo Alto' => @com.yelp();",
    "sort (stars asc of @com.twitter.post() filter location == 'Palo Alto') => @com.yelp();"
    ],
    // test cases like the following one is not realistic, and the chain expression algorithm probably is debatable
    // first projection is not used, so this does not work
    // ["[address] of @com.yelp() => [author] of (sort (stars asc of @com.twitter.post() filter location == 'Mountain View'));",
    // "$cont [name] of (@com.twitter.post() filter location == 'Palo Alto') => @com.yelp();",
    // "[name] of (@com.twitter.post() filter location == 'Palo Alto') => @com.yelp();"
    // ],

    // api params
    ["@com.taxi(departure='Palo Alto', destination='Menlo Park');",
    "$cont @com.taxi(departure='Mountain View', destination='Menlo Park');",
    "@com.taxi(departure='Mountain View', destination='Menlo Park');"
    ],
    ["@com.taxi(departure='Palo Alto');",
    "$cont @com.taxi(departure='Mountain View', destination='Menlo Park');",
    "@com.taxi(departure='Mountain View', destination='Menlo Park');"
    ],
    ["@com.taxi(departure='Palo Alto', destination='Menlo Park', fare=11);",
    "$cont @com.taxi(departure='Mountain View');",
    "@com.taxi(departure='Mountain View', destination='Menlo Park', fare=11);"
    ],
    ["@com.taxi(departure='Palo Alto', destination='Menlo Park', fare=11);",
    "$cont @com.taxi(departure='Mountain View', fare=10);",
    "@com.taxi(departure='Mountain View', destination='Menlo Park', fare=10);"
    ],
    ["[author] of (sort (stars asc of @com.twitter.post(time=1789, other=true) filter location == 'Mountain View'));",
    "$cont [name] of @com.twitter.post(time=986);",
    "[name] of (sort (stars asc of @com.twitter.post(other=true, time=986) filter location == 'Mountain View'));"
    ],
    ["[author] of (sort (stars asc of @com.twitter.post(name='vhfPni9pci29SEHrN1OtRg'^^com.yelp:restaurant('Ramen Nagi')) filter location == 'Mountain View'));",
    "$cont [name] of @com.twitter.post(zime=986);",
    "[name] of (sort (stars asc of @com.twitter.post(zime=986, name='vhfPni9pci29SEHrN1OtRg'^^com.yelp:restaurant('Ramen Nagi')) filter location == 'Mountain View'));"
    ],

    // This currently cannot pass because filters are optimized
    ["(@com.twitter.post() filter name == 'Japanese') filter place == 'Palo Alto';",
    "$cont @com.twitter.post() filter name == 'Chinese';",
    "@com.twitter.post() filter name == 'Chinese';"
    ],
    // ["@com.yelp.review() filter id == any(@com.yelp.restaurant());",
    // "$cont @com.yelp.review() filter id == any(@com.yelp.restaurant(), rating >= 4);",
    // "@com.yelp.review() filter id == any(@com.yelp.restaurant(), rating >= 4);"
    // ]
];

function test(i) {
    console.log('Test Case #' + (i+1));
    let [before, levenshtein, expected] = TEST_CASES[i];

    let beforeProrgram = Grammar.parse(before);
    let levenshteinProgram = Grammar.parse(levenshtein);
    let expectedProgram = Grammar.parse(expected);
    let actualProgram = applyLevenshteinWrapper(beforeProrgram, levenshteinProgram);

    if (expectedProgram.prettyprint() !== actualProgram.prettyprint()) {
        console.log("====\n");
        console.error('Test Case #' + (i+1) + ': does not match what expected');
        console.error('Before:    ' + beforeProrgram.prettyprint());
        console.error('Incoming:  ' + levenshteinProgram.prettyprint());
        console.error('Expected:  ' + expectedProgram.prettyprint());
        console.error('Generated: ' + actualProgram.prettyprint());
        if (process.env.TEST_MODE)
            throw new Error(`testLevenshtein ${i+1} FAILED`);
    }
}

export default async function main() {
    for (let i = 0; i < TEST_CASES.length; i++)
        test(i);
}
if (!module.parent)
    main();
