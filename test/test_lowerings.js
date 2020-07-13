// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingTalk
//
// Copyright 2017-2019 The Board of Trustees of the Leland Stanford Junior University
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
"use strict";

const Q = require('q');
const assert = require('assert');

const AppGrammar = require('../lib/grammar_api');
const SchemaRetriever = require('../lib/schema');
const { prettyprint } = require('../lib/prettyprint');

const _mockSchemaDelegate = require('./mock_schema_delegate');
const _mockMemoryClient = require('./mock_memory_client');
const schemaRetriever = new SchemaRetriever(_mockSchemaDelegate, _mockMemoryClient, true);

const TEST_CASES = [
    ['now => @security-camera.current_event() => return;',
    'now => @security-camera.current_event() => notify;', []],

    [`executor = "1234"^^tt:contact : now => @security-camera.current_event() => return;`,
     `executor = "1234"^^tt:contact : {\n` +
     `  class @__dyn_0 extends @org.thingpedia.builtin.thingengine.remote {\n` +
     `    action send(in req __principal: Entity(tt:contact),\n` +
     `                in req __program_id: Entity(tt:program_id),\n` +
     `                in req __flow: Number,\n` +
     `                in req __kindChannel: Entity(tt:function),\n` +
     `                in opt __response: String,\n` +
     `                in req start_time: Date,\n` +
     `                in req has_sound: Boolean,\n` +
     `                in req has_motion: Boolean,\n` +
     `                in req has_person: Boolean,\n` +
     `                in req picture_url: Entity(tt:picture));\n` +
     `  }\n` +
     `  now => @security-camera.current_event() => @__dyn_0.send(__principal="mock-account:12345678"^^tt:contact("me"), __program_id=$event.program_id, __flow=0, __kindChannel=$event.type, start_time=start_time, has_sound=has_sound, has_motion=has_motion, has_person=has_person, picture_url=picture_url);\n` +
    `}`,
    [`class @__dyn_0 extends @org.thingpedia.builtin.thingengine.remote {\n` +
     `  monitorable list query receive(in req __principal: Entity(tt:contact),\n` +
     `                                 in req __program_id: Entity(tt:program_id),\n` +
     `                                 in req __flow: Number,\n` +
     `                                 out __kindChannel: Entity(tt:function),\n` +
     `                                 out __response: String,\n` +
     `                                 out start_time: Date,\n` +
     `                                 out has_sound: Boolean,\n` +
     `                                 out has_motion: Boolean,\n` +
     `                                 out has_person: Boolean,\n` +
     `                                 out picture_url: Entity(tt:picture));\n` +
     `}\n` +
     `monitor (@__dyn_0.receive(__principal="1234"^^tt:contact, __program_id=$event.program_id, __flow=0)) => notify;`]],

    [`executor = "1234"^^tt:contact : now => @com.bing.web_search(query="lol") => return;`,
     `executor = "1234"^^tt:contact : {\n` +
     `  class @__dyn_0 extends @org.thingpedia.builtin.thingengine.remote {\n` +
     `    action send(in req __principal: Entity(tt:contact),\n` +
     `                in req __program_id: Entity(tt:program_id),\n` +
     `                in req __flow: Number,\n` +
     `                in req __kindChannel: Entity(tt:function),\n` +
     `                in opt __response: String,\n` +
     `                in req title: String,\n` +
     `                in req description: String,\n` +
     `                in req link: Entity(tt:url));\n` +
     `  }\n` +
     `  now => @com.bing.web_search(query="lol") => @__dyn_0.send(__principal="mock-account:12345678"^^tt:contact("me"), __program_id=$event.program_id, __flow=0, __kindChannel=$event.type, title=title, description=description, link=link);\n` +
     `}`,
    [`class @__dyn_0 extends @org.thingpedia.builtin.thingengine.remote {\n` +
     `  monitorable list query receive(in req __principal: Entity(tt:contact),\n` +
     `                                 in req __program_id: Entity(tt:program_id),\n` +
     `                                 in req __flow: Number,\n` +
     `                                 out __kindChannel: Entity(tt:function),\n` +
     `                                 out __response: String,\n` +
     `                                 out title: String,\n` +
     `                                 out description: String,\n` +
     `                                 out link: Entity(tt:url));\n` +
     `}\n` +
     `monitor (@__dyn_0.receive(__principal="1234"^^tt:contact, __program_id=$event.program_id, __flow=0)) => notify;`]],

    [`executor = "1234"^^tt:contact : monitor @security-camera.current_event() => return;`,
     `executor = "1234"^^tt:contact : {\n` +
     `  class @__dyn_0 extends @org.thingpedia.builtin.thingengine.remote {\n` +
     `    action send(in req __principal: Entity(tt:contact),\n` +
     `                in req __program_id: Entity(tt:program_id),\n` +
     `                in req __flow: Number,\n` +
     `                in req __kindChannel: Entity(tt:function),\n` +
     `                in opt __response: String,\n` +
     `                in req start_time: Date,\n` +
     `                in req has_sound: Boolean,\n` +
     `                in req has_motion: Boolean,\n` +
     `                in req has_person: Boolean,\n` +
     `                in req picture_url: Entity(tt:picture));\n` +
     `  }\n` +
     `  monitor (@security-camera.current_event()) => @__dyn_0.send(__principal="mock-account:12345678"^^tt:contact("me"), __program_id=$event.program_id, __flow=0, __kindChannel=$event.type, start_time=start_time, has_sound=has_sound, has_motion=has_motion, has_person=has_person, picture_url=picture_url);\n` +
     `}`,
    [`class @__dyn_0 extends @org.thingpedia.builtin.thingengine.remote {\n` +
     `  monitorable list query receive(in req __principal: Entity(tt:contact),\n` +
     `                                 in req __program_id: Entity(tt:program_id),\n` +
     `                                 in req __flow: Number,\n` +
     `                                 out __kindChannel: Entity(tt:function),\n` +
     `                                 out __response: String,\n` +
     `                                 out start_time: Date,\n` +
     `                                 out has_sound: Boolean,\n` +
     `                                 out has_motion: Boolean,\n` +
     `                                 out has_person: Boolean,\n` +
     `                                 out picture_url: Entity(tt:picture));\n` +
     `}\n` +
     `monitor (@__dyn_0.receive(__principal="1234"^^tt:contact, __program_id=$event.program_id, __flow=0)) => notify;`]],

];

var _mockMessaging = {
    getSelf(sendTo) {
        assert.strictEqual(sendTo, '1234');
        return 'mock-account:12345678';
    }
};

function safePrettyprint(prog) {
    if (prog === undefined)
        return 'undefined';
    if (prog === null)
        return 'null';
    return prettyprint(prog, true).replace(/__token="[^"]+"/g, `__token="XXXXXXXX"`).trim();
}

function test(i) {
    console.log('Test Case #' + (i+1));
    let [testCase, expectedLowered, expectedSend] = TEST_CASES[i];

    return AppGrammar.parseAndTypecheck(testCase, schemaRetriever).then((prog) => {
        let newprogram = prog;
        let sendprograms = prog.lowerReturn(_mockMessaging);

        newprogram = safePrettyprint(newprogram);
        if (newprogram !== expectedLowered) {
            console.error('Test Case #' + (i+1) + ': lowered program does not match what expected');
            console.error('Expected: ' + expectedLowered);
            console.error('Generated: ' + newprogram);
        }
        AppGrammar.parse(newprogram);

        for (let j = 0; j < Math.max(sendprograms.length, expectedSend.length); j++) {
            let tt = safePrettyprint(sendprograms[j]);
            AppGrammar.parse(tt);
            let expectedTT = expectedSend[j] || 'undefined';
            if (tt !== expectedTT) {
                console.error('Test Case #' + (i+1) + ': program to send does not match what expected');
                console.error('Expected: ' + expectedTT);
                console.error('Generated: ' + tt);
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

function loop(i) {
    if (i === TEST_CASES.length)
        return Q();

    return Q(test(i)).then(() => loop(i+1));
}
function main() {
    return loop(0);
}
module.exports = main;
if (!module.parent)
    main();
