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

const Type = require('../type');
const { FunctionDef } = require('../ast/function_def');

// Definitions of ThingTalk operators

/**
 * Definitions (type signatures) of ThingTalk binary comparison operators.
 *
 * @alias module:Builtin.BinaryOps
 * @namespace
 * @package
 */
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

/**
 * Definitions (type signatures) of ThingTalk unary operators.
 *
 * @alias module:Builtin.UnaryOps
 * @namespace
 * @package
 */
module.exports.UnaryOps = {
    '!': {
        types: [[Type.Boolean, Type.Boolean]],
        op: '!'
    },
    'get_time': {
        types: [[Type.Date, Type.Time]],
        fn: 'getTime'
    },
    'get_currency': {
        types: [[Type.Number, Type.Currency]],
        fn: 'getCurrency'
    }
};

/**
 * Definitions (type signatures) of ThingTalk scalar operators.
 *
 * @alias module:Builtin.ScalarExpressionOps
 * @namespace
 * @package
 */
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

/**
 * Definitions (type signatures) of ThingTalk aggregation operators.
 *
 * @alias module:Builtin.Aggregations
 * @namespace
 * @package
 */
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
    'avg': {
        types: [[Type.Number, Type.Number],
                [Type.Currency, Type.Currency],
                [Type.Measure(''), Type.Measure('')]]
    },
    'count': {
        types: [[Type.Any, Type.Number]]
    }
};

function builtinFunction(name) {
    return new FunctionDef('action', name, [], [], false, false, {}, {});
}
module.exports.emptyFunction = builtinFunction;
module.exports.Triggers = {
};
module.exports.Actions = {
    'notify': builtinFunction('notify'),
    'return': builtinFunction('return'),
    'save': builtinFunction('save'),
};
module.exports.Queries = {
};
