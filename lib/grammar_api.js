// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingTalk
//
// Copyright 2017 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const Grammar = require('./grammar');
// Initialize the AST API
require('./ast_api');

module.exports = {
    parse(code) {
        return Grammar.parse(code);
    },
    parseAndTypecheck(code, schemaRetriever, useMeta = false) {
        let ast = Grammar.parse(code);
        return ast.typecheck(schemaRetriever, useMeta);
    },

    parseType(typeStr) {
        return Grammar.parse(typeStr, { startRule: 'type_ref' });
    },

    parsePermissionRule(code) {
        return Grammar.parse(code, { startRule: 'permission_rule' });
    }
};