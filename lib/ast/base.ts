// -*- mode: typescript; indent-tabs-mode: nil; js-basic-offset: 4 -*-
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

import type {
    Invocation,
    ExternalBooleanExpression
} from './expression';
import type { Value } from './values';
import type { FunctionDeclaration } from './program';
import type {
    InvocationAction,
    VarRefAction,
    InvocationTable,
    VarRefTable,
    VarRefStream
} from './primitive';
import type {
    FunctionCallExpression
} from './expression2';
import {
    SourceRange,
    SourceLocation
} from '../utils/source_locations';

import { TokenStream } from '../new-syntax/tokenstream';
import { prettyprint } from '../new-syntax/pretty';

// reexport those types for the benefit of ThingTalk API consumers
export {
    SourceRange,
    SourceLocation
};

export type NLAnnotationMap = { [key : string] : any };
export type AnnotationMap = { [key : string] : Value };

export interface AnnotationSpec {
    nl ?: NLAnnotationMap;
    impl ?: AnnotationMap;
}

export type Primitive = Invocation |
    VarRefTable |
    VarRefAction |
    VarRefStream |
    FunctionCallExpression |
    ExternalBooleanExpression;

/**
 * Base class of AST nodes.
 *
 * @class
 * @alias Ast~Node
 * @abstract
 */
export default abstract class Node {
    location : SourceRange|null;

    /**
     * Construct a new AST node.
     *
     * @param location - the position of this node in the source code
     */
    constructor(location : SourceRange|null = null) {
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

    /**
     * Traverse the current subtree using the visitor pattern.
     * See {@link Ast.NodeVisitor} for details and example usage.
     *
     * @param {Ast.NodeVisitor} visitor - the visitor to use.
     */
    abstract visit(visitor : NodeVisitor) : void;

    abstract clone() : Node;

    /**
     * Optimize this AST node.
     *
     * Optimization removes redundant operations and converts ThingTalk to canonical form.
     *
     * @returns {Ast~Node} the optimized node
     */
    optimize() : Node|null {
        return this;
    }

    /* istanbul ignore next */
    /**
     * Convert this AST node to a sequence of tokens.
     */
    toSource() : TokenStream {
        // this method should be abstract but that would break everything
        throw new Error('not implemented');
    }

    // TODO: rename to prettyprint() when the new syntax becomes the default
    /**
     * Convert this AST node to a normalized surface form in ThingTalk.
     */
    prettyprint2() {
        return prettyprint(this.toSource());
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
     * @deprecated Use {@link Ast.NodeVisitor}.
     */
    iteratePrimitives(includeVarRef : false) : Array<[('action'|'query'|'stream'|'filter'), Invocation|ExternalBooleanExpression]>;
    iteratePrimitives(includeVarRef : boolean) : Array<[('action'|'query'|'stream'|'filter'), Primitive]>;
    iteratePrimitives(includeVarRef : boolean) : Array<[('action'|'query'|'stream'|'filter'), Primitive]> {
        // we cannot yield from inside the visitor, so we buffer everything
        const buffer : Array<[('action'|'query'|'stream'|'filter'), Primitive]> = [];
        const visitor = new class extends NodeVisitor {
            visitVarRefAction(node : VarRefAction) {
                if (includeVarRef)
                    buffer.push(['action', node]);
                return true;
            }
            visitInvocationAction(node : InvocationAction) {
                buffer.push(['action', node.invocation]);
                return true;
            }
            visitVarRefTable(node : VarRefTable) {
                if (includeVarRef)
                    buffer.push(['query', node]);
                return true;
            }
            visitInvocationTable(node : InvocationTable) {
                buffer.push(['query', node.invocation]);
                return true;
            }
            visitVarRefStream(node : VarRefStream) {
                if (includeVarRef)
                    buffer.push(['stream', node]);
                return true;
            }
            visitExternalBooleanExpression(node : ExternalBooleanExpression) {
                buffer.push(['filter', node]);
                return true;
            }

            visitFunctionDeclaration(node : FunctionDeclaration) {
                // we don't recurse into nested procedures
                return false;
            }
        };

        this.visit(visitor);
        return buffer;
    }
}
