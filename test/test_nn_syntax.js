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

const Q = require('q');

const NNSyntax = require('../lib/nn_syntax');
//const NNOutputParser = require('../lib/nn_output_parser');
const Ast = require('../lib/ast');
const { typeCheckProgram, typeCheckPermissionRule } = require('../lib/typecheck');
const SchemaRetriever = require('../lib/schema');

const ThingpediaClientHttp = require('./http_client');

var schemaRetriever = new SchemaRetriever(new ThingpediaClientHttp(), false);

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
     {},
     `monitor (@com.xkcd.get_comic()) => notify;`
    ],

    [`now => @com.twitter.post param:status:String = QUOTED_STRING_0`,
     {'QUOTED_STRING_0': 'hello'},
     `now => @com.twitter.post(status="hello");`
    ],

    [`now => @com.twitter.post param:status:String = ""`,
     {},
     `now => @com.twitter.post(status="");`
    ],

    [`now => @com.xkcd.get_comic param:number:Number = NUMBER_0 => notify`,
     {'NUMBER_0': 1234},
     `now => @com.xkcd.get_comic(number=1234) => notify;`],

    [`now => ( @org.thingpedia.builtin.thingengine.builtin.get_random_between param:high:Number = NUMBER_1 param:low:Number = NUMBER_0 ) join ( @com.xkcd.get_comic ) on param:number:Number = param:random:Number => notify`,
    {'NUMBER_0': 55, 'NUMBER_1': 1024},
    `now => (@org.thingpedia.builtin.thingengine.builtin.get_random_between(high=1024, low=55) join @com.xkcd.get_comic() on (number=random)) => notify;`],

    [`( ( timer base = now , interval = 1 unit:hour ) join ( @org.thingpedia.builtin.thingengine.builtin.get_random_between param:high:Number = NUMBER_1 param:low:Number = NUMBER_0 ) ) join ( @com.xkcd.get_comic ) on param:number:Number = param:random:Number => notify`,
    {'NUMBER_0': 55, 'NUMBER_1': 1024},
    `((timer(base=makeDate(), interval=1hour) join @org.thingpedia.builtin.thingengine.builtin.get_random_between(high=1024, low=55)) join @com.xkcd.get_comic() on (number=random)) => notify;`],

    [`now => @org.thingpedia.builtin.thingengine.builtin.get_random_between param:high:Number = NUMBER_1 param:low:Number = NUMBER_0 => notify`,
    {'NUMBER_0': 55, 'NUMBER_1': 1024},
    `now => @org.thingpedia.builtin.thingengine.builtin.get_random_between(high=1024, low=55) => notify;`],

    [`now => @org.thingpedia.builtin.thingengine.builtin.get_random_between param:high:Number = NUMBER_0 param:low:Number = NUMBER_1 => notify`,
    {'NUMBER_0': 1024, 'NUMBER_1': 55},
    `now => @org.thingpedia.builtin.thingengine.builtin.get_random_between(high=1024, low=55) => notify;`],

    [`monitor ( @thermostat.get_temperature ) => notify`,
    {},
    `monitor (@thermostat.get_temperature()) => notify;`],

    [`monitor ( ( @thermostat.get_temperature ) filter param:value:Measure(C) > NUMBER_0 unit:F ) => notify`,
    {'NUMBER_0': 70},
    `monitor ((@thermostat.get_temperature()), value > 70F) => notify;`],

    [`now => timeseries now , 1 unit:week of ( monitor ( @thermostat.get_temperature ) ) => notify`,
    {},
    `now => timeseries makeDate(), 1week of monitor (@thermostat.get_temperature()) => notify;`],

    [`now => timeseries now , NUMBER_0 unit:week of ( monitor ( @thermostat.get_temperature ) ) => notify`,
    {NUMBER_0: 2},
    `now => timeseries makeDate(), 2week of monitor (@thermostat.get_temperature()) => notify;`],

    [`now => ( @com.bing.image_search ) filter param:width:Number > NUMBER_0 or param:height:Number > NUMBER_1 => notify`,
    {NUMBER_0: 100, NUMBER_1:200},
    `now => (@com.bing.image_search()), (width > 100 || height > 200) => notify;`],

    [`now => ( @com.bing.image_search ) filter param:width:Number > NUMBER_0 or param:height:Number > NUMBER_1 and param:width:Number < NUMBER_2 => notify`,
    {NUMBER_0: 100, NUMBER_1:200, NUMBER_2: 500},
    `now => (@com.bing.image_search()), ((width > 100 || height > 200) && width < 500) => notify;`],

    [`now => ( @com.bing.image_search ) filter param:width:Number > NUMBER_0 or param:height:Number > NUMBER_0 => notify`,
    {NUMBER_0: 100},
    `now => (@com.bing.image_search()), (width > 100 || height > 100) => notify;`],

    [`now => ( @com.bing.image_search ) filter param:width:Number > NUMBER_0 => notify`,
    {NUMBER_0: 100 },
    `now => (@com.bing.image_search()), width > 100 => notify;`],

    ['monitor ( @com.xkcd.get_comic ) on new param:title:String => notify',
    {},
    `monitor (@com.xkcd.get_comic()) on new [title] => notify;`],

    ['monitor ( @com.xkcd.get_comic ) on new [ param:title:String , param:alt_text:String ] => notify',
    {},
    `monitor (@com.xkcd.get_comic()) on new [title, alt_text] => notify;`],

    ['monitor ( ( @com.instagram.get_pictures param:count:Number = NUMBER_0 ) filter param:caption:String in_array [ QUOTED_STRING_0 , QUOTED_STRING_1 ] ) => notify',
    {NUMBER_0: 100, QUOTED_STRING_0: 'abc', QUOTED_STRING_1: 'def'},
    `monitor ((@com.instagram.get_pictures(count=100)), in_array(caption, ["abc", "def"])) => notify;`],

    ['timer base = now , interval = DURATION_0 => notify',
    {DURATION_0: { value: 2, unit: 'h'}},
    `timer(base=makeDate(), interval=2h) => notify;`],

    ['monitor ( ( @com.phdcomics.get_post ) filter not param:title:String =~ QUOTED_STRING_0 ) => notify',
    {QUOTED_STRING_0: 'abc'},
    `monitor ((@com.phdcomics.get_post()), !(title =~ "abc")) => notify;`],

    ['now => ( @com.uber.price_estimate param:end:Location = location:home param:start:Location = location:work ) filter param:low_estimate:Currency >= CURRENCY_0 => notify',
    {CURRENCY_0: { value: 50, unit: 'usd' } },
    `now => (@com.uber.price_estimate(end=$context.location.home, start=$context.location.work)), low_estimate >= makeCurrency(50, usd) => notify;`],

    ['now => ( @com.uber.price_estimate ) filter param:uber_type:Enum(pool,uber_x,uber_xl,uber_black,select,suv,assist) == enum:uber_x => notify',
    {},
    `now => (@com.uber.price_estimate()), uber_type == enum(uber_x) => notify;`],

    ['now => @org.thingpedia.builtin.thingengine.builtin.configure param:device:Entity(tt:device) = device:com.google',
    {},
    `now => @org.thingpedia.builtin.thingengine.builtin.configure(device="com.google"^^tt:device);`],

    ['now => ( @com.nytimes.get_front_page ) filter param:updated:Date >= now - DURATION_0 => notify',
     { DURATION_0: { value: 2, unit: 'h' } },
     `now => (@com.nytimes.get_front_page()), updated >= makeDate() - 2h => notify;`],

    [`executor = USERNAME_0 : now => @com.twitter.post`,
     { USERNAME_0: 'bob' },
     `executor = "bob"^^tt:username : now => @com.twitter.post();`],

    [`executor = USERNAME_0 : now => @com.xkcd.get_comic => notify`,
     { USERNAME_0: 'bob' },
     `executor = "bob"^^tt:username : now => @com.xkcd.get_comic() => notify;`],

    [`executor = USERNAME_0 : now => @com.xkcd.get_comic => return`,
     { USERNAME_0: 'bob' },
     `executor = "bob"^^tt:username : now => @com.xkcd.get_comic() => return;`],

    [`now => ( @security-camera.current_event ) filter @org.thingpedia.builtin.thingengine.phone.get_gps { not param:location:Location == location:home } => notify`,
     {},
     `now => (@security-camera.current_event()), @org.thingpedia.builtin.thingengine.phone.get_gps() { !(location == $context.location.home) } => notify;`],

    [`policy true : now => @com.twitter.post`,
    {},
    `true : now => @com.twitter.post;`],

    [`policy true : now => @com.twitter.post filter param:status:String =~ QUOTED_STRING_0`,
    { QUOTED_STRING_0: 'foo' },
    `true : now => @com.twitter.post, status =~ "foo";`],

    [`policy param:source:Entity(tt:contact) == USERNAME_0 : now => @com.twitter.post`,
    { USERNAME_0: 'bob' },
    `source == "bob"^^tt:username : now => @com.twitter.post;`],

    [`policy param:source:Entity(tt:contact) == USERNAME_0 : now => @com.twitter.post filter param:status:String =~ QUOTED_STRING_0`,
    { USERNAME_0: 'bob', QUOTED_STRING_0: 'foo' },
    `source == "bob"^^tt:username : now => @com.twitter.post, status =~ "foo";`],

    [`policy true : @com.bing.web_search => notify`,
    {},
    `true : @com.bing.web_search => notify;`],

    [`policy true : @com.bing.web_search filter param:query:String =~ QUOTED_STRING_0 => notify`,
    { QUOTED_STRING_0: 'foo' },
    `true : @com.bing.web_search, query =~ "foo" => notify;`],

    [`policy true : @com.bing.web_search filter param:description:String =~ QUOTED_STRING_0 => notify`,
    { QUOTED_STRING_0: 'foo' },
    `true : @com.bing.web_search, description =~ "foo" => notify;`],

    [`policy true : @com.bing.web_search filter param:description:String =~ QUOTED_STRING_0 => @com.twitter.post filter param:status:String =~ QUOTED_STRING_0`,
    { QUOTED_STRING_0: 'foo' },
    `true : @com.bing.web_search, description =~ "foo" => @com.twitter.post, status =~ "foo";`],

    [`policy true : @com.bing.web_search filter @org.thingpedia.builtin.thingengine.phone.get_gps { not param:location:Location == location:home } and param:description:String =~ QUOTED_STRING_0 => notify`,
    { QUOTED_STRING_0: 'foo' },
    `true : @com.bing.web_search, (@org.thingpedia.builtin.thingengine.phone.get_gps() { !(location == $context.location.home) } && description =~ "foo") => notify;`],

    [`executor = USERNAME_0 : now => @com.twitter.post_picture`,
     { USERNAME_0: 'mom' },
     `executor = "mom"^^tt:username : now => @com.twitter.post_picture();`],

    [`now => @org.thingpedia.weather.sunrise param:date:Date = DATE_0 => notify`,
     { DATE_0: { year: 2018, month: 5, day: 23, hour: -1, minute: -1, second: -1 } },
     `now => @org.thingpedia.weather.sunrise(date=makeDate(1527058800000)) => notify;`],

    [`now => @org.thingpedia.weather.sunrise param:date:Date = DATE_0 => notify`,
     { DATE_0: { year: 2018, month: 5, day: 23, hour: 10, minute: 40, second: 0 } },
     `now => @org.thingpedia.weather.sunrise(date=makeDate(1527097200000)) => notify;`],

    [`now => @org.thingpedia.weather.sunrise param:date:Date = DATE_0 => notify`,
     { DATE_0: { year: 2018, month: 5, day: 23, hour: 10, minute: 40, second: -1 } },
     `now => @org.thingpedia.weather.sunrise(date=makeDate(1527097200000)) => notify;`],

    [`now => @org.thingpedia.weather.sunrise param:date:Date = DATE_0 => notify`,
     { DATE_0: { year: 2018, month: 5, day: 23, hour: 10, minute: 40, second: 40.5 } },
     `now => @org.thingpedia.weather.sunrise(date=makeDate(1527097240500)) => notify;`],

    /*[`now => @com.xkcd.get_comic param:number:Number = SLOT_0 => notify`,
     {'SLOT_0': Ast.Value.Number(1234)},
     `now => @com.xkcd.get_comic(number=1234) => notify;`],

    [`now => @com.xkcd.get_comic param:number:Number = SLOT_0 => notify`,
     {'SLOT_0': undefined},
     `now => @com.xkcd.get_comic(number=$undefined) => notify;`],*/
];

function typeCheck(what, schemaRetriever) {
    if (what instanceof Ast.Program)
        return typeCheckProgram(what, schemaRetriever);
    else
        return typeCheckPermissionRule(what, schemaRetriever);
}

function prettyprint(what) {
    if (what instanceof Ast.Program)
        return Ast.prettyprint(what, true);
    else
        return Ast.prettyprintPermissionRule(what);
}

function testCase(test, i) {
    let [sequence, entities, expected] = test;

    console.log('Test Case #' + (i+1));
    return Q.try(() => {
        sequence = sequence.split(' ');
        let program = NNSyntax.fromNN(sequence, entities);
        let generated = prettyprint(program);

        if (generated !== expected) {
            console.error('Test Case #' + (i+1) + ' failed (wrong program)');
            console.error('Expected:', expected);
            console.error('Generated:', generated);
            if (process.env.TEST_MODE)
                throw new Error(`testNNSyntax ${i+1} FAILED`);
        }

        return typeCheck(program, schemaRetriever).then(() => {

            let reconstructed = NNSyntax.toNN(program, entities).join(' ');
            if (reconstructed !== test[0]) {
                console.error('Test Case #' + (i+1) + ' failed (wrong NN syntax)');
                console.error('Expected:', test[0]);
                console.error('Generated:', reconstructed);
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
        });
    }).catch((e) => {
        console.error('Test Case #' + (i+1) + ' failed with exception');
        console.error(e.stack);
        if (process.env.TEST_MODE)
            throw e;
    });
}

function promiseLoop(array, fn) {
    return (function loop(i) {
        if (i === array.length)
            return Q();
        return Q(fn(array[i], i)).then(() => loop(i+1));
    })(0);
}

function main() {
    promiseLoop(TEST_CASES, testCase).done();
}
main();
