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


import { LocalCVC4Solver as CVC4Solver } from 'smtlib';

import * as Ast from '../lib/ast';
import * as Grammar from '../lib/syntax_api';
import Compiler from '../lib/compiler';
import SchemaRetriever from '../lib/schema';
import PermissionChecker from '../lib/permission_checker';

import _mockSchemaDelegate from './mock_schema_delegate';
const schemaRetriever = new SchemaRetriever(_mockSchemaDelegate, null, true);

const TEST_CASES = [
    [`now => @com.facebook.post(status="this is really funny lol");`,
      true, { transform: false }],
    [`now => @com.facebook.post(status="this is sad");`,
      null, { transform: false }],
    [`now => @com.facebook.post(status=$undefined);`,
      true, { transform: false }],

    [`now => @com.facebook.post(status="this is really funny lol");`,
     `@com.facebook.post(status="this is really funny lol");`],

    [`now => @com.facebook.post(status="this is totally not funny");`, null],

    [`now => @com.twitter.search(), text =~ "funny lol" => @com.facebook.post(status=text);`,
     `@com.twitter.search() filter text =~ "funny lol" => @com.facebook.post(status=text);`],

    [`now => @com.twitter.search() => @com.facebook.post(status=text);`,
     `@com.twitter.search() filter in_array~(text, ["https://www.wsj.com", "https://www.washingtonpost.com"]) || text =~ "funny" && text =~ "lol" => @com.facebook.post(status=text);`],

    [`now => @com.bing.web_search(query="cats") => @com.facebook.post(status=description);`,
     `@com.bing.web_search(query="cats") filter description =~ "funny" && description =~ "lol" || in_array~(description, ["https://www.wsj.com", "https://www.washingtonpost.com"]) || description =~ "cat" => @com.facebook.post(status=description);`],

    [`monitor(@security-camera.current_event(), has_person == true) => notify;`,
    `monitor(@security-camera.current_event() filter any(@org.thingpedia.builtin.thingengine.builtin.get_gps() filter location == new Location(1, 2)) && has_person == true);`],

    // the program should be rejected because there is no rule that allows builtin.get_gps()
    [`monitor (@security-camera.current_event(), (has_person == true && any(@org.thingpedia.builtin.thingengine.builtin.get_gps(), location == new Location(1, 2))))  => notify;`,
     null],

    [`now => @org.thingpedia.builtin.thingengine.builtin.get_gps() => notify;`, null],

    [`now => @thermostat.get_temperature() => notify;`,
     `@thermostat.get_temperature() filter any(@com.xkcd.get_comic(number=10) filter title =~ "lol");`],

    // this test case does not work because we add the filter outside as stream filter which no longer exists
    //[`attimer(time=[new Time(10,30)]) => @thermostat.get_temperature() => notify;`,
    // `attimer(time=[new Time(10, 30)]) => @thermostat.get_temperature(), any(@com.xkcd.get_comic(number=10), title =~ "lol") => notify;`],

    [`now => @com.lg.tv.webos2.set_power(power=enum(on));`, null],

    [`class @__dyn_0 extends @org.thingpedia.builtin.thingengine.remote {\n` +
     `    action send (in req __principal : Entity(tt:contact), in req __program_id : Entity(tt:program_id), in req __flow : Number, in req __kindChannel : Entity(tt:function), in req media_id : Entity(instagram:media_id), in req picture_url : Entity(tt:picture), in req caption : String, in req link : Entity(tt:url), in req filter_ : Entity(com.instagram:filter_), in req hashtags : Array(Entity(tt:hashtag)), in req location : Location);\n` +
     `}\n` +
     `  now => @com.instagram.get_pictures() => @__dyn_0.send(__principal="matrix-account:@rayx6:matrix.org"^^tt:contact, __program_id=$program_id, __flow=0, __kindChannel=$type, media_id=media_id, picture_url=picture_url, caption=caption, link=link, filter_=filter_, hashtags=hashtags, location=location);\n`,

     `class @__dyn_0 extends @org.thingpedia.builtin.thingengine.remote {
  action send(in req __principal : Entity(tt:contact),
              in req __program_id : Entity(tt:program_id),
              in req __flow : Number,
              in req __kindChannel : Entity(tt:function),
              in req media_id : Entity(instagram:media_id),
              in req picture_url : Entity(tt:picture),
              in req caption : String,
              in req link : Entity(tt:url),
              in req filter_ : Entity(com.instagram:filter_),
              in req hashtags : Array(Entity(tt:hashtag)),
              in req location : Location)
  #[minimal_projection=[]];
}
@com.instagram.get_pictures() filter caption =~ "trip" => @__dyn_0.send(__flow=0, __kindChannel=$type, __principal="matrix-account:@rayx6:matrix.org"^^tt:contact, __program_id=$program_id, caption=caption, filter_=filter_, hashtags=hashtags, link=link, location=location, media_id=media_id, picture_url=picture_url);`]

    /*[`monitor @thermostat.get_temperature(), @com.xkcd.get_comic(number=10) { title =~ "lol" }  => notify;`,
    `@thermostat.temperature(), @xkcd.get_comic(number=10) { title =~ "lol" }  => notify;`],

    [`monitor @thermostat.get_temperature(), @xkcd.get_comic(number=11) { title =~ "lol" }  => notify;`,
    `AlmondGenerated() {
    @thermostat.temperature(), (@xkcd.get_comic(number=11) { title =~ "lol" } && @xkcd.get_comic(number=10) { title =~ "lol" })  => notify;
}`],

    [`monitor @thermostat.get_temperature(), @xkcd.get_comic() { title =~ "lol" }  => notify;`,
    `AlmondGenerated() {
    @thermostat.temperature(), (@xkcd.get_comic() { title =~ "lol" } && @xkcd.get_comic(number=10) { title =~ "lol" })  => notify;
}`],

    [`monitor @thermostat.get_humidity(), @xkcd.get_comic() { title =~ "lol" }  => notify;
}`, `AlmondGenerated() {
    @thermostat.humidity(), @xkcd.get_comic() { title =~ "lol" }  => notify;
}`]*/
];

async function promiseLoop(array, fn) {
    for (let i = 0; i < array.length; i++)
        await fn(array[i], i);
}

const PERMISSION_DATABASE = [
    `$policy { true : @com.gmail.inbox, sender_address == "bob@stanford.edu"^^tt:email_address => *; }`,
    `$policy { true : * => @org.thingpedia.builtin.thingengine.builtin.say; }`,
    `$policy { true : * => @com.facebook.post, status =~ "funny" && status =~ "lol"; }`,
    `$policy { true : * => @com.facebook.post, status =~ "https://www.wsj.com" || status =~ "https://www.washingtonpost.com"; }`,
    `$policy { true : * => @com.twitter.post, status =~ "funny"; }`,
    `$policy { true : @com.bing.web_search, query == "cats" && description =~ "cat" => *; }`,
    `$policy { true : @com.bing.web_search, query == "dogs" && description =~ "dog" => *; }`,
    `$policy { true : * => @thermostat.set_target_temperature, value >= 70F && value <= 75F; }`,
    `$policy { true : * => @com.lg.tv.webos2.set_power, power == enum(off); }`,
    `$policy { $source == "mom@stanford.edu"^^tt:contact : * => @com.lg.tv.webos2.set_power, power == enum(on); }`,
    `$policy { true : @com.xkcd.get_comic => *; }`,

    `$policy { true : @security-camera.current_event filter any(@org.thingpedia.builtin.thingengine.builtin.get_gps() filter location == new Location(1,2)) => notify; }`,
    `$policy { true : @thermostat.get_temperature filter any(@com.xkcd.get_comic(number=10) filter title =~ "lol") => notify; }`,
    `$policy { true : @thermostat.get_humidity filter any(@com.xkcd.get_comic() filter title =~ "lol") => notify; }`,

    '$policy { true : @com.instagram.get_pictures, caption =~ "trip" => notify; }',
];

class MockGroupDelegate {
    async getGroups(principal) {
        switch (principal) {
        case 'omlet-messaging:testtesttest':
            return ['omlet-feed:family', 'role:mom'];
        case 'omlet-messaging:sistertest':
            return ['omlet-feed:family', 'role:sister'];
        case 'omlet-messaging:strangertext':
            return [];
        default:
            return [];
        }
    }
}

export default async function main() {
    let checker = new PermissionChecker(CVC4Solver, schemaRetriever, new MockGroupDelegate());

    await Promise.all(PERMISSION_DATABASE.map((a, i) => {
        console.log('Parsing rule ', i+1);
        return checker.allowed(Grammar.parse(a));
    }));

    const principal = new Ast.Value.Entity('omlet-messaging:testtesttest', 'tt:contact', null);

    return promiseLoop(TEST_CASES, ([input, expected, options], i) => {
        console.error('Test case #' + (i+1));
        //console.log('Checking program');
        //console.log(input);
        return checker.check(principal, Grammar.parse(input), options).then((prog) => {
            if (prog) {
                console.log('Program accepted');
                let code = typeof prog === 'boolean' ? prog : prog.prettyprint(true);
                if (code !== expected) {
                    console.error('Test case #' + (i+1) + ' FAIL');
                    console.error('Program does not match what expected');
                    console.error('Expected:');
                    console.error(expected);
                    console.error('Generated:');
                    console.error(code);
                    if (process.env.TEST_MODE)
                        throw new Error(`testPermissions ${i+1} FAILED`);
                } else {
                    console.error('Test case #' + (i+1) + ' PASS');
                    console.error('Program matches what expected');
                }

                if (typeof prog !== 'boolean') {
                    let compiler = new Compiler(schemaRetriever);
                    return compiler.compileProgram(prog);
                }
            } else if (expected !== null) {
                console.error('Test case #' + (i+1) + ' FAIL');
                console.error('Program rejected unexpectedly');
                if (process.env.TEST_MODE)
                    throw new Error(`testPermissions ${i+1} FAILED`);
            } else {
                console.error('Test case #' + (i+1) + ' PASS');
                console.error('Program rejected as expected');
            }

            // quiet eslint
            return Promise.resolve();
        });
    });
}
if (!module.parent)
    main();
