// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingTalk
//
// Copyright 2016 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

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
const Units = require('./lib/units');
const NNSyntax = require('./lib/nn_syntax');
const SentenceGenerator = require('./lib/sentence-generator');

let { typeCheckFilter, typeCheckProgram, typeCheckPermissionRule } = require('./lib/typecheck');
Generate.typeCheckFilter = typeCheckFilter;
Generate.typeCheckProgram = typeCheckProgram;
Generate.typeCheckPermissionRule = typeCheckPermissionRule;

let { fromManifest, toManifest } = require('./lib/ast/api');
Ast.fromManifest = fromManifest;
Ast.toManifest = toManifest;

const Builtin = require('./lib/builtin');

module.exports = {
    version: '1.3.1',

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

    // synthetic sentence generation
    SentenceGenerator,

    // Policy support
    PermissionChecker,

    // Misc
    Units,

    // Value Types, exposed so that Thingpedia can reexpose them to device impls
    // (to create values of the appropriate types)
    Location: Builtin.Location,
    Entity: Builtin.Entity,
    Time: Builtin.Time,
    Builtin,
};
