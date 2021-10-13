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
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>

import assert from 'assert';

import * as Grammar from '../lib/syntax_api';
import * as Ast from '../lib/ast';
import SchemaRetriever from '../lib/schema';
import Type from '../lib/type';

import _mockSchemaDelegate from './mock_schema_delegate';
const schemaRetriever = new SchemaRetriever(_mockSchemaDelegate, null, true);

function assertArrayEquals(testCase, array, expected) {
    //assert.strictEqual(array.length, expected.length);

    let failed = false;
    for (let i = 0; i < Math.max(array.length, expected.length); i++) {
        if (array[i] !== expected[i]) {
            console.error(`Test Case #${testCase+1}/${i+1}: does not match what expected`);
            console.error('Expected: ' + expected[i]);
            console.error('Generated: ' + array[i]);
            failed = true;
        }
    }
    if (failed)
        throw new Error(`testIterationAPIs ${testCase} FAILED`);
}

let TEST_CASES = [
    [`now => @com.xkcd.get_comic() => notify;`,
    ['query: Invocation(Device(com.xkcd, , ), get_comic, , )'],
    ['Device(com.xkcd, , ) com.xkcd:get_comic'],
    ['Selector(@com.xkcd)'],
    ],

    [`monitor (@com.xkcd.get_comic()) => notify;`,
    ['query: Invocation(Device(com.xkcd, , ), get_comic, , )'],
    ['Device(com.xkcd, , ) com.xkcd:get_comic'],
    ['Selector(@com.xkcd)'],
    ],

    [`monitor (@com.xkcd.get_comic(number=$undefined)) => notify;`,
    ['query: Invocation(Device(com.xkcd, , ), get_comic, InputParam(number, Undefined(true)), )'],
    ['Device(com.xkcd, , ) com.xkcd:get_comic',
     'InputParam(number, Undefined(true)) com.xkcd:get_comic'],
    ['Selector(@com.xkcd)',
     'InputParamSlot(number : Number) in_param.number'],
    ],

    [`monitor (@com.xkcd.get_comic(number=1234)) => notify;`,
    ['query: Invocation(Device(com.xkcd, , ), get_comic, InputParam(number, Number(1234)), )'],
    ['Device(com.xkcd, , ) com.xkcd:get_comic',
     'InputParam(number, Number(1234)) com.xkcd:get_comic'],
    ['Selector(@com.xkcd)',
     'InputParamSlot(number : Number) in_param.number'],
    ],

    [`monitor (@com.xkcd.get_comic(number=1234)) => @com.facebook.post(status=title);`,
    ['query: Invocation(Device(com.xkcd, , ), get_comic, InputParam(number, Number(1234)), )',
     'action: Invocation(Device(com.facebook, , ), post, InputParam(status, VarRef(title)), )'],
    ['Device(com.xkcd, , ) com.xkcd:get_comic',
     'InputParam(number, Number(1234)) com.xkcd:get_comic',
     'Device(com.facebook, , ) com.facebook:post',
     'InputParam(status, VarRef(title)) com.facebook:post'],
    ['Selector(@com.xkcd)',
     'InputParamSlot(number : Number) in_param.number',
     'Selector(@com.facebook)',
     'InputParamSlot(status : String) in_param.status'],
    ],

    [`monitor (@com.xkcd.get_comic(number=1234)) => @com.facebook.post(status=$result);`,
    ['query: Invocation(Device(com.xkcd, , ), get_comic, InputParam(number, Number(1234)), )',
     'action: Invocation(Device(com.facebook, , ), post, InputParam(status, Event(null)), )'],
    ['Device(com.xkcd, , ) com.xkcd:get_comic',
     'InputParam(number, Number(1234)) com.xkcd:get_comic',
     'Device(com.facebook, , ) com.facebook:post',
     'InputParam(status, Event(null)) com.facebook:post'],
    ['Selector(@com.xkcd)',
     'InputParamSlot(number : Number) in_param.number',
     'Selector(@com.facebook)',
     'InputParamSlot(status : String) in_param.status'],
    ],

    [`now => count(@com.xkcd.get_comic(number=1234)) => @com.facebook.post(status=$result);`,
    ['query: Invocation(Device(com.xkcd, , ), get_comic, InputParam(number, Number(1234)), )',
     'action: Invocation(Device(com.facebook, , ), post, InputParam(status, Event(null)), )'],
    ['Device(com.xkcd, , ) com.xkcd:get_comic',
     'InputParam(number, Number(1234)) com.xkcd:get_comic',
     'Device(com.facebook, , ) com.facebook:post',
     'InputParam(status, Event(null)) com.facebook:post'],
    ['Selector(@com.xkcd)',
     'InputParamSlot(number : Number) in_param.number',
     'Selector(@com.facebook)',
     'InputParamSlot(status : String) in_param.status'],
    ],

    [`now => avg(temperature of (@com.instagram.get_pictures() => @org.thingpedia.weather.current(location=location))) => notify;`,
    ['query: Invocation(Device(com.instagram, , ), get_pictures, , )',
     'query: Invocation(Device(org.thingpedia.weather, , ), current, InputParam(location, VarRef(location)), )'],
    ['Device(com.instagram, , ) com.instagram:get_pictures',
     'Device(org.thingpedia.weather, , ) org.thingpedia.weather:current',
     'InputParam(location, VarRef(location)) org.thingpedia.weather:current'],
    ['Selector(@com.instagram)',
     'Selector(@org.thingpedia.weather)',
     'InputParamSlot(location : Location) in_param.location'],
    ],

    [`now => sort(temperature asc of (@com.instagram.get_pictures() => @org.thingpedia.weather.current(location=location))) => notify;`,
    ['query: Invocation(Device(com.instagram, , ), get_pictures, , )',
     'query: Invocation(Device(org.thingpedia.weather, , ), current, InputParam(location, VarRef(location)), )'],
    ['Device(com.instagram, , ) com.instagram:get_pictures',
     'Device(org.thingpedia.weather, , ) org.thingpedia.weather:current',
     'InputParam(location, VarRef(location)) org.thingpedia.weather:current'],
    ['Selector(@com.instagram)',
     'Selector(@org.thingpedia.weather)',
     'InputParamSlot(location : Location) in_param.location',
     'FieldSlot(value : Number) sort.value'],
    ],

    [`now => (@com.instagram.get_pictures() => @org.thingpedia.weather.current(location=location))[1,2] => notify;`,
    ['query: Invocation(Device(com.instagram, , ), get_pictures, , )',
     'query: Invocation(Device(org.thingpedia.weather, , ), current, InputParam(location, VarRef(location)), )'],
    ['Device(com.instagram, , ) com.instagram:get_pictures',
     'Device(org.thingpedia.weather, , ) org.thingpedia.weather:current',
     'InputParam(location, VarRef(location)) org.thingpedia.weather:current'],
    ['Selector(@com.instagram)',
     'Selector(@org.thingpedia.weather)',
     'InputParamSlot(location : Location) in_param.location',
     'ArrayIndexSlot([0] : Number) expression.index.0',
     'ArrayIndexSlot([1] : Number) expression.index.1'],
    ],

    [`now => (@com.instagram.get_pictures() => @org.thingpedia.weather.current(location=location))[1:2] => notify;`,
    ['query: Invocation(Device(com.instagram, , ), get_pictures, , )',
     'query: Invocation(Device(org.thingpedia.weather, , ), current, InputParam(location, VarRef(location)), )'],
    ['Device(com.instagram, , ) com.instagram:get_pictures',
     'Device(org.thingpedia.weather, , ) org.thingpedia.weather:current',
     'InputParam(location, VarRef(location)) org.thingpedia.weather:current'],
    ['Selector(@com.instagram)',
     'Selector(@org.thingpedia.weather)',
     'InputParamSlot(location : Location) in_param.location',
     'FieldSlot(base : Number) slice.base',
     'FieldSlot(limit : Number) slice.limit'],
    ],

    [`monitor (@com.instagram.get_pictures() => @org.thingpedia.weather.current(location=location)) => notify;`,
    ['query: Invocation(Device(com.instagram, , ), get_pictures, , )',
     'query: Invocation(Device(org.thingpedia.weather, , ), current, InputParam(location, VarRef(location)), )'],
    ['Device(com.instagram, , ) com.instagram:get_pictures',
     'Device(org.thingpedia.weather, , ) org.thingpedia.weather:current',
     'InputParam(location, VarRef(location)) org.thingpedia.weather:current'],
    ['Selector(@com.instagram)',
     'Selector(@org.thingpedia.weather)',
     'InputParamSlot(location : Location) in_param.location'],
    ],

    [`monitor(@com.washingtonpost.get_article()) => @com.yandex.translate.translate(target_language="zh"^^tt:iso_lang_code, text=title) => notify;`,
    ['query: Invocation(Device(com.washingtonpost, , ), get_article, InputParam(section, Undefined(true)), )',
     'query: Invocation(Device(com.yandex.translate, , ), translate, InputParam(target_language, Entity(zh, tt:iso_lang_code, null)),InputParam(text, VarRef(title)), )'],
    ['Device(com.washingtonpost, , ) com.washingtonpost:get_article',
     'InputParam(section, Undefined(true)) com.washingtonpost:get_article',
     'Device(com.yandex.translate, , ) com.yandex.translate:translate',
     'InputParam(target_language, Entity(zh, tt:iso_lang_code, null)) com.yandex.translate:translate',
     'InputParam(text, VarRef(title)) com.yandex.translate:translate'],
    ['Selector(@com.washingtonpost)',
     'InputParamSlot(section : Enum(politics,opinions,local,sports,national,world,business,lifestyle)) in_param.section',
     'Selector(@com.yandex.translate)',
     'InputParamSlot(target_language : Entity(tt:iso_lang_code)) in_param.target_language',
     'InputParamSlot(text : String) in_param.text'],
    ],

    [`monitor(@com.washingtonpost.get_article()) => @com.yandex.translate.translate(target_language="zh"^^tt:iso_lang_code, text=title) => notify;`,
    ['query: Invocation(Device(com.washingtonpost, , ), get_article, InputParam(section, Undefined(true)), )',
     'query: Invocation(Device(com.yandex.translate, , ), translate, InputParam(target_language, Entity(zh, tt:iso_lang_code, null)),InputParam(text, VarRef(title)), )'],
    ['Device(com.washingtonpost, , ) com.washingtonpost:get_article',
     'InputParam(section, Undefined(true)) com.washingtonpost:get_article',
     'Device(com.yandex.translate, , ) com.yandex.translate:translate',
     'InputParam(target_language, Entity(zh, tt:iso_lang_code, null)) com.yandex.translate:translate',
     'InputParam(text, VarRef(title)) com.yandex.translate:translate'],
    ['Selector(@com.washingtonpost)',
     'InputParamSlot(section : Enum(politics,opinions,local,sports,national,world,business,lifestyle)) in_param.section',
     'Selector(@com.yandex.translate)',
     'InputParamSlot(target_language : Entity(tt:iso_lang_code)) in_param.target_language',
     'InputParamSlot(text : String) in_param.text'],
    ],

    [`monitor(@com.washingtonpost.get_article(section=enum(world))) => @com.yandex.translate.translate(target_language="zh"^^tt:iso_lang_code, text=title) => notify;`,
    ['query: Invocation(Device(com.washingtonpost, , ), get_article, InputParam(section, Enum(world)), )',
     'query: Invocation(Device(com.yandex.translate, , ), translate, InputParam(target_language, Entity(zh, tt:iso_lang_code, null)),InputParam(text, VarRef(title)), )'],
    ['Device(com.washingtonpost, , ) com.washingtonpost:get_article',
     'InputParam(section, Enum(world)) com.washingtonpost:get_article',
     'Device(com.yandex.translate, , ) com.yandex.translate:translate',
     'InputParam(target_language, Entity(zh, tt:iso_lang_code, null)) com.yandex.translate:translate',
     'InputParam(text, VarRef(title)) com.yandex.translate:translate'],
    ['Selector(@com.washingtonpost)',
     'InputParamSlot(section : Enum(politics,opinions,local,sports,national,world,business,lifestyle)) in_param.section',
     'Selector(@com.yandex.translate)',
     'InputParamSlot(target_language : Entity(tt:iso_lang_code)) in_param.target_language',
     'InputParamSlot(text : String) in_param.text'],
    ],

    [`monitor(@com.washingtonpost.get_article(section=enum(world))) => notify;`,
    ['query: Invocation(Device(com.washingtonpost, , ), get_article, InputParam(section, Enum(world)), )'],
    ['Device(com.washingtonpost, , ) com.washingtonpost:get_article',
     'InputParam(section, Enum(world)) com.washingtonpost:get_article'],
    ['Selector(@com.washingtonpost)',
     'InputParamSlot(section : Enum(politics,opinions,local,sports,national,world,business,lifestyle)) in_param.section'],
    ],

    [`monitor(@com.washingtonpost.get_article(section=enum(world)), title =~ "lol") => notify;`,
    ['query: Invocation(Device(com.washingtonpost, , ), get_article, InputParam(section, Enum(world)), )'],
    ['Device(com.washingtonpost, , ) com.washingtonpost:get_article',
     'InputParam(section, Enum(world)) com.washingtonpost:get_article',
     'Atom(title, =~, String(lol)) com.washingtonpost:get_article'],
    ['Selector(@com.washingtonpost)',
     'InputParamSlot(section : Enum(politics,opinions,local,sports,national,world,business,lifestyle)) in_param.section',
     'FilterSlot(title =~ : String) filter.=~.title'],
    ],

    [`monitor(@com.washingtonpost.get_article(section=enum(world)), title =~ "lol" || title =~ "bar") => notify;`,
    ['query: Invocation(Device(com.washingtonpost, , ), get_article, InputParam(section, Enum(world)), )'],
    ['Device(com.washingtonpost, , ) com.washingtonpost:get_article',
     'InputParam(section, Enum(world)) com.washingtonpost:get_article',
     'Atom(title, in_array~, Array(String(lol),String(bar))) com.washingtonpost:get_article'
    ],
    ['Selector(@com.washingtonpost)',
     'InputParamSlot(section : Enum(politics,opinions,local,sports,national,world,business,lifestyle)) in_param.section',
     'FilterSlot(title in_array~ : Array(String)) filter.in_array~.title',
     'ArrayIndexSlot([0] : String) filter.in_array~.title.0',
     'ArrayIndexSlot([1] : String) filter.in_array~.title.1'],
    ],

    [`now => @com.washingtonpost.get_article(section=enum(world)), title =~ "lol" => notify;`,
    ['query: Invocation(Device(com.washingtonpost, , ), get_article, InputParam(section, Enum(world)), )'],
    ['Device(com.washingtonpost, , ) com.washingtonpost:get_article',
     'InputParam(section, Enum(world)) com.washingtonpost:get_article',
     'Atom(title, =~, String(lol)) com.washingtonpost:get_article'],
    ['Selector(@com.washingtonpost)',
     'InputParamSlot(section : Enum(politics,opinions,local,sports,national,world,business,lifestyle)) in_param.section',
     'FilterSlot(title =~ : String) filter.=~.title'],
    ],

    [`now => @com.washingtonpost.get_article(section=enum(world)), title =~ "lol" || title =~ "bar" => notify;`,
    ['query: Invocation(Device(com.washingtonpost, , ), get_article, InputParam(section, Enum(world)), )'],
    ['Device(com.washingtonpost, , ) com.washingtonpost:get_article',
     'InputParam(section, Enum(world)) com.washingtonpost:get_article',
     'Atom(title, in_array~, Array(String(lol),String(bar))) com.washingtonpost:get_article'],
    ['Selector(@com.washingtonpost)',
     'InputParamSlot(section : Enum(politics,opinions,local,sports,national,world,business,lifestyle)) in_param.section',
     'FilterSlot(title in_array~ : Array(String)) filter.in_array~.title',
     'ArrayIndexSlot([0] : String) filter.in_array~.title.0',
     'ArrayIndexSlot([1] : String) filter.in_array~.title.1'],
    ],

    ['now => (@com.bing.web_search() => @com.yandex.translate.translate(target_language="it"^^tt:iso_lang_code("Italian"), text=$result)) => notify;',
    ['query: Invocation(Device(com.bing, , ), web_search, InputParam(query, Undefined(true)), )',
     'query: Invocation(Device(com.yandex.translate, , ), translate, InputParam(target_language, Entity(it, tt:iso_lang_code, Italian)),InputParam(text, Event(null)), )'],
    ['Device(com.bing, , ) com.bing:web_search',
     'InputParam(query, Undefined(true)) com.bing:web_search',
     'Device(com.yandex.translate, , ) com.yandex.translate:translate',
     'InputParam(target_language, Entity(it, tt:iso_lang_code, Italian)) com.yandex.translate:translate',
     'InputParam(text, Event(null)) com.yandex.translate:translate'
    ],
    ['Selector(@com.bing)',
     'InputParamSlot(query : String) in_param.query',
     'Selector(@com.yandex.translate)',
     'InputParamSlot(target_language : Entity(tt:iso_lang_code)) in_param.target_language',
     'InputParamSlot(text : String) in_param.text'],
    ],

    ['monitor(@com.bing.web_search()) => @com.yandex.translate.translate(target_language="it"^^tt:iso_lang_code("Italian"), text=$result) => notify;',
    ['query: Invocation(Device(com.bing, , ), web_search, InputParam(query, Undefined(true)), )',
     'query: Invocation(Device(com.yandex.translate, , ), translate, InputParam(target_language, Entity(it, tt:iso_lang_code, Italian)),InputParam(text, Event(null)), )'],
    ['Device(com.bing, , ) com.bing:web_search',
     'InputParam(query, Undefined(true)) com.bing:web_search',
     'Device(com.yandex.translate, , ) com.yandex.translate:translate',
     'InputParam(target_language, Entity(it, tt:iso_lang_code, Italian)) com.yandex.translate:translate',
     'InputParam(text, Event(null)) com.yandex.translate:translate'],
    ['Selector(@com.bing)',
     'InputParamSlot(query : String) in_param.query',
     'Selector(@com.yandex.translate)',
     'InputParamSlot(target_language : Entity(tt:iso_lang_code)) in_param.target_language',
     'InputParamSlot(text : String) in_param.text'],
    ],

    ['dataset @com.twitter #[language=\'en\'] {\n' +
    '    stream (p_author : Entity(tt:username)) := monitor (@com.twitter.search()), author == p_author\n' +
    '    #_[utterances=[\'monitor ${p_author}\\\'s tweets\']];\n' +
    '    program := monitor (@com.twitter.search())\n' +
    '    #_[utterances=[\'notify me about new tweets\']];\n' +
    '}',
    ['query: Invocation(Device(com.twitter, , ), search, , )',
     'query: Invocation(Device(com.twitter, , ), search, , )'
    ],
    ['Device(com.twitter, , ) com.twitter:search',
     'Atom(author, ==, VarRef(p_author)) com.twitter:search',
     'Device(com.twitter, , ) com.twitter:search'
    ],
    ['Selector(@com.twitter)',
     'FilterSlot(author == : Entity(tt:username)) filter.==.author',
     'Selector(@com.twitter)'],
    ],

    [`function p1(p_query : String) {
        monitor (@com.bing.web_search(query=p_query)) => notify;
    }
    p1(p_query="foo");`,
    [
    'query: Invocation(Device(com.bing, , ), web_search, InputParam(query, VarRef(p_query)), )',
    'stream: FunctionCallExpression(p1, InputParam(p_query, String(foo)))'],
    ['InputParam(p_query, String(foo)) p1'],
    ['InputParamSlot(p_query : String) in_param.p_query'
    ]
    ],

    [`#[executor = $?] now => @com.twitter.post();`,

    [`action: Invocation(Device(com.twitter, , ), post, InputParam(status, Undefined(true)), )`],
    ['Device(com.twitter, , ) com.twitter:post',
     'InputParam(status, Undefined(true)) com.twitter:post'],
    ['FieldSlot(executor : Entity(tt:contact)) program.executor',
     'Selector(@com.twitter)',
     'InputParamSlot(status : String) in_param.status']
    ],

    [`attimer(time=$?) => @com.twitter.post();`,

    [
    `stream: FunctionCallExpression(attimer, InputParam(time, Undefined(true)))`,
    `action: Invocation(Device(com.twitter, , ), post, InputParam(status, Undefined(true)), )`],
    [`InputParam(time, Undefined(true)) attimer`,
     'Device(com.twitter, , ) com.twitter:post',
     'InputParam(status, Undefined(true)) com.twitter:post'],
    ['InputParamSlot(time : Array(Time)) in_param.time',
     'Selector(@com.twitter)',
     'InputParamSlot(status : String) in_param.status']
    ],

    [`attimer(time=[$?, $?]) => @com.twitter.post();`,

    [
    `stream: FunctionCallExpression(attimer, InputParam(time, Array(Undefined(true),Undefined(true))))`,
    `action: Invocation(Device(com.twitter, , ), post, InputParam(status, Undefined(true)), )`],
    [`InputParam(time, Array(Undefined(true),Undefined(true))) attimer`,
     'Device(com.twitter, , ) com.twitter:post',
     'InputParam(status, Undefined(true)) com.twitter:post'],
    ['InputParamSlot(time : Array(Time)) in_param.time',
     'ArrayIndexSlot([0] : Time) in_param.time.0',
     'ArrayIndexSlot([1] : Time) in_param.time.1',
     'Selector(@com.twitter)',
     'InputParamSlot(status : String) in_param.status']
    ],

    [`attimer(time=[$?, $?], expiration_date=$?) => @com.twitter.post();`,

    [
    `stream: FunctionCallExpression(attimer, InputParam(expiration_date, Undefined(true)),InputParam(time, Array(Undefined(true),Undefined(true))))`,
    `action: Invocation(Device(com.twitter, , ), post, InputParam(status, Undefined(true)), )`],
    [`InputParam(expiration_date, Undefined(true)) attimer`,
     `InputParam(time, Array(Undefined(true),Undefined(true))) attimer`,
     'Device(com.twitter, , ) com.twitter:post',
     'InputParam(status, Undefined(true)) com.twitter:post'],
    ['InputParamSlot(expiration_date : Date) in_param.expiration_date',
     'InputParamSlot(time : Array(Time)) in_param.time',
     'ArrayIndexSlot([0] : Time) in_param.time.0',
     'ArrayIndexSlot([1] : Time) in_param.time.1',
     'Selector(@com.twitter)',
     'InputParamSlot(status : String) in_param.status']
    ],

    [`$policy { $source == $? : now => @com.twitter.post; }`,

    [],
    [],
    ['FieldSlot(lhs : Entity(tt:contact)) compute_filter.lhs',
     'FieldSlot(rhs : Entity(tt:contact)) compute_filter.rhs'],
    ],

    [`$policy { in_array($source, $?) : now => @com.twitter.post; }`,

    [],
    [],
    ['FieldSlot(lhs : Entity(tt:contact)) compute_filter.lhs',
     'FieldSlot(rhs : Array(Entity(tt:contact))) compute_filter.rhs'],
    ],

    [`$policy { in_array($source, [$?, $?]) : now => @com.twitter.post; }`,

    [],
    [],
    ['FieldSlot(lhs : Entity(tt:contact)) compute_filter.lhs',
    'FieldSlot(rhs : Array(Entity(tt:contact))) compute_filter.rhs',
    'ArrayIndexSlot([0] : Entity(tt:contact)) compute_filter.rhs.0',
    'ArrayIndexSlot([1] : Entity(tt:contact)) compute_filter.rhs.1']
    ],

    [`now => @org.schema.restaurant(), count(review filter author =~ "bob") >= 1 => notify;`,

    ['query: Invocation(Device(org.schema, , ), restaurant, , )'],
    ['Device(org.schema, , ) org.schema:restaurant'],
    ['Selector(@org.schema)',
     'FieldSlot(lhs : Number) compute_filter.lhs',
     'ComputationOperandSlot(count[0] : Array(Compound)) compute_filter.lhs.count.0',
     'FieldSlot(rhs : Number) compute_filter.rhs']
    ],

    [`now => @light-bulb(name="bedroom").set_power(power=enum(off));`,
    ['action: Invocation(Device(light-bulb, , ), set_power, InputParam(power, Enum(off)), )'],
    [
    'Device(light-bulb, , ) light-bulb:set_power',
    'InputParam(power, Enum(off)) light-bulb:set_power',
    ],
    [
    'DeviceAttributeSlot(name : String) attribute.name',
    'Selector(@light-bulb)',
    'InputParamSlot(power : Enum(on,off)) in_param.power',
    ]
    ],

    [`
$dialogue @org.thingpedia.dialogue.transaction.execute;
now => [food] of ((@uk.ac.cam.multiwoz.Restaurant.Restaurant()), true) => notify
#[results=[
  { id="str:ENTITY_uk.ac.cam.multiwoz.Restaurant:Restaurant::0:"^^uk.ac.cam.multiwoz.Restaurant:Restaurant, food="str:QUOTED_STRING::9:" },
  { id="str:ENTITY_uk.ac.cam.multiwoz.Restaurant:Restaurant::1:"^^uk.ac.cam.multiwoz.Restaurant:Restaurant, food="str:QUOTED_STRING::25:" }
]]
#[count=50]
#[more=true];
    `,
    ['query: Invocation(Device(uk.ac.cam.multiwoz.Restaurant, , ), Restaurant, , )'],
    ['Device(uk.ac.cam.multiwoz.Restaurant, , ) uk.ac.cam.multiwoz.Restaurant:Restaurant'],
    ['Selector(@uk.ac.cam.multiwoz.Restaurant)',
     'ResultSlot(id : Entity(uk.ac.cam.multiwoz.Restaurant:Restaurant)) result.id',
     'ResultSlot(food : String) result.food',
     'ResultSlot(id : Entity(uk.ac.cam.multiwoz.Restaurant:Restaurant)) result.id',
     'ResultSlot(food : String) result.food']
    ],

    [`now => [distance(geo, $location.current_location)] of @com.yelp.restaurant() => notify;`,
    ['query: Invocation(Device(com.yelp, , ), restaurant, , )'],
    ['Device(com.yelp, , ) com.yelp:restaurant'],
    ['Selector(@com.yelp)',
    'ArrayIndexSlot([0] : Measure(m)) computations.0',
    'ComputationOperandSlot(distance[0] : Location) computations.0.distance.0',
    'ComputationOperandSlot(distance[1] : Location) computations.0.distance.1']
    ],

    [`monitor( @security-camera.current_event()), (has_person == true && any(@org.thingpedia.builtin.thingengine.builtin.get_gps(), location == new Location(1, 2)))  => notify;`,
    ['query: Invocation(Device(security-camera, , ), current_event, , )',
     'query: Invocation(Device(org.thingpedia.builtin.thingengine.builtin, , ), get_gps, , )'],
    [
    'Device(security-camera, , ) security-camera:current_event',
    'Device(org.thingpedia.builtin.thingengine.builtin, , ) org.thingpedia.builtin.thingengine.builtin:get_gps',
    'Atom(location, ==, Location(Absolute(1, 2, null))) org.thingpedia.builtin.thingengine.builtin:get_gps',
    'Atom(has_person, ==, Boolean(true)) security-camera:current_event',
    ],
    [
    'Selector(@security-camera)',
    'Selector(@org.thingpedia.builtin.thingengine.builtin)',
    'FilterSlot(location == : Location) filter.==.location',
    'FilterSlot(has_person == : Boolean) filter.==.has_person',
    ]]
];

async function test(i) {
    console.log('Test Case #' + (i+1));
    let [code, expectedPrim, expectedSlots, expectedSlots2] = TEST_CASES[i];

    try {
        const prog = await Grammar.parse(code).typecheck(schemaRetriever, true);
        const generatedSlots = Array.from(prog.iterateSlots()).map(([schema, slot, prim, scope]) => {
            if (!prim)
                return String(slot);
            else if (prim instanceof Ast.FunctionCallExpression)
                return `${slot} ${prim.name}`;
            else
                return `${slot} ${prim.selector.kind}:${prim.channel}`;
        });
        const generatedSlots2 = Array.from(prog.iterateSlots2()).map((slot) => {
            if (slot instanceof Ast.DeviceSelector)
                return `Selector(@${slot.kind})`;

            assert(slot.type instanceof Type);
            assert(slot.get() instanceof Ast.Value);
            assert(Array.isArray(slot.options));
            return slot.toString() + ' ' + slot.tag;
        });
        const generatedPrims = Array.from(prog.iteratePrimitives(true)).map(([primType, prim]) => {
            prim.schema = null;
            return `${primType}: ${prim}`;
        });

        assertArrayEquals(i, generatedPrims, expectedPrim);
        assertArrayEquals(i, generatedSlots, expectedSlots);
        assertArrayEquals(i, generatedSlots2, expectedSlots2);
    } catch(e) {
        console.error('Test Case #' + (i+1) + ': failed with exception');
        console.error(code);
        console.error('Error: ' + e.message);
        console.error(e.stack);
        if (process.env.TEST_MODE)
            throw e;
    }
}

export default async function main() {
    for (let i = 0; i < TEST_CASES.length; i++)
        await test(i);
}
if (!module.parent)
    main();
