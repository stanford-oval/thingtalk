// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingTalk
//
// Copyright 2018-2020 The Board of Trustees of the Leland Stanford Junior University
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//    http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
"use strict";

const adt = require('adt');

const FunctionDefs = require('./function_def');
const ClassDefs = require('./class_def');
const Values = require('./values');
const Expressions = require('./expression');
const Primitives = require('./primitive');
const Programs = require('./program');
const Bookkeepings = require('./bookkeeping');
const Dialogues = require('./dialogues');
const NodeVisitor = require('./visitor');

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

/**
 * The AST namespace includes the definition of AST nodes.
 *
 * @namespace Ast
 */
Object.assign(module.exports, FunctionDefs, ClassDefs, Values, Expressions, Primitives, Programs, Bookkeepings, Dialogues);
module.exports.NodeVisitor = NodeVisitor;
require('./api');
