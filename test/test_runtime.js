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

const Compiler = require('../lib/compiler');
const SchemaRetriever = require('../lib/schema');
const assert = require('assert');

const ExecEnvironment = require('../lib/exec_environment');

const _mockSchemaDelegate = require('./mock_schema_delegate');
const _mockMemoryClient = require('./mock_memory_client');
var schemaRetriever = new SchemaRetriever(_mockSchemaDelegate, _mockMemoryClient, true);

class MockExecEnvironment extends ExecEnvironment {
    constructor(compiledrule, triggerdata, querydata, outputdata) {
        super('en-US', 'America/Los_Angeles');

        this._compiled = compiledrule;
        this._trigger = triggerdata;
        this._query = querydata;
        this._actions = outputdata;
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

        return this._trigger.value[Symbol.iterator]();
    }
    invokeTimer(base, interval) {
        // reset base
        base = 0;

        return [{__timestamp: base},
            {__timestamp: base+interval},
            {__timestamp: base+2*interval}][Symbol.iterator]();
    }
    /* istanbul ignore next */
    invokeAtTimer(time) {
        throw new Error('Must be overridden');
    }

    invokeQuery(fnid, params) {
        const fn = this._getFn(fnid, 'query');

        if (!(fn in this._query))
            throw new Error('Unexpected query ' + fn);

        return this._query[fn].map((v) => [fn,v]);
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
            throw new Error('Unexpected end-of-flow');

        assert.deepStrictEqual(outputType, nextaction.outputType);
        assert.deepStrictEqual(output, nextaction.value);
    }

    /* istanbul ignore next */
    readState(stateId) {
        return null;
    }
    /* istanbul ignore next */
    writeState(stateId, value) {
        // do nothing
    }

    reportError(message, err) {
        console.error('Test failed with error: ' + message);
        throw err;
    }
}


const TEST_CASES = [
    [`now => @xkcd.get_comic() => notify;`,
    null,
    { 'xkcd:get_comic': [
        { number: 1234, title: 'Douglas Engelbart (1925-2013)',
          link: 'https://xkcd.com/1234/',
          picture_url: 'https://imgs.xkcd.com/comics/douglas_engelbart_1925_2013.png' }
    ]},
    [
    { type: 'output',
      outputType: 'xkcd:get_comic',
      value: { number: 1234, title: 'Douglas Engelbart (1925-2013)',
        link: 'https://xkcd.com/1234/',
        picture_url: 'https://imgs.xkcd.com/comics/douglas_engelbart_1925_2013.png' }
    }
    ]],

    [`now => @xkcd.get_comic() => @twitter.sink(status=title);`,
    null,
    { 'xkcd:get_comic': [
        { number: 1234, title: 'Douglas Engelbart (1925-2013)',
          link: 'https://xkcd.com/1234/',
          picture_url: 'https://imgs.xkcd.com/comics/douglas_engelbart_1925_2013.png' }
    ]},
    [
    {
     type: 'action',
     fn: 'twitter:sink',
     params: { status: 'Douglas Engelbart (1925-2013)' }
    }
    ]],

    [`now => @xkcd.get_comic() => { notify; @twitter.sink(status=title); };`,
    null,
    { 'xkcd:get_comic': [
        { number: 1234, title: 'Douglas Engelbart (1925-2013)',
          link: 'https://xkcd.com/1234/',
          picture_url: 'https://imgs.xkcd.com/comics/douglas_engelbart_1925_2013.png' }
    ]},
    [
    { type: 'output',
      outputType: 'xkcd:get_comic',
      value: { number: 1234, title: 'Douglas Engelbart (1925-2013)',
        link: 'https://xkcd.com/1234/',
        picture_url: 'https://imgs.xkcd.com/comics/douglas_engelbart_1925_2013.png' }
    },
    {
     type: 'action',
     fn: 'twitter:sink',
     params: { status: 'Douglas Engelbart (1925-2013)' }
    }
    ]],

    [`now => @xkcd.get_comic(), number <= 1000 => { notify; @twitter.sink(status=title); };`,
    null,
    { 'xkcd:get_comic': [
        { number: 1234, title: 'Douglas Engelbart (1925-2013)',
          link: 'https://xkcd.com/1234/',
          picture_url: 'https://imgs.xkcd.com/comics/douglas_engelbart_1925_2013.png' }
    ]},
    []],

    [`now => @xkcd.get_comic(), number >= 1234 => { notify; @twitter.sink(status=title); };`,
    null,
    { 'xkcd:get_comic': [
        { number: 1234, title: 'Douglas Engelbart (1925-2013)',
          link: 'https://xkcd.com/1234/',
          picture_url: 'https://imgs.xkcd.com/comics/douglas_engelbart_1925_2013.png' }
    ]},
    [
    { type: 'output',
      outputType: 'xkcd:get_comic',
      value: { number: 1234, title: 'Douglas Engelbart (1925-2013)',
        link: 'https://xkcd.com/1234/',
        picture_url: 'https://imgs.xkcd.com/comics/douglas_engelbart_1925_2013.png' }
    },
    {
     type: 'action',
     fn: 'twitter:sink',
     params: { status: 'Douglas Engelbart (1925-2013)' }
    }
    ]],

    /*[`now => @xkcd.get_comic() => @twitter.sink(status=$event);`,
    null,
    { 'xkcd:get_comic': [
        { number: 1234, title: 'Douglas Engelbart (1925-2013)',
          link: 'https://xkcd.com/1234/',
          picture_url: 'https://imgs.xkcd.com/comics/douglas_engelbart_1925_2013.png' }
    ]},
    [
    {
     type: 'action',
     fn: 'twitter:sink',
     params: { status: 'Douglas Engelbart (1925-2013)' }
    }
    ]],*/
];

function test(i) {
    console.log('Test Case #' + (i+1));

    let [code, trigger, queries, actions] = TEST_CASES[i];

    return Q.try(() => {
        var compiler = new Compiler();
        compiler.setSchemaRetriever(schemaRetriever);

        return compiler.compileCode(code).then((compiled) => {
            assert.strictEqual(compiler.rules.length, 1);

            const env = new MockExecEnvironment(compiler.rules[0],
                trigger, queries, actions);
            return Promise.resolve(compiler.rules[0].code(env)).then(() => {
                if (actions.length !== 0)
                    throw new Error(`Left-over actions in test ${i+1}`);
            });
        });
    }).catch((e) => {
        console.error('Test Case #' + (i+1) + ': failed with exception');
        console.error('Code: ' + code);
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

loop(0).done();