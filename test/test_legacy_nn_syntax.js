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

/*class SimpleSequenceLexer {
    constructor(sequence) {
        this._sequence = sequence;
        this._i = 0;
    }

    next() {
        if (this._i >= this._sequence.length)
            return { done: true };

        let next = this._sequence[this._i++];
        if (/^[A-Z]/.test(next)) {
            // entity
            next = next.substring(0, next.lastIndexOf('_'));
        } else if (next.startsWith('@')) {
            next = 'FUNCTION';
        } else if (next.startsWith('enum:')) {
            next = 'ENUM';
        } else if (next.startsWith('param:')) {
            next = 'PARAM_NAME';
        } else if (next.startsWith('unit:')) {
            next = 'UNIT';
        }
        return { done: false, value: next };
    }
}*/

const TEST_CASES = [
    [`monitor ( @com.xkcd.get_comic ) => notify`,
     `monitor xkcd`, {},
     `monitor(@com.xkcd.get_comic());`
    ],

    [`now => @com.twitter.post param:status:String = QUOTED_STRING_0`,
     `tweet QUOTED_STRING_0`, { 'QUOTED_STRING_0': 'hello' },
     `@com.twitter.post(status="hello");`
    ],

    [`now => @com.twitter.post param:status:String = ""`,
     `post on twitter`, {},
     `@com.twitter.post(status="");`
    ],

    [`now => @com.xkcd.get_comic param:number:Number = NUMBER_0 => notify`,
     `get xkcd NUMBER_0`, { 'NUMBER_0': 1234 },
     `@com.xkcd.get_comic(number=1234);`],

    [`now => @com.xkcd.get_comic param:number:Number = NUMBER_0 => @com.twitter.post on param:status:String = param:title:String`,
     `get xkcd NUMBER_0`, { 'NUMBER_0': 1234 },
     `@com.xkcd.get_comic(number=1234) => @com.twitter.post(status=title);`],

    [`now => ( @org.thingpedia.builtin.thingengine.builtin.get_random_between param:high:Number = NUMBER_1 param:low:Number = NUMBER_0 ) join ( @com.xkcd.get_comic ) on param:number:Number = param:random:Number => notify`,
    `get xkcd whose number is a random number between NUMBER_0 and NUMBER_1`, { 'NUMBER_0': 55, 'NUMBER_1': 1024 },
    `@org.thingpedia.builtin.thingengine.builtin.get_random_between(high=1024, low=55) => @com.xkcd.get_comic(number=random);`],

    [`( timer base = now , interval = 1 unit:h ) => ( ( @org.thingpedia.builtin.thingengine.builtin.get_random_between param:high:Number = NUMBER_1 param:low:Number = NUMBER_0 ) join ( @com.xkcd.get_comic ) on param:number:Number = param:random:Number ) => notify`,
    `every hour get xkcd whose number is a random number between NUMBER_0 and NUMBER_1`, { 'NUMBER_0': 55, 'NUMBER_1': 1024 },
    `timer(base=$now, interval=1h) => @org.thingpedia.builtin.thingengine.builtin.get_random_between(high=1024, low=55) => @com.xkcd.get_comic(number=random);`],

    [`( timer base = now , interval = 1 unit:h , frequency = 3 ) => ( ( @org.thingpedia.builtin.thingengine.builtin.get_random_between param:high:Number = NUMBER_1 param:low:Number = NUMBER_0 ) join ( @com.xkcd.get_comic ) on param:number:Number = param:random:Number ) => notify`,
    `3 times every hour get xkcd whose number is a random number between NUMBER_0 and NUMBER_1`, { 'NUMBER_0': 55, 'NUMBER_1': 1024 },
    `timer(base=$now, frequency=3, interval=1h) => @org.thingpedia.builtin.thingengine.builtin.get_random_between(high=1024, low=55) => @com.xkcd.get_comic(number=random);`],

    [`now => @org.thingpedia.builtin.thingengine.builtin.get_random_between param:high:Number = NUMBER_1 param:low:Number = NUMBER_0 => notify`,
    `get a random number between NUMBER_0 and NUMBER_1`,{ 'NUMBER_0': 55, 'NUMBER_1': 1024 },
    `@org.thingpedia.builtin.thingengine.builtin.get_random_between(high=1024, low=55);`],

    [`now => @org.thingpedia.builtin.thingengine.builtin.get_random_between param:high:Number = NUMBER_0 param:low:Number = NUMBER_1 => notify`,
    `get xkcd whose number is a random number max is NUMBER_0 min is NUMBER_1`, { 'NUMBER_0': 1024, 'NUMBER_1': 55 },
    `@org.thingpedia.builtin.thingengine.builtin.get_random_between(high=1024, low=55);`],

    [`monitor ( @thermostat.get_temperature ) => notify`,
    `monitor thermostat`, {},
    `monitor(@thermostat.get_temperature());`],

    [`monitor ( ( @thermostat.get_temperature ) filter param:value:Measure(C) >= NUMBER_0 unit:F ) => notify`,
    `notify me if the temperature is above NUMBER_0 degrees`, { 'NUMBER_0': 70 },
    `monitor(@thermostat.get_temperature() filter value >= 70F);`],

    [`now => ( @com.bing.image_search ) filter param:height:Number >= NUMBER_1 or param:width:Number >= NUMBER_0 => notify`,
    `search images wider than NUMBER_0 pixels or taller than NUMBER_1 pixels`, { NUMBER_0: 100, NUMBER_1:200 },
    `@com.bing.image_search() filter height >= 200 || width >= 100;`],

    [`now => ( @com.bing.image_search ) filter param:height:Number >= NUMBER_1 or param:width:Number >= NUMBER_0 and param:width:Number <= NUMBER_2 => notify`,
    `search images wider than NUMBER_0 pixels or taller than NUMBER_1 pixels and narrower than NUMBER_2 pixels`, { NUMBER_0: 100, NUMBER_1:200, NUMBER_2: 500 },
    `@com.bing.image_search() filter (height >= 200 || width >= 100) && width <= 500;`],

    [`now => ( @com.bing.image_search ) filter param:height:Number >= NUMBER_0 or param:width:Number >= NUMBER_0 => notify`,
    `search images larger than NUMBER_0 pixels in either dimension`, { NUMBER_0: 100 },
    `@com.bing.image_search() filter height >= 100 || width >= 100;`],

    [`now => ( @com.bing.image_search ) filter param:width:Number >= NUMBER_0 => notify`,
    `search images wider than NUMBER_0 pixels`, { NUMBER_0: 100 },
    `@com.bing.image_search() filter width >= 100;`],

    ['monitor ( @com.xkcd.get_comic ) on new param:title:String => notify',
    `monitor xkcd if the title changes`, {},
    `monitor(title of @com.xkcd.get_comic());`],

    ['monitor ( @com.xkcd.get_comic ) on new [ param:alt_text:String , param:title:String ] => notify',
    `monitor xkcd if the title or alt text changes`, {},
    `monitor(alt_text, title of @com.xkcd.get_comic());`],

    ['monitor ( ( @com.instagram.get_pictures param:count:Number = NUMBER_0 ) filter param:caption:String in_array [ QUOTED_STRING_0 , QUOTED_STRING_1 ] ) => notify',
    `monitor my last NUMBER_0 instagram pics if the caption is either QUOTED_STRING_0 or QUOTED_STRING_1`, { NUMBER_0: 100, QUOTED_STRING_0: 'abc', QUOTED_STRING_1: 'def' },
    `monitor(@com.instagram.get_pictures(count=100) filter in_array(caption, ["abc", "def"]));`],

    ['timer base = now , interval = DURATION_0 => notify',
    `alert me every DURATION_0`, { DURATION_0: { value: 30, unit: 'min' } },
    `timer(base=$now, interval=30min);`],

    ['monitor ( ( @com.phdcomics.get_post ) filter not param:title:String =~ QUOTED_STRING_0 ) => notify',
    `monitor phd comics post that do n't have QUOTED_STRING_0 in the title`, { QUOTED_STRING_0: 'abc' }, //'
    `monitor(@com.phdcomics.get_post() filter !(title =~ "abc"));`],

    ['now => ( @com.uber.price_estimate param:end:Location = location:home param:start:Location = location:work ) filter param:low_estimate:Currency >= CURRENCY_0 => notify',
    `get an uber price estimate from home to work if the low estimate is greater than CURRENCY_0`, { CURRENCY_0: { value: 50, unit: 'usd' } },
    `@com.uber.price_estimate(end=$location.home, start=$location.work) filter low_estimate >= 50$usd;`],

    ['now => ( @com.uber.price_estimate ) filter param:uber_type:Enum(pool,uber_x,uber_xl,uber_black,select,suv,assist) == enum:uber_x => notify',
    `get a price estimate for uber x`, {},
    `@com.uber.price_estimate() filter uber_type == enum uber_x;`],

    ['now => @org.thingpedia.builtin.thingengine.builtin.configure param:device:Entity(tt:device) = device:com.google',
    `configure google`, {},
    `@org.thingpedia.builtin.thingengine.builtin.configure(device="com.google"^^tt:device);`],

    ['now => ( @com.nytimes.get_front_page ) filter param:updated:Date >= now - DURATION_0 => notify',
     `get new york times articles published in the last DURATION_0`, { DURATION_0: { value: 15, unit: 'min' } },
     `@com.nytimes.get_front_page() filter updated >= $now - 15min;`],

    [`executor = USERNAME_0 : now => @com.twitter.post`,
     `ask USERNAME_0 to post on twitter`, { USERNAME_0: 'bob' },
     `#[executor="bob"^^tt:username]
@com.twitter.post();`],

    [`executor = USERNAME_0 : now => @com.xkcd.get_comic => notify`,
     `ask USERNAME_0 to get xkcd`, { USERNAME_0: 'bob' },
     `#[executor="bob"^^tt:username]
@com.xkcd.get_comic();`],

    [`now => ( @security-camera.current_event ) filter @org.thingpedia.builtin.thingengine.builtin.get_gps { not param:location:Location == location:home } => notify`,
     `show me my security camera if i 'm not home`, {}, //'
     `@security-camera.current_event() filter any(@org.thingpedia.builtin.thingengine.builtin.get_gps() filter !(location == $location.home));`],

    [`policy true : now => @com.twitter.post`,
    `anyone can post on twitter`, {},
    `$policy {
  true : now => @com.twitter.post;
}`],

    [`policy true : now => @com.twitter.post filter param:status:String =~ QUOTED_STRING_0`,
    `anyone can post on twitter if they put QUOTED_STRING_0 in the status`, { QUOTED_STRING_0: 'foo' },
    `$policy {
  true : now => @com.twitter.post filter status =~ "foo";
}`],

    [`policy true : @com.bing.web_search => notify`,
    `anyone can search on bing`, {},
    `$policy {
  true : @com.bing.web_search => notify;
}`],

    [`policy true : @com.bing.web_search filter param:query:String =~ QUOTED_STRING_0 => notify`,
    `anyone can search on bing if the query contains QUOTED_STRING_0`,{ QUOTED_STRING_0: 'foo' },
    `$policy {
  true : @com.bing.web_search filter query =~ "foo" => notify;
}`],

    [`policy true : @com.bing.web_search filter param:description:String =~ QUOTED_STRING_0 => notify`,
    `anyone can search on bing if the description contains QUOTED_STRING_0`, { QUOTED_STRING_0: 'foo' },
    `$policy {
  true : @com.bing.web_search filter description =~ "foo" => notify;
}`],

    [`policy true : @com.bing.web_search filter param:description:String =~ QUOTED_STRING_0 => @com.twitter.post filter param:status:String =~ QUOTED_STRING_0`,
    `anyone can search on bing if the description contains QUOTED_STRING_0 and then post on twitter if the status contains the same thing`, { QUOTED_STRING_0: 'foo' },
    `$policy {
  true : @com.bing.web_search filter description =~ "foo" => @com.twitter.post filter status =~ "foo";
}`],

    [`policy true : @com.bing.web_search filter @org.thingpedia.builtin.thingengine.builtin.get_gps { not param:location:Location == location:home } and param:description:String =~ QUOTED_STRING_0 => notify`,
    `anyone can search on bing if i am not at home and the description contains QUOTED_STRING_0`, { QUOTED_STRING_0: 'foo' },
    `$policy {
  true : @com.bing.web_search filter any(@org.thingpedia.builtin.thingengine.builtin.get_gps() filter !(location == $location.home)) && description =~ "foo" => notify;
}`],

    [`executor = USERNAME_0 : now => @com.twitter.post_picture`,
     `USERNAME_0 can post pictures on twitter`, { USERNAME_0: 'mom' },
     `#[executor="mom"^^tt:username]
@com.twitter.post_picture();`],

    [`now => @org.thingpedia.weather.sunrise param:date:Date = DATE_0 => notify`,
     `get sunrise sunset on date DATE_0`, { DATE_0: { year: 2018, month: 5, day: 23, hour: -1, minute: -1, second: -1 } },
     `@org.thingpedia.weather.sunrise(date=new Date("2018-05-23T07:00:00.000Z"));`],

    [`now => @org.thingpedia.weather.sunrise param:date:Date = new Date ( " 2018-05-23T07:00:00.000Z " ) => notify`,
     `get sunrise sunset on date 2018-05-23T07:00:00.000Z`, { },
     `@org.thingpedia.weather.sunrise(date=new Date("2018-05-23T07:00:00.000Z"));`],

    [`now => @org.thingpedia.weather.sunrise param:date:Date = DATE_0 => notify`,
     `get sunrise sunset on date DATE_0`, { DATE_0: { year: 2018, month: 5, day: 23, hour: 10, minute: 40, second: 0 } },
     `@org.thingpedia.weather.sunrise(date=new Date("2018-05-23T17:40:00.000Z"));`],

    [`now => @org.thingpedia.weather.sunrise param:date:Date = DATE_0 => notify`,
     `get sunrise sunset on date DATE_0`, { DATE_0: { year: 2018, month: 5, day: 23, hour: 10, minute: 40, second: -1 } },
     `@org.thingpedia.weather.sunrise(date=new Date("2018-05-23T17:40:00.000Z"));`],

    [`now => @org.thingpedia.weather.sunrise param:date:Date = DATE_0 => notify`,
     `get sunrise sunset on date DATE_0`, { DATE_0: { year: 2018, month: 5, day: 23, hour: 10, minute: 40, second: 40.5 } },
     `@org.thingpedia.weather.sunrise(date=new Date("2018-05-23T17:40:40.500Z"));`],

    ['now => ( @com.bing.web_search ) join ( @com.yandex.translate.translate param:target_language:Entity(tt:iso_lang_code) = GENERIC_ENTITY_tt:iso_lang_code_0 ) on param:text:String = event => notify',
    `translate web searches to GENERIC_ENTITY_tt:iso_lang_code_0`, { 'GENERIC_ENTITY_tt:iso_lang_code_0': { value: 'it', display: "Italian" } },
    `@com.bing.web_search() => @com.yandex.translate.translate(target_language="it"^^tt:iso_lang_code("Italian"), text=$result);`],

    ['now => ( @com.bing.web_search ) join ( @com.yandex.translate.translate param:target_language:Entity(tt:iso_lang_code) = " italian " ^^tt:iso_lang_code ) on param:text:String = event => notify',
    `translate web searches to italian`, {},
    `@com.bing.web_search() => @com.yandex.translate.translate(target_language=null^^tt:iso_lang_code("italian"), text=$result);`],

    ['now => @com.bing.web_search param:query:String = " pizza " => notify',
    `search pizza on bing`, {},
    `@com.bing.web_search(query="pizza");`],

    ['now => @com.bing.web_search param:query:String = " donald trump " => notify',
    `search donald trump on bing`, {},
    `@com.bing.web_search(query="donald trump");`],

    ['now => ( @com.twitter.search ) filter param:hashtags:Array(Entity(tt:hashtag)) contains " foo " ^^tt:hashtag => notify',
    `search hashtag foo on twitter`, {},
    `@com.twitter.search() filter contains(hashtags, "foo"^^tt:hashtag);`],

    ['executor = " bob " ^^tt:username : now => @com.twitter.post',
    `ask bob to post on twitter`, {},
    `#[executor="bob"^^tt:username]
@com.twitter.post();`],

    ['now => @com.twitter.follow param:user_name:Entity(tt:username) = " bob " ^^tt:username',
    `follow bob on twitter`, {},
    `@com.twitter.follow(user_name="bob"^^tt:username);`],

    ['policy true : now => @org.thingpedia.builtin.thingengine.builtin.discover filter @org.thingpedia.builtin.test.get_data { param:data:String == QUOTED_STRING_0 }',
    'everybody has permission to discover new devices if the data of more data genning ... is exactly QUOTED_STRING_0', { QUOTED_STRING_0: 'foo' },
    `$policy {
  true : now => @org.thingpedia.builtin.thingengine.builtin.discover filter any(@org.thingpedia.builtin.test.get_data() filter data == "foo");
}`],

    [`now => @com.xkcd.get_comic param:number:Number = SLOT_0 => notify`,
     '', { 'SLOT_0': new Ast.Value.Number(1234) },
     `@com.xkcd.get_comic(number=1234);`],

    [`now => @com.xkcd.get_comic param:number:Number = SLOT_0 => notify`,
     '', { 'SLOT_0': undefined },
     `@com.xkcd.get_comic(number=$?);`],

    [`now => @com.xkcd.get_comic param:number:Number = undefined => notify`,
     'get some specific xkcd comic', {},
    `@com.xkcd.get_comic(number=$?);`],

    [`now => ( @com.twitter.search ) filter param:author:Entity(tt:username) == undefined => notify`,
     'search tweets by author', {},
    `@com.twitter.search() filter author == $?;`],

    ['now => sort param:sender_name:String asc of ( @com.gmail.inbox ) => notify',
    'show my emails sorted by sender name', {},
    `sort(sender_name asc of @com.gmail.inbox());`],

    ['now => sort param:sender_name:String desc of ( @com.gmail.inbox ) => notify',
    'show my emails sorted by sender name -lrb- in reverse order -rrb-', {},
    `sort(sender_name desc of @com.gmail.inbox());`],

    ['now => ( @com.gmail.inbox ) [ 1 ] => notify',
    'show me exactly one email', {},
    `@com.gmail.inbox()[1];`],

    ['now => ( @com.gmail.inbox ) [ 1 : 3 ] => notify',
    'show me exactly 3 emails', {},
    `@com.gmail.inbox()[1 : 3];`],

    ['now => ( @com.gmail.inbox ) [ 1 : NUMBER_0 ] => notify',
    'show me exactly NUMBER_0 emails', { NUMBER_0: 22 },
    `@com.gmail.inbox()[1 : 22];`],

    ['now => ( @com.gmail.inbox ) [ 3 : NUMBER_0 ] => notify',
    'show me exactly NUMBER_0 emails , starting from the third', { NUMBER_0: 22 },
    `@com.gmail.inbox()[3 : 22];`],

    ['now => ( @com.gmail.inbox ) [ NUMBER_1 : NUMBER_0 ] => notify',
    'show me exactly NUMBER_0 emails , starting from the NUMBER_1', { NUMBER_1: 13, NUMBER_0: 22 },
    `@com.gmail.inbox()[13 : 22];`],

    ['now => ( @com.gmail.inbox ) [ 3 , 7 , NUMBER_0 ] => notify',
    'show me exactly the emails number 3 , 7 and NUMBER_0', { NUMBER_0: 22 },
    `@com.gmail.inbox()[3, 7, 22];`],

    ['bookkeeping special special:yes',
    'yes', {},
    '$yes;'],

    ['bookkeeping special special:no',
    'no', {},
    '$no;'],

    ['bookkeeping choice 0',
    'the first choice', {},
    `$choice(0);`],

    ['bookkeeping choice 1',
    'the second choice', {},
    `$choice(1);`],

    ['bookkeeping choice 2',
    'the third choice', {},
    `$choice(2);`],

    ['bookkeeping answer NUMBER_0',
    'NUMBER_0', { NUMBER_0: 42 },
    `$answer(42);`],

    ['bookkeeping answer LOCATION_0',
    'LOCATION_0', { LOCATION_0: { latitude: 0, longitude: 0, display: "North Pole" } },
    `$answer(new Location(0, 0, "North Pole"));`],

    ['bookkeeping answer 0',
    'zero', {},
    `$answer(0);`],

    ['now => @org.thingpedia.weather.current param:location:Location = location: " stanford california " => notify',
    'get weather for stanford california', {},
    `@org.thingpedia.weather.current(location=new Location("stanford california"));`],

    ['attimer time = TIME_0 => @org.thingpedia.builtin.thingengine.builtin.say param:message:String = QUOTED_STRING_0',
    `say "it's 9am" every day at 9am`,
    { TIME_0: { hour: 9, minute: 0 }, QUOTED_STRING_0: "it's 9am" },
    `attimer(time=[new Time(9, 0)]) => @org.thingpedia.builtin.thingengine.builtin.say(message="it's 9am");`],

    ['attimer time = [ TIME_0 , TIME_1 ] => @org.thingpedia.builtin.thingengine.builtin.say param:message:String = QUOTED_STRING_0',
    `say "it's 9am or 3pm" every day at 9am and 3pm`,
    { TIME_0: { hour: 9, minute: 0 }, TIME_1: { hour: 15, minute: 0 }, QUOTED_STRING_0: "it's 9am or 3pm" },
    `attimer(time=[new Time(9, 0), new Time(15, 0)]) => @org.thingpedia.builtin.thingengine.builtin.say(message="it's 9am or 3pm");`],

    [`attimer time = time:morning => @org.thingpedia.builtin.thingengine.builtin.say param:message:String = QUOTED_STRING_0`,
    `say "it's the morning" every day in the morning`,
    { QUOTED_STRING_0: "it's the morning" },
    `attimer(time=[$time.morning]) => @org.thingpedia.builtin.thingengine.builtin.say(message="it's the morning");`],

    [`attimer time = time:evening => @org.thingpedia.builtin.thingengine.builtin.say param:message:String = QUOTED_STRING_0`,
    `say "it's the evening" every day in the evening`,
    { QUOTED_STRING_0: "it's the evening" },
    `attimer(time=[$time.evening]) => @org.thingpedia.builtin.thingengine.builtin.say(message="it's the evening");`],

    // To test LITERAL_TIME but might want to drop this functionality
    // Left sentence blank because "at noon" should map to TIME_0 instead
    [`attimer time = time:12:0:0 => @org.thingpedia.builtin.thingengine.builtin.say param:message:String = QUOTED_STRING_0`,
    '',
    { QUOTED_STRING_0: "it's noon" },
    `attimer(time=[new Time(12, 0)]) => @org.thingpedia.builtin.thingengine.builtin.say(message="it's noon");`],

    ['now => [ param:description:String , param:title:String ] of ( @com.bing.web_search ) => notify',
    'get title and description from bing', {},
    '[description, title] of @com.bing.web_search();'],

    [`now => @com.spotify.get_currently_playing => @com.spotify.add_songs_to_playlist param:songs:Array(String) = [ param:song:String ]`,
    `add the currently playing song to my playlist`, {},
    `@com.spotify.get_currently_playing() => @com.spotify.add_songs_to_playlist(songs=[song]);`],

    [`[ param:author:Entity(tt:username) , param:text:String ] of ( monitor ( @com.twitter.home_timeline ) on new param:text:String ) => notify`,
    `monitor new text of tweets and show me the text and author`, {},
    `[author, text] of monitor(text of @com.twitter.home_timeline());`],

    ['now => @com.twitter.post param:status:String = context:selection:String',
    'post this on twitter', {},
    `@com.twitter.post(status=$context.selection : String);`],

    [`now => ( @com.twitter.home_timeline ) filter count ( param:hashtags:Array(Entity(tt:hashtag)) ) >= 0 => notify`,
    `get tweets with hashtags`, {},
    `@com.twitter.home_timeline() filter count(hashtags) >= 0;`],

    // just to test syntax, in reality we should not generate examples like this
    [`now => ( @com.twitter.home_timeline ) filter count ( param:hashtags:Array(Entity(tt:hashtag)) filter { param:value:Entity(tt:hashtag) == " foo " ^^tt:hashtag } ) >= 0 => notify`,
    `get tweets with hashtags foo`, {},
    `@com.twitter.home_timeline() filter count(hashtags filter value == "foo"^^tt:hashtag) >= 0;`],

    [`now => @light-bulb.set_power attribute:name:String = " bedroom " param:power:Enum(on,off) = enum:off`,
    `turn off my bedroom lights`, {},
    `@light-bulb(name="bedroom").set_power(power=enum off);`],

    [`$dialogue @org.thingpedia.dialogue.transaction.greet ;`,
     `hello`, {},
     `$dialogue @org.thingpedia.dialogue.transaction.greet;`],

    [`$dialogue @org.thingpedia.dialogue.transaction.execute ; ` +
     `now => @com.thecatapi.get => notify ;`,
    `get a cat picture`, {},
    `$dialogue @org.thingpedia.dialogue.transaction.execute;
@com.thecatapi.get();`],

    [`$dialogue @org.thingpedia.dialogue.transaction.execute ; ` +
     `now => @com.thecatapi.get => notify ` +
     `#[ results = [ { param:image_id = GENERIC_ENTITY_com.thecatapi:image_id_0 , param:picture_url = PICTURE_0 , param:link = URL_0 } ] ] ;`,
    `here is your cat picture`, { 'GENERIC_ENTITY_com.thecatapi:image_id_0': { value: '1234', display: null }, PICTURE_0: 'https://example.com/1', URL_0: 'https://example.com/2' },
    `$dialogue @org.thingpedia.dialogue.transaction.execute;
@com.thecatapi.get()
#[results=[
  { image_id="1234"^^com.thecatapi:image_id, picture_url="https://example.com/1"^^tt:picture, link="https://example.com/2"^^tt:url }
]];`],

    [`$dialogue @org.thingpedia.dialogue.transaction.execute ; ` +
     `now => @com.thecatapi.get => notify ` +
     `#[ results = [ { param:image_id = GENERIC_ENTITY_com.thecatapi:image_id_0 , param:picture_url = PICTURE_0 , param:link = URL_1 } ] ] ; ` +
     `now => @com.twitter.post_picture param:picture_url:Entity(tt:picture) = PICTURE_0 ;`,
    `now post it on twitter`, { 'GENERIC_ENTITY_com.thecatapi:image_id_0': { value: '1234', display: null }, PICTURE_0: 'https://example.com/1', URL_1: 'https://example.com/2' },
    `$dialogue @org.thingpedia.dialogue.transaction.execute;
@com.thecatapi.get()
#[results=[
  { image_id="1234"^^com.thecatapi:image_id, picture_url="https://example.com/1"^^tt:picture, link="https://example.com/2"^^tt:url }
]];
@com.twitter.post_picture(picture_url="https://example.com/1"^^tt:picture);`],

    [`$dialogue @org.thingpedia.dialogue.transaction.execute ; ` +
     `now => @com.thecatapi.get => notify ` +
     `#[ results = [ { param:image_id = GENERIC_ENTITY_com.thecatapi:image_id_0 , param:picture_url = PICTURE_0 , param:link = URL_1 } ] ] ; ` +
     `now => @com.twitter.post_picture param:picture_url:Entity(tt:picture) = PICTURE_0 ` +
     `#[ confirm = enum:confirmed ] ;`,
    `confirm posting it on twitter`, { 'GENERIC_ENTITY_com.thecatapi:image_id_0': { value: '1234', display: null }, PICTURE_0: 'https://example.com/1', URL_1: 'https://example.com/2' },
    `$dialogue @org.thingpedia.dialogue.transaction.execute;
@com.thecatapi.get()
#[results=[
  { image_id="1234"^^com.thecatapi:image_id, picture_url="https://example.com/1"^^tt:picture, link="https://example.com/2"^^tt:url }
]];
@com.twitter.post_picture(picture_url="https://example.com/1"^^tt:picture)
#[confirm=enum confirmed];`],

    [`$dialogue @org.thingpedia.dialogue.transaction.execute ; ` +
     `now => @com.thecatapi.get => notify ` +
     `#[ results = [ { param:image_id = GENERIC_ENTITY_com.thecatapi:image_id_0 , param:picture_url = PICTURE_0 , param:link = URL_0 } ] ] ; ` +
     `now => @com.twitter.post_picture param:picture_url:Entity(tt:picture) = PICTURE_0 ` +
     `#[ results = [ { param:tweet_id = GENERIC_ENTITY_com.twitter:tweet_id_0 , param:link = URL_1 } ] ] ;`,
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

    [`$dialogue @org.thingpedia.dialogue.transaction.execute ; ` +
     `now => @com.thecatapi.get => notify ` +
     `#[ results = [ { param:image_id = GENERIC_ENTITY_com.thecatapi:image_id_0 , param:picture_url = PICTURE_0 , param:link = URL_0 } ] ] ; ` +
     `now => @com.twitter.post_picture param:picture_url:Entity(tt:picture) = PICTURE_0 ` +
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

    [`$dialogue @org.thingpedia.dialogue.transaction.execute ; ` +
     `now => @com.thecatapi.get => notify ` +
     `#[ results = [ { param:image_id = GENERIC_ENTITY_com.thecatapi:image_id_0 , param:picture_url = PICTURE_0 , param:link = URL_0 } ] ] ; ` +
     `now => @com.twitter.post_picture param:picture_url:Entity(tt:picture) = PICTURE_0 ` +
     `#[ results = [ ] ] #[ error = enum:my_error_code ] ;`,
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

    [`$dialogue @org.thingpedia.dialogue.transaction.execute ; ` +
     `now => @com.thecatapi.get => notify ` +
     `#[ results = [ { param:image_id = GENERIC_ENTITY_com.thecatapi:image_id_0 , param:picture_url = PICTURE_0 , param:link = URL_0 } ] ] ` +
     `#[ count = NUMBER_0 ] ;`,
    `i found NUMBER_0 cat pictures , here is one`, { 'GENERIC_ENTITY_com.thecatapi:image_id_0': { value: '1234', display: null }, PICTURE_0: 'https://example.com/1', URL_0: 'https://example.com/2', NUMBER_0: 55 },
    `$dialogue @org.thingpedia.dialogue.transaction.execute;
@com.thecatapi.get()
#[results=[
  { image_id="1234"^^com.thecatapi:image_id, picture_url="https://example.com/1"^^tt:picture, link="https://example.com/2"^^tt:url }
]]
#[count=55];`],

    [`$dialogue @org.thingpedia.dialogue.transaction.execute ; ` +
     `now => @com.thecatapi.get => notify ` +
     `#[ results = [ { param:image_id = GENERIC_ENTITY_com.thecatapi:image_id_0 , param:picture_url = PICTURE_0 , param:link = URL_0 } ] ] ` +
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

    [`$dialogue @org.thingpedia.dialogue.transaction.sys_search_question param:serveCuisine ; ` +
     `now => @org.schema.restaurant => notify ;`,
     'what kind of cuisine are you looking for ?', {},
     `$dialogue @org.thingpedia.dialogue.transaction.sys_search_question(serveCuisine);
@org.schema.restaurant();`],

    [`$dialogue @org.thingpedia.dialogue.transaction.sys_search_question param:price , param:serveCuisine ; ` +
     `now => @org.schema.restaurant => notify ;`,
     'what kind of cuisine and price are you looking for ?', {},
     `$dialogue @org.thingpedia.dialogue.transaction.sys_search_question(price, serveCuisine);
@org.schema.restaurant();`],

    [`bookkeeping answer @com.google.contacts.get_contacts`,
    `google contacts`, {},
    `$answer("com.google.contacts:get_contacts"^^tt:function);`],

    [`now => ( @com.yelp.restaurant ) filter true param:cuisines:Array(Entity(com.yelp:restaurant_cuisine)) => notify`,
    `i 'm looking for a restaurant , i do n't care what cuisine`, {},
    `@com.yelp.restaurant() filter true(cuisines);`],

    ['now => ( @org.schema.full.Recipe ) filter param:nutrition.fatContent:Measure(kg) >= MEASURE_kg_0 and param:nutrition.sugarContent:Measure(kg) >= MEASURE_kg_0 => notify',
     `yeah please find a recipe with that fat content and that sugar content`, { MEASURE_kg_0: { value: 13, unit: 'kg' } },
     `@org.schema.full.Recipe() filter nutrition.fatContent >= 13kg && nutrition.sugarContent >= 13kg;`],

    ['now => ( @com.uber.price_estimate ) filter param:low_estimate:Currency <= NUMBER_0 unit:$usd => notify',
     'is it less than $ NUMBER_0 ?', { NUMBER_0: 1000 },
     '@com.uber.price_estimate() filter low_estimate <= 1000$usd;'],

    ['now => @com.twitter.post attribute:id:Entity(tt:device_id) = GENERIC_ENTITY_tt:device_id_0 param:status:String = QUOTED_STRING_0',
     'post QUOTED_STRING_0 on it', { 'GENERIC_ENTITY_tt:device_id_0': { value: 'twitter-account-foo', display: "Twitter Account foo" },
                                     QUOTED_STRING_0: 'hello' },
     `@com.twitter(id="twitter-account-foo"^^tt:device_id("Twitter Account foo")).post(status="hello");`],

    ['now => @com.twitter.post attribute:id:Entity(tt:device_id) = GENERIC_ENTITY_tt:device_id_0 param:status:String = QUOTED_STRING_0',
     'post QUOTED_STRING_0 on it', { 'GENERIC_ENTITY_tt:device_id_0': { value: 'twitter-account-foo' },
                                     QUOTED_STRING_0: 'hello' },
     `@com.twitter(id="twitter-account-foo"^^tt:device_id).post(status="hello");`],

    [`now => @org.thingpedia.weather.sunrise param:date:Date = new Date ( , , NUMBER_0 , ) => notify`,
     `get sunrise sunset on the NUMBER_0 th`, { NUMBER_0: 25 },
     `@org.thingpedia.weather.sunrise(date=new Date(, , 25));`],

    [`now => @org.thingpedia.weather.sunrise param:date:Date = new Date ( , , 10 , TIME_0 ) => notify`,
     `get sunrise sunset on the 10 th at TIME_0`, { TIME_0: { hour: 5, minute: 0 } },
     `@org.thingpedia.weather.sunrise(date=new Date(, , 10, new Time(5, 0)));`],

    [`now => @org.thingpedia.weather.sunrise param:date:Date = new Date ( NUMBER_0 , 3 , 1 ) => notify`,
     `get sunrise sunset on March, NUMBER_0`, { NUMBER_0: 2020 },
     `@org.thingpedia.weather.sunrise(date=new Date("2020-03-01T08:00:00.000Z"));`],

    [`now => @org.thingpedia.weather.sunrise param:date:Date = new Date ( 10 , 1 , 1 ) => notify`,
     `get sunrise sunset in the 10s`, {},
     `@org.thingpedia.weather.sunrise(date=new Date("2010-01-01T08:00:00.000Z"));`],

    [`now => @org.thingpedia.weather.sunrise param:date:Date = new Date ( enum:monday ) => notify`,
     `get sunrise sunset on Monday`, {},
     `@org.thingpedia.weather.sunrise(date=new Date(enum monday));`],

    [`now => @org.thingpedia.weather.sunrise param:date:Date = new Date ( enum:monday , TIME_0 ) => notify`,
     `get sunrise sunset on Monday`, { TIME_0: { hour: 5, minute: 0 } },
     `@org.thingpedia.weather.sunrise(date=new Date(enum monday, new Time(5, 0)));`],

    [`now => ( @com.yelp.restaurant ) filter param:openingHours:RecurrentTimeSpecification == new RecurrentTimeSpecification ( { beginTime = time:0:0:0 , endTime = time:24:0:0 ,`
    + ` dayOfWeek = enum:friday } , { beginTime = time:0:0:0 , endTime = time:24:0:0 , dayOfWeek = enum:saturday } ) => notify`,
    `restaurants open 24 hours on friday and saturday`, {},
    `@com.yelp.restaurant() filter openingHours == new RecurrentTimeSpecification({ beginTime=new Time(0, 0), endTime=new Time(24, 0), dayOfWeek=enum friday }, { beginTime=new Time(0, 0), endTime=new Time(24, 0), dayOfWeek=enum saturday });`],

    ['let param:foo = ( @org.thingpedia.weather.sunrise param:date:Date = new Date ( enum:monday ) )',
     'let foo be the weather on monday', {},
     'let foo = @org.thingpedia.weather.sunrise(date=new Date(enum monday));'],
];

function stripTypeAnnotations(program) {
    return program.split(' ').map((token) => {
        if (token.startsWith('param:'))
            return 'param:' + token.split(':')[1];
        else if (token.startsWith('attribute:'))
            return 'attribute:' + token.split(':')[1];
        else
            return token;
    }).join(' ');
}

async function testCase(test, i) {
    if (test.length !== 4)
        throw new Error('invalid test ' + test[0]);
    let [sequence, sentence, entities, expected] = test;

    console.log('Test Case #' + (i+1));
    try {
        sequence = sequence.split(' ');
        let program = Grammar.parse(sequence, Grammar.SyntaxType.LegacyNN, entities, {
            timezone: 'America/Los_Angeles'
        });
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
        let reconstructed = Grammar.serialize(program, Grammar.SyntaxType.LegacyNN, entityRetriever).join(' ');
        if (reconstructed !== test[0]) {
            console.error('Test Case #' + (i+1) + ' failed (wrong NN syntax)');
            console.error('Expected:', test[0]);
            console.error('Generated:', reconstructed);
            if (process.env.TEST_MODE)
                throw new Error(`testNNSyntax ${i+1} FAILED`);
        }

        entityRetriever = new Grammar.EntityRetriever(sentence, entities, {
            timezone: 'America/Los_Angeles'
        });
        let withoutTypeAnnotations = Grammar.serialize(program, Grammar.SyntaxType.LegacyNN, entityRetriever, { typeAnnotations: false }).join(' ');
        if (withoutTypeAnnotations !== stripTypeAnnotations(test[0])) {
            console.error('Test Case #' + (i+1) + ' failed (wrong NN syntax without type annotations)');
            console.error('Expected:', stripTypeAnnotations(test[0]));
            console.error('Generated:', withoutTypeAnnotations);
            if (process.env.TEST_MODE)
                throw new Error(`testNNSyntax ${i+1} FAILED`);
        }

        /*let parser = new NNOutputParser();
        let reduces = parser.getReduceSequence({
            [Symbol.iterator]() {
                return new SimpleSequenceLexer(sequence);

            }
        });
        console.log('Reduces:', reduces);*/
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
