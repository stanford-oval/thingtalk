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

const FunctionDefs = require('./function_def');
const ClassDefs = require('./class_def');
const Values = require('./values');
const Programs = require('./program');
const Bookkeepings = require('./bookkeeping');

adt.nativeClone = function nativeClone(x) {
    if (x === null || x === undefined)
        return x;
    if (x instanceof adt.__Base__ || typeof x.clone === 'function')
        return x.clone();
    if (Array.isArray(x))
        return x.map((el) => nativeClone(el));
    if (x instanceof Date)
        return new Date(x);
    if (typeof x === 'object') {
        let clone = {};
        Object.assign(clone, x);
        return clone;
    }
    return x;
};

Object.assign(module.exports, FunctionDefs, ClassDefs, Values, Programs, Bookkeepings);
require('./api');
