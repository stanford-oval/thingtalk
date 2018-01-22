// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingEngine
//
// Copyright 2017 Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const NNSyntax = require('../lib/nn_syntax');
const NNOutputParser = require('../lib/nn_output_parser');
const Ast = require('../lib/ast');

class SimpleSequenceLexer {
    constructor(sequence) {
        this._sequence = sequence;
        this._i = 0;
    }

    next() {
        if (this._i >= this._sequence.length)
            return { done: true };

        let next = this._sequence[this._i++];
        if (/^[A-Z]/.test(next)) {
            // entity
            next = next.substring(0, next.lastIndexOf('_'));
        } else if (next.startsWith('@')) {
            next = 'FUNCTION';
        } else if (next.startsWith('enum:')) {
            next = 'ENUM';
        } else if (next.startsWith('param:')) {
            next = 'PARAM_NAME';
        } else if (next.startsWith('unit:')) {
            next = 'UNIT';
        }
        return { done: false, value: next };
    }
}

const TEST_CASES = [
    [`monitor ( @com.xkcd.get_comic ) => notify`,
     {},
     `monitor (@com.xkcd.get_comic()) => notify;`
    ],

    [`now => @com.twitter.post param:status = QUOTED_STRING_0`,
     {'QUOTED_STRING_0': 'hello'},
     `now => @com.twitter.post(status="hello");`
    ],

    [`now => @com.xkcd.get_comic param:number = NUMBER_0 => notify`,
     {'NUMBER_0': 1234},
     `now => @com.xkcd.get_comic(number=1234) => notify;`],

    [`now => ( @builtin.get_random_between param:low = NUMBER_0 param:high = NUMBER_1 ) join ( @com.xkcd.get_comic ) on param:number = param:number => notify`,
    {'NUMBER_0': 55, 'NUMBER_1': 1024},
    `now => (@builtin.get_random_between(low=55, high=1024) join @com.xkcd.get_comic() on (number=number)) => notify;`],

    [`now => @builtin.get_random_between param:low = NUMBER_0 param:high = NUMBER_1 => notify`,
    {'NUMBER_0': 55, 'NUMBER_1': 1024},
    `now => @builtin.get_random_between(low=55, high=1024) => notify;`],

    [`now => @builtin.get_random_between param:low = NUMBER_1 param:high = NUMBER_0 => notify`,
    {'NUMBER_0': 1024, 'NUMBER_1': 55},
    `now => @builtin.get_random_between(low=55, high=1024) => notify;`],

    [`monitor ( @thermostat.temperature ) => notify`,
    {},
    `monitor (@thermostat.temperature()) => notify;`],

    [`( monitor ( @thermostat.temperature ) ) filter param:temperature > NUMBER_0 unit:F => notify`,
    {'NUMBER_0': 70},
    `monitor (@thermostat.temperature()), temperature > 70F => notify;`],

    [`now => timeseries now , 1 unit:week of ( monitor ( @thermostat.temperature ) ) => notify`,
    {},
    `now => timeseries makeDate(), 1week of monitor (@thermostat.temperature()) => notify;`],

    [`now => timeseries now , NUMBER_0 unit:week of ( monitor ( @thermostat.temperature ) ) => notify`,
    {NUMBER_0: 2},
    `now => timeseries makeDate(), 2week of monitor (@thermostat.temperature()) => notify;`],

    [`now => param:value of ( @thermostat.temperature ) => notify`,
    {},
    `now => [value] of (@thermostat.temperature()) => notify;`],

    [`param:value of ( monitor ( @thermostat.temperature ) ) => notify`,
    {},
    `[value] of (monitor (@thermostat.temperature())) => notify;`],

    [`[ param:value , param:time ] of ( monitor ( @thermostat.temperature ) ) => notify`,
    {},
    `[value, time] of (monitor (@thermostat.temperature())) => notify;`],

    [`now => ( @com.bing.image_search ) filter param:width > NUMBER_0 or param:height > NUMBER_1 => notify`,
    {NUMBER_0: 100, NUMBER_1:200},
    `now => (@com.bing.image_search()), (width > 100 || height > 200) => notify;`],

    [`now => ( @com.bing.image_search ) filter param:width > NUMBER_0 or param:height > NUMBER_1 and param:width < NUMBER_2 => notify`,
    {NUMBER_0: 100, NUMBER_1:200, NUMBER_2: 500},
    `now => (@com.bing.image_search()), ((width > 100 || height > 200) && width < 500) => notify;`],

    [`now => ( @com.bing.image_search ) filter param:width > NUMBER_0 or param:height > NUMBER_0 => notify`,
    {NUMBER_0: 100},
    `now => (@com.bing.image_search()), (width > 100 || height > 100) => notify;`],

    [`now => ( @com.bing.image_search ) filter param:width > NUMBER_0 => notify`,
    {NUMBER_0: 100 },
    `now => (@com.bing.image_search()), width > 100 => notify;`],

    ['monitor ( @xkcd.get_comic ) on new param:title => notify',
    {},
    `monitor (@xkcd.get_comic()) on new [title] => notify;`],

    ['monitor ( @xkcd.get_comic ) on new [ param:title , param:number ] => notify',
    {},
    `monitor (@xkcd.get_comic()) on new [title, number] => notify;`]
];

function testCase(test, i) {
    let [sequence, entities, expected] = test;

    console.log('Test Case #' + (i+1));
    try {
        sequence = sequence.split(' ');
        let program = NNSyntax.fromNN(sequence, entities);
        let generated = Ast.prettyprint(program, true).trim();

        if (generated !== expected) {
            console.error('Test Case #' + (i+1) + ' failed (wrong program)');
            console.error('Expected:', expected);
            console.error('Generated:', generated);
        }

        let reconstructed = NNSyntax.toNN(program, entities).join(' ');
        if (reconstructed !== test[0]) {
            console.error('Test Case #' + (i+1) + ' failed (wrong NN syntax)');
            console.error('Expected:', test[0]);
            console.error('Generated:', reconstructed);
        }

        let parser = new NNOutputParser();
        let reduces = parser.getReduceSequence({
            [Symbol.iterator]() {
                return new SimpleSequenceLexer(sequence);
            }
        });
        console.log('Reduces:', reduces);

    } catch(e) {
        console.error('Test Case #' + (i+1) + ' failed with exception');
        console.error(e.stack);
    }
}

function main() {
    TEST_CASES.forEach(testCase);
}
main();
