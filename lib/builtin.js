// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingEngine
//
// Copyright 2015-2016 Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const adt = require('adt');

const Type = require('./type');

function objectToString(o) {
    if (Array.isArray(o))
        return (o.map(objectToString).join(', '));
    else if (typeof o === 'object' && o !== null &&
             o.hasOwnProperty('x') && o.hasOwnProperty('y'))
        return '[Latitude: ' + Number(o.y).toFixed(3) + ' deg, Longitude: ' + Number(o.x).toFixed(3) + ' deg]';
    else if (typeof o === 'number')
        return (Math.floor(o) === o ? o.toFixed(0) : o.toFixed(3));
    else
        return String(o);
}

function arrayEquals(a, b) {
    if (a.length !== b.length)
        return false;

    for (var i = 0; i < a.length; i++) {
        if (!equalityTest(a[i], b[i]))
            return false;
    }

    return true;
}

function equalityTest(a, b) {
    if (a === b)
        return true;
    if (a === null || b === null) // they can't be both null because a !== b
        return false;
    if (a instanceof Date && b instanceof Date)
        return +a === +b;
    if (typeof a !== typeof b)
        return false;
    if (typeof a !== 'object') // primitives compare ===
        return false;
    if (a.feedId !== undefined)
        return a.feedId === b.feedId;
    if (a.hasOwnProperty('x') && a.hasOwnProperty('y'))
        return a.x === b.x && a.y === b.y;
    if (Array.isArray(a) && Array.isArray(b))
        return arrayEquals(a, b);

    return false;
}

module.exports.equality = equalityTest;

function likeTest(a, b) {
    return a.indexOf(b) >= 0;
}

module.exports.BinaryOps = {
    '+': {
        types: [[Type.Measure(''), Type.Measure(''), Type.Measure('')],
                [Type.Number, Type.Number, Type.Number],
                [Type.String, Type.String, Type.String]],
        op: function(a, b) { return a + b; },
        pure: true,
    },
    '-': {
        types: [[Type.Measure(''), Type.Measure(''), Type.Measure('')],
                [Type.Number, Type.Number, Type.Number],
                [Type.Date, Type.Date, Type.Measure('ms')]],
        op: function(a, b) { return (+a) - (+b); },
        pure: true,
    },
    '*': {
        types: [[Type.Measure(''), Type.Number, Type.Measure('')],
                [Type.Number, Type.Measure(''), Type.Measure('')],
                [Type.Number, Type.Number, Type.Number]],
        op: function(a, b) { return a * b; },
        pure: true,
    },
    '/': {
        types: [[Type.Measure(''), Type.Measure(''), Type.Number],
                [Type.Number, Type.Number, Type.Number]],
        op: function(a, b) { return a / b; },
        pure: true,
    },
    '&&': {
        types: [[Type.Boolean, Type.Boolean, Type.Boolean]],
        op: function(a, b) { return a && b; },
        pure: true,
    },
    '||': {
        types: [[Type.Boolean, Type.Boolean, Type.Boolean]],
        op: function(a, b) { return a && b; },
        pure: true,
    },
    '>': {
        types: [[Type.String, Type.String, Type.Boolean],
                [Type.Measure(''), Type.Measure(''), Type.Boolean],
                [Type.Number, Type.Number, Type.Boolean],
                [Type.Date, Type.Date, Type.Boolean]],
        op: function(a, b) { return a > b; },
        pure: true,
    },
    '<': {
        types: [[Type.String, Type.String, Type.Boolean],
                [Type.Measure(''), Type.Measure(''), Type.Boolean],
                [Type.Number, Type.Number, Type.Boolean],
                [Type.Date, Type.Date, Type.Boolean]],
        op: function(a, b) { return a < b; },
        pure: true,
        reverse: '<',
    },
    '>=': {
        types: [[Type.String, Type.String, Type.Boolean],
                [Type.Measure(''), Type.Measure(''), Type.Boolean],
                [Type.Number, Type.Number, Type.Boolean],
                [Type.Date, Type.Date, Type.Boolean]],
        op: function(a, b) { return a >= b; },
        pure: true,
        reverse: '<=',
    },
    '<=': {
        types: [[Type.String, Type.String, Type.Boolean],
                [Type.Measure(''), Type.Measure(''), Type.Boolean],
                [Type.Number, Type.Number, Type.Boolean],
                [Type.Date, Type.Date, Type.Boolean]],
        op: function(a, b) { return a <= b; },
        pure: true,
        reverse: '>=',
    },
    '=': {
        types: [[Type.Any, Type.Any, Type.Any]],
        op: equalityTest,
        pure: true,
        reverse: '=',
    },
    '!=': {
        types: [[Type.Any, Type.Any, Type.Any]],
        op: function(a, b) { return !(equalityTest(a,b)); },
        pure: true,
        reverse: '=',
    },
    '=~': {
        types: [[Type.String, Type.String, Type.String]],
        op: likeTest,
        pure: true,
        reverse: null,
    }
};

module.exports.UnaryOps = {
    '!': {
        types: [[Type.Boolean, Type.Boolean]],
        op: function(a) { return !a; },
        pure: true,
    },
    '-': {
        types: [[Type.Measure(''), Type.Measure('')],
                [Type.Number, Type.Number]],
        op: function(a) { return -a; },
        pure: true,
    }
};

module.exports.Functions = {
    'append': {
        types: [[Type.Array('a'), 'a', Type.Array('a')]],
        op: function(a, b) {
            var acopy = a.slice();
            acopy.push(b);
            return acopy;
        },
        pure: true,
    },
    'last': {
        types: [[Type.Array('a'), 'a']],
        op: function(a) {
            return a[a.length-1];
        },
        pure: true,
    },
    'first': {
        types: [[Type.Array('a'), 'a']],
        op: function(a) {
            return a[0];
        },
        pure: true,
    },
    'at': {
        types: [[Type.Array('a'), Number, 'a']],
        op: function(a, b) {
            b = Math.floor(b);
            return a[b];
        },
        pure: true,
    },
    'remove': {
        types: [[Type.Array('a'), 'a', Type.Array('a')],
                [Type.Map('k', 'v'), 'k', Type.Map('k', 'v')]],
        op: [function(a, b) {
            return a.filter(function(e) {
                return !equalityTest(e, b);
            });
        }, function(a, b) {
            return a.filter(function(e) {
                var k = e[0];
                var v = e[1];
                return !equalityTest(k, b);
            });
        }],
        pure: true,
    },
    'emptyMap': {
        types: [[Type.Map(Type.Any, Type.Any)]],
        op: function() {
            return [];
        },
        pure: true,
    },
    'lookup': {
        types: [[Type.Map('k', Type.Array('a')), 'k', Type.Array('a')],
                [Type.Map('k', 'v'), 'k', 'v']],
        op: [function(a, b) {
            for (var e of a) {
                var k = e[0];
                var v = e[1];
                if (equalityTest(k, b))
                    return v;
            }
            return [];
        }, function(a, b) {
            for (var e of a) {
                var k = e[0];
                var v = e[1];
                if (equalityTest(k, b))
                    return v;
            }
            return null;
        }],
        pure: true,
    },
    'insert': {
        types: [[Type.Map('k', 'v'), 'k', 'v', Type.Map('k', 'v')]],
        op: function(a, b, c) {
            var acopy = a.slice();
            for (var e of acopy) {
                var k = e[0];
                var v = e[1];
                if (equalityTest(k, b)) {
                    e[1] = c;
                    return acopy;
                }
            }
            acopy.push([b, c]);
            return acopy;
        },
        pure: true,
    },
    'values': {
        types: [[Type.Map('k', 'v'), Array('v')]],
        op: function(a) {
            return a.map(function(e) {
                return e[1];
            });
        },
        pure: true,
    },
    'regex': {
        types: [[Type.String, Type.String, Type.String, Type.Boolean]],
        minArgs: 2,
        op: function(a, b, c) {
            return (new RegExp(b, c)).test(a);
        },
        pure: true,
    },
    'contains': {
        types: [[Type.Array('a'), 'a', Type.Boolean],
                [Type.Map('k', 'v'), 'k', Type.Boolean]],
        op: [function(a, b) {
            return a.some(function(x) { return equalityTest(x, b); });
        }, function(a, b) {
            return a.some(function(x) { return equalityTest(x[0], b); });
        }],
        pure: true,
    },
    'distance': {
        types: [[Type.Location, Type.Location, Type.Measure('m')]],
        op: function(a, b) {
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

            var a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
                    Math.cos(φ1) * Math.cos(φ2) *
                    Math.sin(Δλ/2) * Math.sin(Δλ/2);
            var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

            return R * c;
        },
        pure: true,
    },
    'latitude': {
        types: [[Type.Location, Type.Number]],
        op: function(x) { return x.y; },
        pure: true,
    },
    'longitude': {
        types: [[Type.Location, Type.Number]],
        op: function(x) { return x.x; },
        pure: true,
    },
    'makeLocation': {
        types: [[Type.Number, Type.Number, Type.Location]],
        op: function(lat, lon) {
            return ({ x: lon, y: lat });
        },
        pure: true,
    },
    'makePicture': {
        types: [[Type.String, Type.Picture]],
        op: function(x) { return x; },
        pure: true,
    },
    'makeResource': {
        types: [[Type.String, Type.Resource]],
        op: function(x) { return x; },
        pure: true,
    },
    'toString': {
        types: [[Type.Any, Type.String]],
        op: objectToString,
        pure: true,
    },
    'valueOf': {
        types: [[Type.String, Type.Number]],
        op: parseFloat,
        pure: true,
    },
    'julianday': {
        types: [[Type.Date, Type.Number]],
        op: function(date) {
            return Math.floor((date.getTime() / 86400000) + 2440587.5);
        },
        pure: true,
    },
    'today': {
        types: [[Type.Number]],
        op: function() {
            return Functions.julianday.op(new Date);
        },
        pure: false,
    },
    'now': {
        types: [[Type.Date]],
        op: function() {
            return new Date;
        },
        pure: false,
    },
    'dayOfWeek': {
        types: [[Type.Date, Type.Number]],
        op: function(d) {
            return d.getDay();
        },
        pure: true,
    },
    'dayOfMonth': {
        types: [[Type.Date, Type.Number]],
        op: function(d) {
            return d.getDate();
        },
        pure: true,
    },
    'month': {
        types: [[Type.Date, Type.Number]],
        op: function(d) {
            return d.getMonth() + 1;
        },
        pure: true,
    },
    'year': {
        types: [[Type.Date, Type.Number]],
        op: function(d) {
            return d.getFullYear();
        },
        pure: true,
    },
    'makeDate': {
        types: [[Type.Number, Type.Number, Type.Number, Type.Date]],
        op: function(year, month, day) {
            return new Date(year, month-1, day);
        },
        pure: true,
    },
    'random': {
        types: [[Type.Number]],
        op: function() {
            return Math.random();
        },
        pure: false,
    },
    'choice': {
        types: [[Type.Array('t'), 't']],
        op: function(v) {
            return v[Math.floor(Math.random() * v.length)];
        },
        pure: false,
    },
    'floor': {
        types: [[Type.Number, Type.Number]],
        op: function(v) {
            return Math.floor(v);
        },
        pure: true,
    },
    'ceil': {
        types: [[Type.Number, Type.Number]],
        op: function(v) {
            return Math.ceil(v);
        },
        pure: true,
    },

    'sum': {
        types: [[Type.Array(Type.Number), Type.Number],
                [Type.Array(Type.Measure('')), Type.Measure('')]],
        op: function(values) {
            return values.reduce(function(v1, v2) { return v1 + v2; }, 0);
        },
        pure: true,
    },

    'avg': {
        types: [[Type.Array(Type.Number), Type.Number],
                [Type.Array(Type.Measure('')), Type.Measure('')]],
        op: function(values) {
            var sum = values.reduce(function(v1, v2) { return v1 + v2; }, 0);
            return sum / values.length;
        },
        pure: true,
    },

    'concat': {
        types: [[Type.Array(Type.Any), Type.String, Type.String]],
        minArgs: 1,
        op: function(values, joiner) {
            return values.map(objectToString).join(joiner);
        },
        pure: true,
    },

    'count': {
        types: [[Type.Array(Type.Any), Type.Number],
                [Type.Map(Type.Any, Type.Any), Type.Number]],
        tuplelength: -1,
        argtypes: [Type.Any],
        rettype: Type.Number,
        extratypes: [],
        op: function(values) {
            return values.length;
        },
        pure: true,
    },

    'argMin': {
        types: [[Type.Array(Type.Any), Type.Number],
                [Type.Map('k', Type.Any), 'k']],
        op: function(values) {
            return values.reduce(function(state, value, key) {
                if (state.who === null || value < state.best)
                    return { who: key, best: value };
                else
                    return state;
            }, { best: null, who: null }).who;
        },
        pure: true,
    },

    'argMax': {
        types: [[Type.Array(Type.Any), Type.Number],
                [Type.Map('k', Type.Any), 'k']],
        op: function(values) {
            return values.reduce(function(state, value, key) {
                if (state.who === null || value > state.best)
                    return { who: key, best: value };
                else
                    return state;
            }, { best: null, who: null }).who;
        },
        pure: true,
    },
};

module.exports.Triggers = {
};
module.exports.TriggerMeta = {
}

module.exports.Actions = {
    'return': null, // no schema
    'notify': null, // no schema
    'logger': [Type.String],
};
module.exports.ActionMeta = {
    'return': {
        schema: [Type.String],
        confirmation: 'return me',
        canonical: 'return me',
        doc: 'report a value to the user and remove the app',
        args: ['text'],
        questions: ["What should I return you?"]
    },
    'notify': {
        schema: [Type.String],
        confirmation: 'notify me',
        canonical: 'notify me',
        doc: 'notify the user with a value',
        args: ['text'],
        questions: ["What text to notify you with?"]
    },
    'logger': {
        schema: [Type.String],
        confirmation: 'log',
        canonical: 'log',
        doc: 'log a message in the developer logs',
        args: ['text'],
        questions: ["What should I write in the logs?"]
    }
};

module.exports.Queries = {};
module.exports.QueryMeta = {};
