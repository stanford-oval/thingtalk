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


// Unit tests for SchemaRetriever

import assert from 'assert';
import * as util from 'util';
import * as fs from 'fs';

import SchemaRetriever from '../lib/schema';
import * as Ast from '../lib/ast';
import * as Grammar from '../lib/syntax_api';

import _mockSchemaDelegate from './mock_schema_delegate';
import _mockMemoryClient from './mock_memory_client';

const FAKE_TWITTER = `class @com.twitter {
    import loader from @org.thingpedia.v2();

    monitorable list query fake_query(in req fake_argument : String)
    #[poll_interval=1min]
    #[formatted=["foo"]];
}`;

async function testBasic() {
    let schemaRetriever = new SchemaRetriever(_mockSchemaDelegate,
        _mockMemoryClient);

    const fndef1 = await schemaRetriever.getSchemaAndNames('com.xkcd', 'query', 'get_comic');

    assert(fndef1 instanceof Ast.FunctionDef);
    assert.strictEqual(fndef1.name, 'get_comic');
    assert.strictEqual(fndef1.class.name, 'com.xkcd');
    assert.strictEqual(fndef1.qualifiedName, 'com.xkcd.get_comic');
    assert.deepStrictEqual(fndef1.extends, []);
    assert.strictEqual(fndef1.is_list, false);
    assert.strictEqual(fndef1.is_monitorable, true);

    const fndef2 = await schemaRetriever.getMemorySchema('Q1');

    assert(fndef2 instanceof Ast.FunctionDef);
    assert.strictEqual(fndef2.name, 'Q1');
    assert.strictEqual(fndef2.class, null);
    assert.strictEqual(fndef2.qualifiedName, '.Q1');
    assert.deepStrictEqual(fndef2.extends, []);
    assert.strictEqual(fndef2.is_list, true);
    assert.strictEqual(fndef2.is_monitorable, true);
}

async function testInjectManifest() {
    const manifest = await util.promisify(fs.readFile)(require.resolve('./com.xkcd.tt'), { encoding: 'utf8' });

    let schemaRetriever = new SchemaRetriever(_mockSchemaDelegate,
        _mockMemoryClient);

    schemaRetriever.injectClass(Grammar.parse(manifest).classes[0]);

    assert.deepStrictEqual((await schemaRetriever.getFullSchema('com.xkcd')).prettyprint(), `class @com.xkcd
#[version=91] {
  import loader from @org.thingpedia.v2();

  import config from @org.thingpedia.config.none();

  monitorable query get_comic(in opt number : Number
                              #_[prompt="What Xkcd comic do you want?"],
                              out title : String,
                              out picture_url : Entity(tt:picture),
                              out link : Entity(tt:url),
                              out alt_text : String)
  #_[canonical="xkcd comic"]
  #_[confirmation="an Xkcd comic"]
  #_[formatted=[{
    type="rdl",
    webCallback="\${link}",
    displayTitle="\${title}"
  }, {
    type="picture",
    url="\${picture_url}"
  }, {
    type="text",
    text="\${alt_text}"
  }]]
  #[poll_interval=86400000ms]
  #[doc="retrieve the comic with a given number, or the latest comit"]
  #[minimal_projection=[]];

  query random_comic(out number : Number,
                     out title : String,
                     out picture_url : Entity(tt:picture),
                     out link : Entity(tt:url),
                     out alt_text : String)
  #_[canonical="random xkcd comic"]
  #_[confirmation="a random Xkcd comic"]
  #_[formatted=[{
    type="rdl",
    webCallback="\${link}",
    displayTitle="\${title}"
  }, {
    type="picture",
    url="\${picture_url}"
  }, {
    type="text",
    text="\${alt_text}"
  }]]
  #[doc="retrieve a random xkcd"]
  #[minimal_projection=[]];

  monitorable list query what_if(out title : String,
                                 out link : Entity(tt:url),
                                 out updated_time : Date)
  #_[canonical="xkcd what if blog posts"]
  #_[confirmation="Xkcd's What If blog posts"]
  #_[formatted=[{
    type="rdl",
    webCallback="\${link}",
    displayTitle="\${title}"
  }]]
  #[poll_interval=86400000ms]
  #[doc="retrieve the latest posts on Xkcd's What If blog"]
  #[minimal_projection=[]];
}`
    );

    const fakeTwitter = (await Grammar.parse(FAKE_TWITTER).typecheck(schemaRetriever)).classes[0];
    schemaRetriever.injectClass(fakeTwitter);

    assert.deepStrictEqual((await schemaRetriever.getSchemaAndNames('com.twitter', 'query', 'fake_query')).prettyprint(),
        `monitorable list query fake_query(in req fake_argument : String)\n` +
        `#[poll_interval=1min]\n` +
        `#[formatted=["foo"]]\n` +
        `#[minimal_projection=[]];`);
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

async function testDataset() {
    const schemaRetriever = new SchemaRetriever(_mockSchemaDelegate,
        _mockMemoryClient);

    const BING = `dataset @com.bing {
  query (p_query : String) = @com.bing.web_search(query=p_query)
  #_[utterances=["\${p_query:const} on bing", "bing $p_query", "websites matching $p_query", "web sites matching $p_query", "\${p_query:const}"]]
  #[id=21626326]
  #[name="WebSearchWithQuery"];

  query = @com.bing.web_search()
  #_[utterances=[", search on bing", ", bing search", ", web search"]]
  #[id=21626330]
  #[name="WebSearch"];

  query (p_query : String) = @com.bing.image_search(query=p_query)
  #_[utterances=["\${p_query:const} images on bing", "images matching $p_query from bing"]]
  #[id=21626333]
  #[name="ImageSearchWithQuery"];
}`;
    const XKCD = `dataset @com.xkcd {
  stream = monitor(@com.xkcd.get_comic())
  #_[utterances=["when a new xkcd is out", "when a new xkcd is posted"]]
  #[id=1648624]
  #[name="MonitorComic"];

  query (p_number : Number) = @com.xkcd.get_comic() filter number == p_number
  #_[utterances=["the xkcd number \${p_number}", "xkcd \${p_number:const}"]]
  #[id=1648627]
  #[name="ComicWithNumber"];
}`;
    const CAT = `dataset @com.thecatapi {
  program = @com.thecatapi.get()
  #_[utterances=["not enough cat pictures", "need moar cats", "can i haz cats", "cat pictures now"]]
  #[id=9750272]
  #[name="Get1"];

  query (p_count : Number) = @com.thecatapi.get()[1 : p_count]
  #_[utterances=["\${p_count:const} cat pictures"]]
  #[id=9750276]
  #[name="GetWithCount"];
}`;

    // simple
    assert.strictEqual((await schemaRetriever.getExamplesByKind('com.bing')).prettyprint(), BING);

    // cached
    assert.strictEqual((await schemaRetriever.getExamplesByKind('com.bing')).prettyprint(), BING);

    // batched
    const p1 = schemaRetriever.getExamplesByKind('com.xkcd');
    const p2 = schemaRetriever.getExamplesByKind('com.thecatapi');

    await Promise.all([p1, p2]);

    assert.strictEqual((await p1).prettyprint(), XKCD);
    assert.strictEqual((await p2).prettyprint(), CAT);
}

export default async function main()   {
    await testBasic();
    await testInjectManifest();
    await testInvalid();
    await testDataset();
}
if (!module.parent)
    main();
