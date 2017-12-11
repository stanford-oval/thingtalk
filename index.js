// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingEngine
//
// Copyright 2016 Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const Ast = require('./lib/ast');
const Compiler = require('./lib/compiler');
const Grammar = require('./lib/grammar_api');
const ExecEnvironment = require('./lib/exec_environment');
const Type = require('./lib/type');
const SchemaRetriever = require('./lib/schema');
const Generate = require('./lib/generate');
const Describe = require('./lib/describe');
const Formatter = require('./lib/formatter');
const PermissionChecker = require('./lib/permission_checker');
const NNSyntax = require('./lib/nn_syntax');

let { genRandomRules, genRandomPermissionRule } = require('./lib/gen_random_rule');
Generate.genRandomRules = genRandomRules;
Generate.genRandomValue = require('./lib/gen_random_value');
let { optimizeFilter, optimizeProgram } = require('./lib/optimize');
Generate.optimizeFilter = optimizeFilter;
Generate.optimizeProgram = optimizeProgram;
let { typeCheckProgram, typeCheckPermissionRule } = require('./lib/typecheck');
Generate.typeCheckProgram = typeCheckProgram;
Generate.typeCheckPermissionRule = typeCheckPermissionRule;
const SEMPRESyntax = require('./lib/sempre_syntax');

const builtin = require('./lib/builtin');

module.exports = {
    Ast: Ast,
    Compiler: Compiler,
    Grammar: Grammar,
    ExecEnvironment: ExecEnvironment,
    Type: Type,
    SchemaRetriever: SchemaRetriever,
    Generate: Generate,
    Describe: Describe,
    SEMPRESyntax: SEMPRESyntax,
    NNSyntax: NNSyntax,
    Formatter: Formatter,
    PermissionChecker: PermissionChecker,

    Location: builtin.Location,
    Entity: builtin.Entity,
    Time: builtin.Time,
    Builtin: builtin,
};
