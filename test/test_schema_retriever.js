// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingTalk
//
// Copyright 2018 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Giovanni Campagna <gcampagna@cs.stanford.edu>
//
// See COPYING for details
"use strict";

// Unit tests for SchemaRetriever

const assert = require('assert');

const SchemaRetriever = require('../lib/schema');
const Grammar = require('../lib/grammar_api');

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

    schemaRetriever.injectManifest('com.xkcd', manifest);

    assert.deepStrictEqual((await schemaRetriever.getFullSchema('com.xkcd')).prettyprint(), `class @com.xkcd
#[version=91] {
  import loader from @org.thingpedia.v2();
  import config from @org.thingpedia.config.none();

  monitorable query get_comic(in opt number: Number #_[prompt="What Xkcd comic do you want?"],
                              out title: String,
                              out picture_url: Entity(tt:picture),
                              out link: Entity(tt:url),
                              out alt_text: String)
  #_[canonical="xkcd comic"]
  #_[confirmation="an Xkcd comic"]
  #_[formatted=[{type="rdl",webCallback="${'${link}'}",displayTitle="${'${title}'}"}, {type="picture",url="${'${picture_url}'}"}, {type="text",text="${'${alt_text}'}"}]]
  #[poll_interval=86400000ms]
  #[doc="retrieve the comic with a given number, or the latest comit"];

  query random_comic(out number: Number,
                     out title: String,
                     out picture_url: Entity(tt:picture),
                     out link: Entity(tt:url),
                     out alt_text: String)
  #_[canonical="random xkcd comic"]
  #_[confirmation="a random Xkcd comic"]
  #_[formatted=[{type="rdl",webCallback="${'${link}'}",displayTitle="${'${title}'}"}, {type="picture",url="${'${picture_url}'}"}, {type="text",text="${'${alt_text}'}"}]]
  #[doc="retrieve a random xkcd"];

  monitorable list query what_if(out title: String,
                                 out link: Entity(tt:url),
                                 out updated_time: Date)
  #_[canonical="xkcd what if blog posts"]
  #_[confirmation="Xkcd's What If blog posts"]
  #_[formatted=[{type="rdl",webCallback="${'${link}'}",displayTitle="${'${title}'}"}]]
  #[poll_interval=86400000ms]
  #[doc="retrieve the latest posts on Xkcd's What If blog"];
}
`
    );

    const fakeTwitter = (await Grammar.parseAndTypecheck(FAKE_TWITTER, schemaRetriever)).classes[0];
    schemaRetriever.injectClass(fakeTwitter);

    assert.deepStrictEqual((await schemaRetriever.getSchemaAndNames('com.twitter', 'query', 'fake_query')).prettyprint(), `monitorable list query fake_query(in req fake_argument: String)\n  #[poll_interval=1min]\n  #[formatted=["foo"]];`);
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
