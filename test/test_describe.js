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

const Describe = require('../lib/describe');
const Grammar = require('../lib/grammar_api');
const SchemaRetriever = require('../lib/schema');

const _mockSchemaDelegate = require('./mock_schema_delegate');
const schemaRetriever = new SchemaRetriever(_mockSchemaDelegate, null, true);

var TEST_CASES = [
    // manually written test cases
    ['now => @com.twitter.post(status=$undefined);',
     'tweet ____',
     'Twitter'],
    ['monitor @com.twitter.home_timeline() => @com.twitter.post(status=text);',
    'tweet the text when tweets from anyone you follow change',
    'Twitter ⇒ Twitter'],

    ['attimer(time=makeTime(8,30)) => @org.thingpedia.builtin.thingengine.builtin.say(message=$undefined);',
    'send me a message ____ every day at 8:30 AM',
    'Say'],
    ['attimer(time=makeTime(20,30)) => @org.thingpedia.builtin.thingengine.builtin.say(message=$undefined);',
    'send me a message ____ every day at 8:30 PM',
    'Say'],
    ['attimer(time=makeTime(0,0)) => @org.thingpedia.builtin.thingengine.builtin.say(message=$undefined);',
    'send me a message ____ every day at 12:00 AM',
    'Say'],
    ['attimer(time=makeTime(12,0)) => @org.thingpedia.builtin.thingengine.builtin.say(message=$undefined);',
    'send me a message ____ every day at 12:00 PM',
    'Say'],
    [`attimer(time=[makeTime(9,0), makeTime(15,0)]) => @org.thingpedia.builtin.thingengine.builtin.say(message="it's 9am or 3pm");`,
    `send me a message “it's 9am or 3pm” every day at 9:00 AM, 3:00 PM`,//'
    'Say'],
    [`attimer(time=[makeTime(9,0)]) => @org.thingpedia.builtin.thingengine.builtin.say(message="it's 9am");`,
    `send me a message “it's 9am” every day at 9:00 AM`,//'
    'Say'],
    [`attimer(time=[$context.time.morning]) => @org.thingpedia.builtin.thingengine.builtin.say(message="it's the morning");`,
    `send me a message “it's the morning” every day at the morning`,//'
    'Say'],
    [`attimer(time=[$context.time.evening]) => @org.thingpedia.builtin.thingengine.builtin.say(message="it's the evening");`,
    `send me a message “it's the evening” every day at the evening`,//'
    'Say'],
    [`timer(base=makeDate(), interval=2h) => @org.thingpedia.builtin.thingengine.builtin.say(message="it's the evening");`,
    `send me a message “it's the evening” every 2 h`,//'
    'Say'],
    [`timer(base=makeDate(), interval=2h, frequency=2) => @org.thingpedia.builtin.thingengine.builtin.say(message="it's the evening");`,
    `send me a message “it's the evening” twice every 2 h`,//'
    'Say'],

    [`now => @com.xkcd.get_comic() => notify;`,
    'get an Xkcd comic and then notify you',
    'Xkcd ⇒ Notification'],
    [`now => @com.xkcd.get_comic(number=42) => notify;`,
    'get an Xkcd comic with number equal to 42 and then notify you',
    'Xkcd ⇒ Notification',],
    [`now => @com.xkcd.get_comic(number=$undefined) => notify;`,
    'get an Xkcd comic with number equal to ____ and then notify you',
    'Xkcd ⇒ Notification'],
    [`now => @com.xkcd.get_comic() => return;`,
    'get an Xkcd comic and then send it to me',
    'Xkcd ⇒ Notification'],
    [`monitor @com.xkcd.get_comic() => notify;`,
    'notify you when an Xkcd comic changes',
    'Xkcd ⇒ Notification'],
    [`monitor @com.xkcd.get_comic() => return;`,
    'send it to me when an Xkcd comic changes',
    'Xkcd ⇒ Notification'],

    [`now => @org.thingpedia.weather.current(location=$context.location.current_location) => notify;`,
    `get the current weather for here and then notify you`,
    'Weather ⇒ Notification'],
    [`now => @org.thingpedia.weather.current(location=$context.location.home) => notify;`,
    `get the current weather for at home and then notify you`,
    'Weather ⇒ Notification'],
    [`now => @org.thingpedia.weather.current(location=$context.location.work) => notify;`,
    `get the current weather for at work and then notify you`,
    'Weather ⇒ Notification'],
    [`now => @org.thingpedia.weather.current(location=makeLocation(37,-137)) => notify;`,
    `get the current weather for [Latitude: 37 deg, Longitude: -137 deg] and then notify you`,
    'Weather ⇒ Notification'],
    [`now => @org.thingpedia.weather.current(location=makeLocation(37,-137, "Somewhere")) => notify;`,
    `get the current weather for Somewhere and then notify you`,
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
    `get your recent Instagram pictures such that the caption is any of “foo”, “bar” and then notify you`,
    'Instagram ⇒ Notification'],
    [`now => @com.instagram.get_pictures(), contains(hashtags, "foo"^^tt:hashtag) => notify;`,
    `get your recent Instagram pictures such that the hashtags contain #foo and then notify you`,
    'Instagram ⇒ Notification'],

    [`now => @com.yandex.translate.translate(target_language="zh"^^tt:iso_lang_code, text="hello") => @com.facebook.post(status=$event);`,
    `get the translation of “hello” to zh and then post the result on Facebook`,
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
    `do the following: when an Xkcd comic changes, get the translation of the title to Chinese, and then post the result on Facebook`,
    'Xkcd ⇒ Yandex Translate ⇒ Facebook'],
    [`monitor (@com.xkcd.get_comic()) join @com.yandex.translate.translate(target_language="zh"^^tt:iso_lang_code("Chinese")) on (text=title) => notify;`,
    `do the following: when an Xkcd comic changes, get the translation of the title to Chinese, and then notify you`,
    'Xkcd ⇒ Yandex Translate ⇒ Notification'],
    [`monitor (@com.xkcd.get_comic(), title =~ "lol") join @com.yandex.translate.translate(target_language="zh"^^tt:iso_lang_code("Chinese")) on (text=title) => notify;`,
    'do the following: when an Xkcd comic changes if the title contains “lol”, get the translation of the title to Chinese, and then notify you',
    'Xkcd ⇒ Yandex Translate ⇒ Notification'],
    [`monitor (@com.xkcd.get_comic(), title =~ "lol") => notify;`,
    'notify you when an Xkcd comic changes if the title contains “lol”',
    'Xkcd ⇒ Notification'],
    [`monitor (@com.xkcd.get_comic(), title =~ "lol") => @com.facebook.post(status=link);`,
    `post the link on Facebook when an Xkcd comic changes if the title contains “lol”`,
    'Xkcd ⇒ Facebook'],
    [`monitor (@com.gmail.inbox(), contains(labels, "work")) => @com.facebook.post(status=snippet);`,
    `post the snippet on Facebook when the emails in your GMail inbox change if the labels contain “work”`,
    'Gmail ⇒ Facebook'],
    [`monitor (@com.gmail.inbox(), contains(labels, "work")) => @com.facebook.post(status=snippet);`,
    `post the snippet on Facebook when the emails in your GMail inbox change if the labels contain “work”`,
    'Gmail ⇒ Facebook'],
    [`monitor (@com.gmail.inbox(), !contains(labels, "work")) => @com.facebook.post(status=snippet);`,
    `post the snippet on Facebook when the emails in your GMail inbox change if the labels do not contain “work”`,
    'Gmail ⇒ Facebook'],

    ['monitor @com.twitter.home_timeline(), contains(hashtags, "funny") => @com.twitter.post(status=text);',
    'tweet the text when tweets from anyone you follow change if the hashtags contain “funny”',
    'Twitter ⇒ Twitter'],
    ['monitor @com.twitter.home_timeline(), text =~ "funny" => @com.twitter.post(status=text);',
    'tweet the text when tweets from anyone you follow change if the text contains “funny”',
    'Twitter ⇒ Twitter'],
    ['monitor @com.twitter.home_timeline(), !(text =~ "funny") => @com.twitter.post(status=text);',
    'tweet the text when tweets from anyone you follow change if the text does not contain “funny”',
    'Twitter ⇒ Twitter'],

    ['now => @uk.co.thedogapi.get() => notify;',
    'get dog pictures and then notify you', 'Thedogapi ⇒ Notification'],

    ['now => @org.thingpedia.builtin.thingengine.phone.sms() => notify;',
    'get your SMS and then notify you', 'Phone ⇒ Notification'],
    ['now => @org.thingpedia.builtin.thingengine.phone.set_ringer(mode=enum(vibrate));',
    'set your phone to vibrate', 'Phone'],

    ['now => (@com.bing.web_search() join @com.yandex.translate.translate(target_language="it"^^tt:iso_lang_code("Italian")) on (text=$event)) => notify;',
    'get websites matching ____ on Bing and the translation of the result to Italian and then notify you',
    'Bing ⇒ Yandex Translate ⇒ Notification'],
    ['monitor @com.bing.web_search() join @com.yandex.translate.translate(target_language="it"^^tt:iso_lang_code("Italian")) on (text=$event) => notify;',
    'do the following: when websites matching ____ on Bing change, get the translation of the result to Italian, and then notify you',
    'Bing ⇒ Yandex Translate ⇒ Notification'],

    [`monitor @com.yahoo.finance.get_stock_quote(stock_id="goog"^^tt:stock_id("Alphabet, Inc.")), ask_price >= makeCurrency(100, usd) => notify;`,
    'notify you when the stock price of Alphabet, Inc. changes if the ask price is greater than or equal to $100.00',
    'Yahoo Finance ⇒ Notification'],

    [`now => [ask_price] of @com.yahoo.finance.get_stock_quote(stock_id="goog"^^tt:stock_id("Alphabet, Inc.")) => notify;`,
    'get the ask price of the stock price of Alphabet, Inc. and then notify you',
    'Yahoo Finance ⇒ Notification'],

    [`now => [ask_price, bid_price] of @com.yahoo.finance.get_stock_quote(stock_id="goog"^^tt:stock_id("Alphabet, Inc.")) => notify;`,
    'get the ask price, bid price of the stock price of Alphabet, Inc. and then notify you',
    'Yahoo Finance ⇒ Notification'],

    [`now => aggregate avg file_size of @com.google.drive.list_drive_files() => notify;`,
    'get the average file size in files in your Google Drive and then notify you',
    'Google Drive ⇒ Notification'],
    [`now => aggregate min file_size of @com.google.drive.list_drive_files() => notify;`,
    'get the minimum file size in files in your Google Drive and then notify you',
    'Google Drive ⇒ Notification'],
    [`now => aggregate max file_size of @com.google.drive.list_drive_files() => notify;`,
    'get the maximum file size in files in your Google Drive and then notify you',
    'Google Drive ⇒ Notification'],
    [`now => aggregate sum file_size of @com.google.drive.list_drive_files() => notify;`,
    'get the sum of the file size in files in your Google Drive and then notify you',
    'Google Drive ⇒ Notification'],
    [`now => aggregate count file_size of @com.google.drive.list_drive_files() => notify;`,
    'get the number of file sizes in files in your Google Drive and then notify you',
    'Google Drive ⇒ Notification'],
    [`now => aggregate count file_name of @com.google.drive.list_drive_files() => notify;`,
    'get the number of file names in files in your Google Drive and then notify you',
    'Google Drive ⇒ Notification'],
    [`now => aggregate count of @com.google.drive.list_drive_files() => notify;`,
    'get the number of files in your Google Drive and then notify you',
    'Google Drive ⇒ Notification'],
    [`now => (sort file_size asc of @com.google.drive.list_drive_files())[1] => notify;`,
    'get the files in your Google Drive with the minimum file size and then notify you',
    'Google Drive ⇒ Notification'],
    [`now => (sort file_size desc of @com.google.drive.list_drive_files())[-1] => notify;`,
    'get the files in your Google Drive with the minimum file size and then notify you',
    'Google Drive ⇒ Notification'],
    [`now => (sort file_size desc of @com.google.drive.list_drive_files())[1] => notify;`,
    'get the files in your Google Drive with the maximum file size and then notify you',
    'Google Drive ⇒ Notification'],
    [`now => (sort file_size asc of @com.google.drive.list_drive_files())[-1] => notify;`,
    'get the files in your Google Drive with the maximum file size and then notify you',
    'Google Drive ⇒ Notification'],
    [`now => (sort file_size asc of @com.google.drive.list_drive_files())[-1:5] => notify;`,
    'get the 5 files in your Google Drive with the maximum file size and then notify you',
    'Google Drive ⇒ Notification'],
    [`now => (sort file_size asc of @com.google.drive.list_drive_files())[1:5] => notify;`,
    'get the 5 files in your Google Drive with the minimum file size and then notify you',
    'Google Drive ⇒ Notification'],
    [`now => (sort file_size asc of @com.google.drive.list_drive_files())[1:$?] => notify;`,
    'get the ____ files in your Google Drive with the minimum file size and then notify you',
    'Google Drive ⇒ Notification'],
    [`now => (sort file_size desc of @com.google.drive.list_drive_files())[1:$?] => notify;`,
    'get the ____ files in your Google Drive with the maximum file size and then notify you',
    'Google Drive ⇒ Notification'],
    [`now => @com.google.drive.list_drive_files()[1] => notify;`,
    'get the first files in your Google Drive and then notify you',
    'Google Drive ⇒ Notification'],
    [`now => @com.google.drive.list_drive_files()[-1] => notify;`,
    'get the last files in your Google Drive and then notify you',
    'Google Drive ⇒ Notification'],
    [`now => @com.google.drive.list_drive_files()[$?] => notify;`,
    'get the files in your Google Drive with index ____ and then notify you',
    'Google Drive ⇒ Notification'],
    [`now => @com.google.drive.list_drive_files()[1:$?] => notify;`,
    'get the first ____ files in your Google Drive and then notify you',
    'Google Drive ⇒ Notification'],
    [`now => @com.google.drive.list_drive_files()[-1:$?] => notify;`,
    'get the last ____ files in your Google Drive and then notify you',
    'Google Drive ⇒ Notification'],
    [`now => @com.google.drive.list_drive_files()[1:5] => notify;`,
    'get the first 5 files in your Google Drive and then notify you',
    'Google Drive ⇒ Notification'],
    [`now => @com.google.drive.list_drive_files()[-1:5] => notify;`,
    'get the last 5 files in your Google Drive and then notify you',
    'Google Drive ⇒ Notification'],
    [`now => @com.google.drive.list_drive_files()[2:5] => notify;`,
    'get 5 elements starting from 2 of the files in your Google Drive and then notify you',
    'Google Drive ⇒ Notification'],
    [`now => @com.google.drive.list_drive_files()[-2:5] => notify;`,
    'get 5 elements starting from -2 of the files in your Google Drive and then notify you',
    'Google Drive ⇒ Notification'],
    [`now => @com.google.drive.list_drive_files()[1, 2, 7] => notify;`,
    'get elements 1, 2, 7 of the files in your Google Drive and then notify you',
    'Google Drive ⇒ Notification'],

    [`now => [file_name] of sort file_size asc of @com.google.drive.list_drive_files() => notify;`,
    'get the file name of the files in your Google Drive sorted by increasing file size and then notify you',
    'Google Drive ⇒ Notification'],

    [`bookkeeping(yes);`,
    'yes', ''],

    [`bookkeeping(no);`,
    'no', ''],

    [`bookkeeping(nevermind);`,
    'cancel', ''],

    [`bookkeeping(commands(category="online-account"));`,
    'list the commands of ____, in category online-account', ''],

    [`bookkeeping(commands(device="com.twitter"^^tt:device, category="social-network"));`,
    'list the commands of com.twitter, in category social-network', ''],

    [`bookkeeping(commands(device="com.twitter"^^tt:device("Twitter"), category="social-network"));`,
    'list the commands of Twitter, in category social-network', ''],

    [`bookkeeping(answer(42));`,
    '42', ''],

    [`bookkeeping(choice(0));`,
    'choice number 1', ''],

    [`now => result(@com.thecatapi.get) => notify;`,
    'get the last cat picture and then notify you', 'Thecatapi ⇒ Notification'],
    [`now => result(@com.thecatapi.get[1]) => notify;`,
    'get the first cat picture and then notify you', 'Thecatapi ⇒ Notification'],
    [`now => result(@com.thecatapi.get[2]) => notify;`,
    'get the second cat picture and then notify you', 'Thecatapi ⇒ Notification'],
    [`now => result(@com.thecatapi.get[-2]) => notify;`,
    'get the second to last cat picture and then notify you', 'Thecatapi ⇒ Notification'],
    [`now => result(@com.thecatapi.get[3]) => notify;`,
    'get the third cat picture and then notify you', 'Thecatapi ⇒ Notification'],
    [`now => result(@com.thecatapi.get[-3]) => notify;`,
    'get the 3rd last cat picture and then notify you', 'Thecatapi ⇒ Notification'],
    [`now => result(@com.thecatapi.get[4]) => notify;`,
    'get the 4th cat picture and then notify you', 'Thecatapi ⇒ Notification'],
    [`now => result(@com.thecatapi.get[-4]) => notify;`,
    'get the 4th last cat picture and then notify you', 'Thecatapi ⇒ Notification'],
    [`now => @com.spotify.get_currently_playing() => @com.spotify.add_songs_to_playlist(songs=[song]);`,
    'get the currently playing track and then add the songs the song to the playlist ____', 'Spotify ⇒ Spotify'],
    [`attimer(time=$?) => @com.twitter.post();`,
    `tweet ____ every day at ____`, 'Twitter'],
    [`now => @com.twitter.post(status = $context.selection : String);`,
    `tweet the selection on the screen`, `Twitter`],

    ['now => @light-bulb.set_power();',
    'turn ____ your light bulb', 'Light Bulb'],
    ['now => @light-bulb(name="bedroom").set_power();',
    'turn ____ your “bedroom” light bulb', 'Light Bulb'],
    ['now => @light-bulb(name="bedroom", all=true).set_power();',
    'turn ____ all your “bedroom” light bulb', 'Light Bulb'],
    ['now => @light-bulb(all=true).set_power();',
    'turn ____ all your light bulb', 'Light Bulb'],

    [`monitor (@smoke-alarm.status()) => notify;`,
    'notify you when the status of your smoke alarm changes', 'Smoke Alarm ⇒ Notification'],
    [`monitor (@smoke-alarm(name="kitchen").status()) => notify;`,
    'notify you when the status of your “kitchen” smoke alarm changes', 'Smoke Alarm ⇒ Notification'],

    [`now => compute distance(geo, $context.location.current_location) of @org.schema.place() => notify;`,
    'get places and the distance between the geo and here and then notify you', 'Schema ⇒ Notification'],
    [`compute distance(geo, $context.location.current_location) of (timer(base=$?, interval=$?) join @org.schema.place()) => notify;`,
    'notify you every ____ starting ____, get places and the distance between the geo and here', 'Schema ⇒ Notification'],
];

const gettext = {
    locale: 'en-US',
    dgettext: (domain, msgid) => msgid,
    dngettext: (domain, msgid, msgid_plural, n) => n === 1 ? msgid : msgid_plural,
};

function test(i) {
    console.log('Test Case #' + (i+1));
    var [code, expected, expectedname] = TEST_CASES[i];

    return Grammar.parseAndTypecheck(code, schemaRetriever, true).then((prog) => {
        const describer = new Describe.Describer(gettext, 'en-US', 'America/Los_Angeles');
        let reconstructed = describer.describe(prog);
        if (expected !== reconstructed) {
            console.error('Test Case #' + (i+1) + ': does not match what expected');
            console.error('Expected: ' + expected);
            console.error('Generated: ' + reconstructed);
            if (process.env.TEST_MODE)
                throw new Error(`testDescribe ${i+1} FAILED`);
        }
        if (prog.isProgram) {
            let name = Describe.getProgramName(gettext, prog);
            if (name !== expectedname) {
                console.error('Test Case #' + (i+1) + ': does not match what expected');
                console.error('Expected: ' + expectedname);
                console.error('Generated: ' + name);
                if (process.env.TEST_MODE)
                    throw new Error(`testDescribe ${i+1} FAILED`);
            }
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
