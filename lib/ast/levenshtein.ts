// -*- mode: typescript; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingTalk
//
// Copyright 2022 The Board of Trustees of the Leland Stanford Junior University
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

import Node, { SourceRange } from './base';
import { DeviceSelector } from './invocation';
import { BooleanExpression } from './boolean_expression';
import { InvocationExpression } from './expression';
import {
    AbstractSlot,
    OldSlot,
    ScopeMap,
    InvocationLike,
} from './slots';

import { TokenStream } from '../new-syntax/tokenstream';
import List from '../utils/list';
import { SyntaxPriority } from './syntax_priority';
import NodeVisitor from './visitor';

export abstract class LevenshteinExpression extends Node {
    table : InvocationExpression;

    constructor(location : SourceRange|null, table : InvocationExpression) {
        super(location);
        this.table = table;
    }

    static AddFilter : any;

    // syntactic priority of this expression (to emit the right parenthesis)
    abstract get priority() : SyntaxPriority;

    abstract clone() : LevenshteinExpression;
    abstract toSource() : TokenStream;
    abstract equals(other : LevenshteinExpression) : boolean;

    optimize() : LevenshteinExpression {
        return this;
    }

    /**
     * Iterate all slots (scalar value nodes) in this expression.
     *
     * @param scope - available names for parameter passing
     * @deprecated Use {@link Ast.Table.iterateSlots2} instead.
     */
    abstract iterateSlots(scope : ScopeMap) : Generator<OldSlot, [InvocationLike|null, ScopeMap]>;

    /**
     * Iterate all slots (scalar value nodes) in this expression.
     *
     * @param scope - available names for parameter passing
     */
    abstract iterateSlots2(scope : ScopeMap) : Generator<DeviceSelector|AbstractSlot, [InvocationLike|null, ScopeMap]>;
}

export class AddFilterLevenshteinExpression extends LevenshteinExpression {
    filter : BooleanExpression;

    constructor(location : SourceRange|null, table : InvocationExpression, filter : BooleanExpression) {
        super(location, table);
        this.filter = filter;
    }

    get priority() : SyntaxPriority {
        return SyntaxPriority.Add;
    }

    toSource() : TokenStream {
        return List.concat(
            '$add_filter', 
            this.table.invocation.selector.toSource(), '.', this.table.invocation.channel,
            ':', 
            this.filter.toSource()
        );
    }

    clone() {
        return new AddFilterLevenshteinExpression(this.location, this.table.clone(), this.filter.clone());
    }

    equals(other : LevenshteinExpression) : boolean {
        return other instanceof AddFilterLevenshteinExpression && 
            this.table.equals(other.table) &&
            this.filter.equals(other.filter);
    }

    visit(visitor : NodeVisitor) : void {
        visitor.enter(this);
        if (visitor.visitLevenshteinExpression(this)) {
            this.table.visit(visitor);
            this.filter.visit(visitor);
        }
        visitor.exit(this);
    }

    *iterateSlots(scope : ScopeMap) : Generator<OldSlot, [InvocationLike|null, ScopeMap]> {
        const [prim, newScope] = yield* this.table.iterateSlots(scope);
        yield* this.filter.iterateSlots(this.table.schema, prim, newScope);
        return [prim, newScope];
    }

    *iterateSlots2(scope : ScopeMap) : Generator<DeviceSelector|AbstractSlot, [InvocationLike|null, ScopeMap]> {
        const [prim, newScope] = yield* this.table.iterateSlots2(scope);
        yield* this.filter.iterateSlots2(this.table.schema, prim, newScope);
        return [prim, newScope];
    }
}
LevenshteinExpression.AddFilter = AddFilterLevenshteinExpression;