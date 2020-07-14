// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingTalk
//
// Copyright 2018-2020 The Board of Trustees of the Leland Stanford Junior University
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
"use strict";

const assert = require('assert');
const Q = require('q');
Q.longStackSupport = true;

const Grammar = require('../lib/grammar_api');
const SchemaRetriever = require('../lib/schema');

const { prettyprint } = require('../lib/prettyprint');
const { fromManifest, toManifest } = require('../lib/ast/api');
const _mockSchemaDelegate = require('./mock_schema_delegate');
const schemaRetriever = new SchemaRetriever(_mockSchemaDelegate, null, true);

const TEST_CASES = [
    'class @com.foo\n' +
    '#_[name="Foo"]\n' +
    '#_[description="This is Foo"] {\n' +
    '  import loader from @org.thingpedia.v2();\n' +
    '  import config from @org.thingpedia.config.form(params=new ArgMap(url:Entity(tt:url),password:Entity(tt:password)));\n' +
    '\n' +
    '  monitorable query get_power(out power: Enum(on,off))\n' +
    '  #_[canonical="power status of foo"]\n' +
    '  #_[confirmation="status of foo"]\n' +
    '  #_[formatted=["Here is something for you", {type="rdl",displayTitle="$title",webCallback="$url"}]]\n' +
    '  #[poll_interval=600000ms];\n' +
    '\n' +
    '  action set_power(in req power: Enum(on,off) #_[prompt="do you want turn on or off?"])\n' +
    '  #_[canonical="set power of foo"]\n' +
    '  #_[confirmation="turn $power foo"];\n' +
    '}\n',

    'class @com.foo {\n' +
    '  import loader from @org.thingpedia.v2();\n' +
    '  import config from @org.thingpedia.config.oauth2(client_id="xxx", client_secret="yyy");\n' +
    '}\n',

    'class @com.foo {\n' +
    '  import loader from @org.thingpedia.v2();\n' +
    '  import config from @org.thingpedia.config.custom_oauth();\n' +
    '}\n',

    'class @com.foo {\n' +
    '  import loader from @org.thingpedia.v2();\n' +
    '  import config from @org.thingpedia.config.basic_auth();\n' +
    '}\n',

    'class @com.foo {\n' +
    '  import loader from @org.thingpedia.v2();\n' +
    '  import config from @org.thingpedia.config.basic_auth(extra_params=new ArgMap(serial_number:String));\n' +
    '}\n',

    'class @com.foo {\n' +
    '  import loader from @org.thingpedia.v2();\n' +
    '  import config from @org.thingpedia.config.interactive();\n' +
    '}\n',

    'class @com.foo {\n' +
    '  import loader from @org.thingpedia.v2();\n' +
    '  import config from @org.thingpedia.config.builtin();\n' +
    '}\n',

    'class @com.foo {\n' +
    '  import loader from @org.thingpedia.v2();\n' +
    '  import config from @org.thingpedia.config.none();\n' +
    '}\n',

    'class @com.foo\n' +
    '#[version=1] {\n' +
    '  import loader from @org.thingpedia.v2();\n' +
    '  import config from @org.thingpedia.config.none();\n' +
    '}\n',

    'class @com.foo extends @com.twitter, @com.facebook {\n' +
    '  import loader from @org.thingpedia.v2();\n' +
    '  import config from @org.thingpedia.config.none();\n' +
    '}\n',

    'class @com.foo extends @com.twitter\n' +
    '#[child_types=["com.facebook"]] {\n' +
    '  import loader from @org.thingpedia.v2();\n' +
    '  import config from @org.thingpedia.config.none();\n' +
    '}\n',

    'class @com.foo {\n' +
    '  import loader from @org.thingpedia.v2();\n' +
    '  import config from @org.thingpedia.config.form(params=new ArgMap(url:Entity(tt:url),text:String));\n' +
    '}\n',

    'class @com.foo {\n' +
    '  import loader from @org.thingpedia.v2();\n' +
    '  import config from @org.thingpedia.config.form(params=new ArgMap(email:Entity(tt:email_address),text:String));\n' +
    '}\n',

    'class @com.foo {\n' +
    '  import loader from @org.thingpedia.v2();\n' +
    '  import config from @org.thingpedia.config.form(params=new ArgMap(number:Entity(tt:phone_number),text:String));\n' +
    '}\n',

    {
      kind: 'com.foo',
      module_type: 'org.thingpedia.v2',
      types: [],
      child_types: [],
      category: 'data',
      params: {},
      auth: {
        type: 'none'
      },
      queries: {},
      actions: {},
      version: 0
    },

    {
      kind: 'com.foo',
      module_type: 'org.thingpedia.v2',
      types: [],
      child_types: [],
      category: 'online',
      params: {
        'url': ['url', 'text']
      },
      auth: {
        type: 'none'
      },
      queries: {},
      actions: {},
      version: 0
    },

    {
      kind: 'com.foo',
      module_type: 'org.thingpedia.v2',
      types: [],
      child_types: [],
      category: 'online',
      params: {
        'address': ['address', 'email']
      },
      auth: {
        type: 'none'
      },
      queries: {},
      actions: {},
      version: 0
    },

    {
      kind: 'com.foo',
      module_type: 'org.thingpedia.v2',
      types: [],
      child_types: [],
      category: 'online',
      params: {
        'number': ['number', 'tel']
      },
      auth: {
        type: 'none'
      },
      queries: {},
      actions: {},
      version: 0
    },

    {
        kind: 'com.foo',
        module_type: 'org.thingpedia.v2',
        types: [],
        child_types: [],
        category: 'online',
        params: {},
        auth: {
            type: 'basic'
        },
        queries: {},
        actions: {},
        version: 0
    },

    {
        kind: 'com.foo',
        module_type: 'org.thingpedia.v2',
        types: [],
        child_types: [],
        category: 'online',
        params: {
            'serial_number': ['serial number', 'text']
        },
        auth: {
            type: 'basic'
        },
        queries: {},
        actions: {},
        version: 0
    },

    {
      kind: 'com.foo',
      module_type: 'org.thingpedia.generic_rest.v1',
      types: [],
      child_types: [],
      category: 'data',
      params: {
      },
      auth: {
        type: 'none'
      },
      queries: {
        foo: {
            args: [{
                name: 'output',
                type: 'String',
                is_input: false,
                required: false,
                question: '',
                json_key: 'output_key'
            }],
            canonical: 'foo',
            confirmation: 'foo',
            doc: 'foo',
            formatted: [],
            is_list: false,
            poll_interval: -1,
            minimal_projection: [],
            json_key: 'data'
        }
      },
      actions: {},
      version: 0
    },

    'class @org.thingpedia.bluetooth.speaker.a2dp {\n' +
    '  import loader from @org.thingpedia.v2();\n' +
    '  import config from @org.thingpedia.config.discovery.bluetooth(uuids=["0000110b-0000-1000-8000-00805f9b34fb"]);\n' +
    '}\n',

    {
      kind: 'org.thingpedia.bluetooth.speaker.a2dp',
      module_type: 'org.thingpedia.v2',
      types: ['bluetooth-uuid-0000110b-0000-1000-8000-00805f9b34fb'],
      child_types: [],
      category: 'physical',
      params: {
      },
      auth: {
        type: 'discovery',
        discoveryType: 'bluetooth'
      },
      queries: {},
      actions: {},
      version: 0
    },

    'class @org.thingpedia.bluetooth.foo {\n' +
    '  import loader from @org.thingpedia.v2();\n' +
    '  import config from @org.thingpedia.config.discovery.bluetooth(uuids=[], device_class=enum(computer));\n' +
    '}\n',

    {
      kind: 'org.thingpedia.bluetooth.foo',
      module_type: 'org.thingpedia.v2',
      types: ['bluetooth-class-computer'],
      child_types: [],
      category: 'physical',
      params: {
      },
      auth: {
        type: 'discovery',
        discoveryType: 'bluetooth'
      },
      queries: {},
      actions: {},
      version: 0
    },

    'class @com.lg.tv.webos2 {\n' +
    '  import loader from @org.thingpedia.v2();\n' +
    '  import config from @org.thingpedia.config.discovery.upnp(search_target=["urn:lge-com-service-webos-second-screen-1"]);\n' +
    '}\n',

    {
      kind: 'com.lg.tv.webos2',
      module_type: 'org.thingpedia.v2',
      types: ['upnp-lge-com-service-webos-second-screen-1'],
      child_types: [],
      category: 'physical',
      params: {
      },
      auth: {
        type: 'discovery',
        discoveryType: 'upnp'
      },
      queries: {},
      actions: {},
      version: 0
    },

    'class @foo {\n' +
    '  import loader from @org.thingpedia.v2();\n' +
    '  import config from @org.thingpedia.config.none();\n' +
    '\n' +
    '  query bar(out title: String,\n' +
    '            out description: String,\n' +
    '            out url: Entity(tt:url) #[unique=true])\n' +
    '  #_[canonical="foo"]\n' +
    '  #_[confirmation="bar"]\n' +
    '  #[require_filter=true]\n' +
    '  #[default_projection=["title", "description"]];\n' +
    '}\n',

];

async function test(i) {
    console.log('Test Case #' + (i+1));
    let tt = TEST_CASES[i];

    try {
        if (typeof tt === 'string') {
            const meta = await Grammar.parseAndTypecheck(tt, schemaRetriever, false);
            let manifest_from_tt = toManifest(meta);
            let generated = prettyprint(fromManifest(meta.classes[0].kind, manifest_from_tt));
            if (tt !== generated) {
                console.error('Test Case #' + (i+1) + ': does not match what expected');
                console.error('Expected: ' + tt);
                console.error('Generated: ' + generated);
            }
        } else {
            const tt_from_manifest = fromManifest(tt.kind, tt);
            await Grammar.parseAndTypecheck(tt_from_manifest.prettyprint(), schemaRetriever, false);
            const generated = toManifest(tt_from_manifest);
            generated.kind = tt.kind;
            assert.deepStrictEqual(generated, tt);
        }
    } catch(e) {
        console.error('Test Case #' + (i+1) + ': failed with exception');
        console.error('Error: ' + e.message);
        console.error(e.stack);
        if (process.env.TEST_MODE)
            throw e;
    }
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
