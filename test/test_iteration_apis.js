// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Almond
//
// Copyright 2018 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const assert = require('assert');

const Grammar = require('../lib/grammar_api');
const SchemaRetriever = require('../lib/schema');

const _mockSchemaDelegate = require('./mock_schema_delegate');
const schemaRetriever = new SchemaRetriever(_mockSchemaDelegate, null, true);

function assertArrayEquals(testCase, array, expected) {
    assert.strictEqual(array.length, expected.length);

    let failed = false;
    for (let i = 0; i < array.length; i++) {
        if (array[i] !== expected[i]) {
            console.error('Test Case #' + (i+1) + ': does not match what expected');
            console.error('Expected: ' + expected[i]);
            console.error('Generated: ' + array[i]);
            failed = true;
        }
    }
    if (failed)
        throw new Error(`testIterationAPIs ${testCase} FAILED`);
}

var TEST_CASES = [
    [`now => @com.xkcd.get_comic() => notify;`,
    ['query: Invocation(Device(com.xkcd, , ), get_comic, , )',
     'action: Invocation(Builtin, notify, , )'],
    ['Device(com.xkcd, , ) com.xkcd:get_comic',
     'Builtin undefined:notify']],

    [`monitor (@com.xkcd.get_comic()) => notify;`,
    ['query: Invocation(Device(com.xkcd, , ), get_comic, , )',
     'action: Invocation(Builtin, notify, , )'],
    ['Device(com.xkcd, , ) com.xkcd:get_comic',
     'Builtin undefined:notify']],

    [`monitor (@com.xkcd.get_comic(number=$undefined)) => notify;`,
    ['query: Invocation(Device(com.xkcd, , ), get_comic, InputParam(number, Undefined(true)), )',
     'action: Invocation(Builtin, notify, , )'],
    ['Device(com.xkcd, , ) com.xkcd:get_comic',
     'InputParam(number, Undefined(true)) com.xkcd:get_comic',
     'Builtin undefined:notify']],

    [`monitor (@com.xkcd.get_comic(number=1234)) => notify;`,
    ['query: Invocation(Device(com.xkcd, , ), get_comic, InputParam(number, Number(1234)), )',
     'action: Invocation(Builtin, notify, , )'],
    ['Device(com.xkcd, , ) com.xkcd:get_comic',
     'InputParam(number, Number(1234)) com.xkcd:get_comic',
     'Builtin undefined:notify']],

    [`monitor (@com.xkcd.get_comic(number=1234)) => @com.facebook.post(status=title);`,
    ['query: Invocation(Device(com.xkcd, , ), get_comic, InputParam(number, Number(1234)), )',
     'action: Invocation(Device(com.facebook, , ), post, InputParam(status, VarRef(title)), )'],
    ['Device(com.xkcd, , ) com.xkcd:get_comic',
     'InputParam(number, Number(1234)) com.xkcd:get_comic',
     'Device(com.facebook, , ) com.facebook:post',
     'InputParam(status, VarRef(title)) com.facebook:post']],

    [`monitor (@com.xkcd.get_comic(number=1234)) => @com.facebook.post(status=$event);`,
    ['query: Invocation(Device(com.xkcd, , ), get_comic, InputParam(number, Number(1234)), )',
     'action: Invocation(Device(com.facebook, , ), post, InputParam(status, Event()), )'],
    ['Device(com.xkcd, , ) com.xkcd:get_comic',
     'InputParam(number, Number(1234)) com.xkcd:get_comic',
     'Device(com.facebook, , ) com.facebook:post',
     'InputParam(status, Event()) com.facebook:post']],

    [`now => aggregate count of @com.xkcd.get_comic(number=1234) => @com.facebook.post(status=$event);`,
    ['query: Invocation(Device(com.xkcd, , ), get_comic, InputParam(number, Number(1234)), )',
     'action: Invocation(Device(com.facebook, , ), post, InputParam(status, Event()), )'],
    ['Device(com.xkcd, , ) com.xkcd:get_comic',
     'InputParam(number, Number(1234)) com.xkcd:get_comic',
     'Device(com.facebook, , ) com.facebook:post',
     'InputParam(status, Event()) com.facebook:post']],

    [`now => aggregate avg temperature of (@com.instagram.get_pictures() join @org.thingpedia.weather.current() on (location=location)) => notify;`,
    ['query: Invocation(Device(com.instagram, , ), get_pictures, , )',
     'query: Invocation(Device(org.thingpedia.weather, , ), current, , )',
     'action: Invocation(Builtin, notify, , )'],
    ['Device(com.instagram, , ) com.instagram:get_pictures',
     'Device(org.thingpedia.weather, , ) org.thingpedia.weather:current',
     'Builtin undefined:notify']],

    [`now => sort temperature asc of (@com.instagram.get_pictures() join @org.thingpedia.weather.current() on (location=location)) => notify;`,
    ['query: Invocation(Device(com.instagram, , ), get_pictures, , )',
     'query: Invocation(Device(org.thingpedia.weather, , ), current, , )',
     'action: Invocation(Builtin, notify, , )'],
    ['Device(com.instagram, , ) com.instagram:get_pictures',
     'Device(org.thingpedia.weather, , ) org.thingpedia.weather:current',
     'Builtin undefined:notify']],

    [`now => (@com.instagram.get_pictures() join @org.thingpedia.weather.current() on (location=location))[1,2] => notify;`,
    ['query: Invocation(Device(com.instagram, , ), get_pictures, , )',
     'query: Invocation(Device(org.thingpedia.weather, , ), current, , )',
     'action: Invocation(Builtin, notify, , )'],
    ['Device(com.instagram, , ) com.instagram:get_pictures',
     'Device(org.thingpedia.weather, , ) org.thingpedia.weather:current',
     'Builtin undefined:notify']],

    [`now => (@com.instagram.get_pictures() join @org.thingpedia.weather.current() on (location=location))[1:2] => notify;`,
    ['query: Invocation(Device(com.instagram, , ), get_pictures, , )',
     'query: Invocation(Device(org.thingpedia.weather, , ), current, , )',
     'action: Invocation(Builtin, notify, , )'],
    ['Device(com.instagram, , ) com.instagram:get_pictures',
     'Device(org.thingpedia.weather, , ) org.thingpedia.weather:current',
     'Builtin undefined:notify']],

    [`monitor (@com.instagram.get_pictures() join @org.thingpedia.weather.current() on (location=location)) => notify;`,
    ['query: Invocation(Device(com.instagram, , ), get_pictures, , )',
     'query: Invocation(Device(org.thingpedia.weather, , ), current, , )',
     'action: Invocation(Builtin, notify, , )'],
    ['Device(com.instagram, , ) com.instagram:get_pictures',
     'Device(org.thingpedia.weather, , ) org.thingpedia.weather:current',
     'Builtin undefined:notify']],

    [`(monitor @com.washingtonpost.get_article() join @com.yandex.translate.translate(target_language="zh"^^tt:iso_lang_code) on (text=title)) => notify;`,
    ['query: Invocation(Device(com.washingtonpost, , ), get_article, InputParam(section, Undefined(true)), )',
     'query: Invocation(Device(com.yandex.translate, , ), translate, InputParam(target_language, Entity(zh, tt:iso_lang_code, )), )',
     'action: Invocation(Builtin, notify, , )'],
    ['Device(com.washingtonpost, , ) com.washingtonpost:get_article',
     'InputParam(section, Undefined(true)) com.washingtonpost:get_article',
     'Device(com.yandex.translate, , ) com.yandex.translate:translate',
     'InputParam(target_language, Entity(zh, tt:iso_lang_code, )) com.yandex.translate:translate',
     'Builtin undefined:notify']],

    [`monitor @com.washingtonpost.get_article() join @com.yandex.translate.translate(target_language="zh"^^tt:iso_lang_code) on (text=title) => notify;`,
    ['query: Invocation(Device(com.washingtonpost, , ), get_article, InputParam(section, Undefined(true)), )',
     'query: Invocation(Device(com.yandex.translate, , ), translate, InputParam(target_language, Entity(zh, tt:iso_lang_code, )), )',
     'action: Invocation(Builtin, notify, , )'],
    ['Device(com.washingtonpost, , ) com.washingtonpost:get_article',
     'InputParam(section, Undefined(true)) com.washingtonpost:get_article',
     'Device(com.yandex.translate, , ) com.yandex.translate:translate',
     'InputParam(target_language, Entity(zh, tt:iso_lang_code, )) com.yandex.translate:translate',
     'Builtin undefined:notify']],

    [`monitor @com.washingtonpost.get_article(section=enum(world)) join @com.yandex.translate.translate(target_language="zh"^^tt:iso_lang_code) on (text=title) => notify;`,
    ['query: Invocation(Device(com.washingtonpost, , ), get_article, InputParam(section, Enum(world)), )',
     'query: Invocation(Device(com.yandex.translate, , ), translate, InputParam(target_language, Entity(zh, tt:iso_lang_code, )), )',
     'action: Invocation(Builtin, notify, , )'],
    ['Device(com.washingtonpost, , ) com.washingtonpost:get_article',
     'InputParam(section, Enum(world)) com.washingtonpost:get_article',
     'Device(com.yandex.translate, , ) com.yandex.translate:translate',
     'InputParam(target_language, Entity(zh, tt:iso_lang_code, )) com.yandex.translate:translate',
     'Builtin undefined:notify']],

    [`monitor @com.washingtonpost.get_article(section=enum(world)) => notify;`,
    ['query: Invocation(Device(com.washingtonpost, , ), get_article, InputParam(section, Enum(world)), )',
     'action: Invocation(Builtin, notify, , )'],
    ['Device(com.washingtonpost, , ) com.washingtonpost:get_article',
     'InputParam(section, Enum(world)) com.washingtonpost:get_article',
     'Builtin undefined:notify']],

    [`monitor @com.washingtonpost.get_article(section=enum(world)), title =~ "lol" => notify;`,
    ['query: Invocation(Device(com.washingtonpost, , ), get_article, InputParam(section, Enum(world)), )',
     'action: Invocation(Builtin, notify, , )'],
    ['Device(com.washingtonpost, , ) com.washingtonpost:get_article',
     'InputParam(section, Enum(world)) com.washingtonpost:get_article',
     'Atom(title, =~, String(lol)) com.washingtonpost:get_article',
     'Builtin undefined:notify']],
    [`monitor @com.washingtonpost.get_article(section=enum(world)), title =~ "lol" || title =~ "bar" => notify;`,
    ['query: Invocation(Device(com.washingtonpost, , ), get_article, InputParam(section, Enum(world)), )',
     'action: Invocation(Builtin, notify, , )'],
    ['Device(com.washingtonpost, , ) com.washingtonpost:get_article',
     'InputParam(section, Enum(world)) com.washingtonpost:get_article',
     'Atom(title, =~, String(lol)) com.washingtonpost:get_article',
     'Atom(title, =~, String(bar)) com.washingtonpost:get_article',
     'Builtin undefined:notify']],

    [`now => @com.washingtonpost.get_article(section=enum(world)), title =~ "lol" => notify;`,
    ['query: Invocation(Device(com.washingtonpost, , ), get_article, InputParam(section, Enum(world)), )',
     'action: Invocation(Builtin, notify, , )'],
    ['Device(com.washingtonpost, , ) com.washingtonpost:get_article',
     'InputParam(section, Enum(world)) com.washingtonpost:get_article',
     'Atom(title, =~, String(lol)) com.washingtonpost:get_article',
     'Builtin undefined:notify']],

    [`now => @com.washingtonpost.get_article(section=enum(world)), title =~ "lol" || title =~ "bar" => notify;`,
    ['query: Invocation(Device(com.washingtonpost, , ), get_article, InputParam(section, Enum(world)), )',
     'action: Invocation(Builtin, notify, , )'],
    ['Device(com.washingtonpost, , ) com.washingtonpost:get_article',
     'InputParam(section, Enum(world)) com.washingtonpost:get_article',
     'Atom(title, =~, String(lol)) com.washingtonpost:get_article',
     'Atom(title, =~, String(bar)) com.washingtonpost:get_article',
     'Builtin undefined:notify']],

    ['now => (@com.bing.web_search() join @com.yandex.translate.translate(target_language="it"^^tt:iso_lang_code("Italian")) on (text=$event)) => notify;',
    ['query: Invocation(Device(com.bing, , ), web_search, InputParam(query, Undefined(true)), )',
     'query: Invocation(Device(com.yandex.translate, , ), translate, InputParam(target_language, Entity(it, tt:iso_lang_code, Italian)), )',
     'action: Invocation(Builtin, notify, , )'],
    ['Device(com.bing, , ) com.bing:web_search',
     'InputParam(query, Undefined(true)) com.bing:web_search',
     'Device(com.yandex.translate, , ) com.yandex.translate:translate',
     'InputParam(target_language, Entity(it, tt:iso_lang_code, Italian)) com.yandex.translate:translate',
     'Builtin undefined:notify']],

    ['monitor @com.bing.web_search() join @com.yandex.translate.translate(target_language="it"^^tt:iso_lang_code("Italian")) on (text=$event) => notify;',
    ['query: Invocation(Device(com.bing, , ), web_search, InputParam(query, Undefined(true)), )',
     'query: Invocation(Device(com.yandex.translate, , ), translate, InputParam(target_language, Entity(it, tt:iso_lang_code, Italian)), )',
     'action: Invocation(Builtin, notify, , )'],
    ['Device(com.bing, , ) com.bing:web_search',
     'InputParam(query, Undefined(true)) com.bing:web_search',
     'Device(com.yandex.translate, , ) com.yandex.translate:translate',
     'InputParam(target_language, Entity(it, tt:iso_lang_code, Italian)) com.yandex.translate:translate',
     'Builtin undefined:notify']],

    ['dataset @com.twitter language \'en\' {\n' +
    '    stream (p_author : Entity(tt:username)) := monitor (@com.twitter.search()), author == p_author\n' +
    '    #_[utterances=[\'monitor ${p_author}\\\'s tweets\']];\n' +
    '    program := {\n' +
    '        monitor (@com.twitter.search()) => notify;\n' +
    '    }\n' +
    '    #_[utterances=[\'notify me about new tweets\']];\n' +
    '}',
    ['query: Invocation(Device(com.twitter, , ), search, , )',
     'query: Invocation(Device(com.twitter, , ), search, , )',
     'action: Invocation(Builtin, notify, , )'
    ],
    ['Device(com.twitter, , ) com.twitter:search',
     'Atom(author, ==, VarRef(p_author)) com.twitter:search',
     'Device(com.twitter, , ) com.twitter:search',
     'Builtin undefined:notify'
    ]],

    [`let program p1(p_query : String) := {
        monitor (@com.bing.web_search(query=p_query)) => notify;
    };

    oninput => {
        // this should have a query=$? added
        p1();
    }`,
    ['action: VarRef(p1, InputParam(p_query, Undefined(true)), )'],
    ['InputParam(p_query, Undefined(true)) p1']],

    [`now => result(@com.thecatapi.get) => notify;`,
    ['query: ResultRef(com.thecatapi, get, Number(-1), )',
     'action: Invocation(Builtin, notify, , )'],
     ['Builtin undefined:notify']
    ]

];

function test(i) {
    console.log('Test Case #' + (i+1));
    var [code, expectedPrim, expectedSlots] = TEST_CASES[i];

    return Grammar.parseAndTypecheck(code, schemaRetriever, true).then((prog) => {
        const generatedSlots = Array.from(prog.iterateSlots()).map(([schema, slot, prim, scope]) => {
            if (prim.isVarRef)
                return `${slot} ${prim.name}`;
            else
                return `${slot} ${prim.selector.kind}:${prim.channel}`;
        });
        const generatedPrims = Array.from(prog.iteratePrimitives(true)).map(([primType, prim]) => {
            prim.schema = null;
            return `${primType}: ${prim}`;
        });

        assertArrayEquals(i, generatedPrims, expectedPrim);
        assertArrayEquals(i, generatedSlots, expectedSlots);
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
