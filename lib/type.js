// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingEngine
//
// Copyright 2015-2016 Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details

const adt = require('adt');

const Grammar = require('./grammar');
const Internal = require('./internal');

function normalizeUnit(unit) {
    if (unit === '')
        return '';
    var baseunit = Internal.UnitsToBaseUnit[unit];
    if (baseunit === undefined)
        throw new TypeError('Invalid unit ' + unit);
    return baseunit;
}

function adtOnlyOrString(what) {
    return function(v) {
        if (typeof v === 'string')
            return v;
        if (v instanceof what)
            return v;
        throw new TypeError('Invalid ADT parameter');
    }
}

function adtNullable(o) {
    var only = adt.only(o);
    return function(v) {
        if (v === null)
            return v;
        else
            return only.apply(this, arguments);
    };
}

// strictly speaking, Measure and Arrays are not types, they are type constructors
// (kind * -> *)
// typeUnify() has the magic to check types
module.exports = adt.data(function() {
    return {
        Any: null, // polymorphic hole
        Boolean: null,
        String: null,
        Number: null,
        Measure: {
            // '' means any unit, creating a polymorphic type
            // any other value is a base unit (m for length, C for temperature)
            unit: normalizeUnit,
        },
        Array: {
            elem: adtOnlyOrString(this),
        },
        Map: {
            key: adtOnlyOrString(this),
            value: adtOnlyOrString(this),
        },
        Date: null,
        Location: null,
        Tuple: {
            schema: adtNullable(Array),
        },
        User: null,
        Feed: null,

        // internal types
        Object: {
            schema: adt.any,
        },
        Module: null,
    };
});

module.exports.fromString = function(str) {
    return Grammar.parse(str, { startRule: 'type_ref' });
};
