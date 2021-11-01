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

import Compiler from '../lib/compiler';
import SchemaRetriever from '../lib/schema';

import { ExecEnvironment } from '../lib/runtime/exec_environment';
import * as builtin from '../lib/runtime/values';

import _mockSchemaDelegate from './mock_schema_delegate';
const schemaRetriever = new SchemaRetriever(_mockSchemaDelegate, null, true);

class MockAssistant {
    constructor() {
        this._outputHistory = [];
    }

    output(outputType, output) {
        this._outputHistory.push([outputType, output]);
    }

    _outputTypeMatches(type, _function) {
        const split = type.split('+');
        return split[split.length-1] === _function;
    }
}

class MockState {
    constructor(compiled) {
        this._states = [];
        this._states.length = compiled.states;
        for (let i = 0; i < this._states.length; i++)
            this._states[i] = null;

    }

    readState(stateId) {
        return this._states[stateId];
    }
    writeState(stateId, value) {
        assert(value.length >= 0);
        assert(value.length <= 4);
        assert(stateId >= 0);
        assert(stateId <= this._states.length);
        return this._states[stateId] = value;
    }
}

class MockExecEnvironment extends ExecEnvironment {
    constructor(assistant, states, triggerdata, querydata, outputdata) {
        super('en-US', 'America/Los_Angeles', schemaRetriever);

        this._trigger = triggerdata;
        this._query = querydata;
        this._actions = outputdata;

        this._states = states;
        this._assistant = assistant;
    }

    get program_id() {
        return 'uuid-XXXXXXXXXXXX';
    }
    get locale() {
        return 'en-US';
    }
    get timezone() {
        return 'America/Los_Angeles';
    }

    _getFn(kind, attrs, fname) {
        return `${kind}:${fname}`;
    }

    invokeMonitor(kind, attrs, fname, params) {
        const fn = this._getFn(kind, attrs, fname);
        if (!this._trigger || this._trigger.fn !== fn)
            throw new Error('Unexpected trigger ' + fn);

        return this._trigger.value.map((v) => [fn,v])[Symbol.iterator]();
    }
    invokeTimer(base, interval) {
        // reset base
        base = 0;

        return [{ __timestamp: base },
            { __timestamp: base+interval },
            { __timestamp: base+2*interval }][Symbol.iterator]();
    }
    /* Expiration dates ignored because no way to easily test for expiration dates */
    invokeAtTimer(time, expiration_date) {
        let times = [];
        for (let i = 0; i < time.length; i++)
            times.push({ __timestamp: time[i] });
        return times[Symbol.iterator]();
    }

    async *invokeQuery(kind, attrs, fname, params) {
        const fn = this._getFn(kind, attrs, fname);

        if (!(fn in this._query))
            throw new Error('Unexpected query ' + fn);

        for (const v of this._query[fn]) {
            if (typeof v === 'function')
                yield [fn, v(params)];
            else
                yield [fn,v];
        }
    }

    invokeDBQuery(kind, attrs, query) {
        return this.invokeQuery(kind, attrs, 'query', { query });
    }

    async *invokeAction(kind, attrs, fname, params) {
        const fn = this._getFn(kind, attrs, fname);

        const nextaction = this._actions.shift();
        if (!nextaction || nextaction.type !== 'action' || nextaction.fn !== fn)
            throw new Error('Unexpected action ' + fn);

        assert.deepStrictEqual(params, nextaction.params);
    }
    sendEndOfFlow(principal, flow) {
        const nextaction = this._actions.shift();
        if (!nextaction || nextaction.type !== 'eof')
            throw new Error('Unexpected end-of-flow');

        assert.deepStrictEqual(principal, nextaction.principal);
        assert.deepStrictEqual(flow, nextaction.flow);
    }
    output(outputType, output) {
        const nextaction = this._actions.shift();
        if (!nextaction || nextaction.type !== 'output')
            throw new Error('Unexpected output');

        assert.deepStrictEqual(outputType, nextaction.outputType);
        assert.deepStrictEqual(output, nextaction.value);

        this._assistant.output(outputType, output);
    }

    clearGetCache() {}

    readState(stateId) {
        return this._states.readState(stateId);
    }
    writeState(stateId, value) {
        return this._states.writeState(stateId, value);
    }

    loadContext(info, into) {
        return null;
    }

    reportError(message, err) {
        console.error('Test failed with error: ' + message);
        throw err;
    }
}

class SpotifyEntity extends builtin.Entity {
    softmatch(against) {
        return this.display.toLowerCase() === against || this.display.toLowerCase().replace('2', 'tu') === against;
    }
}

const TEST_CASES = [
    [`now => @com.xkcd.get_comic() => notify;`,
    null,
    { 'com.xkcd:get_comic': [
        { number: 1234, title: 'Douglas Engelbart (1925-2013)',
          link: 'https://xkcd.com/1234/',
          picture_url: 'https://imgs.xkcd.com/comics/douglas_engelbart_1925_2013.png' }
    ] },
    [
    { type: 'output',
      outputType: 'com.xkcd:get_comic',
      value: { number: 1234, title: 'Douglas Engelbart (1925-2013)',
        link: 'https://xkcd.com/1234/',
        picture_url: 'https://imgs.xkcd.com/comics/douglas_engelbart_1925_2013.png' }
    }
    ]],

    [`now => @com.xkcd.get_comic() => @com.twitter.post(status=title);`,
    null,
    { 'com.xkcd:get_comic': [
        { number: 1234, title: 'Douglas Engelbart (1925-2013)',
          link: 'https://xkcd.com/1234/',
          picture_url: 'https://imgs.xkcd.com/comics/douglas_engelbart_1925_2013.png' }
    ] },
    [
    {
     type: 'action',
     fn: 'com.twitter:post',
     params: { status: 'Douglas Engelbart (1925-2013)' }
    }
    ]],

    [`now => @com.xkcd.get_comic(), number <= 1000 => @com.twitter.post(status=title);`,
    null,
    { 'com.xkcd:get_comic': [
        { number: 1234, title: 'Douglas Engelbart (1925-2013)',
          link: 'https://xkcd.com/1234/',
          picture_url: 'https://imgs.xkcd.com/comics/douglas_engelbart_1925_2013.png' }
    ] },
    []],

    [`now => @com.xkcd.get_comic(), number >= 1234 => @com.twitter.post(status=title);`,
    null,
    { 'com.xkcd:get_comic': [
        { number: 1234, title: 'Douglas Engelbart (1925-2013)',
          link: 'https://xkcd.com/1234/',
          picture_url: 'https://imgs.xkcd.com/comics/douglas_engelbart_1925_2013.png' }
    ] },
    [
    {
     type: 'action',
     fn: 'com.twitter:post',
     params: { status: 'Douglas Engelbart (1925-2013)' }
    }
    ]],

    [`monitor(@com.xkcd.get_comic()) => @com.twitter.post(status=title);`,
    { fn: 'com.xkcd:get_comic',
      value: [
        { __timestamp: 0, number: 1, title: 'Barrel - Part 1',
          link: 'https://xkcd.com/1/',
          picture_url: 'https://imgs.xkcd.com/comics/barrel_cropped_(1).jpg' },
        { __timestamp: 1, number: 1234, title: 'Douglas Engelbart (1925-2013)',
          link: 'https://xkcd.com/1234/',
          picture_url: 'https://imgs.xkcd.com/comics/douglas_engelbart_1925_2013.png' }
      ]
    },
    {},
    [
    {
     type: 'action',
     fn: 'com.twitter:post',
     params: { status: 'Douglas Engelbart (1925-2013)' }
    }
    ]],

    [`monitor(@com.xkcd.get_comic(), number >= 1235) => @com.twitter.post(status=title);`,
    { fn: 'com.xkcd:get_comic',
      value: [
        { __timestamp: 0, number: 1, title: 'Barrel - Part 1',
          link: 'https://xkcd.com/1/',
          picture_url: 'https://imgs.xkcd.com/comics/barrel_cropped_(1).jpg' },
        { __timestamp: 1, number: 1234, title: 'Douglas Engelbart (1925-2013)',
          link: 'https://xkcd.com/1234/',
          picture_url: 'https://imgs.xkcd.com/comics/douglas_engelbart_1925_2013.png' },
        { __timestamp: 2, number: 1235, title: 'Settled',
          link: 'https://xkcd.com/1235/',
          picture_url: 'https://imgs.xkcd.com/comics/settled.png' }
      ]
    },
    {},
    [
    {
     type: 'action',
     fn: 'com.twitter:post',
     params: { status: 'Settled' }
    }
    ]],

    [`monitor(@com.xkcd.get_comic(), number >= 1234) => @com.twitter.post(status=title);`,
    { fn: 'com.xkcd:get_comic',
      value: [
        { __timestamp: 0, number: 1, title: 'Barrel - Part 1',
          link: 'https://xkcd.com/1/',
          picture_url: 'https://imgs.xkcd.com/comics/barrel_cropped_(1).jpg' },
        { __timestamp: 1, number: 1234, title: 'Douglas Engelbart (1925-2013)',
          link: 'https://xkcd.com/1234/',
          picture_url: 'https://imgs.xkcd.com/comics/douglas_engelbart_1925_2013.png' },
        { __timestamp: 2, number: 1235, title: 'Settled',
          link: 'https://xkcd.com/1235/',
          picture_url: 'https://imgs.xkcd.com/comics/settled.png' }
      ]
    },
    {},
    [
    {
     type: 'action',
     fn: 'com.twitter:post',
     params: { status: 'Douglas Engelbart (1925-2013)' }
    },
    {
     type: 'action',
     fn: 'com.twitter:post',
     params: { status: 'Settled' }
    }
    ]],

    [`monitor(@com.xkcd.get_comic()) => @com.twitter.post(status=title);`,
    { fn: 'com.xkcd:get_comic',
      value: [
        { __timestamp: 0, number: 1, title: 'Barrel - Part 1',
          link: 'https://xkcd.com/1/',
          picture_url: 'https://imgs.xkcd.com/comics/barrel_cropped_(1).jpg' },
        { __timestamp: 1, number: 1234, title: 'Douglas Engelbart (1925-2013)',
          link: 'https://xkcd.com/1234/',
          picture_url: 'https://imgs.xkcd.com/comics/douglas_engelbart_1925_2013.png' },
        { __timestamp: 1, number: 1235, title: 'Settled',
          link: 'https://xkcd.com/1235/',
          picture_url: 'https://imgs.xkcd.com/comics/settled.png' },
        { __timestamp: 2, number: 1234, title: 'Douglas Engelbart (1925-2013)',
          link: 'https://xkcd.com/1234/',
          picture_url: 'https://imgs.xkcd.com/comics/douglas_engelbart_1925_2013.png' },
        { __timestamp: 2, number: 1235, title: 'Settled',
          link: 'https://xkcd.com/1235/',
          picture_url: 'https://imgs.xkcd.com/comics/settled.png' },
        { __timestamp: 3, number: 1234, title: 'Douglas Engelbart (1925-2013)',
          link: 'https://xkcd.com/1234/',
          picture_url: 'https://imgs.xkcd.com/comics/douglas_engelbart_1925_2013.png' },
        { __timestamp: 3, number: 1235, title: 'Settled',
          link: 'https://xkcd.com/1235/',
          picture_url: 'https://imgs.xkcd.com/comics/settled.png' },
      ]
    },
    {},
    [
    {
     type: 'action',
     fn: 'com.twitter:post',
     params: { status: 'Douglas Engelbart (1925-2013)' }
    },
    {
     type: 'action',
     fn: 'com.twitter:post',
     params: { status: 'Settled' }
    }
    ]],

    [`monitor(@com.xkcd.get_comic(), number >= 1234) => @com.twitter.post(status=title);`,
    { fn: 'com.xkcd:get_comic',
      value: [
        { __timestamp: 0, number: 1, title: 'Barrel - Part 1',
          link: 'https://xkcd.com/1/',
          picture_url: 'https://imgs.xkcd.com/comics/barrel_cropped_(1).jpg' },
        { __timestamp: 1, number: 1234, title: 'Douglas Engelbart (1925-2013)',
          link: 'https://xkcd.com/1234/',
          picture_url: 'https://imgs.xkcd.com/comics/douglas_engelbart_1925_2013.png' },
        { __timestamp: 2, number: 1234, title: 'Douglas Engelbart (1925-2013)',
          link: 'https://xkcd.com/1234/',
          picture_url: 'https://imgs.xkcd.com/comics/douglas_engelbart_1925_2013.png' },
        { __timestamp: 3, number: 1235, title: 'Settled',
          link: 'https://xkcd.com/1235/',
          picture_url: 'https://imgs.xkcd.com/comics/settled.png' }
      ]
    },
    {},
    [
    {
     type: 'action',
     fn: 'com.twitter:post',
     params: { status: 'Douglas Engelbart (1925-2013)' }
    },
    {
     type: 'action',
     fn: 'com.twitter:post',
     params: { status: 'Settled' }
    }
    ]],

    [`monitor(@com.xkcd.get_comic(), number >= 1234) => @com.twitter.post(status=title);`,
    { fn: 'com.xkcd:get_comic',
      value: [
        { __timestamp: 0, number: 1, title: 'Barrel - Part 1',
          link: 'https://xkcd.com/1/',
          picture_url: 'https://imgs.xkcd.com/comics/barrel_cropped_(1).jpg' },
        { __timestamp: 1, number: 1234, title: 'Douglas Engelbart (1925-2013)',
          link: 'https://xkcd.com/1234/',
          picture_url: 'https://imgs.xkcd.com/comics/douglas_engelbart_1925_2013.png' },
        { __timestamp: 1, number: 1234, title: 'Douglas Engelbart (1925-2013)',
          link: 'https://xkcd.com/1234/',
          picture_url: 'https://imgs.xkcd.com/comics/douglas_engelbart_1925_2013.png' },
        { __timestamp: 2, number: 1235, title: 'Settled',
          link: 'https://xkcd.com/1235/',
          picture_url: 'https://imgs.xkcd.com/comics/settled.png' }
      ]
    },
    {},
    [
    {
     type: 'action',
     fn: 'com.twitter:post',
     params: { status: 'Douglas Engelbart (1925-2013)' }
    },
    {
     type: 'action',
     fn: 'com.twitter:post',
     params: { status: 'Douglas Engelbart (1925-2013)' }
    },
    {
     type: 'action',
     fn: 'com.twitter:post',
     params: { status: 'Settled' }
    }
    ]],

    [`monitor(@com.xkcd.get_comic(), number >= 1234) => @com.twitter.post(status=title);`,
    { fn: 'com.xkcd:get_comic',
      value: [
        { __timestamp: 0, number: 1, title: 'Barrel - Part 1',
          link: 'https://xkcd.com/1/',
          picture_url: 'https://imgs.xkcd.com/comics/barrel_cropped_(1).jpg' },
        { __timestamp: 1, number: 1234, title: 'Douglas Engelbart (1925-2013)',
          link: 'https://xkcd.com/1234/',
          picture_url: 'https://imgs.xkcd.com/comics/douglas_engelbart_1925_2013.png' },
        { __timestamp: 2, number: 1235, title: 'Settled',
          link: 'https://xkcd.com/1235/',
          picture_url: 'https://imgs.xkcd.com/comics/settled.png' },
        { __timestamp: 3, number: 1234, title: 'Douglas Engelbart (1925-2013)',
          link: 'https://xkcd.com/1234/',
          picture_url: 'https://imgs.xkcd.com/comics/douglas_engelbart_1925_2013.png' },
      ]
    },
    {},
    [
    {
     type: 'action',
     fn: 'com.twitter:post',
     params: { status: 'Douglas Engelbart (1925-2013)' }
    },
    {
     type: 'action',
     fn: 'com.twitter:post',
     params: { status: 'Settled' }
    },
    {
     type: 'action',
     fn: 'com.twitter:post',
     params: { status: 'Douglas Engelbart (1925-2013)' }
    },
    ]],

    [`monitor(@com.xkcd.get_comic(), number >= 1234) => @com.twitter.post(status=title);`,
    { fn: 'com.xkcd:get_comic',
      value: [
        { __timestamp: 0, number: 1, title: 'Barrel - Part 1',
          link: 'https://xkcd.com/1/',
          picture_url: 'https://imgs.xkcd.com/comics/barrel_cropped_(1).jpg' },
        { __timestamp: 1, number: 1234, title: 'Douglas Engelbart (1925-2013)',
          link: 'https://xkcd.com/1234/',
          picture_url: 'https://imgs.xkcd.com/comics/douglas_engelbart_1925_2013.png' },
        { __timestamp: 2, number: 1235, title: 'Settled',
          link: 'https://xkcd.com/1235/',
          picture_url: 'https://imgs.xkcd.com/comics/settled.png' },
        { __timestamp: 3, number: 1236, title: 'Seashell',
          link: 'https://xkcd.com/1236/',
          picture_url: 'https://imgs.xkcd.com/comics/seashell_2x.png' },
        { __timestamp: 4, number: 1237, title: 'QR Code',
          link: 'https://xkcd.com/1237/',
          picture_url: 'https://imgs.xkcd.com/comics/qr_code_2x.png' },
      ]
    },
    {},
    [
    {
     type: 'action',
     fn: 'com.twitter:post',
     params: { status: 'Douglas Engelbart (1925-2013)' }
    },
    {
     type: 'action',
     fn: 'com.twitter:post',
     params: { status: 'Settled' }
    },
    {
     type: 'action',
     fn: 'com.twitter:post',
     params: { status: 'Seashell' }
    },
    {
     type: 'action',
     fn: 'com.twitter:post',
     params: { status: 'QR Code' }
    },
    ]],

    [`monitor(@com.xkcd.get_comic(), number >= 1234) => @com.twitter.post(status=title);`,
    { fn: 'com.xkcd:get_comic',
      value: [
        { __timestamp: 0, number: 1, title: 'Barrel - Part 1',
          link: 'https://xkcd.com/1/',
          picture_url: 'https://imgs.xkcd.com/comics/barrel_cropped_(1).jpg' },
        { __timestamp: 1, number: 1234, title: 'Douglas Engelbart (1925-2013)',
          link: 'https://xkcd.com/1234/',
          picture_url: 'https://imgs.xkcd.com/comics/douglas_engelbart_1925_2013.png' },
        { __timestamp: 2, number: 1235, title: 'Settled',
          link: 'https://xkcd.com/1235/',
          picture_url: 'https://imgs.xkcd.com/comics/settled.png' },
        { __timestamp: 3, number: 1236, title: 'Seashell',
          link: 'https://xkcd.com/1236/',
          picture_url: 'https://imgs.xkcd.com/comics/seashell_2x.png' },
        { __timestamp: 3, number: 1237, title: 'QR Code',
          link: 'https://xkcd.com/1237/',
          picture_url: 'https://imgs.xkcd.com/comics/qr_code_2x.png' },
      ]
    },
    {},
    [
    {
     type: 'action',
     fn: 'com.twitter:post',
     params: { status: 'Douglas Engelbart (1925-2013)' }
    },
    {
     type: 'action',
     fn: 'com.twitter:post',
     params: { status: 'Settled' }
    },
    {
     type: 'action',
     fn: 'com.twitter:post',
     params: { status: 'Seashell' }
    },
    {
     type: 'action',
     fn: 'com.twitter:post',
     params: { status: 'QR Code' }
    },
    ]],

    [`monitor(@com.xkcd.get_comic(), number >= 1234) => @com.twitter.post(status=title);`,
    { fn: 'com.xkcd:get_comic',
      value: [
        { __timestamp: 0, number: 1, title: 'Barrel - Part 1',
          link: 'https://xkcd.com/1/',
          picture_url: 'https://imgs.xkcd.com/comics/barrel_cropped_(1).jpg' },
        { __timestamp: 1, number: 1234, title: 'Douglas Engelbart (1925-2013)',
          link: 'https://xkcd.com/1234/',
          picture_url: 'https://imgs.xkcd.com/comics/douglas_engelbart_1925_2013.png' },
        { __timestamp: 1, number: 1235, title: 'Settled',
          link: 'https://xkcd.com/1235/',
          picture_url: 'https://imgs.xkcd.com/comics/settled.png' },
        { __timestamp: 2, number: 1234, title: 'Douglas Engelbart (1925-2013)',
          link: 'https://xkcd.com/1234/',
          picture_url: 'https://imgs.xkcd.com/comics/douglas_engelbart_1925_2013.png' },
      ]
    },
    {},
    [
    {
     type: 'action',
     fn: 'com.twitter:post',
     params: { status: 'Douglas Engelbart (1925-2013)' }
    },
    {
     type: 'action',
     fn: 'com.twitter:post',
     params: { status: 'Settled' }
    }
    ]],

    [`monitor(@com.xkcd.get_comic()) => @com.yandex.translate.translate(target_language="it"^^tt:iso_lang_code, text=title) => @com.twitter.post(status=translated_text);`,
    { fn: 'com.xkcd:get_comic',
      value: [
        { __timestamp: 0, number: 1, title: 'Barrel - Part 1',
          link: 'https://xkcd.com/1/',
          picture_url: 'https://imgs.xkcd.com/comics/barrel_cropped_(1).jpg' },
        { __timestamp: 1, number: 1234, title: 'Douglas Engelbart (1925-2013)',
          link: 'https://xkcd.com/1234/',
          picture_url: 'https://imgs.xkcd.com/comics/douglas_engelbart_1925_2013.png' }
      ]
    },
    {
        'com.yandex.translate:translate': [(params) => {
            assert(params.text);
            assert(params.target_language instanceof builtin.Entity);
            assert.strictEqual(params.target_language.value, 'it');

            assert.strictEqual(params.text, 'Douglas Engelbart (1925-2013)');
            return { translated_text: 'some translation' };
        }]
    },
    [
    {
     type: 'action',
     fn: 'com.twitter:post',
     params: { status: 'some translation' }
    }
    ]],

    [`monitor(@com.xkcd.get_comic()) => @com.yandex.translate.translate(target_language="it"^^tt:iso_lang_code, text=title) => @com.twitter.post(status=translated_text);`,
    { fn: 'com.xkcd:get_comic',
      value: [
        { __timestamp: 0, number: 1, title: 'Barrel - Part 1',
          link: 'https://xkcd.com/1/',
          picture_url: 'https://imgs.xkcd.com/comics/barrel_cropped_(1).jpg' },
        { __timestamp: 1, number: 1234, title: 'Douglas Engelbart (1925-2013)',
          link: 'https://xkcd.com/1234/',
          picture_url: 'https://imgs.xkcd.com/comics/douglas_engelbart_1925_2013.png' },
        { __timestamp: 2, number: 1235, title: 'Settled',
          link: 'https://xkcd.com/1235/',
          picture_url: 'https://imgs.xkcd.com/comics/settled.png' },
      ]
    },
    {
        'com.yandex.translate:translate': [(params) => {
            assert(params.text);
            assert(params.target_language instanceof builtin.Entity);
            assert.strictEqual(params.target_language.value, 'it');

            if (params.text === 'Settled')
                return { translated_text: 'Deciso' }; // in this context...
            else
                return { translated_text: params.text };
        }]
    },
    [
    {
     type: 'action',
     fn: 'com.twitter:post',
     params: { status: 'Douglas Engelbart (1925-2013)' }
    },
    {
     type: 'action',
     fn: 'com.twitter:post',
     params: { status: 'Deciso' }
    }
    ]],

    [`monitor(@com.xkcd.get_comic()) => @com.yandex.translate.translate(target_language="it"^^tt:iso_lang_code, text=title) => @com.twitter.post(status=translated_text);`,
    { fn: 'com.xkcd:get_comic',
      value: [
        { __timestamp: 0, number: 1, title: 'Barrel - Part 1',
          link: 'https://xkcd.com/1/',
          picture_url: 'https://imgs.xkcd.com/comics/barrel_cropped_(1).jpg' },
        { __timestamp: 1, number: 1234, title: 'Douglas Engelbart (1925-2013)',
          link: 'https://xkcd.com/1234/',
          picture_url: 'https://imgs.xkcd.com/comics/douglas_engelbart_1925_2013.png' },
        { __timestamp: 1, number: 1235, title: 'Settled',
          link: 'https://xkcd.com/1235/',
          picture_url: 'https://imgs.xkcd.com/comics/settled.png' },
      ]
    },
    {
        'com.yandex.translate:translate': [(params) => {
            assert(params.text);
            assert(params.target_language instanceof builtin.Entity);
            assert.strictEqual(params.target_language.value, 'it');

            if (params.text === 'Settled')
                return { translated_text: 'Deciso' }; // in this context...
            else
                return { translated_text: params.text };
        }]
    },
    [
    {
     type: 'action',
     fn: 'com.twitter:post',
     params: { status: 'Douglas Engelbart (1925-2013)' }
    },
    {
     type: 'action',
     fn: 'com.twitter:post',
     params: { status: 'Deciso' }
    }
    ]],

    [`monitor(@com.xkcd.get_comic()) => @com.yandex.translate.translate(target_language="it"^^tt:iso_lang_code, text=title), translated_text =~ "deciso" => @com.twitter.post(status=translated_text);`,
    { fn: 'com.xkcd:get_comic',
      value: [
        { __timestamp: 0, number: 1, title: 'Barrel - Part 1',
          link: 'https://xkcd.com/1/',
          picture_url: 'https://imgs.xkcd.com/comics/barrel_cropped_(1).jpg' },
        { __timestamp: 1, number: 1234, title: 'Douglas Engelbart (1925-2013)',
          link: 'https://xkcd.com/1234/',
          picture_url: 'https://imgs.xkcd.com/comics/douglas_engelbart_1925_2013.png' },
        { __timestamp: 1, number: 1235, title: 'Settled',
          link: 'https://xkcd.com/1235/',
          picture_url: 'https://imgs.xkcd.com/comics/settled.png' },
      ]
    },
    {
        'com.yandex.translate:translate': [(params) => {
            assert(params.text);
            assert(params.target_language instanceof builtin.Entity);
            assert.strictEqual(params.target_language.value, 'it');

            if (params.text === 'Settled')
                return { translated_text: 'Deciso' }; // in this context...
            else
                return { translated_text: params.text };
        }]
    },
    [
    {
     type: 'action',
     fn: 'com.twitter:post',
     params: { status: 'Deciso' }
    }
    ]],

    [`monitor(@com.xkcd.get_comic()) => @com.yandex.translate.translate(target_language="it"^^tt:iso_lang_code, text=title), translated_text == "Deciso" => @com.twitter.post(status=translated_text);`,
    { fn: 'com.xkcd:get_comic',
      value: [
        { __timestamp: 0, number: 1, title: 'Barrel - Part 1',
          link: 'https://xkcd.com/1/',
          picture_url: 'https://imgs.xkcd.com/comics/barrel_cropped_(1).jpg' },
        { __timestamp: 1, number: 1234, title: 'Douglas Engelbart (1925-2013)',
          link: 'https://xkcd.com/1234/',
          picture_url: 'https://imgs.xkcd.com/comics/douglas_engelbart_1925_2013.png' },
        { __timestamp: 1, number: 1235, title: 'Settled',
          link: 'https://xkcd.com/1235/',
          picture_url: 'https://imgs.xkcd.com/comics/settled.png' },
      ]
    },
    {
        'com.yandex.translate:translate': [(params) => {
            assert(params.text);
            assert(params.target_language instanceof builtin.Entity);
            assert.strictEqual(params.target_language.value, 'it');

            if (params.text === 'Settled')
                return { translated_text: 'Deciso' }; // in this context...
            else
                return { translated_text: params.text };
        }]
    },
    [
    {
     type: 'action',
     fn: 'com.twitter:post',
     params: { status: 'Deciso' }
    }
    ]],

    [`monitor(@com.xkcd.get_comic()) => @com.yandex.translate.translate(target_language="it"^^tt:iso_lang_code,text=title), translated_text =~ "deciso" => @com.twitter.post(status=translated_text);`,
    { fn: 'com.xkcd:get_comic',
      value: [
        { __timestamp: 0, number: 1, title: 'Barrel - Part 1',
          link: 'https://xkcd.com/1/',
          picture_url: 'https://imgs.xkcd.com/comics/barrel_cropped_(1).jpg' },
        { __timestamp: 1, number: 1234, title: 'Douglas Engelbart (1925-2013)',
          link: 'https://xkcd.com/1234/',
          picture_url: 'https://imgs.xkcd.com/comics/douglas_engelbart_1925_2013.png' },
        { __timestamp: 1, number: 1235, title: 'Settled',
          link: 'https://xkcd.com/1235/',
          picture_url: 'https://imgs.xkcd.com/comics/settled.png' },
      ]
    },
    {
        'com.yandex.translate:translate': [(params) => {
            assert(params.text);
            assert(params.target_language instanceof builtin.Entity);
            assert.strictEqual(params.target_language.value, 'it');

            if (params.text === 'Settled')
                return { translated_text: 'Deciso' }; // in this context...
            else
                return { translated_text: params.text };
        }]
    },
    [
    {
     type: 'action',
     fn: 'com.twitter:post',
     params: { status: 'Deciso' }
    }
    ]],

    [
    `now => @com.xkcd.get_comic() => @com.yandex.translate.translate(target_language="it"^^tt:iso_lang_code, text=title), translated_text =~ "deciso" => notify;`,
    {},
    {
        'com.xkcd:get_comic': [() => {
            return { number: 1235, title: 'Settled',
                link: 'https://xkcd.com/1235/',
                picture_url: 'https://imgs.xkcd.com/comics/settled.png' };
        }],

        'com.yandex.translate:translate': [(params) => {
            assert(params.text);
            assert(params.target_language instanceof builtin.Entity);
            assert.strictEqual(params.target_language.value, 'it');

            if (params.text === 'Settled')
                return { translated_text: 'Deciso' }; // in this context...
            else
                return { translated_text: params.text };
        }]
    },
    [{ type: 'output',
      outputType: 'com.xkcd:get_comic+com.yandex.translate:translate',
      value: { number: 1235, title: 'Settled',
        link: 'https://xkcd.com/1235/',
        picture_url: 'https://imgs.xkcd.com/comics/settled.png',
        __response: undefined,
        alt_text: undefined,
        target_language: new builtin.Entity('it', null),
        source_language: undefined,
        text: 'Settled',
        translated_text: 'Deciso' }
    }],

    ],

    [
    `now => @com.xkcd.get_comic() => @com.yandex.translate.translate(target_language="it"^^tt:iso_lang_code, text=title), translated_text =~ "deciso" => notify;`,
    {},
    {
        'com.xkcd:get_comic': [() => {
            return { number: 1235, title: 'Settled',
                link: 'https://xkcd.com/1235/',
                picture_url: 'https://imgs.xkcd.com/comics/settled.png' };
        }],

        'com.yandex.translate:translate': [(params) => {
            assert(params.text);
            assert(params.target_language instanceof builtin.Entity);
            assert.strictEqual(params.target_language.value, 'it');

            if (params.text === 'Settled')
                return { translated_text: 'Deciso' }; // in this context...
            else
                return { translated_text: params.text };
        }]
    },
    [{ type: 'output',
      outputType: 'com.xkcd:get_comic+com.yandex.translate:translate',
      value: { number: 1235, title: 'Settled',
        link: 'https://xkcd.com/1235/',
        picture_url: 'https://imgs.xkcd.com/comics/settled.png',
        __response: undefined,
        alt_text: undefined,
        target_language: new builtin.Entity('it', null),
        source_language: undefined,
        text: 'Settled',
        translated_text: 'Deciso' }
    }],

    ],

    [
    `now => @com.xkcd.get_comic() => @com.yandex.translate.translate(target_language="it"^^tt:iso_lang_code, text=title), translated_text =~ "fuffa" => notify;`,
    {},
    {
        'com.xkcd:get_comic': [() => {
            return { number: 1235, title: 'Settled',
                link: 'https://xkcd.com/1235/',
                picture_url: 'https://imgs.xkcd.com/comics/settled.png' };
        }],

        'com.yandex.translate:translate': [(params) => {
            assert(params.text);
            assert(params.target_language instanceof builtin.Entity);
            assert.strictEqual(params.target_language.value, 'it');

            if (params.text === 'Settled')
                return { translated_text: 'Deciso' }; // in this context...
            else
                return { translated_text: params.text };
        }]
    },
    [],

    ],

    [
    `now => @com.tesla.car.get_drive_state() => @com.tesla.car.get_charge_state(),  charge_port_latch == "Engaged" => notify;`,
    {},
    {
        'com.tesla.car:get_drive_state': [() => {
            return { location: new builtin.Location(90,0, 'North Pole') };
        }],

        'com.tesla.car:get_charge_state': [(params) => {
            return {
                 charge_port_latch: 'Engaged'
            };
        }]
    },
    [{ type: 'output',
      outputType: 'com.tesla.car:get_drive_state+com.tesla.car:get_charge_state',
      value: {
        location: new builtin.Location(90,0, 'North Pole'),
        charge_port_latch: 'Engaged',
      }
    }],

    ],

    [
    `now => @com.tesla.car.get_drive_state() => @com.tesla.car.get_charge_state(),  !(charge_port_latch == "Engaged") => notify;`,
    {},
    {
        'com.tesla.car:get_drive_state': [() => {
            return { location: new builtin.Location(90,0, 'North Pole') };
        }],

        'com.tesla.car:get_charge_state': [(params) => {
            return {
                 charge_port_latch: 'Engaged'
            };
        }]
    },
    [],

    ],

    [
    `now => count(@com.xkcd.get_comic()) => notify;`,
    {},
    {
        'com.xkcd:get_comic': [{
            number: 1235, title: 'Settled',
            link: 'https://xkcd.com/1235/',
            picture_url: 'https://imgs.xkcd.com/comics/settled.png'
        }, {
            number: 1234, title: 'Douglas Engelbart (1925-2013)',
            link: 'https://xkcd.com/1234/',
            picture_url: 'https://imgs.xkcd.com/comics/douglas_engelbart_1925_2013.png'
        }],
    },
    [{ type: 'output',
      outputType: 'count(com.xkcd:get_comic)',
      value: { count: 2 }
    }],

    ],

    [
    `now => count(@com.xkcd.get_comic()) => notify;`,
    {},
    {
        'com.xkcd:get_comic': [{
            number: 1235, title: 'Settled',
            link: 'https://xkcd.com/1235/',
            picture_url: 'https://imgs.xkcd.com/comics/settled.png'
        }, {
            number: 1235, title: 'Settled',
            link: 'https://xkcd.com/1235/',
            picture_url: 'https://imgs.xkcd.com/comics/settled.png'
        }, {
            number: 1234, title: 'Douglas Engelbart (1925-2013)',
            link: 'https://xkcd.com/1234/',
            picture_url: 'https://imgs.xkcd.com/comics/douglas_engelbart_1925_2013.png'
        }],
    },
    [{ type: 'output',
      outputType: 'count(com.xkcd:get_comic)',
      value: { count: 3 }
    }],

    ],

    [
    `now => count(title of @com.xkcd.get_comic()) => notify;`,
    {},
    {
        'com.xkcd:get_comic': [{
            number: 1235, title: 'Settled',
            link: 'https://xkcd.com/1235/',
            picture_url: 'https://imgs.xkcd.com/comics/settled.png'
        }, {
            number: 1235, title: 'Settled',
            link: 'https://xkcd.com/1235/',
            picture_url: 'https://imgs.xkcd.com/comics/settled.png'
        }, {
            number: 1234, title: 'Douglas Engelbart (1925-2013)',
            link: 'https://xkcd.com/1234/',
            picture_url: 'https://imgs.xkcd.com/comics/douglas_engelbart_1925_2013.png'
        }],
    },
    [{ type: 'output',
      outputType: 'count(com.xkcd:get_comic)',
      value: { title: 2 }
    }],

    ],

    [
    `now => min(file_size of @com.google.drive.list_drive_files()) => notify;`,
    {},
    {
        'com.google.drive:list_drive_files': [{
            "order_by": 'name_increasing',
            "file_id": 0,
            "file_name": 'foo.png',
            "mime_type": 'image/png',
            "description": 'a foo meme',
            "starred": false,
            "created_time": new Date(0),
            "modified_time": new Date(1),
            "file_size": 1024
        }, {
            "order_by": 'name_increasing',
            "file_id": 0,
            "file_name": 'bar.png',
            "mime_type": 'image/png',
            "description": 'a bar meme',
            "starred": false,
            "created_time": new Date(0),
            "modified_time": new Date(1),
            "file_size": 1025
        }
        ],
    },
    [{ type: 'output',
      outputType: 'min(com.google.drive:list_drive_files)',
      value: { file_size: 1024 }
    }],

    ],

    [
    `now => avg(file_size of @com.google.drive.list_drive_files()) => notify;`,
    {},
    {
        'com.google.drive:list_drive_files': [{
            "order_by": 'name_increasing',
            "file_id": 0,
            "file_name": 'foo.png',
            "mime_type": 'image/png',
            "description": 'a foo meme',
            "starred": false,
            "created_time": new Date(0),
            "modified_time": new Date(1),
            "file_size": 1024
        }, {
            "order_by": 'name_increasing',
            "file_id": 0,
            "file_name": 'bar.png',
            "mime_type": 'image/png',
            "description": 'a bar meme',
            "starred": false,
            "created_time": new Date(0),
            "modified_time": new Date(1),
            "file_size": 1025
        }
        ],
    },
    [{ type: 'output',
      outputType: 'avg(com.google.drive:list_drive_files)',
      value: { file_size: 1024.5 }
    }],

    ],

    [
    `now => sort(file_size asc of @com.google.drive.list_drive_files())[1] => notify;`,
    {},
    {
        'com.google.drive:list_drive_files': [{
            "order_by": 'name_increasing',
            "file_id": 0,
            "file_name": 'foo.png',
            "mime_type": 'image/png',
            "description": 'a foo meme',
            "starred": false,
            "created_time": new Date(0),
            "modified_time": new Date(1),
            "file_size": 1024
        }, {
            "order_by": 'name_increasing',
            "file_id": 1,
            "file_name": 'bar.png',
            "mime_type": 'image/png',
            "description": 'a bar meme',
            "starred": false,
            "created_time": new Date(0),
            "modified_time": new Date(1),
            "file_size": 1025
        }, {
            "order_by": 'name_increasing',
            "file_id": 2,
            "file_name": 'baz.png',
            "mime_type": 'image/png',
            "description": 'a baz meme',
            "starred": false,
            "created_time": new Date(0),
            "modified_time": new Date(1),
            "file_size": 1026
        }
        ],
    },
    [{ type: 'output',
      outputType: 'com.google.drive:list_drive_files',
      value: {
            "order_by": 'name_increasing',
            "file_id": 0,
            "file_name": 'foo.png',
            "mime_type": 'image/png',
            "description": 'a foo meme',
            "starred": false,
            "created_time": new Date(0),
            "modified_time": new Date(1),
            "file_size": 1024
      }
    }],

    ],

    [
    `now => sort(file_size asc of @com.google.drive.list_drive_files())[1] => notify;`,
    {},
    {
        'com.google.drive:list_drive_files': [{
            "order_by": 'name_increasing',
            "file_id": 1,
            "file_name": 'bar.png',
            "mime_type": 'image/png',
            "description": 'a bar meme',
            "starred": false,
            "created_time": new Date(0),
            "modified_time": new Date(1),
            "file_size": 1025
        }, {
            "order_by": 'name_increasing',
            "file_id": 0,
            "file_name": 'foo.png',
            "mime_type": 'image/png',
            "description": 'a foo meme',
            "starred": false,
            "created_time": new Date(0),
            "modified_time": new Date(1),
            "file_size": 1024
        }, {
            "order_by": 'name_increasing',
            "file_id": 2,
            "file_name": 'baz.png',
            "mime_type": 'image/png',
            "description": 'a baz meme',
            "starred": false,
            "created_time": new Date(0),
            "modified_time": new Date(1),
            "file_size": 1026
        }
        ],
    },
    [{ type: 'output',
      outputType: 'com.google.drive:list_drive_files',
      value: {
            "order_by": 'name_increasing',
            "file_id": 0,
            "file_name": 'foo.png',
            "mime_type": 'image/png',
            "description": 'a foo meme',
            "starred": false,
            "created_time": new Date(0),
            "modified_time": new Date(1),
            "file_size": 1024
      }
    }],

    ],

    [
    `now => sort(file_size asc of @com.google.drive.list_drive_files())[-1] => notify;`,
    {},
    {
        'com.google.drive:list_drive_files': [{
            "order_by": 'name_increasing',
            "file_id": 0,
            "file_name": 'foo.png',
            "mime_type": 'image/png',
            "description": 'a foo meme',
            "starred": false,
            "created_time": new Date(0),
            "modified_time": new Date(1),
            "file_size": 1024
        }, {
            "order_by": 'name_increasing',
            "file_id": 1,
            "file_name": 'bar.png',
            "mime_type": 'image/png',
            "description": 'a bar meme',
            "starred": false,
            "created_time": new Date(0),
            "modified_time": new Date(1),
            "file_size": 1025
        }, {
            "order_by": 'name_increasing',
            "file_id": 2,
            "file_name": 'baz.png',
            "mime_type": 'image/png',
            "description": 'a baz meme',
            "starred": false,
            "created_time": new Date(0),
            "modified_time": new Date(1),
            "file_size": 1026
        }
        ],
    },
    [{ type: 'output',
      outputType: 'com.google.drive:list_drive_files',
      value: {
            "order_by": 'name_increasing',
            "file_id": 2,
            "file_name": 'baz.png',
            "mime_type": 'image/png',
            "description": 'a baz meme',
            "starred": false,
            "created_time": new Date(0),
            "modified_time": new Date(1),
            "file_size": 1026
      }
    }],

    ],

    [
    `now => sort(file_size asc of @com.google.drive.list_drive_files())[2] => notify;`,
    {},
    {
        'com.google.drive:list_drive_files': [{
            "order_by": 'name_increasing',
            "file_id": 0,
            "file_name": 'foo.png',
            "mime_type": 'image/png',
            "description": 'a foo meme',
            "starred": false,
            "created_time": new Date(0),
            "modified_time": new Date(1),
            "file_size": 1024
        }, {
            "order_by": 'name_increasing',
            "file_id": 1,
            "file_name": 'bar.png',
            "mime_type": 'image/png',
            "description": 'a bar meme',
            "starred": false,
            "created_time": new Date(0),
            "modified_time": new Date(1),
            "file_size": 1025
        }, {
            "order_by": 'name_increasing',
            "file_id": 2,
            "file_name": 'baz.png',
            "mime_type": 'image/png',
            "description": 'a baz meme',
            "starred": false,
            "created_time": new Date(0),
            "modified_time": new Date(1),
            "file_size": 1026
        }
        ],
    },
    [{ type: 'output',
      outputType: 'com.google.drive:list_drive_files',
      value: {
            "order_by": 'name_increasing',
            "file_id": 1,
            "file_name": 'bar.png',
            "mime_type": 'image/png',
            "description": 'a bar meme',
            "starred": false,
            "created_time": new Date(0),
            "modified_time": new Date(1),
            "file_size": 1025
      }
    }],

    ],

    [
    `now => sort(file_size asc of @com.google.drive.list_drive_files())[2] => notify;`,
    {},
    {
        'com.google.drive:list_drive_files': [{
            "order_by": 'name_increasing',
            "file_id": 1,
            "file_name": 'bar.png',
            "mime_type": 'image/png',
            "description": 'a bar meme',
            "starred": false,
            "created_time": new Date(0),
            "modified_time": new Date(1),
            "file_size": 1025
        }, {
            "order_by": 'name_increasing',
            "file_id": 0,
            "file_name": 'foo.png',
            "mime_type": 'image/png',
            "description": 'a foo meme',
            "starred": false,
            "created_time": new Date(0),
            "modified_time": new Date(1),
            "file_size": 1024
        }, {
            "order_by": 'name_increasing',
            "file_id": 2,
            "file_name": 'baz.png',
            "mime_type": 'image/png',
            "description": 'a baz meme',
            "starred": false,
            "created_time": new Date(0),
            "modified_time": new Date(1),
            "file_size": 1026
        }
        ],
    },
    [{ type: 'output',
      outputType: 'com.google.drive:list_drive_files',
      value: {
            "order_by": 'name_increasing',
            "file_id": 1,
            "file_name": 'bar.png',
            "mime_type": 'image/png',
            "description": 'a bar meme',
            "starred": false,
            "created_time": new Date(0),
            "modified_time": new Date(1),
            "file_size": 1025
      }
    }],

    ],

    [
    `now => sort(file_size asc of @com.google.drive.list_drive_files())[2] => notify;`,
    {},
    {
        'com.google.drive:list_drive_files': [{
            "order_by": 'name_increasing',
            "file_id": 2,
            "file_name": 'baz.png',
            "mime_type": 'image/png',
            "description": 'a baz meme',
            "starred": false,
            "created_time": new Date(0),
            "modified_time": new Date(1),
            "file_size": 1026
        }, {
            "order_by": 'name_increasing',
            "file_id": 1,
            "file_name": 'bar.png',
            "mime_type": 'image/png',
            "description": 'a bar meme',
            "starred": false,
            "created_time": new Date(0),
            "modified_time": new Date(1),
            "file_size": 1025
        }, {
            "order_by": 'name_increasing',
            "file_id": 0,
            "file_name": 'foo.png',
            "mime_type": 'image/png',
            "description": 'a foo meme',
            "starred": false,
            "created_time": new Date(0),
            "modified_time": new Date(1),
            "file_size": 1024
        },
        ],
    },
    [{ type: 'output',
      outputType: 'com.google.drive:list_drive_files',
      value: {
            "order_by": 'name_increasing',
            "file_id": 1,
            "file_name": 'bar.png',
            "mime_type": 'image/png',
            "description": 'a bar meme',
            "starred": false,
            "created_time": new Date(0),
            "modified_time": new Date(1),
            "file_size": 1025
      }
    }],

    ],

    [
    `now => sort(file_size asc of @com.google.drive.list_drive_files())[1:2] => notify;`,
    {},
    {
        'com.google.drive:list_drive_files': [{
            "order_by": 'name_increasing',
            "file_id": 2,
            "file_name": 'baz.png',
            "mime_type": 'image/png',
            "description": 'a baz meme',
            "starred": false,
            "created_time": new Date(0),
            "modified_time": new Date(1),
            "file_size": 1026
        }, {
            "order_by": 'name_increasing',
            "file_id": 1,
            "file_name": 'bar.png',
            "mime_type": 'image/png',
            "description": 'a bar meme',
            "starred": false,
            "created_time": new Date(0),
            "modified_time": new Date(1),
            "file_size": 1025
        }, {
            "order_by": 'name_increasing',
            "file_id": 0,
            "file_name": 'foo.png',
            "mime_type": 'image/png',
            "description": 'a foo meme',
            "starred": false,
            "created_time": new Date(0),
            "modified_time": new Date(1),
            "file_size": 1024
        },
        ],
    },
    [{ type: 'output',
      outputType: 'com.google.drive:list_drive_files',
      value: {
            "order_by": 'name_increasing',
            "file_id": 0,
            "file_name": 'foo.png',
            "mime_type": 'image/png',
            "description": 'a foo meme',
            "starred": false,
            "created_time": new Date(0),
            "modified_time": new Date(1),
            "file_size": 1024
      }
    }, {
      type: 'output',
      outputType: 'com.google.drive:list_drive_files',
      value: {
            "order_by": 'name_increasing',
            "file_id": 1,
            "file_name": 'bar.png',
            "mime_type": 'image/png',
            "description": 'a bar meme',
            "starred": false,
            "created_time": new Date(0),
            "modified_time": new Date(1),
            "file_size": 1025
      }
    }],

    ],

    [
    `now => sort(file_size asc of @com.google.drive.list_drive_files())[2:2] => notify;`,
    {},
    {
        'com.google.drive:list_drive_files': [{
            "order_by": 'name_increasing',
            "file_id": 2,
            "file_name": 'baz.png',
            "mime_type": 'image/png',
            "description": 'a baz meme',
            "starred": false,
            "created_time": new Date(0),
            "modified_time": new Date(1),
            "file_size": 1026
        }, {
            "order_by": 'name_increasing',
            "file_id": 1,
            "file_name": 'bar.png',
            "mime_type": 'image/png',
            "description": 'a bar meme',
            "starred": false,
            "created_time": new Date(0),
            "modified_time": new Date(1),
            "file_size": 1025
        }, {
            "order_by": 'name_increasing',
            "file_id": 0,
            "file_name": 'foo.png',
            "mime_type": 'image/png',
            "description": 'a foo meme',
            "starred": false,
            "created_time": new Date(0),
            "modified_time": new Date(1),
            "file_size": 1024
        },
        ],
    },
    [{ type: 'output',
      outputType: 'com.google.drive:list_drive_files',
      value: {
            "order_by": 'name_increasing',
            "file_id": 1,
            "file_name": 'bar.png',
            "mime_type": 'image/png',
            "description": 'a bar meme',
            "starred": false,
            "created_time": new Date(0),
            "modified_time": new Date(1),
            "file_size": 1025
      }
    }, {
      type: 'output',
      outputType: 'com.google.drive:list_drive_files',
      value: {
            "order_by": 'name_increasing',
            "file_id": 2,
            "file_name": 'baz.png',
            "mime_type": 'image/png',
            "description": 'a baz meme',
            "starred": false,
            "created_time": new Date(0),
            "modified_time": new Date(1),
            "file_size": 1026
      }
    }],

    ],

    [
    `now => sort(file_size asc of @com.google.drive.list_drive_files())[2:3] => notify;`,
    {},
    {
        'com.google.drive:list_drive_files': [{
            "order_by": 'name_increasing',
            "file_id": 2,
            "file_name": 'baz.png',
            "mime_type": 'image/png',
            "description": 'a baz meme',
            "starred": false,
            "created_time": new Date(0),
            "modified_time": new Date(1),
            "file_size": 1026
        }, {
            "order_by": 'name_increasing',
            "file_id": 1,
            "file_name": 'bar.png',
            "mime_type": 'image/png',
            "description": 'a bar meme',
            "starred": false,
            "created_time": new Date(0),
            "modified_time": new Date(1),
            "file_size": 1025
        }, {
            "order_by": 'name_increasing',
            "file_id": 0,
            "file_name": 'foo.png',
            "mime_type": 'image/png',
            "description": 'a foo meme',
            "starred": false,
            "created_time": new Date(0),
            "modified_time": new Date(1),
            "file_size": 1024
        },
        ],
    },
    [{ type: 'output',
      outputType: 'com.google.drive:list_drive_files',
      value: {
            "order_by": 'name_increasing',
            "file_id": 1,
            "file_name": 'bar.png',
            "mime_type": 'image/png',
            "description": 'a bar meme',
            "starred": false,
            "created_time": new Date(0),
            "modified_time": new Date(1),
            "file_size": 1025
      }
    }, {
      type: 'output',
      outputType: 'com.google.drive:list_drive_files',
      value: {
            "order_by": 'name_increasing',
            "file_id": 2,
            "file_name": 'baz.png',
            "mime_type": 'image/png',
            "description": 'a baz meme',
            "starred": false,
            "created_time": new Date(0),
            "modified_time": new Date(1),
            "file_size": 1026
      }
    }],

    ],

    [
    `now => sort(file_size asc of @com.google.drive.list_drive_files()) => notify;`,
    {},
    {
        'com.google.drive:list_drive_files': [{
            "order_by": 'name_increasing',
            "file_id": 2,
            "file_name": 'baz.png',
            "mime_type": 'image/png',
            "description": 'a baz meme',
            "starred": false,
            "created_time": new Date(0),
            "modified_time": new Date(1),
            "file_size": 1026
        }, {
            "order_by": 'name_increasing',
            "file_id": 1,
            "file_name": 'bar.png',
            "mime_type": 'image/png',
            "description": 'a bar meme',
            "starred": false,
            "created_time": new Date(0),
            "modified_time": new Date(1),
            "file_size": 1025
        }, {
            "order_by": 'name_increasing',
            "file_id": 0,
            "file_name": 'foo.png',
            "mime_type": 'image/png',
            "description": 'a foo meme',
            "starred": false,
            "created_time": new Date(0),
            "modified_time": new Date(1),
            "file_size": 1024
        },
        ],
    },
    [{
      type: 'output',
      outputType: 'com.google.drive:list_drive_files',
      value: {
            "order_by": 'name_increasing',
            "file_id": 0,
            "file_name": 'foo.png',
            "mime_type": 'image/png',
            "description": 'a foo meme',
            "starred": false,
            "created_time": new Date(0),
            "modified_time": new Date(1),
            "file_size": 1024
      },
    }, {
      type: 'output',
      outputType: 'com.google.drive:list_drive_files',
      value: {
            "order_by": 'name_increasing',
            "file_id": 1,
            "file_name": 'bar.png',
            "mime_type": 'image/png',
            "description": 'a bar meme',
            "starred": false,
            "created_time": new Date(0),
            "modified_time": new Date(1),
            "file_size": 1025
      }
    }, {
      type: 'output',
      outputType: 'com.google.drive:list_drive_files',
      value: {
            "order_by": 'name_increasing',
            "file_id": 2,
            "file_name": 'baz.png',
            "mime_type": 'image/png',
            "description": 'a baz meme',
            "starred": false,
            "created_time": new Date(0),
            "modified_time": new Date(1),
            "file_size": 1026
      }
    }],

    ],

    [
    `now => sort(file_size desc of @com.google.drive.list_drive_files()) => notify;`,
    {},
    {
        'com.google.drive:list_drive_files': [{
            "order_by": 'name_increasing',
            "file_id": 2,
            "file_name": 'baz.png',
            "mime_type": 'image/png',
            "description": 'a baz meme',
            "starred": false,
            "created_time": new Date(0),
            "modified_time": new Date(1),
            "file_size": 1026
        }, {
            "order_by": 'name_increasing',
            "file_id": 1,
            "file_name": 'bar.png',
            "mime_type": 'image/png',
            "description": 'a bar meme',
            "starred": false,
            "created_time": new Date(0),
            "modified_time": new Date(1),
            "file_size": 1025
        }, {
            "order_by": 'name_increasing',
            "file_id": 0,
            "file_name": 'foo.png',
            "mime_type": 'image/png',
            "description": 'a foo meme',
            "starred": false,
            "created_time": new Date(0),
            "modified_time": new Date(1),
            "file_size": 1024
        },
        ],
    },
    [ {
      type: 'output',
      outputType: 'com.google.drive:list_drive_files',
      value: {
            "order_by": 'name_increasing',
            "file_id": 2,
            "file_name": 'baz.png',
            "mime_type": 'image/png',
            "description": 'a baz meme',
            "starred": false,
            "created_time": new Date(0),
            "modified_time": new Date(1),
            "file_size": 1026
      }
    }, {
      type: 'output',
      outputType: 'com.google.drive:list_drive_files',
      value: {
            "order_by": 'name_increasing',
            "file_id": 1,
            "file_name": 'bar.png',
            "mime_type": 'image/png',
            "description": 'a bar meme',
            "starred": false,
            "created_time": new Date(0),
            "modified_time": new Date(1),
            "file_size": 1025
      }
    }, {
      type: 'output',
      outputType: 'com.google.drive:list_drive_files',
      value: {
            "order_by": 'name_increasing',
            "file_id": 0,
            "file_name": 'foo.png',
            "mime_type": 'image/png',
            "description": 'a foo meme',
            "starred": false,
            "created_time": new Date(0),
            "modified_time": new Date(1),
            "file_size": 1024
      },
    }],

    ],

    [
    `now => (@com.google.drive.list_drive_files())[1] => notify;`,
    {},
    {
        'com.google.drive:list_drive_files': [{
            "order_by": 'name_increasing',
            "file_id": 2,
            "file_name": 'baz.png',
            "mime_type": 'image/png',
            "description": 'a baz meme',
            "starred": false,
            "created_time": new Date(0),
            "modified_time": new Date(1),
            "file_size": 1026
        }, {
            "order_by": 'name_increasing',
            "file_id": 1,
            "file_name": 'bar.png',
            "mime_type": 'image/png',
            "description": 'a bar meme',
            "starred": false,
            "created_time": new Date(0),
            "modified_time": new Date(1),
            "file_size": 1025
        }, {
            "order_by": 'name_increasing',
            "file_id": 0,
            "file_name": 'foo.png',
            "mime_type": 'image/png',
            "description": 'a foo meme',
            "starred": false,
            "created_time": new Date(0),
            "modified_time": new Date(1),
            "file_size": 1024
        },
        ],
    },
    [ {
      type: 'output',
      outputType: 'com.google.drive:list_drive_files',
      value: {
            "order_by": 'name_increasing',
            "file_id": 2,
            "file_name": 'baz.png',
            "mime_type": 'image/png',
            "description": 'a baz meme',
            "starred": false,
            "created_time": new Date(0),
            "modified_time": new Date(1),
            "file_size": 1026
      }
    }],

    ],

    [
    `now => (@com.google.drive.list_drive_files())[2] => notify;`,
    {},
    {
        'com.google.drive:list_drive_files': [{
            "order_by": 'name_increasing',
            "file_id": 2,
            "file_name": 'baz.png',
            "mime_type": 'image/png',
            "description": 'a baz meme',
            "starred": false,
            "created_time": new Date(0),
            "modified_time": new Date(1),
            "file_size": 1026
        }, {
            "order_by": 'name_increasing',
            "file_id": 1,
            "file_name": 'bar.png',
            "mime_type": 'image/png',
            "description": 'a bar meme',
            "starred": false,
            "created_time": new Date(0),
            "modified_time": new Date(1),
            "file_size": 1025
        }, {
            "order_by": 'name_increasing',
            "file_id": 0,
            "file_name": 'foo.png',
            "mime_type": 'image/png',
            "description": 'a foo meme',
            "starred": false,
            "created_time": new Date(0),
            "modified_time": new Date(1),
            "file_size": 1024
        },
        ],
    },
    [ {
      type: 'output',
      outputType: 'com.google.drive:list_drive_files',
      value: {
            "order_by": 'name_increasing',
            "file_id": 1,
            "file_name": 'bar.png',
            "mime_type": 'image/png',
            "description": 'a bar meme',
            "starred": false,
            "created_time": new Date(0),
            "modified_time": new Date(1),
            "file_size": 1025
      }
    }],

    ],

    // a negative index triggers the advanced indexing path
    [
    `now => (@com.google.drive.list_drive_files())[-2] => notify;`,
    {},
    {
        'com.google.drive:list_drive_files': [{
            "order_by": 'name_increasing',
            "file_id": 2,
            "file_name": 'baz.png',
            "mime_type": 'image/png',
            "description": 'a baz meme',
            "starred": false,
            "created_time": new Date(0),
            "modified_time": new Date(1),
            "file_size": 1026
        }, {
            "order_by": 'name_increasing',
            "file_id": 1,
            "file_name": 'bar.png',
            "mime_type": 'image/png',
            "description": 'a bar meme',
            "starred": false,
            "created_time": new Date(0),
            "modified_time": new Date(1),
            "file_size": 1025
        }, {
            "order_by": 'name_increasing',
            "file_id": 0,
            "file_name": 'foo.png',
            "mime_type": 'image/png',
            "description": 'a foo meme',
            "starred": false,
            "created_time": new Date(0),
            "modified_time": new Date(1),
            "file_size": 1024
        },
        ],
    },
    [ {
      type: 'output',
      outputType: 'com.google.drive:list_drive_files',
      value: {
            "order_by": 'name_increasing',
            "file_id": 1,
            "file_name": 'bar.png',
            "mime_type": 'image/png',
            "description": 'a bar meme',
            "starred": false,
            "created_time": new Date(0),
            "modified_time": new Date(1),
            "file_size": 1025
      }
    }],

    ],

    // multiple indices also trigger the advanced indexing path
    [
    `now => (@com.google.drive.list_drive_files())[1, 3] => notify;`,
    {},
    {
        'com.google.drive:list_drive_files': [{
            "order_by": 'name_increasing',
            "file_id": 2,
            "file_name": 'baz.png',
            "mime_type": 'image/png',
            "description": 'a baz meme',
            "starred": false,
            "created_time": new Date(0),
            "modified_time": new Date(1),
            "file_size": 1026
        }, {
            "order_by": 'name_increasing',
            "file_id": 1,
            "file_name": 'bar.png',
            "mime_type": 'image/png',
            "description": 'a bar meme',
            "starred": false,
            "created_time": new Date(0),
            "modified_time": new Date(1),
            "file_size": 1025
        }, {
            "order_by": 'name_increasing',
            "file_id": 0,
            "file_name": 'foo.png',
            "mime_type": 'image/png',
            "description": 'a foo meme',
            "starred": false,
            "created_time": new Date(0),
            "modified_time": new Date(1),
            "file_size": 1024
        },
        ],
    },
    [ {
      type: 'output',
      outputType: 'com.google.drive:list_drive_files',
      value: {
            "order_by": 'name_increasing',
            "file_id": 2,
            "file_name": 'baz.png',
            "mime_type": 'image/png',
            "description": 'a baz meme',
            "starred": false,
            "created_time": new Date(0),
            "modified_time": new Date(1),
            "file_size": 1026
      }
    }, {
      type: 'output',
      outputType: 'com.google.drive:list_drive_files',
      value: {
            "order_by": 'name_increasing',
            "file_id": 0,
            "file_name": 'foo.png',
            "mime_type": 'image/png',
            "description": 'a foo meme',
            "starred": false,
            "created_time": new Date(0),
            "modified_time": new Date(1),
            "file_size": 1024
      }
    }],

    ],

    // slices
    [
    `now => (@com.google.drive.list_drive_files())[2:2] => notify;`,
    {},
    {
        'com.google.drive:list_drive_files': [{
            "order_by": 'name_increasing',
            "file_id": 2,
            "file_name": 'baz.png',
            "mime_type": 'image/png',
            "description": 'a baz meme',
            "starred": false,
            "created_time": new Date(0),
            "modified_time": new Date(1),
            "file_size": 1026
        }, {
            "order_by": 'name_increasing',
            "file_id": 1,
            "file_name": 'bar.png',
            "mime_type": 'image/png',
            "description": 'a bar meme',
            "starred": false,
            "created_time": new Date(0),
            "modified_time": new Date(1),
            "file_size": 1025
        }, {
            "order_by": 'name_increasing',
            "file_id": 0,
            "file_name": 'foo.png',
            "mime_type": 'image/png',
            "description": 'a foo meme',
            "starred": false,
            "created_time": new Date(0),
            "modified_time": new Date(1),
            "file_size": 1024
        },
        ],
    },
    [ {
      type: 'output',
      outputType: 'com.google.drive:list_drive_files',
      value: {
            "order_by": 'name_increasing',
            "file_id": 1,
            "file_name": 'bar.png',
            "mime_type": 'image/png',
            "description": 'a bar meme',
            "starred": false,
            "created_time": new Date(0),
            "modified_time": new Date(1),
            "file_size": 1025
      }
    }, {
      type: 'output',
      outputType: 'com.google.drive:list_drive_files',
      value: {
            "order_by": 'name_increasing',
            "file_id": 0,
            "file_name": 'foo.png',
            "mime_type": 'image/png',
            "description": 'a foo meme',
            "starred": false,
            "created_time": new Date(0),
            "modified_time": new Date(1),
            "file_size": 1024
      }
    }],

    ],

    // sort + advanced indexing is not a special case
    [
    `now => sort(file_size asc of @com.google.drive.list_drive_files())[-1, 1] => notify;`,
    {},
    {
        'com.google.drive:list_drive_files': [{
            "order_by": 'name_increasing',
            "file_id": 2,
            "file_name": 'baz.png',
            "mime_type": 'image/png',
            "description": 'a baz meme',
            "starred": false,
            "created_time": new Date(0),
            "modified_time": new Date(1),
            "file_size": 1026
        }, {
            "order_by": 'name_increasing',
            "file_id": 1,
            "file_name": 'bar.png',
            "mime_type": 'image/png',
            "description": 'a bar meme',
            "starred": false,
            "created_time": new Date(0),
            "modified_time": new Date(1),
            "file_size": 1025
        }, {
            "order_by": 'name_increasing',
            "file_id": 0,
            "file_name": 'foo.png',
            "mime_type": 'image/png',
            "description": 'a foo meme',
            "starred": false,
            "created_time": new Date(0),
            "modified_time": new Date(1),
            "file_size": 1024
        },
        ],
    },
    [ {
      type: 'output',
      outputType: 'com.google.drive:list_drive_files',
      value: {
            "order_by": 'name_increasing',
            "file_id": 2,
            "file_name": 'baz.png',
            "mime_type": 'image/png',
            "description": 'a baz meme',
            "starred": false,
            "created_time": new Date(0),
            "modified_time": new Date(1),
            "file_size": 1026
      }
    }, {
      type: 'output',
      outputType: 'com.google.drive:list_drive_files',
      value: {
            "order_by": 'name_increasing',
            "file_id": 0,
            "file_name": 'foo.png',
            "mime_type": 'image/png',
            "description": 'a foo meme',
            "starred": false,
            "created_time": new Date(0),
            "modified_time": new Date(1),
            "file_size": 1024
      }
    }],

    ],

    /*[`let query q(p_query : String) := @com.bing.web_search(query=p_query);
      let action a(p_status : String) := @com.twitter.post(status=p_status);

      now => q(p_query="foo") => a(p_status=link);
      now => a(p_status="no");`,
     {},
     {
        'com.bing:web_search': [(params) => {
            assert.strictEqual(params.query, 'foo');
            return {
                link: new builtin.Entity('https://foo.com', null),
                title: 'Foo Website',
                description: 'All The Foo You Could Ever Foo'
            };
        }]
     },
     [
     {
       type: 'action',
       fn: 'com.twitter:post',
       params: { status: 'https://foo.com' }
     },
     {
       type: 'action',
       fn: 'com.twitter:post',
       params: { status: 'no' }
     }],

     ],*/


     [`let cat = @com.thecatapi.get();
      function a(p_picture_url : Entity(tt:picture)) {
         @com.twitter.post_picture(caption="cat", picture_url=p_picture_url);
      }

      now => cat() => notify;
      now => cat() => a(p_picture_url=picture_url);`,
     {},
     {
        'com.thecatapi:get': [(() => {
            let _callcount = 0;
            return (params) => {
                assert.strictEqual(_callcount, 0);
                _callcount++;

                return {
                    link: new builtin.Entity('https://foo.com', null),
                    image_id: '12345',
                    picture_url: 'https://foo.com/cat.png'
                };
            };
        })()]
     },
     [
     {
       type: 'output',
       outputType: 'com.thecatapi:get',
       value: {
            link: new builtin.Entity('https://foo.com', null),
            image_id: '12345',
            picture_url: 'https://foo.com/cat.png'
       }
     },
     {
       type: 'action',
       fn: 'com.twitter:post_picture',
       params: { caption: 'cat', picture_url: 'https://foo.com/cat.png' }
     }],

     ],

     [`let cat = @com.thecatapi.get();
      function a(p_picture_url : Entity(tt:picture)) {
         @com.twitter.post_picture(caption="cat", picture_url=p_picture_url);
      }

      now => cat() => notify;
      timer(base=$now, interval=1h) => cat() => a(p_picture_url=picture_url);`,
     {},
     {
        'com.thecatapi:get': [(() => {
            let _callcount = 0;
            return (params) => {
                assert.strictEqual(_callcount, 0);
                _callcount++;

                return {
                    link: new builtin.Entity('https://foo.com', null),
                    image_id: '12345',
                    picture_url: 'https://foo.com/cat.png'
                };
            };
        })()]
     },
     [
     {
       type: 'output',
       outputType: 'com.thecatapi:get',
       value: {
            link: new builtin.Entity('https://foo.com', null),
            image_id: '12345',
            picture_url: 'https://foo.com/cat.png'
       }
     },
     {
       type: 'action',
       fn: 'com.twitter:post_picture',
       params: { caption: 'cat', picture_url: 'https://foo.com/cat.png' }
     },
     {
       type: 'action',
       fn: 'com.twitter:post_picture',
       params: { caption: 'cat', picture_url: 'https://foo.com/cat.png' }
     },
     {
       type: 'action',
       fn: 'com.twitter:post_picture',
       params: { caption: 'cat', picture_url: 'https://foo.com/cat.png' }
     }],

     ],

     [`let cat = @com.thecatapi.get();
      function a(p_picture_url : Entity(tt:picture)) {
         @com.twitter.post_picture(caption="cat", picture_url=p_picture_url);
      }

      // reversed order in the program, but it won't matter, the output will be first because "now =>"
      timer(base=$now, interval=1h) => cat() => a(p_picture_url=picture_url);
      now => cat() => notify;
      `,
     {},
     {
        'com.thecatapi:get': [(() => {
            let _callcount = 0;
            return (params) => {
                assert.strictEqual(_callcount, 0);
                _callcount++;

                return {
                    link: new builtin.Entity('https://foo.com', null),
                    image_id: '12345',
                    picture_url: 'https://foo.com/cat.png'
                };
            };
        })()]
     },
     [
     {
       type: 'output',
       outputType: 'com.thecatapi:get',
       value: {
            link: new builtin.Entity('https://foo.com', null),
            image_id: '12345',
            picture_url: 'https://foo.com/cat.png'
       }
     },
     {
       type: 'action',
       fn: 'com.twitter:post_picture',
       params: { caption: 'cat', picture_url: 'https://foo.com/cat.png' }
     },
     {
       type: 'action',
       fn: 'com.twitter:post_picture',
       params: { caption: 'cat', picture_url: 'https://foo.com/cat.png' }
     },
     {
       type: 'action',
       fn: 'com.twitter:post_picture',
       params: { caption: 'cat', picture_url: 'https://foo.com/cat.png' }
     }],

     ],


     [`let cat = @com.thecatapi.get();
      function a(p_picture_url : Entity(tt:picture)) {
        @com.twitter.post_picture(caption="cat", picture_url=p_picture_url);
      }

      cat();
      attimer(time=[new Time(9, 0), new Time(15, 0)]) => cat() => a(p_picture_url=picture_url);
      `,
     {},
     {
        'com.thecatapi:get': [(() => {
            let _callcount = 0;
            return (params) => {
                assert.strictEqual(_callcount, 0);
                _callcount++;

                return {
                    link: new builtin.Entity('https://foo.com', null),
                    image_id: '12345',
                    picture_url: 'https://foo.com/cat.png'
                };
            };
        })()]
     },
     [
     {
       type: 'output',
       outputType: 'com.thecatapi:get',
       value: {
            link: new builtin.Entity('https://foo.com', null),
            image_id: '12345',
            picture_url: 'https://foo.com/cat.png'
       }
     },
     {
       type: 'action',
       fn: 'com.twitter:post_picture',
       params: { caption: 'cat', picture_url: 'https://foo.com/cat.png' }
     },
     {
       type: 'action',
       fn: 'com.twitter:post_picture',
       params: { caption: 'cat', picture_url: 'https://foo.com/cat.png' }
     }],

     ],

    [`function p1(p_foo : String) {
        function p2(p_bar : String) {
            now => @com.tumblr.blog.post_text(title = p_foo, body = p_bar);
        }
        now => p2(p_bar = "body one");
        now => p2(p_bar = "body two");
    }
    now => p1(p_foo = "title one");
    now => p1(p_foo = "title two");`,
    {},
    {},
    [
    {
       type: 'action',
       fn: 'com.tumblr.blog:post_text',
       params: { title: 'title one', body: 'body one' },
    },
    {
       type: 'action',
       fn: 'com.tumblr.blog:post_text',
       params: { title: 'title one', body: 'body two' },
    },
    {
       type: 'action',
       fn: 'com.tumblr.blog:post_text',
       params: { title: 'title two', body: 'body one' },
    },
    {
       type: 'action',
       fn: 'com.tumblr.blog:post_text',
       params: { title: 'title two', body: 'body two' },
    },

    ]

    ],

    [`function p1(p_foo : String) {
        function p2(p_bar : String) {
            now => @com.tumblr.blog.post_text(title = p_foo, body = p_bar);
        }
        now => p2(p_bar = "body one");
        now => p2(p_bar = "body two");
    }
    timer(base=$now, interval=1h) => p1(p_foo = "title one");
    `,
    {},
    {},
    [
    {
       type: 'action',
       fn: 'com.tumblr.blog:post_text',
       params: { title: 'title one', body: 'body one' },
    },
    {
       type: 'action',
       fn: 'com.tumblr.blog:post_text',
       params: { title: 'title one', body: 'body two' },
    },
    {
       type: 'action',
       fn: 'com.tumblr.blog:post_text',
       params: { title: 'title one', body: 'body one' },
    },
    {
       type: 'action',
       fn: 'com.tumblr.blog:post_text',
       params: { title: 'title one', body: 'body two' },
    },
    {
       type: 'action',
       fn: 'com.tumblr.blog:post_text',
       params: { title: 'title one', body: 'body one' },
    },
    {
       type: 'action',
       fn: 'com.tumblr.blog:post_text',
       params: { title: 'title one', body: 'body two' },
    },

    ]

    ],

    [
    `now => @org.wikidata.city(), id =~ 'palo alto' => notify;`,
    {},
    {
        'org.wikidata:query': [({ query }) => {
            return { query: query.prettyprint() };
        }]
    },
    [
    { type: 'output',
      outputType: 'org.wikidata:query',
      value: {
        query: '@org.wikidata.city() filter id =~ "palo alto";'
      }
    }]],

    [
    `now => @org.wikidata.city(), postal_code =~ '94305' => @com.twitter.post(status=postal_code);`,
    {},
    {
        'org.wikidata:query': [({ query }) => {
            return { postal_code: query.prettyprint() };
        }]
    },
    [
    {
        type: 'action',
        fn: 'com.twitter:post',
        params: { status: '@org.wikidata.city() filter postal_code =~ "94305";' }
    }]],

    [
      `@org.thingpedia.media-source.artist(), id =~ "tupac";`,
    {},
    {
        'org.thingpedia.media-source:artist': [{
            id: new SpotifyEntity('spotify:artist:1ZwdS5xdxEREPySFridCfh', '2Pac'),
            genres: [
              "g funk",
              "gangster rap",
              "hip hop",
              "rap",
              "west coast rap"
            ],
            popularity: 81
        }]
    },
    [
      {
        type: 'output',
        outputType: 'org.thingpedia.media-source:artist',
        value: {
          id: new SpotifyEntity('spotify:artist:1ZwdS5xdxEREPySFridCfh', '2Pac'),
          genres: [
            "g funk",
            "gangster rap",
            "hip hop",
            "rap",
            "west coast rap"
          ],
          popularity: 81
        }
      }
    ]
    ],

    [
      `@org.thingpedia.media-source.artist(), id =~ "2pac";`,
    {},
    {
        'org.thingpedia.media-source:artist': [{
            id: new SpotifyEntity('spotify:artist:1ZwdS5xdxEREPySFridCfh', '2Pac'),
            genres: [
              "g funk",
              "gangster rap",
              "hip hop",
              "rap",
              "west coast rap"
            ],
            popularity: 81
        }]
    },
    [
      {
        type: 'output',
        outputType: 'org.thingpedia.media-source:artist',
        value: {
          id: new SpotifyEntity('spotify:artist:1ZwdS5xdxEREPySFridCfh', '2Pac'),
          genres: [
            "g funk",
            "gangster rap",
            "hip hop",
            "rap",
            "west coast rap"
          ],
          popularity: 81
        }
      }
    ]
    ]

];

async function test(i) {
    console.log('Test Case #' + (i+1));

    let [code, trigger, queries, actions] = TEST_CASES[i];
    if (!Array.isArray(code))
        code = [code];

    const assistant = new MockAssistant();
    try {
        for (let prog of code) {
            const compiler = new Compiler(schemaRetriever, 'America/Los_Angeles');
            const compiled = await compiler.compileCode(prog);
            const state = new MockState(compiled);

            const generated = [];
            if (compiled.command)
                generated.push(compiled.command);
            generated.push(...compiled.rules);

            for (let gen of generated) {
                const env = new MockExecEnvironment(assistant, state, trigger, queries, actions);
                await gen(env);
            }
        }

        if (actions.length !== 0)
            throw new Error(`Left-over actions in test ${i+1}`);
    } catch(e) {
        console.error('Test Case #' + (i+1) + ': failed with exception');
        console.error('Code: ' + code);
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
