// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingEngine
//
// Copyright 2015-2016 Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const assert = require('assert');

exports.UnitsToBaseUnit = {
    // time
    'ms': 'ms', // base unit for time is milliseconds, because +new Date gives milliseconds
    's': 'ms',
    'min': 'ms',
    'h': 'ms',
    'day': 'ms',
    'week': 'ms',
    'mon': 'ms', // business month, aka exactly 30 days
    'year': 'ms', // business year (365 days exactly, no leap years)
    // length
    'm': 'm',
    'km': 'm',
    'mm': 'm',
    'cm': 'm',
    'mi': 'm',
    'in': 'm',
    'ft': 'm',
    // speed
    'mps': 'mps', // meters per second, usually written as m/s but m/s is not an identifier
    'kmph': 'mps',
    'mph': 'mps',
    // weight
    'kg': 'kg',
    'g': 'kg',
    'lb': 'kg',
    'oz': 'kg',
    // pressure (for weather or blood)
    'Pa': 'Pa',
    'bar': 'Pa',
    'psi': 'Pa',
    'mmHg': 'Pa',
    'inHg': 'Pa',
    'atm': 'Pa',
    // temperature
    'C': 'C',
    'F': 'C',
    'K': 'C',
    // energy
    'kcal': 'kcal',
    'kJ': 'kcal',
    // file and memory sizes
    'byte': 'byte',
    'KB': 'byte',
    'KiB': 'byte',
    'MB': 'byte',
    'MiB': 'byte',
    'GB': 'byte',
    'GiB': 'byte',
    'TB': 'byte',
    'TiB': 'byte'
};

exports.UnitsTransformToBaseUnit = {
    'ms': 1,
    's': 1000,
    'min': 60 * 1000,
    'h': 3600 * 1000,
    'day': 86400 * 1000,
    'week': 86400 * 7 * 1000,
    'mon': 86400 * 30 * 1000,
    'year': 86400 * 365 * 1000,
    'm': 1,
    'km': 1000,
    'mm': 1/1000,
    'cm': 1/100,
    'mi': 1609.344,
    'in': 0.0254,
    'ft': 0.3048,
    'mps': 1,
    'kmph': 0.27777778,
    'mph': 0.44704,
    'kg': 1,
    'g': 1/1000,
    'lb': 0.45359237,
    'oz': 0.028349523,
    'Pa': 1,
    'bar': 100000,
    'psi': 6894.7573,
    'mmHg': 133.32239,
    'inHg': 3386.3886,
    'atm': 101325,
    'C': 1,
    'F': function(x) { return (x - 32)/1.8; },
    'K': function(x) { return x - 273.15; },
    'kcal': 1,
    'kJ': 0.239006,
    'byte': 1,
    'KB': 1000,
    'KiB': 1024,
    'MB': 1000*1000,
    'MiB': 1024*1024,
    'GB': 1000*1000*1000,
    'GiB': 1024*1024*1024,
    'TB': 1000*1000*1000*1000,
    'TiB': 1024*1024*1024*1024
};

exports.UnitsInverseTransformFromBaseUnit = {
    'F': function(x) { return x*1.8 + 32; },
    'K': function(x) { return x + 273.15; }
};

exports.transformToBaseUnit = function(value, unit) {
    var transform = exports.UnitsTransformToBaseUnit[unit];
    if (typeof transform === 'function')
        return transform(value);
    else
        return value * transform;
};

const TIME_UNITS = ['ms', 's', 'min', 'h', 'day', 'week', 'mon', 'year'];
const SET_ZERO = [(d) => {},
    (d) => {
        d.setMilliseconds(0); // start of current second
    },
    (d) => {
        d.setSeconds(0, 0); // start of current minute
    },
    (d) => {
        d.setMinutes(0, 0, 0); // start of current hour
    },
    (d) => {
        d.setHours(0, 0, 0, 0); // start of current day
    },
    (d) => {
        d.setHours(0, 0, 0, 0);
        d.setDate(d.getDate()-d.getDay()); // start of current week (week starts Sunday)
    },
    (d) => {
        d.setHours(0, 0, 0, 0);
        d.setDate(1); // start of current month
    },
    (d) => {
        d.setHours(0, 0, 0, 0);
        d.setMonth(0, 1); // start of current yeah
    }
];
const ADD_ONE = [
    (d) => {
        d.setMilliseconds(d.getMilliseconds()+1);
    },
    (d) => {
        d.setSeconds(d.getSeconds()+1);
    },
    (d) => {
        d.setMinutes(d.getMinutes()+1);
    },
    (d) => {
        d.setHours(d.getHours()+1);
    },
    (d) => {
        d.setDate(d.getDate()+1);
    },
    (d) => {
        d.setDate(d.getDate()+7);
    },
    (d) => {
        d.setMonth(d.getMonth()+1);
    },
    (d) => {
        d.setFullYear(d.getFullYear()+1);
    }
];
assert(SET_ZERO.length === TIME_UNITS.length);
assert(ADD_ONE.length === TIME_UNITS.length);


function createEdgeDate(edge, unit) {
    const index = TIME_UNITS.indexOf(unit);

    let date = new Date;
    SET_ZERO[index](date);
    if (edge === 'end_of')
        ADD_ONE[index](date);
}

exports.normalizeDate = function(value, offset) {
    let base;
    if (value === null)
        base = new Date;
    else if (value instanceof Date)
        base = value;
    else
        base = createEdgeDate(value.unit);
    base.setMilliseconds(base.getMilliseconds() + offset);
    return base;
};
