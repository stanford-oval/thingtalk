// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingTalk
//
// Copyright 2018-2019 The Board of Trustees of the Leland Stanford Junior University
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
// Author: Giovanni Campagna <gcampagna@cs.stanford.edu>
"use strict";

// Unit tests for SchemaRetriever

const assert = require('assert');

const SchemaRetriever = require('../lib/schema').default;
const Grammar = require('../lib/grammar_api');
const { ClassDef } = require('../lib/ast/class_def');

const _mockSchemaDelegate = require('./mock_schema_delegate');
const _mockMemoryClient = require('./mock_memory_client');

const FAKE_TWITTER = `class @com.twitter {
    import loader from @org.thingpedia.v2();

    monitorable list query fake_query(in req fake_argument : String)
    #[poll_interval=1min]
    #[formatted=["foo"]];
}`;

async function testInjectManifest() {
    const manifest = require('./com.xkcd.json');

    let schemaRetriever = new SchemaRetriever(_mockSchemaDelegate,
                                              _mockMemoryClient);

    schemaRetriever.injectClass(ClassDef.fromManifest('com.xkcd', manifest));

    assert.deepStrictEqual((await schemaRetriever.getFullSchema('com.xkcd')).prettyprint(), `class @com.xkcd
#[version=91] {
  import loader from @org.thingpedia.v2();
  import config from @org.thingpedia.config.none();

  monitorable query get_comic(in opt number: Number
                              #_[prompt="What Xkcd comic do you want?"],
                              out title: String,
                              out picture_url: Entity(tt:picture),
                              out link: Entity(tt:url),
                              out alt_text: String)
  #_[canonical="xkcd comic"]
  #_[confirmation="an Xkcd comic"]
  #_[formatted=[{type="rdl", webCallback="${'${link}'}", displayTitle="${'${title}'}"}, {type="picture", url="${'${picture_url}'}"}, {type="text", text="${'${alt_text}'}"}]]
  #[poll_interval=86400000ms]
  #[doc="retrieve the comic with a given number, or the latest comit"]
  #[minimal_projection=[]];

  query random_comic(out number: Number,
                     out title: String,
                     out picture_url: Entity(tt:picture),
                     out link: Entity(tt:url),
                     out alt_text: String)
  #_[canonical="random xkcd comic"]
  #_[confirmation="a random Xkcd comic"]
  #_[formatted=[{type="rdl", webCallback="${'${link}'}", displayTitle="${'${title}'}"}, {type="picture", url="${'${picture_url}'}"}, {type="text", text="${'${alt_text}'}"}]]
  #[doc="retrieve a random xkcd"]
  #[minimal_projection=[]];

  monitorable list query what_if(out title: String,
                                 out link: Entity(tt:url),
                                 out updated_time: Date)
  #_[canonical="xkcd what if blog posts"]
  #_[confirmation="Xkcd's What If blog posts"]
  #_[formatted=[{type="rdl", webCallback="${'${link}'}", displayTitle="${'${title}'}"}]]
  #[poll_interval=86400000ms]
  #[doc="retrieve the latest posts on Xkcd's What If blog"]
  #[minimal_projection=[]];
}
`
    );

    const fakeTwitter = (await Grammar.parseAndTypecheck(FAKE_TWITTER, schemaRetriever)).classes[0];
    schemaRetriever.injectClass(fakeTwitter);

    assert.deepStrictEqual((await schemaRetriever.getSchemaAndNames('com.twitter', 'query', 'fake_query')).prettyprint(),
        `monitorable list query fake_query(in req fake_argument: String)\n` +
        `  #[poll_interval=1min]\n` +
        `  #[formatted=["foo"]]\n` +
        `  #[minimal_projection=[]];`);
}

async function testInvalid() {
    const schemaRetriever = new SchemaRetriever(_mockSchemaDelegate,
                                                _mockMemoryClient);

    await assert.rejects(async () => {
        await schemaRetriever.getSchemaAndNames('org.thingpedia.nonexistent', 'query', 'foo');
    }, (e) => {
        return e.message === 'Invalid kind org.thingpedia.nonexistent';
    });
}

async function main()   {
    await testInjectManifest();
    await testInvalid();
}
module.exports = main;
if (!module.parent)
    main();
