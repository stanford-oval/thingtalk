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
const Type = adt.data(function() {
    return {
        Any: null, // polymorphic hole
        Boolean: null,
        String: null,
        Number: null,
        Resource: null, // an RDF resource (represented as IRI)
        URL: null, // a web link (URL) - same as Resource but unifies with String for compat
        Picture: null, // a picture URL
        EmailAddress: null,
        PhoneNumber: null,
        Username: null,
        Hashtag: null,
        Measure: {
            // '' means any unit, creating a polymorphic type
            // any other value is a base unit (m for length, C for temperature)
            unit: normalizeUnit,
        },
        Enum: {
            entries: adt.only(Array) // of string
        },
        Array: {
            elem: adtOnlyOrString(this),
        },
        Map: {
            key: adtOnlyOrString(this),
            value: adtOnlyOrString(this),
        },
        Time: null,
        Date: null,
        Location: null,
        Tuple: {
            schema: adtNullable(Array),
        },

        // internal types
        Object: {
            schema: adt.any,
        },
        Module: null,
    };
});

module.exports = Type;

module.exports.fromString = function(str) {
    if (str instanceof Type)
        return str;

    return Grammar.parse(str, { startRule: 'type_ref' });
};

function arrayEquals(a, b) {
    if (a.length !== b.length)
        return false;

    for (var i = 0; i < a.length; i++) {
        if (a[i] !== b[i])
            return false;
    }

    return true;
}

function isCompatType(t) {
    return t.isPicture || t.isEmailAddress || t.isPhoneNumber || t.isURL || t.isUsername || t.isHashtag || t.isTime;
}

module.exports.typeUnify = function typeUnify(t1, t2, typeScope) {
    if (!typeScope)
        typeScope = {};

    if (typeof t1 === 'string' && typeof t2 === 'string') {
        if (t1 in typeScope && t2 in typeScope)
            return typeUnify(typeScope[t1], typeScope[t2], typeScope);
        if (t1 in typeScope)
            return typeScope[t2] = typeScope[t1];
        else if (t2 in typeScope)
            return typeScope[t1] = typeScope[t2];
        else
            return typeScope[t1] = typeScope[t2] = Type.Any;
    }
    if (typeof t1 === 'string') {
        if (t1 in typeScope)
            t1 = typeScope[t1];
        else
            return t1 = typeScope[t1] = t2;
    }
    if (typeof t2 === 'string') {
        if (t2 in typeScope)
            t2 = typeScope[t2];
        else
            return t2 = typeScope[t2] = t1;
    }
    // this will also check that the units match for two measures
    if (t1.equals(t2))
        return t1;
    if (t1.isAny)
        return t2;
    else if (t2.isAny)
        return t1;
    else if (t1.isMeasure && t1.unit == '' && t2.isMeasure)
        return t2;
    else if (t2.isMeasure && t2.unit == '' && t1.isMeasure)
        return t1;
    else if (t1.isObject && t2.isObject && t1.schema === null)
        return t2;
    else if (t1.isObject && t2.isObject && t2.schema === null)
        return t2;
    else if (t1.isTuple && t2.isTuple && t1.schema === null)
        return t2;
    else if (t1.isTuple && t2.isTuple && t2.schema === null)
        return t1;
    else if (t1.isTuple && t2.isTuple && t1.schema.length === t2.schema.length) {
        var mapped = new Array(t1.schema.length);
        for (var i = 0; i < t1.schema.length; i++)
            mapped[i] = typeUnify(t1.schema[i], t2.schema[i], typeScope);
        return Type.Tuple(mapped);
    }
    else if (t1.isArray && t2.isArray)
        return Type.Array(typeUnify(t1.elem, t2.elem, typeScope));
    else if (t1.isMap && t2.isMap)
        return Type.Map(typeUnify(t1.key, t2.key, typeScope),
                        typeUnify(t1.value, t2.value, typeScope));
    else if (t1.isEnum && t2.isEnum && arrayEquals(t1.entries, t2.entries))
        return t1;
    else if (t1.isEnum && t2.isString) // strings and enums are interchangeable
        return t1;
    else if (t2.isEnum && t1.isString)
        return t2;
    else if ((isCompatType(t1) && t2.isString) || (t1.isString && isCompatType(t2))) {
        // for compat reason, some types unify with String
        console.log('Using type String for ' + t2 + ' is deprecated');
        return isCompatType(t2) ? t2 : t1;
    } else
        throw new TypeError('Cannot unify ' + t1 + ' and ' + t2);
}

module.exports.resolveTypeScope = function resolveTypeScope(type, typeScope) {
    if (typeof type === 'string') {
        if (type in typeScope)
            return resolveTypeScope(typeScope[type], typeScope);
        else
            return Type.Any;
    }

    if (type.isArray)
        return Type.Array(resolveTypeScope(type.elem, typeScope));
    else if (type.isMap)
        return Type.Map(resolveTypeScope(type.key, typeScope),
                        resolveTypeScope(type.value, typeScope));
    else if (type.isTuple && type.schema !== null)
        return Type.Tuple(type.schema.map(function(t) { return resolveTypeScope(t, typeScope); }));
    else
        return type;
}
