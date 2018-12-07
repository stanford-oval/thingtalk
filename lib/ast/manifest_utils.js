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

const Type = require('../type');
const { Value } = require('./values');

function getString(value, fallback='') {
    if (!value) return fallback;
    if (value.isString) return value.value;
    if (typeof value === 'string') return value;
    throw new Error(`Invalid type for string value ${value}`);
}

function toJS(metadata) {
    if (Array.isArray(metadata))
        return Value.Array(metadata).toJS();
    return Value.Object(metadata).toJS();
}

function htmlTypeToTT(htmlType) {
    switch (htmlType) {
    case 'text':
        return Type.String;
    case 'password':
        return Type.Entity('tt:password');
    case 'number':
        return Type.Number;
    case 'url':
        return Type.Entity('tt:url');
    case 'email':
        return Type.Entity('tt:email_address');
    case 'tel':
        return Type.Entity('tt:phone_number');
    default:
        throw new Error(`Can't handle HTML input type ${htmlType}`);//'
    }
}
function typeToHTML(type) {
    if (type.isString)
        return 'text';
    else if (type.isNumber)
        return 'number';
    else if (type.isEntity && type.type === 'tt:password')
        return 'password';
    else if (type.isEntity && type.type === 'tt:url')
        return 'url';
    else if (type.isEntity && type.type === 'tt:email_address')
        return 'email';
    else if (type.isEntity && type.type === 'tt:phone_number')
        return 'tel';
    else if (type.isEntity)
        return 'text';
    else
        throw new Error(`Can't convert type ${type} to HTML`);//'
}

module.exports = {
    getString,
    toJS,
    htmlTypeToTT,
    typeToHTML
};
