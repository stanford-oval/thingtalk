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

import type { Invocation } from './invocation';
import type { ExternalBooleanExpression } from './boolean_expression';
import type { Value } from './values';
import type {
    InvocationAction,
    VarRefAction,
    InvocationTable,
    VarRefTable,
    VarRefStream
} from './legacy';
import type {
    InvocationExpression,
    FunctionCallExpression
} from './expression';
import {
    SourceRange,
    SourceLocation
} from '../utils/source_locations';

import { TokenStream, ConstantToken } from '../new-syntax/tokenstream';
import {
    SyntaxType,
    serialize,
} from '../syntax_api';
import List from '../utils/list';

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

export function implAnnotationsToSource(map : AnnotationMap, prefix = '\n') : TokenStream {
    let syntax : TokenStream = List.Nil;
    for (const key in map) {
        syntax = List.concat(syntax,
            prefix, '#[', key, '=', map[key].toSource(), ']');
    }
    return syntax;
}

export function toJSON(value : unknown) : TokenStream {
    if (Array.isArray(value)) {
        return List.concat('[', List.join(value.map(toJSON), ','), ']');
    } else if (typeof value === 'object' && value !== null) {
        let list : TokenStream = List.singleton('{');
        let first = true;
        const object = value as { [key : string] : unknown };
        for (const key in object) {
            const inner = object[key];
            if (first) {
                list = List.concat(list, '\n', '\t+');
                first = false;
            } else {
                list = List.concat(list, ',', '\n');
            }
            list = List.concat(list, key, '=', toJSON(inner));
        }
        if (first)
            list = List.concat(list, '}');
        else
            list = List.concat(list, '\n', '\t-', '}');
        return list;
    } else if (typeof value === 'string') {
        return List.singleton(new ConstantToken('QUOTED_STRING', value));
    } else {
        return List.singleton(String(value));
    }
}

export function nlAnnotationsToSource(map : NLAnnotationMap, prefix = '\n') : TokenStream {
    let syntax : TokenStream = List.Nil;
    for (const key of Object.keys(map)) {
        syntax = List.concat(syntax,
            prefix, '#_[', key, '=', toJSON(map[key]), ']');
    }
    return syntax;
}

/**
 * Base class of AST nodes.
 *
 */
export default abstract class Node {
    /**
     * The location of this node in the source code, or `null` if the
     * node is not associated with any source.
     *
     */
    location : SourceRange|null;

    /**
     * Construct a new AST node.
     *
     * @param location - the position of this node in the source code
     */
    constructor(location : SourceRange|null = null) {
        assert(location === null ||
            (typeof location.start === 'object' && typeof location.end === 'object'));
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
    optimize() : Node {
        return this;
    }

    /* istanbul ignore next */
    /**
     * Convert this AST node to a sequence of tokens.
     */
    abstract toSource() : TokenStream;

    /**
     * Convert this AST node to a normalized surface form in ThingTalk.
     */
    prettyprint() : string {
        return serialize(this, SyntaxType.Normal);
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
    iteratePrimitives(includeVarRef : false) : Array<[('action'|'query'|'stream'|'filter'|'expression'), Invocation|ExternalBooleanExpression]>;
    iteratePrimitives(includeVarRef : boolean) : Array<[('action'|'query'|'stream'|'filter'|'expression'), Primitive]>;
    iteratePrimitives(includeVarRef : boolean) : Array<[('action'|'query'|'stream'|'filter'|'expression'), Primitive]> {
        // we cannot yield from inside the visitor, so we buffer everything
        const buffer : Array<[('action'|'query'|'stream'|'filter'|'expression'), Primitive]> = [];
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
            visitFunctionCallExpression(node : FunctionCallExpression) {
                if (!includeVarRef)
                    return true;
                if (node.schema)
                    buffer.push([node.schema.functionType, node]);
                else
                    buffer.push(['expression', node]);
                return true;
            }
            visitInvocationExpression(node : InvocationExpression) {
                if (node.schema)
                    buffer.push([node.schema.functionType, node.invocation]);
                else
                    buffer.push(['expression', node.invocation]);
                return true;
            }
            visitExternalBooleanExpression(node : ExternalBooleanExpression) {
                buffer.push(['filter', node]);
                return true;
            }
        };

        this.visit(visitor);
        return buffer;
    }
}
