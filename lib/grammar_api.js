// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingTalk
//
// Copyright 2017 Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const Grammar = require('./grammar');
const { typeCheckProgram } = require('./typecheck');

module.exports = {
    parse(code) {
        return Grammar.parse(code);
    },
    parseAndTypecheck(code, schemaRetriever, useMeta = false) {
        let ast = Grammar.parse(code);
        return typeCheckProgram(ast, schemaRetriever, useMeta).then(() => ast);
    },

    parseType(typeStr) {
        return Grammar.parse(typeStr, { startRule: 'type_ref' })
    },

    parsePermissionRule(code) {
        return Grammar.parse(code, { startRule: 'permission_rule' });
    }
}
