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

const Q = require('q');
Q.longStackSupport = true;
const assert = require('assert');

require('../lib/ast_api');
const Compiler = require('../lib/compiler');
const SchemaRetriever = require('../lib/schema');

const ExecEnvironment = require('../lib/exec_environment');
const builtin = require('../lib/builtin_values');

const _mockSchemaDelegate = require('./mock_schema_delegate');
const schemaRetriever = new SchemaRetriever(_mockSchemaDelegate, null, true);

class MockExecEnvironment extends ExecEnvironment {
    constructor(compiledrule, triggerdata, querydata, outputdata) {
        super('en-US', 'America/Los_Angeles', schemaRetriever);

        this._compiled = compiledrule;
        this._trigger = triggerdata;
        this._query = querydata;
        this._actions = outputdata;

        this._states = [];
        this._states.length = compiledrule.states;
        for (let i = 0; i < this._states.length; i++)
            this._states[i] = null;
    }

    /* istanbul ignore next */
    get program_id() {
        return 'uuid-XXXXXXXXXXXX';
    }

    _getFn(fnid, type) {
        const fn = this._compiled.functions[fnid];

        assert.strictEqual(fn.type, type);
        return `${fn.selector.kind}:${fn.channel}`;
    }

    invokeMonitor(fnid, params) {
        const fn = this._getFn(fnid, 'trigger');
        if (!this._trigger || this._trigger.fn !== fn)
            throw new Error('Unexpected trigger ' + fn);

        return this._trigger.value.map((v) => [fn,v])[Symbol.iterator]();
    }
    invokeTimer(base, interval) {
        // reset base
        base = 0;

        return [{__timestamp: base},
            {__timestamp: base+interval},
            {__timestamp: base+2*interval}][Symbol.iterator]();
    }
    /* istanbul ignore next */
    invokeAtTimer(timeArray) {
        throw new Error('Must be overridden');
    }

    invokeQuery(fnid, params) {
        const fn = this._getFn(fnid, 'query');

        if (!(fn in this._query))
            throw new Error('Unexpected query ' + fn);

        const result = this._query[fn].map((v) => {
            if (typeof v === 'function')
                return [fn, v(params)];
            else
                return [fn,v];
        });
        return result;
    }
    /* istanbul ignore next */
    invokeAction(fnid, params) {
        const fn = this._getFn(fnid, 'action');

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
    /* istanbul ignore next */
    output(outputType, output) {
        const nextaction = this._actions.shift();
        if (!nextaction || nextaction.type !== 'output')
            throw new Error('Unexpected output');

        assert.deepStrictEqual(outputType, nextaction.outputType);
        assert.deepStrictEqual(output, nextaction.value);
    }

    /* istanbul ignore next */
    readState(stateId) {
        return this._states[stateId];
    }
    /* istanbul ignore next */
    writeState(stateId, value) {
        assert(value.length >= 0);
        assert(value.length <= 3);
        return this._states[stateId] = value;
    }

    reportError(message, err) {
        console.error('Test failed with error: ' + message);
        throw err;
    }
}


const TEST_CASES = [
    [`now => @com.xkcd.get_comic() => notify;`,
    null,
    { 'com.xkcd:get_comic': [
        { number: 1234, title: 'Douglas Engelbart (1925-2013)',
          link: 'https://xkcd.com/1234/',
          picture_url: 'https://imgs.xkcd.com/comics/douglas_engelbart_1925_2013.png' }
    ]},
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
    ]},
    [
    {
     type: 'action',
     fn: 'com.twitter:post',
     params: { status: 'Douglas Engelbart (1925-2013)' }
    }
    ]],

    [`now => @com.xkcd.get_comic() => { notify; @com.twitter.post(status=title); };`,
    null,
    { 'com.xkcd:get_comic': [
        { number: 1234, title: 'Douglas Engelbart (1925-2013)',
          link: 'https://xkcd.com/1234/',
          picture_url: 'https://imgs.xkcd.com/comics/douglas_engelbart_1925_2013.png' }
    ]},
    [
    { type: 'output',
      outputType: 'com.xkcd:get_comic',
      value: { number: 1234, title: 'Douglas Engelbart (1925-2013)',
        link: 'https://xkcd.com/1234/',
        picture_url: 'https://imgs.xkcd.com/comics/douglas_engelbart_1925_2013.png' }
    },
    {
     type: 'action',
     fn: 'com.twitter:post',
     params: { status: 'Douglas Engelbart (1925-2013)' }
    }
    ]],

    [`now => @com.xkcd.get_comic(), number <= 1000 => { notify; @com.twitter.post(status=title); };`,
    null,
    { 'com.xkcd:get_comic': [
        { number: 1234, title: 'Douglas Engelbart (1925-2013)',
          link: 'https://xkcd.com/1234/',
          picture_url: 'https://imgs.xkcd.com/comics/douglas_engelbart_1925_2013.png' }
    ]},
    []],

    [`now => @com.xkcd.get_comic(), number >= 1234 => { notify; @com.twitter.post(status=title); };`,
    null,
    { 'com.xkcd:get_comic': [
        { number: 1234, title: 'Douglas Engelbart (1925-2013)',
          link: 'https://xkcd.com/1234/',
          picture_url: 'https://imgs.xkcd.com/comics/douglas_engelbart_1925_2013.png' }
    ]},
    [
    { type: 'output',
      outputType: 'com.xkcd:get_comic',
      value: { number: 1234, title: 'Douglas Engelbart (1925-2013)',
        link: 'https://xkcd.com/1234/',
        picture_url: 'https://imgs.xkcd.com/comics/douglas_engelbart_1925_2013.png' }
    },
    {
     type: 'action',
     fn: 'com.twitter:post',
     params: { status: 'Douglas Engelbart (1925-2013)' }
    }
    ]],

    [`now => @com.xkcd.get_comic() => @com.twitter.post(status=$event);`,
    null,
    { 'com.xkcd:get_comic': [
        { number: 1234, title: 'Douglas Engelbart (1925-2013)',
          link: 'https://xkcd.com/1234/',
          picture_url: 'https://imgs.xkcd.com/comics/douglas_engelbart_1925_2013.png',
          alt_text: 'some alt text' }
    ]},
    [
    {
     type: 'action',
     fn: 'com.twitter:post',
     params: { status:
`Link: Douglas Engelbart (1925-2013) <https://xkcd.com/1234/>
Picture: https://imgs.xkcd.com/comics/douglas_engelbart_1925_2013.png
some alt text` }
    }
    ]],

    [`now => @com.xkcd.get_comic() => @com.twitter.post(status=$event.program_id);`,
    null,
    { 'com.xkcd:get_comic': [
        { number: 1234, title: 'Douglas Engelbart (1925-2013)',
          link: 'https://xkcd.com/1234/',
          picture_url: 'https://imgs.xkcd.com/comics/douglas_engelbart_1925_2013.png',
          alt_text: 'some alt text' }
    ]},
    [
    {
     type: 'action',
     fn: 'com.twitter:post',
     params: { status: `uuid-XXXXXXXXXXXX` }
    }
    ]],

    [`now => @com.xkcd.get_comic() => @com.twitter.post(status=$event.type);`,
    null,
    { 'com.xkcd:get_comic': [
        { number: 1234, title: 'Douglas Engelbart (1925-2013)',
          link: 'https://xkcd.com/1234/',
          picture_url: 'https://imgs.xkcd.com/comics/douglas_engelbart_1925_2013.png',
          alt_text: 'some alt text' }
    ]},
    [
    {
     type: 'action',
     fn: 'com.twitter:post',
     params: { status: `com.xkcd:get_comic` }
    }
    ]],

    [`now => @com.twitter.post(status=$event.program_id);`,
    null,
    {},
    [
    {
     type: 'action',
     fn: 'com.twitter:post',
     params: { status: `uuid-XXXXXXXXXXXX` }
    }
    ]],

    [`monitor @com.xkcd.get_comic() => @com.twitter.post(status=title);`,
    { fn: 'com.xkcd:get_comic',
      value: [
        { __timestamp: 0, number: 1234, title: 'Douglas Engelbart (1925-2013)',
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

    [`monitor @com.xkcd.get_comic(), number >= 1235 => @com.twitter.post(status=title);`,
    { fn: 'com.xkcd:get_comic',
      value: [
        { __timestamp: 0, number: 1234, title: 'Douglas Engelbart (1925-2013)',
          link: 'https://xkcd.com/1234/',
          picture_url: 'https://imgs.xkcd.com/comics/douglas_engelbart_1925_2013.png' },
        { __timestamp: 1, number: 1235, title: 'Settled',
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

    [`monitor @com.xkcd.get_comic(), number >= 1234 => @com.twitter.post(status=title);`,
    { fn: 'com.xkcd:get_comic',
      value: [
        { __timestamp: 0, number: 1234, title: 'Douglas Engelbart (1925-2013)',
          link: 'https://xkcd.com/1234/',
          picture_url: 'https://imgs.xkcd.com/comics/douglas_engelbart_1925_2013.png' },
        { __timestamp: 1, number: 1235, title: 'Settled',
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

    [`monitor @com.xkcd.get_comic(), number >= 1234 => @com.twitter.post(status=title);`,
    { fn: 'com.xkcd:get_comic',
      value: [
        { __timestamp: 0, number: 1234, title: 'Douglas Engelbart (1925-2013)',
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
     params: { status: 'Settled' }
    }
    ]],

    [`monitor @com.xkcd.get_comic(), number >= 1234 => @com.twitter.post(status=title);`,
    { fn: 'com.xkcd:get_comic',
      value: [
        { __timestamp: 0, number: 1234, title: 'Douglas Engelbart (1925-2013)',
          link: 'https://xkcd.com/1234/',
          picture_url: 'https://imgs.xkcd.com/comics/douglas_engelbart_1925_2013.png' },
        { __timestamp: 0, number: 1234, title: 'Douglas Engelbart (1925-2013)',
          link: 'https://xkcd.com/1234/',
          picture_url: 'https://imgs.xkcd.com/comics/douglas_engelbart_1925_2013.png' },
        { __timestamp: 1, number: 1235, title: 'Settled',
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

    [`monitor @com.xkcd.get_comic(), number >= 1234 => @com.twitter.post(status=title);`,
    { fn: 'com.xkcd:get_comic',
      value: [
        { __timestamp: 0, number: 1234, title: 'Douglas Engelbart (1925-2013)',
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
    },
    {
     type: 'action',
     fn: 'com.twitter:post',
     params: { status: 'Douglas Engelbart (1925-2013)' }
    },
    ]],

    [`monitor @com.xkcd.get_comic(), number >= 1234 => @com.twitter.post(status=title);`,
    { fn: 'com.xkcd:get_comic',
      value: [
        { __timestamp: 0, number: 1234, title: 'Douglas Engelbart (1925-2013)',
          link: 'https://xkcd.com/1234/',
          picture_url: 'https://imgs.xkcd.com/comics/douglas_engelbart_1925_2013.png' },
        { __timestamp: 1, number: 1235, title: 'Settled',
          link: 'https://xkcd.com/1235/',
          picture_url: 'https://imgs.xkcd.com/comics/settled.png' },
        { __timestamp: 2, number: 1236, title: 'Seashell',
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

    [`monitor @com.xkcd.get_comic(), number >= 1234 => @com.twitter.post(status=title);`,
    { fn: 'com.xkcd:get_comic',
      value: [
        { __timestamp: 0, number: 1234, title: 'Douglas Engelbart (1925-2013)',
          link: 'https://xkcd.com/1234/',
          picture_url: 'https://imgs.xkcd.com/comics/douglas_engelbart_1925_2013.png' },
        { __timestamp: 1, number: 1235, title: 'Settled',
          link: 'https://xkcd.com/1235/',
          picture_url: 'https://imgs.xkcd.com/comics/settled.png' },
        { __timestamp: 2, number: 1236, title: 'Seashell',
          link: 'https://xkcd.com/1236/',
          picture_url: 'https://imgs.xkcd.com/comics/seashell_2x.png' },
        { __timestamp: 2, number: 1237, title: 'QR Code',
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

    [`monitor @com.xkcd.get_comic(), number >= 1234 => @com.twitter.post(status=title);`,
    { fn: 'com.xkcd:get_comic',
      value: [
        { __timestamp: 0, number: 1234, title: 'Douglas Engelbart (1925-2013)',
          link: 'https://xkcd.com/1234/',
          picture_url: 'https://imgs.xkcd.com/comics/douglas_engelbart_1925_2013.png' },
        { __timestamp: 0, number: 1235, title: 'Settled',
          link: 'https://xkcd.com/1235/',
          picture_url: 'https://imgs.xkcd.com/comics/settled.png' },
        { __timestamp: 1, number: 1234, title: 'Douglas Engelbart (1925-2013)',
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

    [`monitor @com.xkcd.get_comic() join @com.yandex.translate.translate(target_language="it"^^tt:iso_lang_code) on (text=title) => @com.twitter.post(status=translated_text);`,
    { fn: 'com.xkcd:get_comic',
      value: [
        { __timestamp: 0, number: 1234, title: 'Douglas Engelbart (1925-2013)',
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

    [`monitor @com.xkcd.get_comic() join @com.yandex.translate.translate(target_language="it"^^tt:iso_lang_code) on (text=title) => @com.twitter.post(status=translated_text);`,
    { fn: 'com.xkcd:get_comic',
      value: [
        { __timestamp: 0, number: 1234, title: 'Douglas Engelbart (1925-2013)',
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

    [`monitor @com.xkcd.get_comic() join @com.yandex.translate.translate(target_language="it"^^tt:iso_lang_code) on (text=title) => @com.twitter.post(status=translated_text);`,
    { fn: 'com.xkcd:get_comic',
      value: [
        { __timestamp: 0, number: 1234, title: 'Douglas Engelbart (1925-2013)',
          link: 'https://xkcd.com/1234/',
          picture_url: 'https://imgs.xkcd.com/comics/douglas_engelbart_1925_2013.png' },
        { __timestamp: 0, number: 1235, title: 'Settled',
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

    [`(monitor @com.xkcd.get_comic() join @com.yandex.translate.translate(target_language="it"^^tt:iso_lang_code) on (text=title)), translated_text =~ "deciso" => @com.twitter.post(status=translated_text);`,
    { fn: 'com.xkcd:get_comic',
      value: [
        { __timestamp: 0, number: 1234, title: 'Douglas Engelbart (1925-2013)',
          link: 'https://xkcd.com/1234/',
          picture_url: 'https://imgs.xkcd.com/comics/douglas_engelbart_1925_2013.png' },
        { __timestamp: 0, number: 1235, title: 'Settled',
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

    [`(monitor @com.xkcd.get_comic() join @com.yandex.translate.translate(target_language="it"^^tt:iso_lang_code) on (text=title)), translated_text == "Deciso" => @com.twitter.post(status=translated_text);`,
    { fn: 'com.xkcd:get_comic',
      value: [
        { __timestamp: 0, number: 1234, title: 'Douglas Engelbart (1925-2013)',
          link: 'https://xkcd.com/1234/',
          picture_url: 'https://imgs.xkcd.com/comics/douglas_engelbart_1925_2013.png' },
        { __timestamp: 0, number: 1235, title: 'Settled',
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

    [`(monitor @com.xkcd.get_comic() join @com.yandex.translate.translate(target_language="it"^^tt:iso_lang_code), translated_text =~ "deciso" on (text=title)) => @com.twitter.post(status=translated_text);`,
    { fn: 'com.xkcd:get_comic',
      value: [
        { __timestamp: 0, number: 1234, title: 'Douglas Engelbart (1925-2013)',
          link: 'https://xkcd.com/1234/',
          picture_url: 'https://imgs.xkcd.com/comics/douglas_engelbart_1925_2013.png' },
        { __timestamp: 0, number: 1235, title: 'Settled',
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
    `now => (@com.xkcd.get_comic() join @com.yandex.translate.translate(target_language="it"^^tt:iso_lang_code), translated_text =~ "deciso" on (text=title)) => notify;`,
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
        alt_text: undefined,
        target_language: new builtin.Entity('it', null),
        source_language: undefined,
        text: 'Settled',
        translated_text: 'Deciso' }
    }],

    ],

    [
    `now => (@com.xkcd.get_comic() join @com.yandex.translate.translate(target_language="it"^^tt:iso_lang_code) on (text=title)), translated_text =~ "deciso" => notify;`,
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
        alt_text: undefined,
        target_language: new builtin.Entity('it', null),
        source_language: undefined,
        text: 'Settled',
        translated_text: 'Deciso' }
    }],

    ],

    [
    `now => (@com.xkcd.get_comic() join @com.yandex.translate.translate(target_language="it"^^tt:iso_lang_code) on (text=title)), translated_text =~ "fuffa" => notify;`,
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
    `now => @com.tesla.car.get_drive_state() join @com.tesla.car.get_charge_state(),  charge_port_latch == "Engaged" => notify;`,
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
    `now => @com.tesla.car.get_drive_state() join @com.tesla.car.get_charge_state(),  !(charge_port_latch == "Engaged") => notify;`,
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
];

async function test(i) {
    console.log('Test Case #' + (i+1));

    let [code, trigger, queries, actions] = TEST_CASES[i];

    try {
        var compiler = new Compiler();
        compiler.setSchemaRetriever(schemaRetriever);

        await compiler.compileCode(code);
        assert.strictEqual(compiler.rules.length, 1);

        const env = new MockExecEnvironment(compiler.rules[0],
            trigger, queries, actions);
        await compiler.rules[0].code(env);

        if (actions.length !== 0)
            throw new Error(`Left-over actions in test ${i+1}`);
    } catch (e) {
        console.error('Test Case #' + (i+1) + ': failed with exception');
        console.error('Code: ' + code);
        console.error('Error: ' + e.message);
        console.error(e.stack);
        if (process.env.TEST_MODE)
            throw e;
    }
}

async function main() {
    for (let i = 0; i < TEST_CASES.length; i++)
        await test(i);
}
module.exports = main;
if (!module.parent)
    main();
