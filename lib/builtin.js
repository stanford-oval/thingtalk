// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingEngine
//
// Copyright 2015-2016 Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const Type = require('./type');
const Ast = require('./ast');

// we split the module so that AST can also load it, because
// we need Ast to define function def at the end of the file
module.exports = require('./builtin_values');
const Location = module.exports.Location;
const Entity = module.exports.Entity;
const Time = module.exports.Time;

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

function equalityTest(a, b) {
    if (a === b)
        return true;
    if (a === null || b === null) // they can't be both null because a !== b
        return false;
    if (a === undefined || b === undefined)
        return false;
    if (a instanceof Date && b instanceof Date)
        return +a === +b;
    if (a.feedId !== undefined)
        return a.feedId === b.feedId;
    if (isLocation(a) && isLocation(b))
        return locationEquals(a, b);
    if (isEntity(a) && isEntity(b))
        return String(a) === String(b);
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

module.exports.BinaryOps = {
    '>': {
        types: [[Type.String, Type.String, Type.Boolean],
                [Type.Measure(''), Type.Measure(''), Type.Boolean],
                [Type.Number, Type.Number, Type.Boolean],
                [Type.Date, Type.Date, Type.Boolean],
                [Type.Time, Type.Time, Type.Boolean]],
        op: '>'
    },
    '<': {
        types: [[Type.String, Type.String, Type.Boolean],
                [Type.Measure(''), Type.Measure(''), Type.Boolean],
                [Type.Number, Type.Number, Type.Boolean],
                [Type.Date, Type.Date, Type.Boolean],
                [Type.Time, Type.Time, Type.Boolean]],
        op: '<'
    },
    '>=': {
        types: [[Type.String, Type.String, Type.Boolean],
                [Type.Measure(''), Type.Measure(''), Type.Boolean],
                [Type.Number, Type.Number, Type.Boolean],
                [Type.Date, Type.Date, Type.Boolean],
                [Type.Time, Type.Time, Type.Boolean]],
        op: '>='
    },
    '<=': {
        types: [[Type.String, Type.String, Type.Boolean],
                [Type.Measure(''), Type.Measure(''), Type.Boolean],
                [Type.Number, Type.Number, Type.Boolean],
                [Type.Date, Type.Date, Type.Boolean],
                [Type.Time, Type.Time, Type.Boolean]],
        op: '<='
    },
    '=': {
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

module.exports.Triggers = {};
module.exports.Actions = {
    'notify': new Ast.FunctionDef(
        'global',
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
    ),
    'return': new Ast.FunctionDef(
        'global',
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
    ),
};
module.exports.Queries = {};
