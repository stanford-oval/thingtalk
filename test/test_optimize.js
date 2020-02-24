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

const AppGrammar = require('../lib/grammar_api');
const SchemaRetriever = require('../lib/schema');
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
        `now => result(@com.thecatapi.get[-1]) => notify;`,
        `now => result(@com.thecatapi.get) => notify;`
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
     `monitor ((@com.twitter.home_timeline()), ((text =~ "bar" && !(text =~ "lol")) || text =~ "foo")) => notify;`],
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
