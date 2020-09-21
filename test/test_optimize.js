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

const AppGrammar = require('../lib/grammar_api');
const SchemaRetriever = require('../lib/schema').default;
const _mockSchemaDelegate = require('./mock_schema_delegate');
const schemaRetriever = new SchemaRetriever(_mockSchemaDelegate, null, true);

const TEST_CASES = [
    [
        `now => [text] of (@com.twitter.home_timeline()) => @com.twitter.post(status=text);`,
        `now => @com.twitter.home_timeline() => @com.twitter.post(status=text);`
    ],
    [
        `now => ([text] of @com.twitter.home_timeline()), text =~ "lol" => notify;`,
        `now => [text] of ((@com.twitter.home_timeline()), text =~ "lol") => notify;`
    ],
    [
        `now => ([text] of @com.twitter.home_timeline()), text =~ "lol" => @com.twitter.post(status=text);`,
        `now => (@com.twitter.home_timeline()), text =~ "lol" => @com.twitter.post(status=text);`
    ],
    [
        `monitor ([text] of (@com.twitter.home_timeline())) => @com.twitter.post(status=text);`,
        `monitor (@com.twitter.home_timeline()) on new [text] => @com.twitter.post(status=text);`
    ],
    [
        `monitor (([text] of @com.twitter.home_timeline()), text =~ "lol") => notify;`,
        `[text] of (monitor ((@com.twitter.home_timeline()), text =~ "lol") on new [text]) => notify;`
    ],
    [
        `monitor (([text] of @com.twitter.home_timeline()), text =~ "lol") => @com.twitter.post(status=text);`,
        `monitor ((@com.twitter.home_timeline()), text =~ "lol") on new [text] => @com.twitter.post(status=text);`
    ],
    [
        `now => [count] of aggregate count of (@com.twitter.home_timeline()) => notify;`,
        `now => aggregate count of (@com.twitter.home_timeline()) => notify;`
    ],

    [
        `now => [text] of [text, author] of @com.twitter.home_timeline() => notify;`,
        `now => [text] of (@com.twitter.home_timeline()) => notify;`,
    ],

    [
        `now => [text] of (([text, author] of @com.twitter.home_timeline()), text =~ "lol") => notify;`,
        `now => [text] of ((@com.twitter.home_timeline()), text =~ "lol") => notify;`
    ],

    [
        `monitor ([text, author] of @com.twitter.home_timeline()) => notify;`,
        `[text, author] of (monitor (@com.twitter.home_timeline()) on new [text, author]) => notify;`
    ],

    [
        `monitor ([text, author] of @com.twitter.home_timeline()) on new [text] => notify;`,
        `[text, author] of (monitor (@com.twitter.home_timeline()) on new [text]) => notify;`
    ],

    [
        `monitor ([text, author] of @com.twitter.home_timeline()) => @com.twitter.post(status=text);`,
        `monitor (@com.twitter.home_timeline()) on new [text, author] => @com.twitter.post(status=text);`
    ],

    [
        `monitor (@com.twitter.home_timeline()), author == "bob"^^tt:username || author == "charlie"^^tt:username => notify;`,
        `monitor ((@com.twitter.home_timeline()), in_array(author, ["bob"^^tt:username, "charlie"^^tt:username])) => notify;`
    ],

    [
        `now => @org.schema.full.Restaurant(), id =~ "starbucks" || id =~ "mcdonalds" => notify;`,
        `now => (@org.schema.full.Restaurant()), in_array~(id, ["starbucks", "mcdonalds"]) => notify;`
    ],

    [
`$dialogue @org.thingpedia.dialogue.transaction.execute;
now => [food] of ((@uk.ac.cam.multiwoz.Restaurant.Restaurant()), true) => notify
#[results=[
  { id="str:ENTITY_uk.ac.cam.multiwoz.Restaurant:Restaurant::0:"^^uk.ac.cam.multiwoz.Restaurant:Restaurant, food="str:QUOTED_STRING::9:", price_range=enum(moderate), area=enum(south) },
  { id="str:ENTITY_uk.ac.cam.multiwoz.Restaurant:Restaurant::1:"^^uk.ac.cam.multiwoz.Restaurant:Restaurant, food="str:QUOTED_STRING::25:", price_range=enum(moderate), area=enum(centre) },
  { id="str:ENTITY_uk.ac.cam.multiwoz.Restaurant:Restaurant::2:"^^uk.ac.cam.multiwoz.Restaurant:Restaurant, food="str:QUOTED_STRING::44:", price_range=enum(moderate), area=enum(north) },
  { id="str:ENTITY_uk.ac.cam.multiwoz.Restaurant:Restaurant::3:"^^uk.ac.cam.multiwoz.Restaurant:Restaurant, food="str:QUOTED_STRING::17:", price_range=enum(expensive), area=enum(centre) },
  { id="str:ENTITY_uk.ac.cam.multiwoz.Restaurant:Restaurant::4:"^^uk.ac.cam.multiwoz.Restaurant:Restaurant, food="str:QUOTED_STRING::18:", price_range=enum(expensive), area=enum(south) },
  { id="str:ENTITY_uk.ac.cam.multiwoz.Restaurant:Restaurant::5:"^^uk.ac.cam.multiwoz.Restaurant:Restaurant, food="str:QUOTED_STRING::41:", price_range=enum(expensive), area=enum(north) },
  { id="str:ENTITY_uk.ac.cam.multiwoz.Restaurant:Restaurant::6:"^^uk.ac.cam.multiwoz.Restaurant:Restaurant, food="str:QUOTED_STRING::41:", price_range=enum(cheap), area=enum(south) },
  { id="str:ENTITY_uk.ac.cam.multiwoz.Restaurant:Restaurant::7:"^^uk.ac.cam.multiwoz.Restaurant:Restaurant, food="str:QUOTED_STRING::22:", price_range=enum(cheap), area=enum(south) },
  { id="str:ENTITY_uk.ac.cam.multiwoz.Restaurant:Restaurant::8:"^^uk.ac.cam.multiwoz.Restaurant:Restaurant, food="str:QUOTED_STRING::5:", price_range=enum(moderate), area=enum(south) },
  { id="str:ENTITY_uk.ac.cam.multiwoz.Restaurant:Restaurant::9:"^^uk.ac.cam.multiwoz.Restaurant:Restaurant, food="str:QUOTED_STRING::33:", price_range=enum(moderate), area=enum(south) }
]]
#[count=50]
#[more=true];`,
`$dialogue @org.thingpedia.dialogue.transaction.execute;
now => [food] of (@uk.ac.cam.multiwoz.Restaurant.Restaurant()) => notify
#[results=[
  { id="str:ENTITY_uk.ac.cam.multiwoz.Restaurant:Restaurant::0:"^^uk.ac.cam.multiwoz.Restaurant:Restaurant, food="str:QUOTED_STRING::9:", price_range=enum(moderate), area=enum(south) },
  { id="str:ENTITY_uk.ac.cam.multiwoz.Restaurant:Restaurant::1:"^^uk.ac.cam.multiwoz.Restaurant:Restaurant, food="str:QUOTED_STRING::25:", price_range=enum(moderate), area=enum(centre) },
  { id="str:ENTITY_uk.ac.cam.multiwoz.Restaurant:Restaurant::2:"^^uk.ac.cam.multiwoz.Restaurant:Restaurant, food="str:QUOTED_STRING::44:", price_range=enum(moderate), area=enum(north) },
  { id="str:ENTITY_uk.ac.cam.multiwoz.Restaurant:Restaurant::3:"^^uk.ac.cam.multiwoz.Restaurant:Restaurant, food="str:QUOTED_STRING::17:", price_range=enum(expensive), area=enum(centre) },
  { id="str:ENTITY_uk.ac.cam.multiwoz.Restaurant:Restaurant::4:"^^uk.ac.cam.multiwoz.Restaurant:Restaurant, food="str:QUOTED_STRING::18:", price_range=enum(expensive), area=enum(south) },
  { id="str:ENTITY_uk.ac.cam.multiwoz.Restaurant:Restaurant::5:"^^uk.ac.cam.multiwoz.Restaurant:Restaurant, food="str:QUOTED_STRING::41:", price_range=enum(expensive), area=enum(north) },
  { id="str:ENTITY_uk.ac.cam.multiwoz.Restaurant:Restaurant::6:"^^uk.ac.cam.multiwoz.Restaurant:Restaurant, food="str:QUOTED_STRING::41:", price_range=enum(cheap), area=enum(south) },
  { id="str:ENTITY_uk.ac.cam.multiwoz.Restaurant:Restaurant::7:"^^uk.ac.cam.multiwoz.Restaurant:Restaurant, food="str:QUOTED_STRING::22:", price_range=enum(cheap), area=enum(south) },
  { id="str:ENTITY_uk.ac.cam.multiwoz.Restaurant:Restaurant::8:"^^uk.ac.cam.multiwoz.Restaurant:Restaurant, food="str:QUOTED_STRING::5:", price_range=enum(moderate), area=enum(south) },
  { id="str:ENTITY_uk.ac.cam.multiwoz.Restaurant:Restaurant::9:"^^uk.ac.cam.multiwoz.Restaurant:Restaurant, food="str:QUOTED_STRING::33:", price_range=enum(moderate), area=enum(south) }
]]
#[count=50]
#[more=true];`
    ],

    [`
$dialogue @org.thingpedia.dialogue.transaction.execute;
now => [distance] of compute (distance(geo, $context.location.current_location)) of @com.yelp.restaurant() => notify
#[results=[
{ distance=1.5604449514735575e-9 },
{ distance=0 }
]];
`,
    `$dialogue @org.thingpedia.dialogue.transaction.execute;
now => [distance] of (compute (distance(geo, $context.location.current_location)) of (@com.yelp.restaurant())) => notify
#[results=[
  { distance=1.5604449514735575e-9 },
  { distance=0 }
]];`],

    [`monitor @com.twitter.home_timeline(), text =~ "foo" || (text =~"bar" && !(text =~ "lol")) => notify;`,
     `monitor ((@com.twitter.home_timeline()), ((text =~ "bar" && !(text =~ "lol")) || text =~ "foo")) => notify;`
    ],

    [`now => [aggregateRating.ratingValue] of ((sort distance asc of (compute (distance(geo, new Location("foo"))) of ((@org.schema.restaurant()), name =~ $context.selection : String)))[1]) => notify;`,
    `now => [aggregateRating.ratingValue] of ((sort distance asc of (compute (distance(geo, new Location("foo"))) of ((@org.schema.restaurant()), name =~ $context.selection : String)))[1]) => notify;`
    ],

    [`now => compute distance(geo, $context.location.current_location) of compute distance(geo, $context.location.current_location) of @com.yelp.restaurant() => notify;`,
     `now => compute (distance(geo, $context.location.current_location)) of (@com.yelp.restaurant()) => notify;`],

    [`now => compute distance(geo, $context.location.current_location) of compute distance(geo, $context.location.home) of @com.yelp.restaurant() => notify;`,
     `now => compute (distance(geo, $context.location.current_location)) of (compute (distance(geo, $context.location.home)) of (@com.yelp.restaurant())) => notify;`],

    [`now => compute distance(geo, $context.location.current_location) of compute rating + 2 of @com.yelp.restaurant() => notify;`,
     `now => compute (distance(geo, $context.location.current_location)) of (compute (rating + 2) of (@com.yelp.restaurant())) => notify;`],

    [`now => compute distance(geo, $context.location.current_location) of compute rating + 2 of compute distance(geo, $context.location.current_location) of @com.yelp.restaurant() => notify;`,
     `now => compute (rating + 2) of (compute (distance(geo, $context.location.current_location)) of (@com.yelp.restaurant())) => notify;`],

    [`now => compute result + 2 of compute rating + 2 of @com.yelp.restaurant() => notify;`,
     `now => compute (result + 2) of (compute (rating + 2) of (@com.yelp.restaurant())) => notify;`],

    [`now => compute result + 2 of compute result + 2 of compute rating + 2 of @com.yelp.restaurant() => notify;`,
     `now => compute (result + 2) of (compute (result + 2) of (compute (rating + 2) of (@com.yelp.restaurant()))) => notify;`],

    [`now => compute result + 2 of compute distance(geo, $context.location.current_location) of compute result + 2 of compute rating + 2 of @com.yelp.restaurant() => notify;`,
     `now => compute (result + 2) of (compute (distance(geo, $context.location.current_location)) of (compute (result + 2) of (compute (rating + 2) of (@com.yelp.restaurant())))) => notify;`],

    [`now => compute result of compute rating + 2 of @com.yelp.restaurant() => notify;`,
     `now => compute (rating + 2) of (@com.yelp.restaurant()) => notify;`],

    [`now => compute rating of @com.yelp.restaurant() => notify;`,
     `now => @com.yelp.restaurant() => notify;`],

    [`now => compute distance(geo, $context.location.current_location) of (sort distance asc of compute distance(geo, $context.location.current_location) of @com.yelp.restaurant()) => notify;`,
    `now => sort distance asc of (compute (distance(geo, $context.location.current_location)) of (@com.yelp.restaurant())) => notify;`],

    [`$dialogue @org.thingpedia.dialogue.transaction.execute; now => compute distance(geo, $context.location.current_location) of (sort distance asc of compute distance(geo, $context.location.current_location) of @com.yelp.restaurant()) => notify;`,
    `$dialogue @org.thingpedia.dialogue.transaction.execute;
now => sort distance asc of (compute (distance(geo, $context.location.current_location)) of (@com.yelp.restaurant())) => notify;`]

];


function test(i) {
    console.log('Test Case #' + (i+1));
    let [testCase, expectedOptimized] = TEST_CASES[i];

    return AppGrammar.parseAndTypecheck(testCase, schemaRetriever).then((prog) => {
        let optimized = prog.prettyprint();
        if (optimized !== expectedOptimized) {
            console.error('Test Case #' + (i+1) + ': optimized program does not match what expected');
            console.error('Expected: ' + expectedOptimized);
            console.error('Generated: ' + optimized);
            if (process.env.TEST_MODE)
                throw new Error(`testOptimize ${i+1} FAILED`);
        }
    }).catch((e) => {
        console.error('Test Case #' + (i+1) + ': failed with exception');
        console.error('Error: ' + e.message);
        console.error(e.stack);
        if (process.env.TEST_MODE)
            throw e;
    });
}


async function main() {
    for (let i = 0; i < TEST_CASES.length; i++)
        await test(i);
}

module.exports = main;
if (!module.parent)
    main();
