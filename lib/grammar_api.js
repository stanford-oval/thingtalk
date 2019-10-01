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
require('./ast/api');

/**
 * APIs to parse surface-syntax ThingTalk code.
 *
 * @namespace
 * @alias Grammar
 */
module.exports = {
    /**
     * Parse a string into a ThingTalk {@link module:Ast}
     *
     * @param {string} code - the ThingTalk code to parse
     * @return {module:Ast.Input} the parsed program, library or permission rule
     */
    parse(code) {
        return Grammar.parse(code);
    },

    /**
     * Parse a string into a ThingTalk {@link module:Ast} and typecheck it
     *
     * This is a convenience method that combines {@link Grammar.parse} and
     * {@link module:Ast.Input#typecheck}.
     *
     * @param {string} code - the ThingTalk code to parse
     * @param {SchemaRetriever} schemaRetriever - the delegate object to retrieve type information
     * @param {boolean} useMeta - attach metadata to the typechecked AST
     * @return {module:Ast.Input} the parsed program, library or permission rule
     * @async
     */
    parseAndTypecheck(code, schemaRetriever, useMeta = false) {
        let ast = Grammar.parse(code);
        return ast.typecheck(schemaRetriever, useMeta);
    },

    /**
     * Parse a type string into a {@link Type} object.
     *
     * @param {string} typeStr - the ThingTalk type reference to parse
     * @return {Type} the type object
     */
    parseType(typeStr) {
        return Grammar.parse(typeStr, { startRule: 'type_ref' });
    },

    /**
     * Parse a string into a ThingTalk permission rule
     *
     * @param {string} code - the ThingTalk code to parse
     * @return {module:Ast.PermissionRule} the parsed permission rule
     * @deprecated use {@link Grammar.parse}
     */
    parsePermissionRule(code) {
        return Grammar.parse(code, { startRule: 'permission_rule' });
    }
};
