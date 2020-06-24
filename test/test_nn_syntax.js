// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingTalk
//
// Copyright 2017 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const Ast = require('../lib/ast');
const NNSyntax = require('../lib/nn-syntax');
//const NNOutputParser = require('../lib/nn_output_parser');
const SchemaRetriever = require('../lib/schema');

const _mockSchemaDelegate = require('./mock_schema_delegate');
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
     `monitor (@com.xkcd.get_comic()) => notify;`
    ],

    [`now => @com.twitter.post param:status:String = QUOTED_STRING_0`,
     `tweet QUOTED_STRING_0`, {'QUOTED_STRING_0': 'hello'},
     `now => @com.twitter.post(status="hello");`
    ],

    [`now => @com.twitter.post param:status:String = ""`,
     `post on twitter`, {},
     `now => @com.twitter.post(status="");`
    ],

    [`now => @com.xkcd.get_comic param:number:Number = NUMBER_0 => notify`,
     `get xkcd NUMBER_0`, {'NUMBER_0': 1234},
     `now => @com.xkcd.get_comic(number=1234) => notify;`],

    [`now => @com.xkcd.get_comic param:number:Number = NUMBER_0 => @com.twitter.post on param:status:String = param:title:String`,
     `get xkcd NUMBER_0`, {'NUMBER_0': 1234},
     `now => @com.xkcd.get_comic(number=1234) => @com.twitter.post(status=title);`],

    [`now => ( @org.thingpedia.builtin.thingengine.builtin.get_random_between param:high:Number = NUMBER_1 param:low:Number = NUMBER_0 ) join ( @com.xkcd.get_comic ) on param:number:Number = param:random:Number => notify`,
    `get xkcd whose number is a random number between NUMBER_0 and NUMBER_1`, {'NUMBER_0': 55, 'NUMBER_1': 1024},
    `now => (@org.thingpedia.builtin.thingengine.builtin.get_random_between(high=1024, low=55) join @com.xkcd.get_comic() on (number=random)) => notify;`],

    [`( ( timer base = now , interval = 1 unit:h ) => ( @org.thingpedia.builtin.thingengine.builtin.get_random_between param:high:Number = NUMBER_1 param:low:Number = NUMBER_0 ) ) => ( @com.xkcd.get_comic ) on param:number:Number = param:random:Number => notify`,
    `every hour get xkcd whose number is a random number between NUMBER_0 and NUMBER_1`, {'NUMBER_0': 55, 'NUMBER_1': 1024},
    `((timer(base=new Date(), interval=1h) => @org.thingpedia.builtin.thingengine.builtin.get_random_between(high=1024, low=55)) => @com.xkcd.get_comic() on (number=random)) => notify;`],

    [`( timer base = now , interval = 1 unit:h ) => ( ( @org.thingpedia.builtin.thingengine.builtin.get_random_between param:high:Number = NUMBER_1 param:low:Number = NUMBER_0 ) join ( @com.xkcd.get_comic ) on param:number:Number = param:random:Number ) => notify`,
        `every hour get xkcd whose number is a random number between NUMBER_0 and NUMBER_1`, {'NUMBER_0': 55, 'NUMBER_1': 1024},
        `(timer(base=new Date(), interval=1h) => (@org.thingpedia.builtin.thingengine.builtin.get_random_between(high=1024, low=55) join @com.xkcd.get_comic() on (number=random))) => notify;`],

    [`( ( timer base = now , interval = 1 unit:h , frequency = 3 ) => ( @org.thingpedia.builtin.thingengine.builtin.get_random_between param:high:Number = NUMBER_1 param:low:Number = NUMBER_0 ) ) => ( @com.xkcd.get_comic ) on param:number:Number = param:random:Number => notify`,
    `3 times every hour get xkcd whose number is a random number between NUMBER_0 and NUMBER_1`, {'NUMBER_0': 55, 'NUMBER_1': 1024 },
    `((timer(base=new Date(), interval=1h, frequency=3) => @org.thingpedia.builtin.thingengine.builtin.get_random_between(high=1024, low=55)) => @com.xkcd.get_comic() on (number=random)) => notify;`],

    [`now => @org.thingpedia.builtin.thingengine.builtin.get_random_between param:high:Number = NUMBER_1 param:low:Number = NUMBER_0 => notify`,
    `get a random number between NUMBER_0 and NUMBER_1`,{'NUMBER_0': 55, 'NUMBER_1': 1024},
    `now => @org.thingpedia.builtin.thingengine.builtin.get_random_between(high=1024, low=55) => notify;`],

    [`now => @org.thingpedia.builtin.thingengine.builtin.get_random_between param:high:Number = NUMBER_0 param:low:Number = NUMBER_1 => notify`,
    `get xkcd whose number is a random number max is NUMBER_0 min is NUMBER_1`, {'NUMBER_0': 1024, 'NUMBER_1': 55},
    `now => @org.thingpedia.builtin.thingengine.builtin.get_random_between(high=1024, low=55) => notify;`],

    [`monitor ( @thermostat.get_temperature ) => notify`,
    `monitor thermostat`, {},
    `monitor (@thermostat.get_temperature()) => notify;`],

    [`monitor ( ( @thermostat.get_temperature ) filter param:value:Measure(C) >= NUMBER_0 unit:F ) => notify`,
    `notify me if the temperature is above NUMBER_0 degrees`, {'NUMBER_0': 70},
    `monitor ((@thermostat.get_temperature()), value >= 70F) => notify;`],

    [`now => ( @com.bing.image_search ) filter param:width:Number >= NUMBER_0 or param:height:Number >= NUMBER_1 => notify`,
    `search images wider than NUMBER_0 pixels or taller than NUMBER_1 pixels`, {NUMBER_0: 100, NUMBER_1:200},
    `now => (@com.bing.image_search()), (width >= 100 || height >= 200) => notify;`],

    [`now => ( @com.bing.image_search ) filter param:width:Number <= NUMBER_2 and param:width:Number >= NUMBER_0 or param:height:Number >= NUMBER_1 => notify`,
    `search images wider than NUMBER_0 pixels or taller than NUMBER_1 pixels and narrower than NUMBER_2 pixels`, {NUMBER_0: 100, NUMBER_1:200, NUMBER_2: 500},
    `now => (@com.bing.image_search()), (width <= 500 && (width >= 100 || height >= 200)) => notify;`],

    [`now => ( @com.bing.image_search ) filter param:width:Number >= NUMBER_0 or param:height:Number >= NUMBER_0 => notify`,
    `search images larger than NUMBER_0 pixels in either dimension`, {NUMBER_0: 100},
    `now => (@com.bing.image_search()), (width >= 100 || height >= 100) => notify;`],

    [`now => ( @com.bing.image_search ) filter param:width:Number >= NUMBER_0 => notify`,
    `search images wider than NUMBER_0 pixels`, {NUMBER_0: 100 },
    `now => (@com.bing.image_search()), width >= 100 => notify;`],

    ['monitor ( @com.xkcd.get_comic ) on new param:title:String => notify',
    `monitor xkcd if the title changes`, {},
    `monitor (@com.xkcd.get_comic()) on new [title] => notify;`],

    ['monitor ( @com.xkcd.get_comic ) on new [ param:alt_text:String , param:title:String ] => notify',
    `monitor xkcd if the title or alt text changes`, {},
    `monitor (@com.xkcd.get_comic()) on new [alt_text, title] => notify;`],

    ['monitor ( ( @com.instagram.get_pictures param:count:Number = NUMBER_0 ) filter param:caption:String in_array [ QUOTED_STRING_0 , QUOTED_STRING_1 ] ) => notify',
    `monitor my last NUMBER_0 instagram pics if the caption is either QUOTED_STRING_0 or QUOTED_STRING_1`, {NUMBER_0: 100, QUOTED_STRING_0: 'abc', QUOTED_STRING_1: 'def'},
    `monitor ((@com.instagram.get_pictures(count=100)), in_array(caption, ["abc", "def"])) => notify;`],

    ['timer base = now , interval = DURATION_0 => notify',
    `alert me every DURATION_0`, {DURATION_0: { value: 30, unit: 'min'}},
    `timer(base=new Date(), interval=30min) => notify;`],

    ['monitor ( ( @com.phdcomics.get_post ) filter not param:title:String =~ QUOTED_STRING_0 ) => notify',
    `monitor phd comics post that do n't have QUOTED_STRING_0 in the title`, {QUOTED_STRING_0: 'abc'}, //'
    `monitor ((@com.phdcomics.get_post()), !(title =~ "abc")) => notify;`],

    ['now => ( @com.uber.price_estimate param:end:Location = location:home param:start:Location = location:work ) filter param:low_estimate:Currency >= CURRENCY_0 => notify',
    `get an uber price estimate from home to work if the low estimate is greater than CURRENCY_0`, {CURRENCY_0: { value: 50, unit: 'usd' } },
    `now => (@com.uber.price_estimate(end=$context.location.home, start=$context.location.work)), low_estimate >= new Currency(50, usd) => notify;`],

    ['now => ( @com.uber.price_estimate ) filter param:uber_type:Enum(pool,uber_x,uber_xl,uber_black,select,suv,assist) == enum:uber_x => notify',
    `get a price estimate for uber x`, {},
    `now => (@com.uber.price_estimate()), uber_type == enum(uber_x) => notify;`],

    ['now => @org.thingpedia.builtin.thingengine.builtin.configure param:device:Entity(tt:device) = device:com.google',
    `configure google`, {},
    `now => @org.thingpedia.builtin.thingengine.builtin.configure(device="com.google"^^tt:device);`],

    ['now => ( @com.nytimes.get_front_page ) filter param:updated:Date >= now - DURATION_0 => notify',
     `get new york times articles published in the last DURATION_0`, { DURATION_0: { value: 15, unit: 'min' } },
     `now => (@com.nytimes.get_front_page()), updated >= new Date() - 15min => notify;`],

    [`executor = USERNAME_0 : now => @com.twitter.post`,
     `ask USERNAME_0 to post on twitter`, { USERNAME_0: 'bob' },
     `executor = "bob"^^tt:username : {
  now => @com.twitter.post();
}`],

    [`executor = USERNAME_0 : now => @com.xkcd.get_comic => notify`,
     `ask USERNAME_0 to get xkcd`, { USERNAME_0: 'bob' },
     `executor = "bob"^^tt:username : {
  now => @com.xkcd.get_comic() => notify;
}`],

    [`executor = USERNAME_0 : now => @com.xkcd.get_comic => return`,
     `ask USERNAME_0 to get xkcd`, { USERNAME_0: 'bob' },
     `executor = "bob"^^tt:username : {
  now => @com.xkcd.get_comic() => return;
}`],

    [`now => ( @security-camera.current_event ) filter @org.thingpedia.builtin.thingengine.builtin.get_gps { not param:location:Location == location:home } => notify`,
     `show me my security camera if i 'm not home`, {}, //'
     `now => (@security-camera.current_event()), @org.thingpedia.builtin.thingengine.builtin.get_gps() { !(location == $context.location.home) } => notify;`],

    [`policy true : now => @com.twitter.post`,
    `anyone can post on twitter`, {},
    `true : now => @com.twitter.post;`],

    [`policy true : now => @com.twitter.post filter param:status:String =~ QUOTED_STRING_0`,
    `anyone can post on twitter if they put QUOTED_STRING_0 in the status`, { QUOTED_STRING_0: 'foo' },
    `true : now => @com.twitter.post, status =~ "foo";`],

    [`policy param:source:Entity(tt:contact) == USERNAME_0 : now => @com.twitter.post`,
    `USERNAME_0 can post on twitter`, { USERNAME_0: 'bob' },
    `source == "bob"^^tt:username : now => @com.twitter.post;`],

    [`policy param:source:Entity(tt:contact) == USERNAME_0 : now => @com.twitter.post filter param:status:String =~ QUOTED_STRING_0`,
    `USERNAME_0 can post on twitter if he puts QUOTED_STRING_0 in the status`, { USERNAME_0: 'bob', QUOTED_STRING_0: 'foo' },
    `source == "bob"^^tt:username : now => @com.twitter.post, status =~ "foo";`],

    [`policy true : @com.bing.web_search => notify`,
    `anyone can search on bing`, {},
    `true : @com.bing.web_search => notify;`],

    [`policy true : @com.bing.web_search filter param:query:String =~ QUOTED_STRING_0 => notify`,
    `anyone can search on bing if the query contains QUOTED_STRING_0`,{ QUOTED_STRING_0: 'foo' },
    `true : @com.bing.web_search, query =~ "foo" => notify;`],

    [`policy true : @com.bing.web_search filter param:description:String =~ QUOTED_STRING_0 => notify`,
    `anyone can search on bing if the description contains QUOTED_STRING_0`, { QUOTED_STRING_0: 'foo' },
    `true : @com.bing.web_search, description =~ "foo" => notify;`],

    [`policy true : @com.bing.web_search filter param:description:String =~ QUOTED_STRING_0 => @com.twitter.post filter param:status:String =~ QUOTED_STRING_0`,
    `anyone can search on bing if the description contains QUOTED_STRING_0 and then post on twitter if the status contains the same thing`, { QUOTED_STRING_0: 'foo' },
    `true : @com.bing.web_search, description =~ "foo" => @com.twitter.post, status =~ "foo";`],

    [`policy true : @com.bing.web_search filter @org.thingpedia.builtin.thingengine.builtin.get_gps { not param:location:Location == location:home } and param:description:String =~ QUOTED_STRING_0 => notify`,
    `anyone can search on bing if i am not at home and the description contains QUOTED_STRING_0`, { QUOTED_STRING_0: 'foo' },
    `true : @com.bing.web_search, (@org.thingpedia.builtin.thingengine.builtin.get_gps() { !(location == $context.location.home) } && description =~ "foo") => notify;`],

    [`executor = USERNAME_0 : now => @com.twitter.post_picture`,
     `USERNAME_0 can post pictures on twitter`, { USERNAME_0: 'mom' },
     `executor = "mom"^^tt:username : {
  now => @com.twitter.post_picture();
}`],

    [`now => @org.thingpedia.weather.sunrise param:date:Date = DATE_0 => notify`,
     `get sunrise sunset on date DATE_0`, { DATE_0: { year: 2018, month: 5, day: 23, hour: -1, minute: -1, second: -1 } },
     `now => @org.thingpedia.weather.sunrise(date=new Date("2018-05-23T07:00:00.000Z")) => notify;`],

    [`now => @org.thingpedia.weather.sunrise param:date:Date = new Date ( " 2018-05-23T07:00:00.000Z " ) => notify`,
     `get sunrise sunset on date 2018-05-23T07:00:00.000Z`, { },
     `now => @org.thingpedia.weather.sunrise(date=new Date("2018-05-23T07:00:00.000Z")) => notify;`],

    [`now => @org.thingpedia.weather.sunrise param:date:Date = DATE_0 => notify`,
     `get sunrise sunset on date DATE_0`, { DATE_0: { year: 2018, month: 5, day: 23, hour: 10, minute: 40, second: 0 } },
     `now => @org.thingpedia.weather.sunrise(date=new Date("2018-05-23T17:40:00.000Z")) => notify;`],

    [`now => @org.thingpedia.weather.sunrise param:date:Date = DATE_0 => notify`,
     `get sunrise sunset on date DATE_0`, { DATE_0: { year: 2018, month: 5, day: 23, hour: 10, minute: 40, second: -1 } },
     `now => @org.thingpedia.weather.sunrise(date=new Date("2018-05-23T17:40:00.000Z")) => notify;`],

    [`now => @org.thingpedia.weather.sunrise param:date:Date = DATE_0 => notify`,
     `get sunrise sunset on date DATE_0`, { DATE_0: { year: 2018, month: 5, day: 23, hour: 10, minute: 40, second: 40.5 } },
     `now => @org.thingpedia.weather.sunrise(date=new Date("2018-05-23T17:40:40.500Z")) => notify;`],

    ['now => ( @com.bing.web_search ) join ( @com.yandex.translate.translate param:target_language:Entity(tt:iso_lang_code) = GENERIC_ENTITY_tt:iso_lang_code_0 ) on param:text:String = event => notify',
    `translate web searches to GENERIC_ENTITY_tt:iso_lang_code_0`, { 'GENERIC_ENTITY_tt:iso_lang_code_0': { value: 'it', display: "Italian" } },
    `now => (@com.bing.web_search() join @com.yandex.translate.translate(target_language="it"^^tt:iso_lang_code("Italian")) on (text=$event)) => notify;`],

    ['now => ( @com.bing.web_search ) join ( @com.yandex.translate.translate param:target_language:Entity(tt:iso_lang_code) = " italian " ^^tt:iso_lang_code ) on param:text:String = event => notify',
    `translate web searches to italian`, {},
    `now => (@com.bing.web_search() join @com.yandex.translate.translate(target_language=null^^tt:iso_lang_code("italian")) on (text=$event)) => notify;`],

    ['now => @com.bing.web_search param:query:String = " pizza " => notify',
    `search pizza on bing`, {},
    `now => @com.bing.web_search(query="pizza") => notify;`],

    ['now => @com.bing.web_search param:query:String = " donald trump " => notify',
    `search donald trump on bing`, {},
    `now => @com.bing.web_search(query="donald trump") => notify;`],

    ['now => ( @com.twitter.search ) filter param:hashtags:Array(Entity(tt:hashtag)) contains " foo " ^^tt:hashtag => notify',
    `search hashtag foo on twitter`, {},
    `now => (@com.twitter.search()), contains(hashtags, "foo"^^tt:hashtag) => notify;`],

    ['executor = " bob " ^^tt:username : now => @com.twitter.post',
    `ask bob to post on twitter`, {},
    `executor = "bob"^^tt:username : {
  now => @com.twitter.post();
}`],

    ['now => @com.twitter.follow param:user_name:Entity(tt:username) = " bob " ^^tt:username',
    `follow bob on twitter`, {},
    `now => @com.twitter.follow(user_name="bob"^^tt:username);`],

    ['policy true : now => @org.thingpedia.builtin.thingengine.builtin.discover filter @org.thingpedia.builtin.test.get_data { param:data:String == QUOTED_STRING_0 }',
    'everybody has permission to discover new devices if the data of more data genning ... is exactly QUOTED_STRING_0', { QUOTED_STRING_0: 'foo' },
    'true : now => @org.thingpedia.builtin.thingengine.builtin.discover, @org.thingpedia.builtin.test.get_data() { data == "foo" };'],

    [`now => @com.xkcd.get_comic param:number:Number = SLOT_0 => notify`,
     '', {'SLOT_0': new Ast.Value.Number(1234) },
     `now => @com.xkcd.get_comic(number=1234) => notify;`],

    [`now => @com.xkcd.get_comic param:number:Number = SLOT_0 => notify`,
     '', {'SLOT_0': undefined},
     `now => @com.xkcd.get_comic(number=$?) => notify;`],

    [`bookkeeping filter param:title:String =~ SLOT_0`,
    '', {'SLOT_0': new Ast.Value.String('foo') },
    `bookkeeping(predicate(title =~ "foo"));`],

    [`bookkeeping filter param:title:String == SLOT_0`,
    '', {'SLOT_0': new Ast.Value.String('foo') },
    `bookkeeping(predicate(title == "foo"));`],

    [`now => @com.xkcd.get_comic param:number:Number = undefined => notify`,
     'get some specific xkcd comic', {},
    `now => @com.xkcd.get_comic(number=$?) => notify;`],

    [`now => ( @com.twitter.search ) filter param:author:Entity(tt:username) == undefined => notify`,
     'search tweets by author', {},
    `now => (@com.twitter.search()), author == $? => notify;`],

    ['now => sort param:sender_name:String asc of ( @com.gmail.inbox ) => notify',
    'show my emails sorted by sender name', {},
    `now => sort sender_name asc of (@com.gmail.inbox()) => notify;`],

    ['now => sort param:sender_name:String desc of ( @com.gmail.inbox ) => notify',
    'show my emails sorted by sender name -lrb- in reverse order -rrb-', {},
    `now => sort sender_name desc of (@com.gmail.inbox()) => notify;`],

    ['now => ( @com.gmail.inbox ) [ 1 ] => notify',
    'show me exactly one email', {},
    `now => (@com.gmail.inbox())[1] => notify;`],

    ['now => ( @com.gmail.inbox ) [ 1 : 3 ] => notify',
    'show me exactly 3 emails', {},
    `now => (@com.gmail.inbox())[1 : 3] => notify;`],

    ['now => ( @com.gmail.inbox ) [ 1 : NUMBER_0 ] => notify',
    'show me exactly NUMBER_0 emails', { NUMBER_0: 22 },
    `now => (@com.gmail.inbox())[1 : 22] => notify;`],

    ['now => ( @com.gmail.inbox ) [ 3 : NUMBER_0 ] => notify',
    'show me exactly NUMBER_0 emails , starting from the third', { NUMBER_0: 22 },
    `now => (@com.gmail.inbox())[3 : 22] => notify;`],

    ['now => ( @com.gmail.inbox ) [ NUMBER_1 : NUMBER_0 ] => notify',
    'show me exactly NUMBER_0 emails , starting from the NUMBER_1', { NUMBER_1: 13, NUMBER_0: 22 },
    `now => (@com.gmail.inbox())[13 : 22] => notify;`],

    ['now => ( @com.gmail.inbox ) [ 3 , 7 , NUMBER_0 ] => notify',
    'show me exactly the emails number 3 , 7 and NUMBER_0', { NUMBER_0: 22 },
    `now => (@com.gmail.inbox())[3, 7, 22] => notify;`],

    ['bookkeeping special special:yes',
    'yes', {},
    'bookkeeping(yes);'],

    ['bookkeeping special special:no',
    'no', {},
    'bookkeeping(no);'],

    ['bookkeeping commands social-network device:com.twitter',
    'twitter', {},
    `bookkeeping(commands(category="social-network", device="com.twitter"^^tt:device));`],

    ['bookkeeping category social-network',
    'social networks', {},
    `bookkeeping(commands(category="social-network", device=$?));`],

    ['bookkeeping choice 0',
    'the first choice', {},
    `bookkeeping(choice(0));`],

    ['bookkeeping choice 1',
    'the second choice', {},
    `bookkeeping(choice(1));`],

    ['bookkeeping choice 2',
    'the third choice', {},
    `bookkeeping(choice(2));`],

    ['bookkeeping answer NUMBER_0',
    'NUMBER_0', { NUMBER_0: 42 },
    `bookkeeping(answer(42));`],

    ['bookkeeping answer LOCATION_0',
    'LOCATION_0', { LOCATION_0: { latitude: 0, longitude: 0, display: "North Pole" } },
    `bookkeeping(answer(new Location(0, 0, "North Pole")));`],

    ['bookkeeping answer 0',
    'zero', {},
    `bookkeeping(answer(0));`],

    ['now => @org.thingpedia.weather.current param:location:Location = location: " stanford california " => notify',
    'get weather for stanford california', {},
    `now => @org.thingpedia.weather.current(location=new Location("stanford california")) => notify;`],

    ['attimer time = TIME_0 => @org.thingpedia.builtin.thingengine.builtin.say param:message:String = QUOTED_STRING_0',
    `say "it's 9am" every day at 9am`,
    { TIME_0: { hour: 9, minute: 0 }, QUOTED_STRING_0: "it's 9am" },
    `attimer(time=new Time(9, 0)) => @org.thingpedia.builtin.thingengine.builtin.say(message="it's 9am");`],

    ['attimer time = [ TIME_0 , TIME_1 ] => @org.thingpedia.builtin.thingengine.builtin.say param:message:String = QUOTED_STRING_0',
    `say "it's 9am or 3pm" every day at 9am and 3pm`,
    { TIME_0: { hour: 9, minute: 0 }, TIME_1: { hour: 15, minute: 0 }, QUOTED_STRING_0: "it's 9am or 3pm" },
    `attimer(time=[new Time(9, 0), new Time(15, 0)]) => @org.thingpedia.builtin.thingengine.builtin.say(message="it's 9am or 3pm");`],

    [`attimer time = time:morning => @org.thingpedia.builtin.thingengine.builtin.say param:message:String = QUOTED_STRING_0`,
    `say "it's the morning" every day in the morning`,
    { QUOTED_STRING_0: "it's the morning" },
    `attimer(time=$context.time.morning) => @org.thingpedia.builtin.thingengine.builtin.say(message="it's the morning");`],

    [`attimer time = time:evening => @org.thingpedia.builtin.thingengine.builtin.say param:message:String = QUOTED_STRING_0`,
    `say "it's the evening" every day in the evening`,
    { QUOTED_STRING_0: "it's the evening" },
    `attimer(time=$context.time.evening) => @org.thingpedia.builtin.thingengine.builtin.say(message="it's the evening");`],

    // To test LITERAL_TIME but might want to drop this functionality
    // Left sentence blank because "at noon" should map to TIME_0 instead
    [`attimer time = time:12:0:0 => @org.thingpedia.builtin.thingengine.builtin.say param:message:String = QUOTED_STRING_0`,
    '',
    { QUOTED_STRING_0: "it's noon" },
    `attimer(time=new Time(12, 0)) => @org.thingpedia.builtin.thingengine.builtin.say(message="it's noon");`],

    ['now => [ param:description:String , param:title:String ] of ( @com.bing.web_search ) => notify',
    'get title and description from bing', {},

    'now => [description, title] of (@com.bing.web_search()) => notify;'],

    [`now => @com.spotify.get_currently_playing => @com.spotify.add_songs_to_playlist param:songs:Array(String) = [ param:song:String ]`,
    `add the currently playing song to my playlist`, {},
    `now => @com.spotify.get_currently_playing() => @com.spotify.add_songs_to_playlist(songs=[song]);`],

    [`[ param:author:Entity(tt:username) , param:text:String ] of ( monitor ( @com.twitter.home_timeline ) on new param:text:String ) => notify`,
    `monitor new text of tweets and show me the text and author`, {},
    `[author, text] of (monitor (@com.twitter.home_timeline()) on new [text]) => notify;`],

    ['now => @com.twitter.post param:status:String = context:selection:String',
    'post this on twitter', {},
    `now => @com.twitter.post(status=$context.selection : String);`],

    [`now => ( @com.twitter.home_timeline ) filter count ( param:hashtags:Array(Entity(tt:hashtag)) ) >= 0 => notify`,
    `get tweets with hashtags`, {},
    `now => (@com.twitter.home_timeline()), count(hashtags) >= 0 => notify;`],

    // just to test syntax, in reality we should not generate examples like this
    [`now => ( @com.twitter.home_timeline ) filter count ( param:hashtags:Array(Entity(tt:hashtag)) filter { param:value:Entity(tt:hashtag) == " foo " ^^tt:hashtag } ) >= 0 => notify`,
    `get tweets with hashtags foo`, {},
    `now => (@com.twitter.home_timeline()), count((hashtags) filter { value == "foo"^^tt:hashtag }) >= 0 => notify;`],

    [`now => @light-bulb.set_power attribute:name:String = " bedroom " param:power:Enum(on,off) = enum:off`,
    `turn off my bedroom lights`, {},
    `now => @light-bulb(name="bedroom").set_power(power=enum(off));`],

    [`$dialogue @org.thingpedia.dialogue.transaction.greet ;`,
     `hello`, {},
     `$dialogue @org.thingpedia.dialogue.transaction.greet;`],

    [`$dialogue @org.thingpedia.dialogue.transaction.execute ; ` +
     `now => @com.thecatapi.get => notify ;`,
    `get a cat picture`, {},
    `$dialogue @org.thingpedia.dialogue.transaction.execute;
now => @com.thecatapi.get() => notify;`],

    [`$dialogue @org.thingpedia.dialogue.transaction.execute ; ` +
     `now => @com.thecatapi.get => notify ` +
     `#[ results = [ { param:image_id = GENERIC_ENTITY_com.thecatapi:image_id_0 , param:picture_url = PICTURE_0 , param:link = URL_0 } ] ] ;`,
    `here is your cat picture`, { 'GENERIC_ENTITY_com.thecatapi:image_id_0': { value: '1234', display: null }, PICTURE_0: 'https://example.com/1', URL_0: 'https://example.com/2' },
    `$dialogue @org.thingpedia.dialogue.transaction.execute;
now => @com.thecatapi.get() => notify
#[results=[
  { image_id="1234"^^com.thecatapi:image_id, picture_url="https://example.com/1"^^tt:picture, link="https://example.com/2"^^tt:url }
]];`],

    [`$dialogue @org.thingpedia.dialogue.transaction.execute ; ` +
     `now => @com.thecatapi.get => notify ` +
     `#[ results = [ { param:image_id = GENERIC_ENTITY_com.thecatapi:image_id_0 , param:picture_url = PICTURE_0 , param:link = URL_1 } ] ] ; ` +
     `now => @com.twitter.post_picture param:picture_url:Entity(tt:picture) = PICTURE_0 ;`,
    `now post it on twitter`, { 'GENERIC_ENTITY_com.thecatapi:image_id_0': { value: '1234', display: null }, PICTURE_0: 'https://example.com/1', URL_1: 'https://example.com/2' },
    `$dialogue @org.thingpedia.dialogue.transaction.execute;
now => @com.thecatapi.get() => notify
#[results=[
  { image_id="1234"^^com.thecatapi:image_id, picture_url="https://example.com/1"^^tt:picture, link="https://example.com/2"^^tt:url }
]];
now => @com.twitter.post_picture(picture_url="https://example.com/1"^^tt:picture);`],

    [`$dialogue @org.thingpedia.dialogue.transaction.execute ; ` +
     `now => @com.thecatapi.get => notify ` +
     `#[ results = [ { param:image_id = GENERIC_ENTITY_com.thecatapi:image_id_0 , param:picture_url = PICTURE_0 , param:link = URL_1 } ] ] ; ` +
     `now => @com.twitter.post_picture param:picture_url:Entity(tt:picture) = PICTURE_0 ` +
     `#[ confirm = enum:confirmed ] ;`,
    `confirm posting it on twitter`, { 'GENERIC_ENTITY_com.thecatapi:image_id_0': { value: '1234', display: null }, PICTURE_0: 'https://example.com/1', URL_1: 'https://example.com/2' },
    `$dialogue @org.thingpedia.dialogue.transaction.execute;
now => @com.thecatapi.get() => notify
#[results=[
  { image_id="1234"^^com.thecatapi:image_id, picture_url="https://example.com/1"^^tt:picture, link="https://example.com/2"^^tt:url }
]];
now => @com.twitter.post_picture(picture_url="https://example.com/1"^^tt:picture)
#[confirm=enum(confirmed)];`],

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
now => @com.thecatapi.get() => notify
#[results=[
  { image_id="1234"^^com.thecatapi:image_id, picture_url="https://example.com/1"^^tt:picture, link="https://example.com/2"^^tt:url }
]];
now => @com.twitter.post_picture(picture_url="https://example.com/1"^^tt:picture)
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
now => @com.thecatapi.get() => notify
#[results=[
  { image_id="1234"^^com.thecatapi:image_id, picture_url="https://example.com/1"^^tt:picture, link="https://example.com/2"^^tt:url }
]];
now => @com.twitter.post_picture(picture_url="https://example.com/1"^^tt:picture)
#[results=[
]]
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
now => @com.thecatapi.get() => notify
#[results=[
  { image_id="1234"^^com.thecatapi:image_id, picture_url="https://example.com/1"^^tt:picture, link="https://example.com/2"^^tt:url }
]];
now => @com.twitter.post_picture(picture_url="https://example.com/1"^^tt:picture)
#[results=[
]]
#[error=enum(my_error_code)];`],

    [`$dialogue @org.thingpedia.dialogue.transaction.execute ; ` +
     `now => @com.thecatapi.get => notify ` +
     `#[ results = [ { param:image_id = GENERIC_ENTITY_com.thecatapi:image_id_0 , param:picture_url = PICTURE_0 , param:link = URL_0 } ] ] ` +
     `#[ count = NUMBER_0 ] ;`,
    `i found NUMBER_0 cat pictures , here is one`, { 'GENERIC_ENTITY_com.thecatapi:image_id_0': { value: '1234', display: null }, PICTURE_0: 'https://example.com/1', URL_0: 'https://example.com/2', NUMBER_0: 55 },
    `$dialogue @org.thingpedia.dialogue.transaction.execute;
now => @com.thecatapi.get() => notify
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
now => @com.thecatapi.get() => notify
#[results=[
  { image_id="1234"^^com.thecatapi:image_id, picture_url="https://example.com/1"^^tt:picture, link="https://example.com/2"^^tt:url }
]]
#[count=55]
#[more=true];`],

    [`$dialogue @org.thingpedia.dialogue.transaction.sys_search_question param:serveCuisine ; ` +
     `now => @org.schema.restaurant => notify ;`,
     'what kind of cuisine are you looking for ?', {},
     `$dialogue @org.thingpedia.dialogue.transaction.sys_search_question(serveCuisine);
now => @org.schema.restaurant() => notify;`],

    [`$dialogue @org.thingpedia.dialogue.transaction.sys_search_question param:price , param:serveCuisine ; ` +
     `now => @org.schema.restaurant => notify ;`,
     'what kind of cuisine and price are you looking for ?', {},
     `$dialogue @org.thingpedia.dialogue.transaction.sys_search_question(price, serveCuisine);
now => @org.schema.restaurant() => notify;`],

    [`bookkeeping answer @com.google.contacts.get_contacts`,
    `google contacts`, {},
    `bookkeeping(answer("com.google.contacts:get_contacts"^^tt:function));`],

    [`now => ( @com.yelp.restaurant ) filter true param:cuisines:Array(Entity(com.yelp:restaurant_cuisine)) => notify`,
    `i 'm looking for a restaurant , i do n't care what cuisine`, {},
    `now => (@com.yelp.restaurant()), true(cuisines) => notify;`],

    ['now => ( @org.schema.full.Recipe ) filter param:nutrition.fatContent:Measure(kg) >= MEASURE_kg_0 and param:nutrition.sugarContent:Measure(kg) >= MEASURE_kg_0 => notify',
     `yeah please find a recipe with that fat content and that sugar content`, { MEASURE_kg_0: { value: 13, unit: 'kg' } },
     `now => (@org.schema.full.Recipe()), (nutrition.fatContent >= 13kg && nutrition.sugarContent >= 13kg) => notify;`],

    ['now => ( @com.uber.price_estimate ) filter param:low_estimate:Currency <= new Currency ( NUMBER_0 , unit:usd ) => notify',
     'is it less than $ NUMBER_0 ?', { NUMBER_0: 1000 },
     'now => (@com.uber.price_estimate()), low_estimate <= new Currency(1000, usd) => notify;'],
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
        let program = NNSyntax.fromNN(sequence, entities);
        let generated = program.prettyprint(true);

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

        let reconstructed = NNSyntax.toNN(program, sentence, entities).join(' ');
        if (reconstructed !== test[0]) {
            console.error('Test Case #' + (i+1) + ' failed (wrong NN syntax)');
            console.error('Expected:', test[0]);
            console.error('Generated:', reconstructed);
            if (process.env.TEST_MODE)
                throw new Error(`testNNSyntax ${i+1} FAILED`);
        }

        let withoutTypeAnnotations = NNSyntax.toNN(program, sentence, entities, { typeAnnotations: false }).join(' ');
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
    } catch (e) {
        console.error('Test Case #' + (i+1) + ' failed with exception');
        console.error(sequence.join(' '));
        console.error(e.stack);
        if (process.env.TEST_MODE)
            throw e;
    }
}

async function main() {
    for (let i = 0; i < TEST_CASES.length; i++)
        await testCase(TEST_CASES[i], i);
}
module.exports = main;
if (!module.parent)
    main();
