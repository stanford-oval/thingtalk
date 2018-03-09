// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingEngine
//
// Copyright 2015-2016 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const Type = require('./type');
const Ast = require('./ast');
const AsyncQueue = require('./async_queue');
const Utils = require('./utils');

// we split the module so that AST can also load it, because
// we need Ast to define function def at the end of the file
module.exports = require('./builtin_values');
const Location = module.exports.Location;
const Entity = module.exports.Entity;
const Time = module.exports.Time;
const Currency = module.exports.Currency;
const ExampleProgram = module.exports.ExampleProgram;

function arrayEquals(a, b) {
    if (a.length !== b.length)
        return false;

    for (var i = 0; i < a.length; i++) {
        if (!equalityTest(a[i], b[i]))
            return false;
    }

    return true;
}

function isLocation(obj) {
    return (obj instanceof Location || (obj.hasOwnProperty('x') && obj.hasOwnProperty('y')));
}
function isEntity(obj) {
    return obj instanceof Entity || typeof obj === 'string';
}

function distance(a, b) {
    const R = 6371000; // meters
    var lat1 = a.y;
    var lat2 = b.y;
    var lon1 = a.x;
    var lon2 = a.x;
    function toRadians(deg) { return deg * Math.PI / 180.0; }

    // formula courtesy of http://www.movable-type.co.uk/scripts/latlong.html
    var φ1 = toRadians(lat1);
    var φ2 = toRadians(lat2);
    var Δφ = toRadians(lat2-lat1);
    var Δλ = toRadians(lon2-lon1);

    var x = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ/2) * Math.sin(Δλ/2);
    var c = 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1-x));

    return R * c;
}
function locationEquals(a, b) {
    if (a === b)
        return true;
    if (a.x === b.x && a.y === b.y)
        return true;
    //console.log('Comparing locations', [a,b]);
    var d = distance(a, b);
    //console.log('Distance (m): ' + d.toFixed(2));
    return d <= 100;
}

function hasValueOf(x) {
    return typeof x === 'number' || x instanceof Date || x instanceof Time || x instanceof Currency;
}

function equalityTest(a, b) {
    if (a === b)
        return true;
    if (a === null || b === null) // they can't be both null because a !== b
        return false;
    if (a === undefined || b === undefined)
        return false;
    if (hasValueOf(a) && hasValueOf(b))
        return +a === +b;
    if (a.feedId !== undefined)
        return a.feedId === b.feedId;
    if (isLocation(a) && isLocation(b))
        return locationEquals(a, b);
    if (isEntity(a) && isEntity(b))
        return String(a) === String(b);
    if (a instanceof ExampleProgram && b instanceof ExampleProgram)
        return a.id === b.id;
    if (Array.isArray(a) && Array.isArray(b))
        return arrayEquals(a, b);

    return false;
}
module.exports.equality = equalityTest;

function likeTest(a, b) {
    return a.toLowerCase().indexOf(b.toLowerCase()) >= 0;
}
module.exports.like = likeTest;

function startsWith(a, b) {
    return a.toLowerCase().startsWith(b.toLowerCase());
}
module.exports.startsWith = startsWith;

function endsWith(a, b) {
    return a.toLowerCase().endsWith(b.toLowerCase());
}
module.exports.endsWith = endsWith;

function contains(a, b) {
    return a.some((x) => equalityTest(x, b));
}
module.exports.contains = contains;

function tupleEquals(a, b, keys) {
    for (let key of keys) {
        if (!equalityTest(a[key], b[key]))
            return false;
    }
    return true;
}

function isNewTuple(state, tuple, keys) {
    if (state === null)
        return true;

    let tlast, tprevious;
    for (let i = state.length-1; i >= 0; i--) {
        if (tlast === undefined)
            tlast = state[i].__timestamp;
        else if (tprevious === undefined && state[i].__timestamp < tlast)
            tprevious = state[i].__timestamp;
        else if (state[i].__timestamp < tprevious)
            break;
    }
    if (tuple.__timestamp === tlast)
        tlast = tprevious;
    if (tlast === undefined)
        return true;

    for (let i = 0; i < state.length; i++) {
        if (state[i].__timestamp !== tlast)
            continue;
        if (tupleEquals(state[i], tuple, keys))
            return false;
    }
    return true;
}
module.exports.isNewTuple = isNewTuple;

function addTuple(state, tuple) {
    if (state === null)
        return [tuple];
    state.push(tuple);
    return state;
}
module.exports.addTuple = addTuple;

class IteratorAdapter {
    constructor(queue) {
        this._queue = queue;
    }

    next() {
        return this._queue.pop();
    }
}

function streamUnion(lhs, rhs) {
    let queue = new AsyncQueue();

    let currentLeft = null;
    let currentRight = null;
    let doneLeft = false;
    let doneRight = false;
    function emit() {
        if (currentLeft === null || currentRight === null)
            return;
        let [leftType, leftValue] = currentLeft;
        let [rightType, rightValue] = currentRight;
        let newValue = {};
        Object.assign(newValue, leftValue);
        Object.assign(newValue, rightValue);
        let newType = combineOutputTypes(leftType, rightType);
        queue.push({ value: [newType, newValue], done: false });
    }
    function checkDone() {
        if (doneLeft && doneRight)
            queue.push({ done: true });
    }

    Utils.generatorToAsync(lhs)((v) => {
        currentLeft = v;
        emit();
    }).then(() => {
        doneLeft = true;
        checkDone();
    }).catch((err) => queue.cancelWait(err));

    Utils.generatorToAsync(rhs)((v) => {
        currentRight = v;
        emit();
    }).then(() => {
        doneRight = true;
        checkDone();
    }).catch((err) => queue.cancelWait(err));

    return new IteratorAdapter(queue);
}
module.exports.streamUnion = streamUnion;

function accumulateStream(stream) {
    let into = [];

    return Utils.generatorToAsync(stream)((v) => {
        into.push(v);
    }).then(() => into);
}

class DelayedIterator {
    constructor(promise) {
        this._promise = promise;
        this._iterator = null;
    }

    next() {
        if (this._iterator !== null)
            return Promise.resolve(this._iterator.next());
        return this._promise.then((iterator) => {
            this._iterator = iterator;
            return this._iterator.next();
        });
    }
}

function tableCrossJoin(lhs, rhs) {
    return new DelayedIterator(Promise.all([
        accumulateStream(lhs),
        accumulateStream(rhs)
    ]).then(([left, right]) => {
        return (function*() {
            for (let l of left) {
                for (let r of right) {
                    let [leftType, leftValue] = l;
                    let [rightType, rightValue] = r;
                    let newValue = {};
                    Object.assign(newValue, leftValue);
                    Object.assign(newValue, rightValue);
                    let newType = combineOutputTypes(leftType, rightType);
                    yield [newType, newValue];
                }
            }
        })();
    }));
}
module.exports.tableCrossJoin = tableCrossJoin;

function combineOutputTypes(t1, t2) {
    return `${t1}+${t2}`;
}
module.exports.combineOutputTypes = combineOutputTypes;

module.exports.BinaryOps = {
    '>': {
        types: [[Type.String, Type.String, Type.Boolean],
                [Type.Measure(''), Type.Measure(''), Type.Boolean],
                [Type.Number, Type.Number, Type.Boolean],
                [Type.Date, Type.Date, Type.Boolean],
                [Type.Time, Type.Time, Type.Boolean],
                [Type.Currency, Type.Currency, Type.Boolean]],
        op: '>'
    },
    '<': {
        types: [[Type.String, Type.String, Type.Boolean],
                [Type.Measure(''), Type.Measure(''), Type.Boolean],
                [Type.Number, Type.Number, Type.Boolean],
                [Type.Date, Type.Date, Type.Boolean],
                [Type.Time, Type.Time, Type.Boolean],
                [Type.Currency, Type.Currency, Type.Boolean]],
        op: '<'
    },
    '>=': {
        types: [[Type.String, Type.String, Type.Boolean],
                [Type.Measure(''), Type.Measure(''), Type.Boolean],
                [Type.Number, Type.Number, Type.Boolean],
                [Type.Date, Type.Date, Type.Boolean],
                [Type.Time, Type.Time, Type.Boolean],
                [Type.Currency, Type.Currency, Type.Boolean]],
        op: '>='
    },
    '<=': {
        types: [[Type.String, Type.String, Type.Boolean],
                [Type.Measure(''), Type.Measure(''), Type.Boolean],
                [Type.Number, Type.Number, Type.Boolean],
                [Type.Date, Type.Date, Type.Boolean],
                [Type.Time, Type.Time, Type.Boolean],
                [Type.Currency, Type.Currency, Type.Boolean]],
        op: '<='
    },
    '==': {
        types: [['a', 'a', Type.Boolean]],
        fn: 'equality',
    },
    '=~': {
        types: [[Type.String, Type.String, Type.Boolean]],
        fn: 'like'
    },
    '~=': {
        types: [[Type.String, Type.String, Type.Boolean]],
        fn: 'like',
        flip: true
    },
    starts_with: {
        types: [[Type.String, Type.String, Type.Boolean]],
        fn: 'startsWith',
    },
    ends_with: {
        types: [[Type.String, Type.String, Type.Boolean]],
        fn: 'endsWith',
    },
    prefix_of: {
        types: [[Type.String, Type.String, Type.Boolean]],
        fn: 'startsWith',
        flip: true
    },
    suffix_of: {
        types: [[Type.String, Type.String, Type.Boolean]],
        fn: 'endsWith',
        flip: true
    },
    'contains': {
        types: [[Type.Array('a'), 'a', Type.Boolean]],
        fn: 'contains',
    },
    'in_array': {
        types: [['a', Type.Array('a'), Type.Boolean]],
        fn: 'contains',
        flip: true
    },
    'has_member': {
        types: [[Type.Entity('tt:contact_group'), Type.Entity('tt:contact'), Type.Boolean]],
    },
    'group_member': {
        types: [[Type.Entity('tt:contact'), Type.Entity('tt:contact_group'), Type.Boolean]],
    }
};

function getTime(d) {
    return new Time(d.getHours(), d.getMinutes(), d.getSeconds());
}
module.exports.getTime = getTime;

module.exports.UnaryOps = {
    '!': {
        types: [[Type.Boolean, Type.Boolean]],
        op: '!'
    },
    'get_time': {
        types: [[Type.Date, Type.Time]],
        fn: 'getTime'
    }
};

module.exports.ScalarExpressionOps = {
    '+': {
        types: [[Type.String, Type.String, Type.String],
                [Type.Number, Type.Number, Type.Number],
                [Type.Currency, Type.Currency, Type.Currency],
                [Type.Measure(''), Type.Measure(''), Type.Measure('')],
                [Type.Date, Type.Measure('ms'), Type.Date],
                [Type.Time, Type.Measure('ms'), Type.Time],
                [Type.Measure('ms'), Type.Date, Type.Date],
                [Type.Measure('ms'), Type.Time, Type.Time]],
        op: '+'
    },
    '-': {
        types: [[Type.Number, Type.Number, Type.Number],
                [Type.Currency, Type.Currency, Type.Currency],
                [Type.Measure(''), Type.Measure(''), Type.Measure('')],
                [Type.Date, Type.Measure('ms'), Type.Date],
                [Type.Time, Type.Measure('ms'), Type.Time]],
        op: '-'
    },
    '*': {
        types: [[Type.Number, Type.Number, Type.Number],
                [Type.Currency, Type.Number, Type.Currency],
                [Type.Measure(''), Type.Number, Type.Measure('')]],
        op: '*'
    },
    '/': {
        types: [[Type.Number, Type.Number, Type.Number],
                [Type.Currency, Type.Number, Type.Currency],
                [Type.Measure(''), Type.Number, Type.Measure('')]],
        op: '/'
    },
    '%': {
        types: [[Type.Number, Type.Number, Type.Number]],
        op: '%'
    },
    '**': {
        types: [[Type.Number, Type.Number, Type.Number]],
        op: '**'
    },
    'distance': {
        types: [[Type.Location, Type.Location, Type.Measure('m')]],
        op: '~'
    }
};

module.exports.Aggregations = {
    'max': {
        types: [[Type.Number, Type.Number],
                [Type.Currency, Type.Currency],
                [Type.Measure(''), Type.Measure('')]]
    },
    'min': {
        types: [[Type.Number, Type.Number],
                [Type.Currency, Type.Currency],
                [Type.Measure(''), Type.Measure('')]]
    },
    'sum': {
        types: [[Type.Number, Type.Number],
                [Type.Currency, Type.Currency],
                [Type.Measure(''), Type.Measure('')]]
    },
    'count': {
        types: [[Type.Any, Type.Number]]
    }
};

module.exports.ArgMinMax = {
    'argmax': {
        types: [Type.Number, Type.Measure(''), Type.Currency]
    },
    'argin': {
        types: [Type.Number, Type.Measure(''), Type.Currency]
    }
};

const builtinFunction = new Ast.FunctionDef(
    'builtin',
    [], // args
    [], // types
    {}, // index
    {}, // inReq
    {}, // inOpt
    {}, // out
    '', // canonical
    '', // confirmation
    '', // confirmation_remote,
    [], // argcanonicals,
    [] // questions
);

module.exports.emptyFunction = builtinFunction;
module.exports.Triggers = {
    'new_record': builtinFunction,
};
module.exports.Actions = {
    'notify': builtinFunction,
    'return': builtinFunction,
    'save': builtinFunction,
};
module.exports.Queries = {
    'get_record': builtinFunction,
};
