// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingTalk
//
// Copyright 2019-2020 The Board of Trustees of the Leland Stanford Junior University
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
// Author: Silei Xu <silei@cs.stanford.edu>

import assert from 'assert';
import NodeVisitor from './visitor';

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
export default class Node {
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

    /**
     * Iterate all primitives (Thingpedia function invocations) in the subtree of this
     * AST node (including the node itself).
     *
     * This method is implemented using {@link Ast.NodeVisitor}. It is recommended to use
     * {@link Ast.NodeVisitor} directly to traverse ASTs instead of this or similar methods.
     *
     * @param {boolean} includeVarRef - whether to include local function calls (VarRef nodes)
     *                                  in the iteration
     * @return {Ast.Invocation[]}
     * @deprecated Use {@link Ast.NodeVisitor}.
     */
    iteratePrimitives(includeVarRef) {
        // we cannot yield from inside the visitor, so we buffer everything
        const buffer = [];
        const visitor = new class extends NodeVisitor {
            visitVarRefAction(node) {
                if (includeVarRef)
                    buffer.push(['action', node]);
                return true;
            }
            visitInvocationAction(node) {
                buffer.push(['action', node.invocation]);
                return true;
            }
            visitVarRefTable(node) {
                if (includeVarRef)
                    buffer.push(['query', node]);
                return true;
            }
            visitInvocationTable(node) {
                buffer.push(['query', node.invocation]);
                return true;
            }
            visitVarRefStream(node) {
                if (includeVarRef)
                    buffer.push(['stream', node]);
                return true;
            }
            visitExternalBooleanExpression(node) {
                buffer.push(['filter', node]);
                return true;
            }

            visitDeclaration(node) {
                // if the declaration refers to a nested scope, we don't recurse into it
                if (node.type === 'program' || node.type === 'procedure')
                    return false;
                return true;
            }
        };

        this.visit(visitor);
        return buffer;
    }
}
