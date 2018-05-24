// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Almond
//
// Copyright 2017 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

require('./polyfill');

const Q = require('q');
Q.longStackSupport = true;
const Describe = require('../lib/describe');
const Grammar = require('../lib/grammar_api');
const SchemaRetriever = require('../lib/schema');

const ThingpediaClientHttp = require('./http_client');

var TEST_CASES = [
    // manually written test cases
    ['now => @com.twitter.post(status=$undefined);',
     'tweet ____',
     'Twitter'],
    ['monitor @com.twitter.home_timeline() => @com.twitter.post(status=text);',
    'tweet the text when tweets from anyone you follow change',
    'Twitter ⇒ Twitter'],
    ['attimer(time=makeTime(8,30)) => @org.thingpedia.builtin.thingengine.builtin.say(message=$undefined);',
    'send me a message ____ every day at 8:30am',
    'Say'],
    ['attimer(time=makeTime(20,30)) => @org.thingpedia.builtin.thingengine.builtin.say(message=$undefined);',
    'send me a message ____ every day at 8:30pm',
    'Say'],

    [`now => @com.xkcd.get_comic() => notify;`,
    'get get an Xkcd comic and then notify you',
    'Xkcd ⇒ Notification'],
    [`now => @com.xkcd.get_comic(number=42) => notify;`,
    'get get an Xkcd comic with number equal to 42 and then notify you',
    'Xkcd ⇒ Notification',],
    [`now => @com.xkcd.get_comic(number=$undefined) => notify;`,
    'get get an Xkcd comic with number equal to ____ and then notify you',
    'Xkcd ⇒ Notification'],
    [`now => @com.xkcd.get_comic() => return;`,
    'get get an Xkcd comic and then send it to me',
    'Xkcd ⇒ Notification'],
    [`monitor @com.xkcd.get_comic() => notify;`,
    'notify you when get an Xkcd comic changes',
    'Xkcd ⇒ Notification'],
    [`monitor @com.xkcd.get_comic() => return;`,
    'send it to me when get an Xkcd comic changes',
    'Xkcd ⇒ Notification'],

    [`now => @org.thingpedia.weather.current(location=$context.location.current_location) => notify;`,
    `get show the current weather for here and then notify you`,
    'Weather ⇒ Notification'],
    [`now => @org.thingpedia.weather.current(location=$context.location.home) => notify;`,
    `get show the current weather for at home and then notify you`,
    'Weather ⇒ Notification'],
    [`now => @org.thingpedia.weather.current(location=$context.location.work) => notify;`,
    `get show the current weather for at work and then notify you`,
    'Weather ⇒ Notification'],
    [`now => @org.thingpedia.weather.current(location=makeLocation(37,-137)) => notify;`,
    `get show the current weather for [Latitude: 37.000 deg, Longitude: -137.000 deg] and then notify you`,
    'Weather ⇒ Notification'],
    [`now => @org.thingpedia.weather.current(location=makeLocation(37,-137, "Somewhere")) => notify;`,
    `get show the current weather for Somewhere and then notify you`,
    'Weather ⇒ Notification'],

    /*[`now => @org.thingpedia.weather.sunrise(date=makeDate(2018,4,24)) => notify;`,
    `get get the sunrise and sunset time for location ____ with date equal to 4/24/2018 and then notify you`,
    'Weather ⇒ Notification'],
    [`now => @org.thingpedia.weather.sunrise(date=makeDate(2018,4,24,10,0,0)) => notify;`,
    `get get the sunrise and sunset time for location ____ with date equal to 4/24/2018, 10:00:00 AM and then notify you`,
    'Weather ⇒ Notification'],
    [`now => @org.thingpedia.weather.sunrise(date=makeDate(2018,4,24,22,0,0)) => notify;`,
    `get get the sunrise and sunset time for location ____ with date equal to 4/24/2018, 10:00:00 PM and then notify you`,
    'Weather ⇒ Notification'],*/

    [`now => @com.instagram.get_pictures(), in_array(caption,["foo","bar"]) => notify;`,
    `get retrieve your recent Instagram pictures if "foo", "bar" contains the caption and then notify you`,
    'Instagram ⇒ Notification'],
    [`now => @com.instagram.get_pictures(), contains(hashtags, "foo"^^tt:hashtag) => notify;`,
    `get retrieve your recent Instagram pictures if the hashtags contain #foo and then notify you`,
    'Instagram ⇒ Notification'],

    [`now => @com.yandex.translate.translate(target_language="zh"^^tt:iso_lang_code, text="hello") => @com.facebook.post(status=$event);`,
    `get the translation of "hello" to zh and then post the result on Facebook`,
    'Yandex Translate ⇒ Facebook'],
    [`now => @com.yandex.translate.translate(target_language="zh"^^tt:iso_lang_code) => @com.facebook.post(status=$event.type);`,
    `get the translation of ____ to zh and then post the device type on Facebook`,
    'Yandex Translate ⇒ Facebook'],
    [`now => @com.yandex.translate.translate(target_language="zh"^^tt:iso_lang_code) => @com.facebook.post(status=$event.program_id);`,
    `get the translation of ____ to zh and then post the program ID on Facebook`,
    'Yandex Translate ⇒ Facebook'],
    [`now => @com.yandex.translate.translate(target_language="zh"^^tt:iso_lang_code("Chinese")) => @com.facebook.post(status=$event.program_id);`,
    `get the translation of ____ to Chinese and then post the program ID on Facebook`,
    'Yandex Translate ⇒ Facebook'],

    [`monitor (@com.xkcd.get_comic()) join @com.yandex.translate.translate(target_language="zh"^^tt:iso_lang_code("Chinese")) on (text=title) => @com.facebook.post(status=$event);`,
    `post the result on Facebook when get an Xkcd comic changes and then get the translation of the title to Chinese`,
    'Xkcd ⇒ Yandex Translate ⇒ Facebook'],
    [`monitor (@com.xkcd.get_comic()) join @com.yandex.translate.translate(target_language="zh"^^tt:iso_lang_code("Chinese")) on (text=title) => notify;`,
    `notify you when get an Xkcd comic changes and then get the translation of the title to Chinese`,
    'Xkcd ⇒ Yandex Translate ⇒ Notification'],
    [`monitor (@com.xkcd.get_comic(), title =~ "lol") join @com.yandex.translate.translate(target_language="zh"^^tt:iso_lang_code("Chinese")) on (text=title) => notify;`,
    'notify you when get an Xkcd comic changes if the title contains "lol" and then get the translation of the title to Chinese',
    'Xkcd ⇒ Yandex Translate ⇒ Notification'],
    [`monitor (@com.xkcd.get_comic(), title =~ "lol") => notify;`,
    'notify you when get an Xkcd comic changes if the title contains "lol"',
    'Xkcd ⇒ Notification'],
    [`monitor (@com.xkcd.get_comic(), title =~ "lol") => @com.facebook.post(status=link);`,
    `post the link on Facebook when get an Xkcd comic changes if the title contains "lol"`,
    'Xkcd ⇒ Facebook'],
    [`monitor (@com.gmail.inbox(), contains(labels, "work")) => @com.facebook.post(status=snippet);`,
    `post the snippet on Facebook when list the emails in your GMail inbox change if the labels contain "work"`,
    'Gmail ⇒ Facebook'],
    [`monitor (@com.gmail.inbox(), contains(labels, "work")) => @com.facebook.post(status=snippet);`,
    `post the snippet on Facebook when list the emails in your GMail inbox change if the labels contain "work"`,
    'Gmail ⇒ Facebook'],
    [`monitor (@com.gmail.inbox(), !contains(labels, "work")) => @com.facebook.post(status=snippet);`,
    `post the snippet on Facebook when list the emails in your GMail inbox change if the labels do not contain "work"`,
    'Gmail ⇒ Facebook'],

    ['monitor @com.twitter.home_timeline(), contains(hashtags, "funny") => @com.twitter.post(status=text);',
    'tweet the text when tweets from anyone you follow change if the hashtags contain "funny"',
    'Twitter ⇒ Twitter'],
    ['monitor @com.twitter.home_timeline(), text =~ "funny" => @com.twitter.post(status=text);',
    'tweet the text when tweets from anyone you follow change if the text contains "funny"',
    'Twitter ⇒ Twitter'],
    ['monitor @com.twitter.home_timeline(), !(text =~ "funny") => @com.twitter.post(status=text);',
    'tweet the text when tweets from anyone you follow change if the text does not contain "funny"',
    'Twitter ⇒ Twitter'],

    ['now => @uk.co.thedogapi.get() => notify;',
    'get get dog pictures and then notify you', 'Thedogapi ⇒ Notification'],

    ['now => @org.thingpedia.builtin.thingengine.phone.sms() => notify;',
    'get you receive an SMS and then notify you', 'Phone ⇒ Notification'],
    ['now => @org.thingpedia.builtin.thingengine.phone.set_ringer(mode=enum(vibrate));',
    'set your phone to vibrate', 'Phone']
];

const schemaRetriever = new SchemaRetriever(new ThingpediaClientHttp(), true);
const gettext = {
    dgettext: (domain, msgid) => msgid
};

function test(i) {
    console.log('Test Case #' + (i+1));
    var [code, expected, expectedname] = TEST_CASES[i];

    return Grammar.parseAndTypecheck(code, schemaRetriever, true).then((prog) => {
        let reconstructed = Describe.describeProgram(gettext, prog);
        if (expected !== reconstructed) {
            console.error('Test Case #' + (i+1) + ': does not match what expected');
            console.error('Expected: ' + expected);
            console.error('Generated: ' + reconstructed);
            if (process.env.TEST_MODE)
                throw new Error(`testDescribe ${i+1} FAILED`);
        }
        let name = Describe.getProgramName(gettext, prog);
        if (name !== expectedname) {
            console.error('Test Case #' + (i+1) + ': does not match what expected');
            console.error('Expected: ' + expectedname);
            console.error('Generated: ' + name);
            if (process.env.TEST_MODE)
                throw new Error(`testDescribe ${i+1} FAILED`);
        }
    }).catch((e) => {
        console.error('Test Case #' + (i+1) + ': failed with exception');
        console.error('Error: ' + e.message);
        console.error(e.stack);
        if (process.env.TEST_MODE)
            throw e;
    });
}

function loop(i) {
    if (i === TEST_CASES.length)
        return Q();

    return Q(test(i)).then(() => loop(i+1));
}

function main() {
    loop(0).done();
}
main();
