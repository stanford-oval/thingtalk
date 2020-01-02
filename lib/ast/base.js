// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingTalk
//
// Copyright 2019 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Silei Xu <silei@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const assert = require('assert');

/**
 * A single point in the source code input stream.
 *
 * @typedef {Object} Ast~SourceLocation
 * @property {number|undefined} offset - the character position in the stream (0-based)
 * @property {number|undefined} line - the line number (1-based)
 * @property {number|undefined} column - the column number (1-based)
 * @property {number|undefined} token - the token index (0-based)
 */

/**
 * The interval in the source code covered by a single
 * token or source code span.
 *
 * @typedef {Object} Ast~SourceRange
 * @property {Ast~SourceLocation} start - the beginning of the range
 *           (index of the first character)
 * @property {Ast~SourceLocation} end - the end of the range, immediately
 *           after the end of the range
 */

/**
 * Base class of AST nodes.
 *
 * @class
 * @alias Ast~Node
 * @abstract
 */
module.exports = class Node {
    /**
     * Construct a new AST node.
     *
     * @param {Ast~SourceRange|null} location - the position of this node
     *        in the source code
     */
    constructor(location = null) {
        assert(location === null ||
            (typeof location.start === 'object' && typeof location.end === 'object'));

        /**
         * The location of this node in the source code, or `null` if the
         * node is not associated with any source.
         *
         * @type {Ast~SourceRange|null}
         * @readonly
         */
        this.location = location;
    }

    /* istanbul ignore next */
    /**
     * Traverse the current subtree using the visitor pattern.
     * See {@link Ast.NodeVisitor} for details and example usage.
     *
     * @param {Ast.NodeVisitor} visitor - the visitor to use.
     * @abstract
     */
    visit(visitor) {
        throw new Error('Must be overridden');
    }

    /* istanbul ignore next */
    clone() {
        throw new Error('Must be overridden');
    }

    /* istanbul ignore next */
    /**
     * Optimize this AST node.
     *
     * Optimization removes redundant operations and converts ThingTalk to canonical form.
     *
     * @returns {Ast~Node} the optimized node
     */
    optimize() {
        return this;
    }
};
