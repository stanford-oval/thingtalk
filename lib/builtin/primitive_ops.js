// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingTalk
//
// Copyright 2015-2018 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const Ast = require('../ast');

const BuiltinValues = require('./values');
const Location = BuiltinValues.Location;
const Entity = BuiltinValues.Entity;
const Time = BuiltinValues.Time;
const Currency = BuiltinValues.Currency;

// Implementations of the ThingTalk operators

function arrayEquals(a, b) {
    if (a.length !== b.length)
        return false;

    for (var i = 0; i < a.length; i++) {
        if (!equalityTest(a[i], b[i]))
            return false;
    }

    return true;
}

function objectEquals(a, b) {
    let a_props = Object.getOwnPropertyNames(a);
    let b_props = Object.getOwnPropertyNames(b);

    if (a_props.length !== b_props.length)
        return false;

    for (let i = 0; i < a_props.length; i ++) {
        if (!equalityTest(a[a_props[i]], b[a_props[i]]))
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
    return typeof x === 'number' || x instanceof Date || x instanceof Time;
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
    if (a instanceof Currency && b instanceof Currency)
        return a.value === b.value && a.code.toLowerCase() === b.code.toLowerCase();
    if (a instanceof Currency && typeof b === 'number')
        return +a === +b;
    if (b instanceof Currency && typeof a === 'number')
        return +a === +b;
    if (a.feedId !== undefined)
        return a.feedId === b.feedId;
    if (isLocation(a) && isLocation(b))
        return locationEquals(a, b);
    if (isEntity(a) && isEntity(b))
        return String(a) === String(b);
    if (a instanceof Ast.Example && b instanceof Ast.Example)
        return a.id === b.id;
    if (Array.isArray(a) && Array.isArray(b))
        return arrayEquals(a, b);
    if (typeof a === 'object' && typeof b === 'object')
        return objectEquals(a, b);

    return false;
}
module.exports.equality = equalityTest;

function likeTest(a, b) {
    if (typeof a === 'string' && typeof b === 'string')
        return a.toLowerCase().indexOf(b.toLowerCase()) >= 0;
    return false;
}
module.exports.like = likeTest;

function startsWith(a, b) {
    if (typeof a === 'string' && typeof b === 'string')
        return a.toLowerCase().startsWith(b.toLowerCase());
    return false;
}
module.exports.startsWith = startsWith;

function endsWith(a, b) {
    if (typeof a === 'string' && typeof b === 'string')
        return a.toLowerCase().endsWith(b.toLowerCase());
    return false;
}
module.exports.endsWith = endsWith;

function contains(a, b) {
    return a.some((x) => equalityTest(x, b));
}
module.exports.contains = contains;

function getTime(d) {
    return new Time(d.getHours(), d.getMinutes(), d.getSeconds());
}
module.exports.getTime = getTime;

// aggregations
module.exports.sum = function(a, b) {
    return a + b;
};
module.exports.max = function(a, b) {
    return Math.max(a, b);
};
module.exports.min = function(a, b) {
    return Math.min(a, b);
};
module.exports.argmax = function(value, previous) {
    return value > previous;
};
module.exports.argmin = function(value, previous) {
    return value < previous;
};

// FIXME: replace with a faster implementation based on binary trees
// if we care
class EqualitySet {
    constructor() {
        this.store = [];
    }

    has(value) {
        for (let candidate of this.store) {
            if (equalityTest(candidate, value))
                return true;
        }
        return false;
    }

    add(value) {
        for (let candidate of this.store) {
            if (equalityTest(candidate, value))
                return;
        }
        this.store.push(value);
    }

    get size() {
        return this.store.length;
    }
}
module.exports.EqualitySet = EqualitySet;

class ArgMinMaxState {
    constructor(op, field, base, limit) {
        this._op = op;
        this._field = field;

        this._total = Math.max(base + limit - 1, 1);
        this._filled = 0;
        this._tuples = new Array(this._total);
        this._outputTypes = new Array(this._total);
        this._values = new Array(this._total);

        this._base = Math.max(base-1, 0);
    }

    *[Symbol.iterator]() {
        for (let i = this._base; i < this._filled; i++)
            yield [this._outputTypes[i], this._tuples[i]];
    }

    update(tuple, outputType) {
        const value = tuple[this._field];

        for (let i = 0; i < this._filled; i++) {
            const candidate = this._tuples[i][this._field];
            if (this._op(value, candidate)) {
                // shift everything by one

                let last;
                if (this._filled < this._total) {
                    last = this._filled;
                    this._filled++;
                } else {
                    last = this._filled-1;
                }
                for (let j = last; j > i; j--) {
                    this._tuples[j] = this._tuples[j-1];
                    this._outputTypes[j] = this._outputTypes[j-1];
                }

                this._tuples[i] = tuple;
                this._outputTypes[i] = outputType;
                return;
            }
        }

        if (this._filled < this._total) {
            this._tuples[this._filled] = tuple;
            this._outputTypes[this._filled] = outputType;
            this._filled ++;
        }
    }
}
module.exports.ArgMinMaxState = ArgMinMaxState;
