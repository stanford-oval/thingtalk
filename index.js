// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingEngine
//
// Copyright 2016 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details

const Ast = require('./lib/ast');
const Ir = require('./lib/ir');
const Compiler = require('./lib/compiler');
const Grammar = require('./lib/grammar_api');
const ExecEnvironment = require('./lib/exec_environment');
const Type = require('./lib/type');
const SchemaRetriever = require('./lib/schema');
const Generate = require('./lib/generate');
const Describe = require('./lib/describe');
const Formatter = require('./lib/formatter');
const PermissionChecker = require('./lib/permission_checker');

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

const builtin_values = require('./lib/builtin_values');

module.exports = {
    Ast: Ast,
    Ir: Ir,
    Compiler: Compiler,
    Grammar: Grammar,
    ExecEnvironment: ExecEnvironment,
    Type: Type,
    SchemaRetriever: SchemaRetriever,
    Generate: Generate,
    Describe: Describe,
    SEMPRESyntax: SEMPRESyntax,
    Formatter: Formatter,
    PermissionChecker: PermissionChecker,

    Location: builtin_values.Location,
    Entity: builtin_values.Entity,
    Time: builtin_values.Time,
};
