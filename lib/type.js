// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingTalk
//
// Copyright 2015-2016 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

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

// strictly speaking, Measure and Arrays are not types, they are type constructors
// (kind * -> *)
// isAssignable() has the magic to check types
const Type = adt.data(function() {
    return {
        Any: null, // polymorphic hole
        Boolean: null,
        String: null,
        Number: null,
        Currency: null,
        Entity: { // a typed string (username, hashtag, url, picture...)
            type: adt.only(String), // the entity type, as RDF-style prefix:name
        },
        Measure: {
            // '' means any unit, creating a polymorphic type
            // any other value is a base unit (m for length, C for temperature)
            unit: normalizeUnit,
        },
        Enum: {
            entries: adt.only(Array, null) // of string
        },
        Array: {
            elem: adt.only(this, String),
        },
        Time: null,
        Date: null,
        Location: null,
        Tuple: {
            schema: adt.only(Array),
        },
        Table: null,
        Stream: null
    };
});

module.exports = Type;

module.exports.fromString = function(str) {
    if (str instanceof Type)
        return str;

    return Grammar.parse(str, { startRule: 'type_ref' });
};

function arrayEquals(a, b) {
    if (a === null && b === null)
        return true;
    if (a === null || b === null)
        return false;
    if (a.length !== b.length)
        return false;

    for (var i = 0; i < a.length; i++) {
        if (a[i] !== b[i])
            return false;
    }

    return true;
}

function entitySubType(type, assignableTo) {
    if (type === 'tt:contact_name') {
        return assignableTo === 'tt:phone_number' ||
            assignableTo === 'tt:email_address' ||
            assignableTo === 'tt:contact';
    }
    if (type === 'tt:contact_group_name')
        return assignableTo === 'tt:contact_group';
    if (type === 'tt:picture_url')
        return assignableTo === 'tt:url';
    return false;
}

module.exports.isAssignable = function isAssignable(type, assignableTo, typeScope = {}, lenient = false) {
    if (typeof assignableTo === 'string') {
        if (typeScope[assignableTo])
            return isAssignable(type, typeScope[assignableTo], typeScope, lenient);
        typeScope[assignableTo] = type;
        return true;
    }
    if (type.equals(assignableTo))
        return true;
    if (type.isAny || assignableTo.isAny)
        return true;
    if (type.isMeasure && assignableTo.isMeasure && assignableTo.unit !== '') {
        if (type.unit === assignableTo.unit)
            return true;
    }
    if (type.isMeasure && assignableTo.isMeasure && assignableTo.unit === '') {
        if (!typeScope['_unit']) {
            typeScope['_unit'] = type.unit;
            return true;
        }
        if (typeScope['_unit'] && typeScope['_unit'] === type.unit)
            return true;
    }
    if (type.isTuple && assignableTo.isTuple) {
        return type.schema.length === assignableTo.schema.length &&
            type.schema.every((t, i) => isAssignable(t, assignableTo.schema[i]));
    }
    if (type.isArray && assignableTo.isArray &&
        typeof assignableTo.elem === 'string') {
        if (typeScope[assignableTo.elem])
            return isAssignable(type.elem, typeScope[assignableTo.elem], typeScope, lenient);
        typeScope[assignableTo.elem] = type.elem;
        return true;
    }
    if (type.isArray && assignableTo.isEntity && assignableTo.type === 'tt:contact_group')
        return isAssignable(type.elem, Type.Entity('tt:contact'), typeScope, lenient);
    if (type.isDate && assignableTo.isTime)
        return true;
    if (type.isEntity && assignableTo.isString)
        return true;
    if (lenient && type.isString && assignableTo.isEntity) {
        //console.log('Using String for ' + assignableTo + ' is deprecated');
        return true;
    }
    if (type.isEnum && assignableTo.isEnum && type.entries === null)
        return true;
    if (type.isEnum && assignableTo.isEnum && arrayEquals(type.entries, assignableTo.entries))
        return true;
    if (type.isEntity && assignableTo.isEntity && entitySubType(type.type, assignableTo.type))
        return true;

    return false;
};
