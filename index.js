// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingTalk
//
// Copyright 2016-2020 The Board of Trustees of the Leland Stanford Junior University
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

const Units = require('thingtalk-units');

const Ast = require('./lib/ast');
const Compiler = require('./lib/compiler');
const Grammar = require('./lib/grammar_api');
const ExecEnvironment = require('./lib/runtime/exec_environment');
const Type = require('./lib/type');
const SchemaRetriever = require('./lib/schema');
const Generate = require('./lib/generate');
const Describe = require('./lib/describe');
const Formatter = require('./lib/runtime/formatter');
const PermissionChecker = require('./lib/permission_checker');
const NNSyntax = require('./lib/nn-syntax');
const Helper = require('./lib/helper');
const I18n = require('./lib/i18n');


let { typeCheckFilter, typeCheckProgram, typeCheckPermissionRule } = require('./lib/typecheck');
Generate.typeCheckFilter = typeCheckFilter;
Generate.typeCheckProgram = typeCheckProgram;
Generate.typeCheckPermissionRule = typeCheckPermissionRule;

let { fromManifest, toManifest } = require('./lib/ast/api');
Ast.fromManifest = fromManifest;
Ast.toManifest = toManifest;

const Builtin = require('./lib/builtin');

/**
 * Version information
 *
 * @type {string}
 * @alias version
 */
const version = '1.11.0-beta.1';

module.exports = {
    version,

    // AST definitions
    Ast,
    Type,

    // Syntax support
    Grammar,
    NNSyntax,

    // Compiler and runtime
    Compiler,
    ExecEnvironment,
    Formatter,
    SchemaRetriever,

    // Helper modules to manipulate ASTs
    Generate,
    Describe,

    // Policy support
    PermissionChecker,

    // Helper
    Helper,

    // Misc
    Units,
    I18n,

    // Value Types, exposed so that Thingpedia can reexpose them to device impls
    // (to create values of the appropriate types)
    Location: Builtin.Location,
    Entity: Builtin.Entity,
    Time: Builtin.Time,
    Builtin,
};
