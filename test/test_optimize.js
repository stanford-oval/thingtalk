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


import * as AppGrammar from '../lib/syntax_api';

const TEST_CASES = [
    [
        `now => [text] of (@com.twitter.home_timeline()) => @com.twitter.post(status=text);`,
        `@com.twitter.home_timeline() => @com.twitter.post(status=text);`
    ],
    [
        `now => ([text] of @com.twitter.home_timeline()), text =~ "lol" => notify;`,
        `[text] of @com.twitter.home_timeline() filter text =~ "lol";`
    ],
    [
        `now => ([text] of @com.twitter.home_timeline()), text =~ "lol" => @com.twitter.post(status=text);`,
        `@com.twitter.home_timeline() filter text =~ "lol" => @com.twitter.post(status=text);`
    ],
    [
        `monitor ([text] of (@com.twitter.home_timeline())) => @com.twitter.post(status=text);`,
        `monitor(text of @com.twitter.home_timeline()) => @com.twitter.post(status=text);`
    ],
    [
        `monitor (([text] of @com.twitter.home_timeline()), text =~ "lol") => notify;`,
        `[text] of monitor(text of @com.twitter.home_timeline() filter text =~ "lol");`
    ],
    [
        `monitor (([text] of @com.twitter.home_timeline()), text =~ "lol") => @com.twitter.post(status=text);`,
        `monitor(text of @com.twitter.home_timeline() filter text =~ "lol") => @com.twitter.post(status=text);`
    ],
    [
        `now => [count] of count(@com.twitter.home_timeline()) => notify;`,
        `count(@com.twitter.home_timeline());`
    ],

    [
        `now => [text] of [text, author] of @com.twitter.home_timeline() => notify;`,
        `[text] of @com.twitter.home_timeline();`,
    ],

    [
        `now => [text] of (([text, author] of @com.twitter.home_timeline()), text =~ "lol") => notify;`,
        `[text] of @com.twitter.home_timeline() filter text =~ "lol";`
    ],

    [
        `monitor ([text, author] of @com.twitter.home_timeline()) => notify;`,
        `[author, text] of monitor(author, text of @com.twitter.home_timeline());`
    ],

    [
        `monitor (text of [text, author] of @com.twitter.home_timeline()) => notify;`,
        `[author, text] of monitor(text of @com.twitter.home_timeline());`
    ],

    [
        `monitor ([text, author] of @com.twitter.home_timeline()) => @com.twitter.post(status=text);`,
        `monitor(author, text of @com.twitter.home_timeline()) => @com.twitter.post(status=text);`
    ],

    [
        `monitor (@com.twitter.home_timeline()), author == "bob"^^tt:username || author == "charlie"^^tt:username => notify;`,
        `monitor(@com.twitter.home_timeline()) filter in_array(author, ["bob"^^tt:username, "charlie"^^tt:username]);`
    ],

    [
        `monitor (@com.twitter.home_timeline(), author == "bob"^^tt:username || author == "charlie"^^tt:username) => notify;`,
        `monitor(@com.twitter.home_timeline() filter in_array(author, ["bob"^^tt:username, "charlie"^^tt:username]));`
    ],

    [
        `now => @org.schema.full.Restaurant(), id =~ "starbucks" || id =~ "mcdonalds" => notify;`,
        `@org.schema.full.Restaurant() filter in_array~(id, ["starbucks", "mcdonalds"]);`
    ],

    [
        `now => @org.schema.restaurant(), 500mi >= distance(geo, $location.current_location) => notify;`,
        `@org.schema.restaurant() filter distance(geo, $location.current_location) <= 500mi;`
    ],

    [
        `now => @org.schema.restaurant(), 1 == 1 => notify;`,
        `@org.schema.restaurant();`
    ],

    [
        `now => @org.schema.restaurant(), 1 >= 1 => notify;`,
        `@org.schema.restaurant();`
    ],

    [
        `now => @org.schema.restaurant(), geo == geo => notify;`,
        `@org.schema.restaurant();`
    ],

    [
`$dialogue @org.thingpedia.dialogue.transaction.execute;
now => [food] of ((@uk.ac.cam.multiwoz.Restaurant.Restaurant()), true) => notify
#[results=[
  { id="str:ENTITY_uk.ac.cam.multiwoz.Restaurant:Restaurant::0:"^^uk.ac.cam.multiwoz.Restaurant:Restaurant, food="str:QUOTED_STRING::9:", price_range=enum moderate, area=enum south },
  { id="str:ENTITY_uk.ac.cam.multiwoz.Restaurant:Restaurant::1:"^^uk.ac.cam.multiwoz.Restaurant:Restaurant, food="str:QUOTED_STRING::25:", price_range=enum moderate, area=enum centre },
  { id="str:ENTITY_uk.ac.cam.multiwoz.Restaurant:Restaurant::2:"^^uk.ac.cam.multiwoz.Restaurant:Restaurant, food="str:QUOTED_STRING::44:", price_range=enum moderate, area=enum north },
  { id="str:ENTITY_uk.ac.cam.multiwoz.Restaurant:Restaurant::3:"^^uk.ac.cam.multiwoz.Restaurant:Restaurant, food="str:QUOTED_STRING::17:", price_range=enum expensive, area=enum centre },
  { id="str:ENTITY_uk.ac.cam.multiwoz.Restaurant:Restaurant::4:"^^uk.ac.cam.multiwoz.Restaurant:Restaurant, food="str:QUOTED_STRING::18:", price_range=enum expensive, area=enum south },
  { id="str:ENTITY_uk.ac.cam.multiwoz.Restaurant:Restaurant::5:"^^uk.ac.cam.multiwoz.Restaurant:Restaurant, food="str:QUOTED_STRING::41:", price_range=enum expensive, area=enum north },
  { id="str:ENTITY_uk.ac.cam.multiwoz.Restaurant:Restaurant::6:"^^uk.ac.cam.multiwoz.Restaurant:Restaurant, food="str:QUOTED_STRING::41:", price_range=enum cheap, area=enum south },
  { id="str:ENTITY_uk.ac.cam.multiwoz.Restaurant:Restaurant::7:"^^uk.ac.cam.multiwoz.Restaurant:Restaurant, food="str:QUOTED_STRING::22:", price_range=enum cheap, area=enum south },
  { id="str:ENTITY_uk.ac.cam.multiwoz.Restaurant:Restaurant::8:"^^uk.ac.cam.multiwoz.Restaurant:Restaurant, food="str:QUOTED_STRING::5:", price_range=enum moderate, area=enum south },
  { id="str:ENTITY_uk.ac.cam.multiwoz.Restaurant:Restaurant::9:"^^uk.ac.cam.multiwoz.Restaurant:Restaurant, food="str:QUOTED_STRING::33:", price_range=enum moderate, area=enum south }
]]
#[count=50]
#[more=true];`,
`$dialogue @org.thingpedia.dialogue.transaction.execute;
[food] of @uk.ac.cam.multiwoz.Restaurant.Restaurant()
#[results=[
  { id="str:ENTITY_uk.ac.cam.multiwoz.Restaurant:Restaurant::0:"^^uk.ac.cam.multiwoz.Restaurant:Restaurant, food="str:QUOTED_STRING::9:", price_range=enum moderate, area=enum south },
  { id="str:ENTITY_uk.ac.cam.multiwoz.Restaurant:Restaurant::1:"^^uk.ac.cam.multiwoz.Restaurant:Restaurant, food="str:QUOTED_STRING::25:", price_range=enum moderate, area=enum centre },
  { id="str:ENTITY_uk.ac.cam.multiwoz.Restaurant:Restaurant::2:"^^uk.ac.cam.multiwoz.Restaurant:Restaurant, food="str:QUOTED_STRING::44:", price_range=enum moderate, area=enum north },
  { id="str:ENTITY_uk.ac.cam.multiwoz.Restaurant:Restaurant::3:"^^uk.ac.cam.multiwoz.Restaurant:Restaurant, food="str:QUOTED_STRING::17:", price_range=enum expensive, area=enum centre },
  { id="str:ENTITY_uk.ac.cam.multiwoz.Restaurant:Restaurant::4:"^^uk.ac.cam.multiwoz.Restaurant:Restaurant, food="str:QUOTED_STRING::18:", price_range=enum expensive, area=enum south },
  { id="str:ENTITY_uk.ac.cam.multiwoz.Restaurant:Restaurant::5:"^^uk.ac.cam.multiwoz.Restaurant:Restaurant, food="str:QUOTED_STRING::41:", price_range=enum expensive, area=enum north },
  { id="str:ENTITY_uk.ac.cam.multiwoz.Restaurant:Restaurant::6:"^^uk.ac.cam.multiwoz.Restaurant:Restaurant, food="str:QUOTED_STRING::41:", price_range=enum cheap, area=enum south },
  { id="str:ENTITY_uk.ac.cam.multiwoz.Restaurant:Restaurant::7:"^^uk.ac.cam.multiwoz.Restaurant:Restaurant, food="str:QUOTED_STRING::22:", price_range=enum cheap, area=enum south },
  { id="str:ENTITY_uk.ac.cam.multiwoz.Restaurant:Restaurant::8:"^^uk.ac.cam.multiwoz.Restaurant:Restaurant, food="str:QUOTED_STRING::5:", price_range=enum moderate, area=enum south },
  { id="str:ENTITY_uk.ac.cam.multiwoz.Restaurant:Restaurant::9:"^^uk.ac.cam.multiwoz.Restaurant:Restaurant, food="str:QUOTED_STRING::33:", price_range=enum moderate, area=enum south }
]]
#[count=50]
#[more=true];`
    ],

    [`
$dialogue @org.thingpedia.dialogue.transaction.execute;
now => [distance(geo, $location.current_location)] of @com.yelp.restaurant() => notify
#[results=[
{ distance=1.5604449514735575e-9 },
{ distance=0 }
]];
`,
    `$dialogue @org.thingpedia.dialogue.transaction.execute;
[distance(geo, $location.current_location)] of @com.yelp.restaurant()
#[results=[
  { distance=1.5604449514735575e-9 },
  { distance=0 }
]];`],

    [`monitor (@com.twitter.home_timeline(), text =~ "foo" || (text =~"bar" && !(text =~ "lol"))) => notify;`,
     `monitor(@com.twitter.home_timeline() filter !(text =~ "lol") && text =~ "bar" || text =~ "foo");`
    ],

    [`now => [aggregateRating.ratingValue] of (sort(distance(geo, new Location("foo")) asc of @org.schema.restaurant(), name =~ $context.selection : String)[1]) => notify;`,
    `[aggregateRating.ratingValue] of sort(distance(geo, new Location("foo")) asc of @org.schema.restaurant() filter name =~ $context.selection : String)[1];`
    ],

    // remove redundant * projection
    [`[*] of @com.yelp.restaurant() => notify;`,
     `@com.yelp.restaurant();`],

    // remove redundant * projection
    [`[distance(geo, $location.current_location)] of [*] of @com.yelp.restaurant() => notify;`,
     `[distance(geo, $location.current_location)] of @com.yelp.restaurant();`],

    // remove redundant projection
    [`[distance(geo, $location.current_location)] of [geo] of @com.yelp.restaurant() => notify;`,
     `[distance(geo, $location.current_location)] of @com.yelp.restaurant();`],

    // remove redundant computation
    [`[distance(geo, $location.current_location)] of [*, distance(geo, $location.current_location)] of @com.yelp.restaurant() => notify;`,
     `[distance(geo, $location.current_location)] of @com.yelp.restaurant();`],

    [`[*, distance(geo, $location.current_location)] of [*, distance(geo, $location.current_location)] of @com.yelp.restaurant() => notify;`,
     `[*, distance(geo, $location.current_location)] of @com.yelp.restaurant();`],

    [`[*, distance(geo, $location.current_location)] of [distance(geo, $location.current_location)] of @com.yelp.restaurant() => notify;`,
     `[distance(geo, $location.current_location)] of @com.yelp.restaurant();`],

    // remove shadowed computation
    [`[distance(geo, $location.current_location)] of [*, distance(geo, $location.home)] of @com.yelp.restaurant() => notify;`,
     `[distance(geo, $location.current_location)] of @com.yelp.restaurant();`],

    // collapse invisible compuations
    [`[distance(geo, $location.current_location)] of [*, rating + 2] of @com.yelp.restaurant() => notify;`,
     `[distance(geo, $location.current_location)] of @com.yelp.restaurant();`],

    // collapse invisible computations
    [`[distance(geo, $location.current_location)] of [geo, rating + 2] of @com.yelp.restaurant() => notify;`,
     `[distance(geo, $location.current_location)] of @com.yelp.restaurant();`],

    // collapse the use of the result
    [`[geo, distance(geo, $location.current_location), result] of [geo, rating + 2] of @com.yelp.restaurant() => notify;`,
     `[geo, distance(geo, $location.current_location), rating + 2] of @com.yelp.restaurant();`],

    // preserve variable dependencies
    [`[result + 2] of [rating + 2] of @com.yelp.restaurant() => notify;`,
     `[result + 2] of [*, rating + 2] of @com.yelp.restaurant();`],

    [`[result + 2] of [result + 2] of [rating + 2] of @com.yelp.restaurant() => notify;`,
     `[result + 2] of [*, result + 2] of [*, rating + 2] of @com.yelp.restaurant();`],

    // preserve variable dependencies, with alias
    [`[foo + 2] of [rating + 2 as foo] of @com.yelp.restaurant() => notify;`,
     `[foo + 2] of [*, rating + 2 as foo] of @com.yelp.restaurant();`],

    // shadow, with alias
    [`[rating + 2 as foo] of [*, rating + 3 as foo] of @com.yelp.restaurant() => notify;`,
     `[rating + 2 as foo] of @com.yelp.restaurant();`],

    [`[rating + 2 as foo] of [rating, rating + 3 as foo] of @com.yelp.restaurant() => notify;`,
     `[rating + 2 as foo] of @com.yelp.restaurant();`],

    [`[*, rating + 2 as foo] of [rating, rating + 3 as foo] of @com.yelp.restaurant() => notify;`,
     `[rating, rating + 2 as foo] of @com.yelp.restaurant();`],

    [`[*, rating + 2 as foo] of [*, rating + 3 as foo] of @com.yelp.restaurant() => notify;`,
     `[*, rating + 2 as foo] of @com.yelp.restaurant();`],

    // remove redundant projection at the top
    [`[result] of [rating + 2] of @com.yelp.restaurant();`,
     `[rating + 2] of @com.yelp.restaurant();`],

    // remove redundant projection at the top, with alias
    [`[foo] of [rating + 2 as foo] of @com.yelp.restaurant();`,
     `[rating + 2 as foo] of @com.yelp.restaurant();`],

    [`sort(distance asc of [distance(geo, $location.current_location)] of @com.yelp.restaurant());`,
     `[distance(geo, $location.current_location)] of sort(distance(geo, $location.current_location) asc of @com.yelp.restaurant());`],

    [`sort(distance asc of [*, distance(geo, $location.current_location)] of @com.yelp.restaurant());`,
     `[*, distance(geo, $location.current_location)] of sort(distance(geo, $location.current_location) asc of @com.yelp.restaurant());`],

    [`[distance(geo, $location.current_location)] of sort(distance asc of [distance(geo, $location.current_location)] of @com.yelp.restaurant());`,
     `[distance(geo, $location.current_location)] of sort(distance(geo, $location.current_location) asc of @com.yelp.restaurant());`],

    [`[distance(geo, $location.current_location)] of sort(distance asc of [*, distance(geo, $location.current_location)] of @com.yelp.restaurant());`,
     `[distance(geo, $location.current_location)] of sort(distance(geo, $location.current_location) asc of @com.yelp.restaurant());`],

    // index + projection
    [`([geo] of sort(distance(geo, $location.current_location) asc of @com.yelp.restaurant() filter id =~ "mcdonalds"))[1];`,
     `[geo] of sort(distance(geo, $location.current_location) asc of @com.yelp.restaurant() filter id =~ "mcdonalds")[1];`],

    // projection + index + projection
    [`[geo] of ([*, distance(geo, $location.current_location)] of sort(distance(geo, $location.current_location) asc of @com.yelp.restaurant() filter id =~ "mcdonalds"))[1];`,
     `[geo] of sort(distance(geo, $location.current_location) asc of @com.yelp.restaurant() filter id =~ "mcdonalds")[1];`],

    // projection of chain to chain of projection
    [`[link] of (@com.washingtonpost.get_article() => @com.bing.web_search(query=title));`,
    `@com.washingtonpost.get_article() => [link] of @com.bing.web_search(query=title);`],

    // nested chains
    [`(@com.bing.web_search() => @com.yandex.translate.translate(text=title)) => @com.twitter.post(status=translated_text);`,
    `@com.bing.web_search() => @com.yandex.translate.translate(text=title) => @com.twitter.post(status=translated_text);`],

    // remove redundant device ID
    ['@com.yelp(id="com.yelp").restaurant();',
     '@com.yelp.restaurant();'],

    // remove redundant device ID
    ['@com.yelp(id="com.yelp", name="Yelp").restaurant();',
     '@com.yelp.restaurant();'],

    // remove redundant device ID
    ['@com.yelp(id="com.yelp"^^tt:device_id("Yelp")).restaurant();',
     '@com.yelp.restaurant();'],

    // flip filters
    ['@org.schema.full.Place() filter count(review) >= aggregateRating.ratingValue;',
     '@org.schema.full.Place() filter aggregateRating.ratingValue <= count(review);'],

    // __const is a VarRef, but it should not be moved to the left
    ['@org.schema.full.Place() filter count(review) >= __const_NUMBER_0;',
     '@org.schema.full.Place() filter count(review) >= __const_NUMBER_0;'],

    // test parsing of dates
    [`@com.washingtonpost.get_article() filter updated == new Date(2020, 6, 15);`,
     `@com.washingtonpost.get_article() filter updated == new Date("2020-06-15T07:00:00.000Z");`],

    // hide redundant #[confirm=accepted]
    [`$dialogue @org.thingpedia.dialogue.transaction; @com.thecatapi.get() #[confirm=enum accepted];`,
    `$dialogue @org.thingpedia.dialogue.transaction;\n@com.thecatapi.get();`]
];


async function test(i) {
    console.log('Test Case #' + (i+1));
    let [testCase, expectedOptimized] = TEST_CASES[i];

    try {
        const prog = AppGrammar.parse(testCase);
        let optimized = prog.prettyprint();
        if (optimized !== expectedOptimized) {
            console.error('Test Case #' + (i+1) + ': optimized program does not match what expected');
            console.error('Expected: ' + expectedOptimized);
            console.error('Generated: ' + optimized);
            if (process.env.TEST_MODE)
                throw new Error(`testOptimize ${i+1} FAILED`);
        }
    } catch(e) {
        console.error('Test Case #' + (i+1) + ': failed with exception');
        console.error('Error: ' + e.message);
        console.error(e);
        if (process.env.TEST_MODE)
            throw e;
    }
}

export default async function main() {
    for (let i = 0; i < TEST_CASES.length; i++)
        await test(i);
}
if (!module.parent)
    main();
