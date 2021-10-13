// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingTalk
//
// Copyright 2017-2020 The Board of Trustees of the Leland Stanford Junior University
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
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>


import * as Ast from '../lib/ast';
import * as Grammar from '../lib/syntax_api';
import SchemaRetriever from '../lib/schema';

import _mockSchemaDelegate from './mock_schema_delegate';
const schemaRetriever = new SchemaRetriever(_mockSchemaDelegate, null, true);

const TEST_CASES = [
    [`monitor ( @com.xkcd . get_comic ( ) ) ;`,
     `monitor xkcd`, {},
     `monitor(@com.xkcd.get_comic());`
    ],

    [`@com.twitter . post ( status = QUOTED_STRING_0 ) ;`,
     `tweet QUOTED_STRING_0`, { 'QUOTED_STRING_0': 'hello' },
     `@com.twitter.post(status="hello");`
    ],

    [`@com.twitter . post ( status = "" ) ;`,
     `post on twitter`, {},
     `@com.twitter.post(status="");`
    ],

    [`@com.xkcd . get_comic ( number = NUMBER_0 ) ;`,
     `get xkcd NUMBER_0`, { 'NUMBER_0': 1234 },
     `@com.xkcd.get_comic(number=1234);`],

    [`@com.xkcd . get_comic ( number = NUMBER_0 ) => @com.twitter . post ( status = title ) ;`,
     `get xkcd NUMBER_0`, { 'NUMBER_0': 1234 },
     `@com.xkcd.get_comic(number=1234) => @com.twitter.post(status=title);`],

    [`@org.thingpedia.builtin.thingengine.builtin . get_random_between ( high = NUMBER_1 , low = NUMBER_0 ) => @com.xkcd . get_comic ( number = random ) ;`,
    `get xkcd whose number is a random number between NUMBER_0 and NUMBER_1`, { 'NUMBER_0': 55, 'NUMBER_1': 1024 },
    `@org.thingpedia.builtin.thingengine.builtin.get_random_between(high=1024, low=55) => @com.xkcd.get_comic(number=random);`],

    [`timer ( base = $now , interval = 1 h ) => @org.thingpedia.builtin.thingengine.builtin . get_random_between ( high = NUMBER_1 , low = NUMBER_0 ) => @com.xkcd . get_comic ( number = random ) ;`,
    `every hour get xkcd whose number is a random number between NUMBER_0 and NUMBER_1`, { 'NUMBER_0': 55, 'NUMBER_1': 1024 },
    `timer(base=$now, interval=1h) => @org.thingpedia.builtin.thingengine.builtin.get_random_between(high=1024, low=55) => @com.xkcd.get_comic(number=random);`],

    [`timer ( base = $now , frequency = 3 , interval = 1 h ) => @org.thingpedia.builtin.thingengine.builtin . get_random_between ( high = NUMBER_1 , low = NUMBER_0 ) => @com.xkcd . get_comic ( number = random ) ;`,
    `3 times every hour get xkcd whose number is a random number between NUMBER_0 and NUMBER_1`, { 'NUMBER_0': 55, 'NUMBER_1': 1024 },
    `timer(base=$now, frequency=3, interval=1h) => @org.thingpedia.builtin.thingengine.builtin.get_random_between(high=1024, low=55) => @com.xkcd.get_comic(number=random);`],

    [`@org.thingpedia.builtin.thingengine.builtin . get_random_between ( high = NUMBER_1 , low = NUMBER_0 ) ;`,
    `get a random number between NUMBER_0 and NUMBER_1`,{ 'NUMBER_0': 55, 'NUMBER_1': 1024 },
    `@org.thingpedia.builtin.thingengine.builtin.get_random_between(high=1024, low=55);`],

    [`@org.thingpedia.builtin.thingengine.builtin . get_random_between ( high = NUMBER_0 , low = NUMBER_1 ) ;`,
    `get xkcd whose number is a random number max is NUMBER_0 min is NUMBER_1`, { 'NUMBER_0': 1024, 'NUMBER_1': 55 },
    `@org.thingpedia.builtin.thingengine.builtin.get_random_between(high=1024, low=55);`],

    [`monitor ( @thermostat . get_temperature ( ) ) ;`,
    `monitor thermostat`, {},
    `monitor(@thermostat.get_temperature());`],

    [`monitor ( @thermostat . get_temperature ( ) filter value >= NUMBER_0 F ) ;`,
    `notify me if the temperature is above NUMBER_0 degrees`, { 'NUMBER_0': 70 },
    `monitor(@thermostat.get_temperature() filter value >= 70F);`],

    [`@com.bing . image_search ( ) filter height >= NUMBER_1 || width >= NUMBER_0 ;`,
    `search images wider than NUMBER_0 pixels or taller than NUMBER_1 pixels`, { NUMBER_0: 100, NUMBER_1:200 },
    `@com.bing.image_search() filter height >= 200 || width >= 100;`],

    [`@com.bing . image_search ( ) filter ( height >= NUMBER_1 || width >= NUMBER_0 ) && width <= NUMBER_2 ;`,
    `search images wider than NUMBER_0 pixels || taller than NUMBER_1 pixels and narrower than NUMBER_2 pixels`, { NUMBER_0: 100, NUMBER_1:200, NUMBER_2: 500 },
    `@com.bing.image_search() filter (height >= 200 || width >= 100) && width <= 500;`],

    [`@com.bing . image_search ( ) filter height >= NUMBER_0 || width >= NUMBER_0 ;`,
    `search images larger than NUMBER_0 pixels in either dimension`, { NUMBER_0: 100 },
    `@com.bing.image_search() filter height >= 100 || width >= 100;`],

    [`@com.bing . image_search ( ) filter width >= NUMBER_0 ;`,
    `search images wider than NUMBER_0 pixels`, { NUMBER_0: 100 },
    `@com.bing.image_search() filter width >= 100;`],

    ['monitor ( title of @com.xkcd . get_comic ( ) ) ;',
    `monitor xkcd if the title changes`, {},
    `monitor(title of @com.xkcd.get_comic());`],

    ['monitor ( alt_text , title of @com.xkcd . get_comic ( ) ) ;',
    `monitor xkcd if the title or alt text changes`, {},
    `monitor(alt_text, title of @com.xkcd.get_comic());`],

    ['monitor ( @com.instagram . get_pictures ( count = NUMBER_0 ) filter in_array ( caption , [ QUOTED_STRING_0 , QUOTED_STRING_1 ] ) ) ;',
    `monitor my last NUMBER_0 instagram pics if the caption is either QUOTED_STRING_0 or QUOTED_STRING_1`, { NUMBER_0: 100, QUOTED_STRING_0: 'abc', QUOTED_STRING_1: 'def' },
    `monitor(@com.instagram.get_pictures(count=100) filter in_array(caption, ["abc", "def"]));`],

    ['timer ( base = $now , interval = DURATION_0 ) ;',
    `alert me every DURATION_0`, { DURATION_0: { value: 30, unit: 'min' } },
    `timer(base=$now, interval=30min);`],

    ['monitor ( @com.phdcomics . get_post ( ) filter ! ( title =~ QUOTED_STRING_0 ) ) ;',
    `monitor phd comics post that do n't have QUOTED_STRING_0 in the title`, { QUOTED_STRING_0: 'abc' }, //'
    `monitor(@com.phdcomics.get_post() filter !(title =~ "abc"));`],

    ['@com.uber . price_estimate ( end = $location . home , start = $location . work ) filter low_estimate >= CURRENCY_0 ;',
    `get an uber price estimate from home to work if the low estimate is greater than CURRENCY_0`, { CURRENCY_0: { value: 50, unit: 'usd' } },
    `@com.uber.price_estimate(end=$location.home, start=$location.work) filter low_estimate >= 50$usd;`],

    ['@com.uber . price_estimate ( ) filter uber_type == enum uber_x ;',
    `get a price estimate for uber x`, {},
    `@com.uber.price_estimate() filter uber_type == enum uber_x;`],

    ['@org.thingpedia.builtin.thingengine.builtin . configure ( device = @com.google ) ;',
    `configure google`, {},
    `@org.thingpedia.builtin.thingengine.builtin.configure(device="com.google"^^tt:device);`],

    ['@com.nytimes . get_front_page ( ) filter updated >= $now - DURATION_0 ;',
     `get new york times articles published in the last DURATION_0`, { DURATION_0: { value: 15, unit: 'min' } },
     `@com.nytimes.get_front_page() filter updated >= $now - 15min;`],

    [`#[ executor = USERNAME_0 ] @com.twitter . post ( ) ;`,
     `ask USERNAME_0 to post on twitter`, { USERNAME_0: 'bob' },
     `#[executor="bob"^^tt:username]
@com.twitter.post();`],

    [`#[ executor = USERNAME_0 ] @com.xkcd . get_comic ( ) ;`,
     `ask USERNAME_0 to get xkcd`, { USERNAME_0: 'bob' },
     `#[executor="bob"^^tt:username]
@com.xkcd.get_comic();`],

    [`@security-camera . current_event ( ) filter any ( @org.thingpedia.builtin.thingengine.builtin . get_gps ( ) filter ! ( location == $location . home ) ) ;`,
     `show me my security camera if i 'm not home`, {}, //'
     `@security-camera.current_event() filter any(@org.thingpedia.builtin.thingengine.builtin.get_gps() filter !(location == $location.home));`],

    [`$policy { true : now => @com.twitter . post ; }`,
    `anyone can post on twitter`, {},
    `$policy {
  true : now => @com.twitter.post;
}`],

    [`$policy { true : now => @com.twitter . post filter status =~ QUOTED_STRING_0 ; }`,
    `anyone can post on twitter if they put QUOTED_STRING_0 in the status`, { QUOTED_STRING_0: 'foo' },
    `$policy {
  true : now => @com.twitter.post filter status =~ "foo";
}`],

    [`$policy { $source == null ^^tt:contact ( QUOTED_STRING_0 ) : now => @com.twitter . post ; }`,
    `QUOTED_STRING_0 can post on twitter`, { QUOTED_STRING_0: 'bob' },
    `$policy {
  $source == null^^tt:contact("bob") : now => @com.twitter.post;
}`],

    [`$policy { $source == null ^^tt:contact ( QUOTED_STRING_0 ) : now => @com.twitter . post filter status =~ QUOTED_STRING_1 ; }`,
    `QUOTED_STRING_0 can post on twitter if he puts QUOTED_STRING_1 in the status`, { QUOTED_STRING_0: 'bob', QUOTED_STRING_1: 'foo' },
    `$policy {
  $source == null^^tt:contact("bob") : now => @com.twitter.post filter status =~ "foo";
}`],

    [`$policy { true : @com.bing . web_search => notify ; }`,
    `anyone can search on bing`, {},
    `$policy {
  true : @com.bing.web_search => notify;
}`],

    [`$policy { true : @com.bing . web_search filter query =~ QUOTED_STRING_0 => notify ; }`,
    `anyone can search on bing if the query contains QUOTED_STRING_0`,{ QUOTED_STRING_0: 'foo' },
    `$policy {
  true : @com.bing.web_search filter query =~ "foo" => notify;
}`],

    [`$policy { true : @com.bing . web_search filter description =~ QUOTED_STRING_0 => notify ; }`,
    `anyone can search on bing if the description contains QUOTED_STRING_0`, { QUOTED_STRING_0: 'foo' },
    `$policy {
  true : @com.bing.web_search filter description =~ "foo" => notify;
}`],

    [`$policy { true : @com.bing . web_search filter description =~ QUOTED_STRING_0 => @com.twitter . post filter status =~ QUOTED_STRING_0 ; }`,
    `anyone can search on bing if the description contains QUOTED_STRING_0 and then post on twitter if the status contains the same thing`, { QUOTED_STRING_0: 'foo' },
    `$policy {
  true : @com.bing.web_search filter description =~ "foo" => @com.twitter.post filter status =~ "foo";
}`],

    [`$policy { true : @com.bing . web_search filter any ( @org.thingpedia.builtin.thingengine.builtin . get_gps ( ) filter ! ( location == $location . home ) ) && description =~ QUOTED_STRING_0 => notify ; }`,
    `anyone can search on bing if i am not at home and the description contains QUOTED_STRING_0`, { QUOTED_STRING_0: 'foo' },
    `$policy {
  true : @com.bing.web_search filter any(@org.thingpedia.builtin.thingengine.builtin.get_gps() filter !(location == $location.home)) && description =~ "foo" => notify;
}`],

    [`#[ executor = USERNAME_0 ] @com.twitter . post_picture ( ) ;`,
     `USERNAME_0 can post pictures on twitter`, { USERNAME_0: 'mom' },
     `#[executor="mom"^^tt:username]
@com.twitter.post_picture();`],

    [`@org.thingpedia.weather . sunrise ( date = DATE_0 ) ;`,
     `get sunrise sunset on date DATE_0`, { DATE_0: { year: 2018, month: 5, day: 23, hour: -1, minute: -1, second: -1 } },
     `@org.thingpedia.weather.sunrise(date=new Date("2018-05-23T07:00:00.000Z"));`],

    [`@org.thingpedia.weather . sunrise ( date = new Date ( " 2018-05-23T07:00:00.000Z " ) ) ;`,
     `get sunrise sunset on date 2018-05-23T07:00:00.000Z`, { },
     `@org.thingpedia.weather.sunrise(date=new Date("2018-05-23T07:00:00.000Z"));`],

    [`@org.thingpedia.weather . sunrise ( date = DATE_0 ) ;`,
     `get sunrise sunset on date DATE_0`, { DATE_0: { year: 2018, month: 5, day: 23, hour: 10, minute: 40, second: 0 } },
     `@org.thingpedia.weather.sunrise(date=new Date("2018-05-23T17:40:00.000Z"));`],

    [`@org.thingpedia.weather . sunrise ( date = DATE_0 ) ;`,
     `get sunrise sunset on date DATE_0`, { DATE_0: { year: 2018, month: 5, day: 23, hour: 10, minute: 40, second: -1 } },
     `@org.thingpedia.weather.sunrise(date=new Date("2018-05-23T17:40:00.000Z"));`],

    [`@org.thingpedia.weather . sunrise ( date = DATE_0 ) ;`,
     `get sunrise sunset on date DATE_0`, { DATE_0: { year: 2018, month: 5, day: 23, hour: 10, minute: 40, second: 40.5 } },
     `@org.thingpedia.weather.sunrise(date=new Date("2018-05-23T17:40:40.500Z"));`],

    ['@com.bing . web_search ( ) => @com.yandex.translate . translate ( target_language = GENERIC_ENTITY_tt:iso_lang_code_0 , text = $result ) ;',
    `translate web searches to GENERIC_ENTITY_tt:iso_lang_code_0`, { 'GENERIC_ENTITY_tt:iso_lang_code_0': { value: 'it', display: "Italian" } },
    `@com.bing.web_search() => @com.yandex.translate.translate(target_language="it"^^tt:iso_lang_code("Italian"), text=$result);`],

    ['@com.bing . web_search ( ) => @com.yandex.translate . translate ( target_language = null ^^tt:iso_lang_code ( " italian " ) , text = $result ) ;',
    `translate web searches to italian`, {},
    `@com.bing.web_search() => @com.yandex.translate.translate(target_language=null^^tt:iso_lang_code("italian"), text=$result);`],

    ['@com.bing . web_search ( query = " pizza " ) ;',
    `search pizza on bing`, {},
    `@com.bing.web_search(query="pizza");`],

    ['@com.bing . web_search ( query = " donald trump " ) ;',
    `search donald trump on bing`, {},
    `@com.bing.web_search(query="donald trump");`],

    ['@com.twitter . search ( ) filter contains ( hashtags , " foo " ^^tt:hashtag ) ;',
    `search hashtag foo on twitter`, {},
    `@com.twitter.search() filter contains(hashtags, "foo"^^tt:hashtag);`],

    ['#[ executor = " bob " ^^tt:username ] @com.twitter . post ( ) ;',
    `ask bob to post on twitter`, {},
    `#[executor="bob"^^tt:username]
@com.twitter.post();`],

    ['@com.twitter . follow ( user_name = " bob " ^^tt:username ) ;',
    `follow bob on twitter`, {},
    `@com.twitter.follow(user_name="bob"^^tt:username);`],

    ['$policy { true : now => @org.thingpedia.builtin.thingengine.builtin . discover filter any ( @org.thingpedia.builtin.test . get_data ( ) filter data == QUOTED_STRING_0 ) ; }',
    'everybody has permission to discover new devices if the data of more data genning ... is exactly QUOTED_STRING_0', { QUOTED_STRING_0: 'foo' },
    `$policy {
  true : now => @org.thingpedia.builtin.thingengine.builtin.discover filter any(@org.thingpedia.builtin.test.get_data() filter data == "foo");
}`],

    [`@com.xkcd . get_comic ( number = SLOT_0 ) ;`,
     '', { 'SLOT_0': new Ast.Value.Number(1234) },
     `@com.xkcd.get_comic(number=1234);`],

    [`@com.xkcd . get_comic ( number = SLOT_0 ) ;`,
     '', { 'SLOT_0': undefined },
     `@com.xkcd.get_comic(number=$?);`],

    [`@com.xkcd . get_comic ( number = $? ) ;`,
     'get some specific xkcd comic', {},
    `@com.xkcd.get_comic(number=$?);`],

    [`@com.twitter . search ( ) filter author == $? ;`,
     'search tweets by author', {},
    `@com.twitter.search() filter author == $?;`],

    ['sort ( sender_name asc of @com.gmail . inbox ( ) ) ;',
    'show my emails sorted by sender name', {},
    `sort(sender_name asc of @com.gmail.inbox());`],

    ['sort ( sender_name desc of @com.gmail . inbox ( ) ) ;',
    'show my emails sorted by sender name -lrb- in reverse order -rrb-', {},
    `sort(sender_name desc of @com.gmail.inbox());`],

    ['@com.gmail . inbox ( ) [ 1 ] ;',
    'show me exactly one email', {},
    `@com.gmail.inbox()[1];`],

    ['@com.gmail . inbox ( ) [ 1 : 3 ] ;',
    'show me exactly 3 emails', {},
    `@com.gmail.inbox()[1 : 3];`],

    ['@com.gmail . inbox ( ) [ 1 : NUMBER_0 ] ;',
    'show me exactly NUMBER_0 emails', { NUMBER_0: 22 },
    `@com.gmail.inbox()[1 : 22];`],

    ['@com.gmail . inbox ( ) [ 3 : NUMBER_0 ] ;',
    'show me exactly NUMBER_0 emails , starting from the third', { NUMBER_0: 22 },
    `@com.gmail.inbox()[3 : 22];`],

    ['@com.gmail . inbox ( ) [ NUMBER_1 : NUMBER_0 ] ;',
    'show me exactly NUMBER_0 emails , starting from the NUMBER_1', { NUMBER_1: 13, NUMBER_0: 22 },
    `@com.gmail.inbox()[13 : 22];`],

    ['@com.gmail . inbox ( ) [ 3 , 7 , NUMBER_0 ] ;',
    'show me exactly the emails number 3 , 7 and NUMBER_0', { NUMBER_0: 22 },
    `@com.gmail.inbox()[3, 7, 22];`],

    ['$yes ;',
    'yes', {},
    '$yes;'],

    ['$no ;',
    'no', {},
    '$no;'],

    ['$choice ( 0 ) ;',
    'the first choice', {},
    `$choice(0);`],

    ['$choice ( 1 ) ;',
    'the second choice', {},
    `$choice(1);`],

    ['$choice ( 2 ) ;',
    'the third choice', {},
    `$choice(2);`],

    ['$answer ( NUMBER_0 ) ;',
    'NUMBER_0', { NUMBER_0: 42 },
    `$answer(42);`],

    ['$answer ( LOCATION_0 ) ;',
    'LOCATION_0', { LOCATION_0: { latitude: 0, longitude: 0, display: "North Pole" } },
    `$answer(new Location(0, 0, "North Pole"));`],

    ['$answer ( 0 ) ;',
    'zero', {},
    `$answer(0);`],

    ['@org.thingpedia.weather . current ( location = new Location ( " stanford california " ) ) ;',
    'get weather for stanford california', {},
    `@org.thingpedia.weather.current(location=new Location("stanford california"));`],

    ['attimer ( time = [ TIME_0 ] ) => @org.thingpedia.builtin.thingengine.builtin . say ( message = QUOTED_STRING_0 ) ;',
    `say QUOTED_STRING_0 every day at 9am`,
    { TIME_0: { hour: 9, minute: 0 }, QUOTED_STRING_0: "it's 9am" },
    `attimer(time=[new Time(9, 0)]) => @org.thingpedia.builtin.thingengine.builtin.say(message="it's 9am");`],

    ['attimer ( time = [ TIME_0 , TIME_1 ] ) => @org.thingpedia.builtin.thingengine.builtin . say ( message = QUOTED_STRING_0 ) ;',
    `say QUOTED_STRING_0 every day at 9am and 3pm`,
    { TIME_0: { hour: 9, minute: 0 }, TIME_1: { hour: 15, minute: 0 }, QUOTED_STRING_0: "it's 9am or 3pm" },
    `attimer(time=[new Time(9, 0), new Time(15, 0)]) => @org.thingpedia.builtin.thingengine.builtin.say(message="it's 9am or 3pm");`],

    [`attimer ( time = [ $time . morning ] ) => @org.thingpedia.builtin.thingengine.builtin . say ( message = QUOTED_STRING_0 ) ;`,
    `say QUOTED_STRING_0 every day in the morning`,
    { QUOTED_STRING_0: "it's the morning" },
    `attimer(time=[$time.morning]) => @org.thingpedia.builtin.thingengine.builtin.say(message="it's the morning");`],

    [`attimer ( time = [ $time . evening ] ) => @org.thingpedia.builtin.thingengine.builtin . say ( message = QUOTED_STRING_0 ) ;`,
    `say QUOTED_STRING_0 every day in the evening`,
    { QUOTED_STRING_0: "it's the evening" },
    `attimer(time=[$time.evening]) => @org.thingpedia.builtin.thingengine.builtin.say(message="it's the evening");`],

    [`attimer ( time = [ new Time ( 12 , 0 ) ] ) => @org.thingpedia.builtin.thingengine.builtin . say ( message = QUOTED_STRING_0 ) ;`,
    'say QUOTED_STRING every day at noon',
    { QUOTED_STRING_0: "it's noon" },
    `attimer(time=[new Time(12, 0)]) => @org.thingpedia.builtin.thingengine.builtin.say(message="it's noon");`],

    ['ontimer ( date = [ DATE_0 ] ) => @org.thingpedia.builtin.thingengine.builtin . say ( message = QUOTED_STRING_0 ) ;',
    `say QUOTED_STRING_0 on DATE_0`,
    { DATE_0: { year: 2021, month: 1, day: 1 }, QUOTED_STRING_0: "hello, world" },
    `ontimer(date=[new Date("2021-01-01T08:00:00.000Z")]) => @org.thingpedia.builtin.thingengine.builtin.say(message="hello, world");`],

    ['ontimer ( date = [ set_time ( DATE_0 , TIME_0 ) ] ) => @org.thingpedia.builtin.thingengine.builtin . say ( message = QUOTED_STRING_0 ) ;',
    `say QUOTED_STRING_0 at TIME_0 on DATE_0`,
    { DATE_0: { year: 2021, month: 1, day: 1 }, TIME_0: { hour: 9, minute: 30 }, QUOTED_STRING_0: "hello, world" },
    `ontimer(date=[set_time(new Date("2021-01-01T08:00:00.000Z"), new Time(9, 30))]) => @org.thingpedia.builtin.thingengine.builtin.say(message="hello, world");`],

    ['ontimer ( date = [ set_time ( DATE_0 , $time . morning ) ] ) => @org.thingpedia.builtin.thingengine.builtin . say ( message = QUOTED_STRING_0 ) ;',
    `say QUOTED_STRING_0 on the morning of DATE_0`,
    { DATE_0: { year: 2021, month: 1, day: 1 }, TIME_0: { hour: 9, minute: 30 }, QUOTED_STRING_0: "good morning, world" },
    `ontimer(date=[set_time(new Date("2021-01-01T08:00:00.000Z"), $time.morning)]) => @org.thingpedia.builtin.thingengine.builtin.say(message="good morning, world");`],

    ['ontimer ( date = [ set_time ( $now + DURATION_0 , TIME_0 ) ] ) => @org.thingpedia.builtin.thingengine.builtin . say ( message = QUOTED_STRING_0 ) ;',
    `say QUOTED_STRING_0 DURATION_0 from now at TIME_0`,
    { DURATION_0: { value: 2, unit: 'day' }, TIME_0: { hour: 9, minute: 30 }, QUOTED_STRING_0: "hello, world" },
    `ontimer(date=[set_time($now + 2day, new Time(9, 30))]) => @org.thingpedia.builtin.thingengine.builtin.say(message="hello, world");`],

    ['[ description , title ] of @com.bing . web_search ( ) ;',
    'get title and description from bing', {},
    '[description, title] of @com.bing.web_search();'],

    [`@com.spotify . get_currently_playing ( ) => @com.spotify . add_songs_to_playlist ( songs = [ song ] ) ;`,
    `add the currently playing song to my playlist`, {},
    `@com.spotify.get_currently_playing() => @com.spotify.add_songs_to_playlist(songs=[song]);`],

    [`[ author , text ] of monitor ( text of @com.twitter . home_timeline ( ) ) ;`,
    `monitor new text of tweets and show me the text and author`, {},
    `[author, text] of monitor(text of @com.twitter.home_timeline());`],

    ['@com.twitter . post ( status = $context . selection : String ) ;',
    'post this on twitter', {},
    `@com.twitter.post(status=$context.selection : String);`],

    [`@com.twitter . home_timeline ( ) filter count ( hashtags ) >= 0 ;`,
    `get tweets with hashtags`, {},
    `@com.twitter.home_timeline() filter count(hashtags) >= 0;`],

    // just to test syntax, in reality we should not generate examples like this
    [`@com.twitter . home_timeline ( ) filter count ( hashtags filter value == " foo " ^^tt:hashtag ) >= 0 ;`,
    `get tweets with hashtags foo`, {},
    `@com.twitter.home_timeline() filter count(hashtags filter value == "foo"^^tt:hashtag) >= 0;`],

    [`@light-bulb ( name = " bedroom " ) . set_power ( power = enum off ) ;`,
    `turn off my bedroom lights`, {},
    `@light-bulb(name="bedroom").set_power(power=enum off);`],

    [`$dialogue @org.thingpedia.dialogue.transaction . greet ;`,
     `hello`, {},
     `$dialogue @org.thingpedia.dialogue.transaction.greet;`],

    [`$dialogue @org.thingpedia.dialogue.transaction . execute ; ` +
     `@com.thecatapi . get ( ) ;`,
    `get a cat picture`, {},
    `$dialogue @org.thingpedia.dialogue.transaction.execute;
@com.thecatapi.get();`],

    [`$dialogue @org.thingpedia.dialogue.transaction . execute ; ` +
     `@com.thecatapi . get ( ) ` +
     `#[ results = [ { image_id = GENERIC_ENTITY_com.thecatapi:image_id_0 , picture_url = PICTURE_0 , link = URL_0 } ] ] ;`,
    `here is your cat picture`, { 'GENERIC_ENTITY_com.thecatapi:image_id_0': { value: '1234', display: null }, PICTURE_0: 'https://example.com/1', URL_0: 'https://example.com/2' },
    `$dialogue @org.thingpedia.dialogue.transaction.execute;
@com.thecatapi.get()
#[results=[
  { image_id="1234"^^com.thecatapi:image_id, picture_url="https://example.com/1"^^tt:picture, link="https://example.com/2"^^tt:url }
]];`],

    [`$dialogue @org.thingpedia.dialogue.transaction . execute ; ` +
     `@com.thecatapi . get ( ) ` +
     `#[ results = [ { image_id = GENERIC_ENTITY_com.thecatapi:image_id_0 , picture_url = PICTURE_0 , link = URL_1 } ] ] ; ` +
     `@com.twitter . post_picture ( picture_url = PICTURE_0 ) ;`,
    `now post it on twitter`, { 'GENERIC_ENTITY_com.thecatapi:image_id_0': { value: '1234', display: null }, PICTURE_0: 'https://example.com/1', URL_1: 'https://example.com/2' },
    `$dialogue @org.thingpedia.dialogue.transaction.execute;
@com.thecatapi.get()
#[results=[
  { image_id="1234"^^com.thecatapi:image_id, picture_url="https://example.com/1"^^tt:picture, link="https://example.com/2"^^tt:url }
]];
@com.twitter.post_picture(picture_url="https://example.com/1"^^tt:picture);`],

    [`$dialogue @org.thingpedia.dialogue.transaction . execute ; ` +
     `@com.thecatapi . get ( ) ` +
     `#[ results = [ { image_id = GENERIC_ENTITY_com.thecatapi:image_id_0 , picture_url = PICTURE_0 , link = URL_1 } ] ] ; ` +
     `@com.twitter . post_picture ( picture_url = PICTURE_0 ) ` +
     `#[ confirm = enum confirmed ] ;`,
    `confirm posting it on twitter`, { 'GENERIC_ENTITY_com.thecatapi:image_id_0': { value: '1234', display: null }, PICTURE_0: 'https://example.com/1', URL_1: 'https://example.com/2' },
    `$dialogue @org.thingpedia.dialogue.transaction.execute;
@com.thecatapi.get()
#[results=[
  { image_id="1234"^^com.thecatapi:image_id, picture_url="https://example.com/1"^^tt:picture, link="https://example.com/2"^^tt:url }
]];
@com.twitter.post_picture(picture_url="https://example.com/1"^^tt:picture)
#[confirm=enum confirmed];`],

    [`$dialogue @org.thingpedia.dialogue.transaction . execute ; ` +
     `@com.thecatapi . get ( ) ` +
     `#[ results = [ { image_id = GENERIC_ENTITY_com.thecatapi:image_id_0 , picture_url = PICTURE_0 , link = URL_0 } ] ] ; ` +
     `@com.twitter . post_picture ( picture_url = PICTURE_0 ) ` +
     `#[ results = [ { tweet_id = GENERIC_ENTITY_com.twitter:tweet_id_0 , link = URL_1 } ] ] ;`,
    `here is your twitter picture`, {
        'GENERIC_ENTITY_com.thecatapi:image_id_0': { value: '1234', display: null },
        PICTURE_0: 'https://example.com/1',
        URL_0: 'https://example.com/2',
        'GENERIC_ENTITY_com.twitter:tweet_id_0': { value: '1111', display: null },
        URL_1: 'https://example.com/3'
    },
    `$dialogue @org.thingpedia.dialogue.transaction.execute;
@com.thecatapi.get()
#[results=[
  { image_id="1234"^^com.thecatapi:image_id, picture_url="https://example.com/1"^^tt:picture, link="https://example.com/2"^^tt:url }
]];
@com.twitter.post_picture(picture_url="https://example.com/1"^^tt:picture)
#[results=[
  { tweet_id="1111"^^com.twitter:tweet_id, link="https://example.com/3"^^tt:url }
]];`],

    [`$dialogue @org.thingpedia.dialogue.transaction . execute ; ` +
     `@com.thecatapi . get ( ) ` +
     `#[ results = [ { image_id = GENERIC_ENTITY_com.thecatapi:image_id_0 , picture_url = PICTURE_0 , link = URL_0 } ] ] ; ` +
     `@com.twitter . post_picture ( picture_url = PICTURE_0 ) ` +
     `#[ results = [ ] ] #[ error = QUOTED_STRING_0 ] ;`,
    `sorry , that did not work : QUOTED_STRING_0`, {
        'GENERIC_ENTITY_com.thecatapi:image_id_0': { value: '1234', display: null },
        PICTURE_0: 'https://example.com/1',
        URL_0: 'https://example.com/2',
        'GENERIC_ENTITY_com.twitter:tweet_id_0': { value: '1111', display: null },
        URL_1: 'https://example.com/3',
        QUOTED_STRING_0: 'something bad happened'
    },
    `$dialogue @org.thingpedia.dialogue.transaction.execute;
@com.thecatapi.get()
#[results=[
  { image_id="1234"^^com.thecatapi:image_id, picture_url="https://example.com/1"^^tt:picture, link="https://example.com/2"^^tt:url }
]];
@com.twitter.post_picture(picture_url="https://example.com/1"^^tt:picture)
#[results=[]]
#[error="something bad happened"];`],

    [`$dialogue @org.thingpedia.dialogue.transaction . execute ; ` +
     `@com.thecatapi . get ( ) ` +
     `#[ results = [ { image_id = GENERIC_ENTITY_com.thecatapi:image_id_0 , picture_url = PICTURE_0 , link = URL_0 } ] ] ; ` +
     `@com.twitter . post_picture ( picture_url = PICTURE_0 ) ` +
     `#[ results = [ ] ] #[ error = enum my_error_code ] ;`,
    `sorry , that did not work : QUOTED_STRING_0`, {
        'GENERIC_ENTITY_com.thecatapi:image_id_0': { value: '1234', display: null },
        PICTURE_0: 'https://example.com/1',
        URL_0: 'https://example.com/2',
        'GENERIC_ENTITY_com.twitter:tweet_id_0': { value: '1111', display: null },
        URL_1: 'https://example.com/3'
    },
    `$dialogue @org.thingpedia.dialogue.transaction.execute;
@com.thecatapi.get()
#[results=[
  { image_id="1234"^^com.thecatapi:image_id, picture_url="https://example.com/1"^^tt:picture, link="https://example.com/2"^^tt:url }
]];
@com.twitter.post_picture(picture_url="https://example.com/1"^^tt:picture)
#[results=[]]
#[error=enum my_error_code];`],

    [`$dialogue @org.thingpedia.dialogue.transaction . execute ; ` +
     `@com.thecatapi . get ( ) ` +
     `#[ results = [ { image_id = GENERIC_ENTITY_com.thecatapi:image_id_0 , picture_url = PICTURE_0 , link = URL_0 } ] ] ` +
     `#[ count = NUMBER_0 ] ;`,
    `i found NUMBER_0 cat pictures , here is one`, { 'GENERIC_ENTITY_com.thecatapi:image_id_0': { value: '1234', display: null }, PICTURE_0: 'https://example.com/1', URL_0: 'https://example.com/2', NUMBER_0: 55 },
    `$dialogue @org.thingpedia.dialogue.transaction.execute;
@com.thecatapi.get()
#[results=[
  { image_id="1234"^^com.thecatapi:image_id, picture_url="https://example.com/1"^^tt:picture, link="https://example.com/2"^^tt:url }
]]
#[count=55];`],

    [`$dialogue @org.thingpedia.dialogue.transaction . execute ; ` +
     `@com.thecatapi . get ( ) ` +
     `#[ results = [ { image_id = GENERIC_ENTITY_com.thecatapi:image_id_0 , picture_url = PICTURE_0 , link = URL_0 } ] ] ` +
     `#[ count = NUMBER_0 ] ` +
     `#[ more = true ] ;`,
    `i found more than NUMBER_0 cat pictures , here is one`, { 'GENERIC_ENTITY_com.thecatapi:image_id_0': { value: '1234', display: null }, PICTURE_0: 'https://example.com/1', URL_0: 'https://example.com/2', NUMBER_0: 55 },
    `$dialogue @org.thingpedia.dialogue.transaction.execute;
@com.thecatapi.get()
#[results=[
  { image_id="1234"^^com.thecatapi:image_id, picture_url="https://example.com/1"^^tt:picture, link="https://example.com/2"^^tt:url }
]]
#[count=55]
#[more=true];`],

    [`$dialogue @org.thingpedia.dialogue.transaction . sys_search_question ( serveCuisine ) ; ` +
     `@org.schema . restaurant ( ) ;`,
     'what kind of cuisine are you looking for ?', {},
     `$dialogue @org.thingpedia.dialogue.transaction.sys_search_question(serveCuisine);
@org.schema.restaurant();`],

    [`$dialogue @org.thingpedia.dialogue.transaction . sys_search_question ( price , serveCuisine ) ; ` +
     `@org.schema . restaurant ( ) ;`,
     'what kind of cuisine and price are you looking for ?', {},
     `$dialogue @org.thingpedia.dialogue.transaction.sys_search_question(price, serveCuisine);
@org.schema.restaurant();`],

    [`$answer ( null ^^tt:function ( " google contacts " ) ) ;`,
    `google contacts`, {},
    `$answer(null^^tt:function("google contacts"));`],

    [`$answer ( @com.google . contacts ) ;`,
    ``, {},
    `$answer("com.google.contacts"^^tt:function);`],

    [`@com.yelp . restaurant ( ) filter true ( cuisines ) ;`,
    `i 'm looking for a restaurant , i do n't care what cuisine`, {},
    `@com.yelp.restaurant() filter true(cuisines);`],

    ['@org.schema.full . Recipe ( ) filter nutrition . fatContent >= MEASURE_kg_0 && nutrition . sugarContent >= MEASURE_kg_0 ;',
     `yeah please find a recipe with that fat content and that sugar content`, { MEASURE_kg_0: { value: 13, unit: 'kg' } },
     `@org.schema.full.Recipe() filter nutrition.fatContent >= 13kg && nutrition.sugarContent >= 13kg;`],

    ['@com.uber . price_estimate ( ) filter low_estimate <= NUMBER_0 $usd ;',
     'is it less than $ NUMBER_0 ?', { NUMBER_0: 1000 },
     '@com.uber.price_estimate() filter low_estimate <= 1000$usd;'],

    ['@com.twitter ( id = GENERIC_ENTITY_tt:device_id_0 ) . post ( status = QUOTED_STRING_0 ) ;',
     'post QUOTED_STRING_0 on it', { 'GENERIC_ENTITY_tt:device_id_0': { value: 'twitter-account-foo', display: "Twitter Account foo" },
                                     QUOTED_STRING_0: 'hello' },
     `@com.twitter(id="twitter-account-foo"^^tt:device_id("Twitter Account foo")).post(status="hello");`],

    ['@com.twitter ( id = GENERIC_ENTITY_tt:device_id_0 ) . post ( status = QUOTED_STRING_0 ) ;',
     'post QUOTED_STRING_0 on it', { 'GENERIC_ENTITY_tt:device_id_0': { value: 'twitter-account-foo' },
                                     QUOTED_STRING_0: 'hello' },
     `@com.twitter(id="twitter-account-foo"^^tt:device_id).post(status="hello");`],

    [`@org.thingpedia.weather . sunrise ( date = new Date ( , , NUMBER_0 ) ) ;`,
     `get sunrise sunset on the NUMBER_0 th`, { NUMBER_0: 25 },
     `@org.thingpedia.weather.sunrise(date=new Date(, , 25));`],

    [`@org.thingpedia.weather . sunrise ( date = new Date ( , , 10 , TIME_0 ) ) ;`,
     `get sunrise sunset on the 10 th at TIME_0`, { TIME_0: { hour: 5, minute: 0 } },
     `@org.thingpedia.weather.sunrise(date=new Date(, , 10, new Time(5, 0)));`],

    [`@org.thingpedia.weather . sunrise ( date = new Date ( NUMBER_0 , 3 ) ) ;`,
     `get sunrise sunset on March, NUMBER_0`, { NUMBER_0: 2020 },
     `@org.thingpedia.weather.sunrise(date=new Date("2020-03-01T08:00:00.000Z"));`],

    [`@org.thingpedia.weather . sunrise ( date = new Date ( 10 ) ) ;`,
     `get sunrise sunset in the 10 s`, {},
     `@org.thingpedia.weather.sunrise(date=new Date("2010-01-01T08:00:00.000Z"));`],

    [`@org.thingpedia.weather . sunrise ( date = new Date ( NUMBER_0 ) ) ;`,
     `get sunrise sunset in the NUMBER_0 s`, { NUMBER_0: 20 },
     `@org.thingpedia.weather.sunrise(date=new Date("2020-01-01T08:00:00.000Z"));`],

    [`@org.thingpedia.weather . sunrise ( date = new Date ( NUMBER_0 ) ) ;`,
     `get sunrise sunset in the NUMBER_0 s`, { NUMBER_0: 90 },
     `@org.thingpedia.weather.sunrise(date=new Date("1990-01-01T08:00:00.000Z"));`],

    [`@org.thingpedia.weather . sunrise ( date = new Date ( enum monday ) ) ;`,
     `get sunrise sunset on Monday`, {},
     `@org.thingpedia.weather.sunrise(date=new Date(enum monday));`],

    [`@org.thingpedia.weather . sunrise ( date = new Date ( enum monday , TIME_0 ) ) ;`,
     `get sunrise sunset on Monday`, { TIME_0: { hour: 5, minute: 0 } },
     `@org.thingpedia.weather.sunrise(date=new Date(enum monday, new Time(5, 0)));`],

    [`@com.yelp . restaurant ( ) filter openingHours == new RecurrentTimeSpecification ( { beginTime = new Time ( 0 , 0 ) , endTime = new Time ( NUMBER_0 , 0 ) ,`
    + ` dayOfWeek = enum friday } , { beginTime = new Time ( 0 , 0 ) , endTime = new Time ( NUMBER_0 , 0 ) , dayOfWeek = enum saturday } ) ;`,
    `restaurants open NUMBER_0 hours on friday and saturday`, { NUMBER_0: 24 },
    `@com.yelp.restaurant() filter openingHours == new RecurrentTimeSpecification({ beginTime=new Time(0, 0), endTime=new Time(24, 0), dayOfWeek=enum friday }, { beginTime=new Time(0, 0), endTime=new Time(24, 0), dayOfWeek=enum saturday });`],

    ['let foo = @org.thingpedia.weather . sunrise ( date = new Date ( enum monday ) ) ;',
     'let foo be the weather on monday', {},
     'let foo = @org.thingpedia.weather.sunrise(date=new Date(enum monday));'],

    ['timer ( base = $now , interval = NUMBER_0 min ) => @com.tesla.car . get_mobile_enabled ( ) ;',
     'check the status of my tesla car every NUMBER_0 minutes', { NUMBER_0: 44 },
     'timer(base=$now, interval=44min) => @com.tesla.car.get_mobile_enabled();'],

    ['[ aggregateRating . reviewCount ] of @org.schema . restaurant ( ) filter name =~ " holiday inn " ;',
     'get the review count of the holiday inn', {},
     '[aggregateRating.reviewCount] of @org.schema.restaurant() filter name =~ "holiday inn";'],

    ['sum ( aggregateRating . reviewCount of @org.schema . restaurant ( ) filter name =~ " holiday inn " ) ;',
     'sum the review count of the holiday inn', {},
     'sum(aggregateRating.reviewCount of @org.schema.restaurant() filter name =~ "holiday inn");'],

    ['@com.thecatapi . get ( count = 77 ) ;',
     'find me 77 cat pictures', {},
     '@com.thecatapi.get(count=77);'],

     ['@thermostat . set_target_temperature ( value = 77 F ) ;',
     'set the thermostat to 77 f', {},
     '@thermostat.set_target_temperature(value=77F);'],

     ['@com.uber . price_estimate ( end = $location . home , start = $location . work ) filter low_estimate >= 50 $usd ;',
    `get an uber price estimate from home to work if the low estimate is greater than $ 50`, {},
    `@com.uber.price_estimate(end=$location.home, start=$location.work) filter low_estimate >= 50$usd;`],
];

async function testCase(test, i) {
    if (test.length !== 4)
        throw new Error('invalid test ' + test[0]);
    let [sequence, sentence, entities, expected] = test;

    console.log('Test Case #' + (i+1));
    try {
        sequence = sequence.split(' ');
        let program = Grammar.parse(sequence, Grammar.SyntaxType.Tokenized, entities);
        let generated = program.prettyprint();

        if (generated !== expected) {
            console.error('Test Case #' + (i+1) + ' failed (wrong program)');
            console.error('Expected:', expected);
            console.error('Generated:', generated);
            if (process.env.TEST_MODE)
                throw new Error(`testNNSyntax ${i+1} FAILED`);
        }

        if (!sentence)
            return;
        await program.typecheck(schemaRetriever);

        let entityRetriever = new Grammar.EntityRetriever(sentence, entities, {
            timezone: 'America/Los_Angeles'
        });
        let reconstructed = Grammar.serialize(program, Grammar.SyntaxType.Tokenized, entityRetriever).join(' ');
        if (reconstructed !== test[0]) {
            console.error('Test Case #' + (i+1) + ' failed (wrong NN syntax)');
            console.error('Expected:', test[0]);
            console.error('Generated:', reconstructed);
            if (process.env.TEST_MODE)
                throw new Error(`testNNSyntax ${i+1} FAILED`);
        }
    } catch(e) {
        console.error('Test Case #' + (i+1) + ' failed with exception');
        console.error(sequence.join(' '));
        console.error(e.stack);
        if (process.env.TEST_MODE)
            throw e;
    }
}

export default async function main(max = Infinity) {
    for (let i = 0; i < Math.min(TEST_CASES.length, max); i++)
        await testCase(TEST_CASES[i], i);
}
if (!module.parent)
    main(parseInt(process.argv[2])||Infinity);
