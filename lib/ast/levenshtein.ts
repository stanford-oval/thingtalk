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

import { SourceRange } from './base';
import { DeviceSelector, InputParam } from './invocation';
import { ChainExpression, Expression } from './expression';
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
import { FunctionDef } from './function_def';
import * as legacy from './legacy';
import { UnserializableError } from '../utils/errors';

export class LevenshteinExpression extends Expression {
    expressions : ChainExpression;
    op : string;

    constructor(location : SourceRange|null, 
                expression : ChainExpression, 
                op : string, 
                schema : FunctionDef|null) {
        super(location, schema);
        this.op = op;
        this.expressions = expression;
    }

    get priority() : SyntaxPriority {
        return SyntaxPriority.Add;
    }

    toSource() : TokenStream {
        return List.concat(
            '$edit', 
            this.op,
            this.expressions.toSource(),
        );
    }

    toLegacy(into_params : InputParam[] = [], scope_params : string[] = []) : legacy.Table {
        throw new UnserializableError('Levenshtein expression');
    }

    clone() : LevenshteinExpression {
        return new LevenshteinExpression(
            this.location, 
            this.expressions.clone(), 
            this.op, 
            this.schema ? this.schema.clone() : null
        );
    }

    equals(other : LevenshteinExpression) : boolean {
        return other instanceof LevenshteinExpression && 
            this.expressions.equals(other.expressions) &&
            (this.op === other.op);
    }

    visit(visitor : NodeVisitor) : void {
        visitor.enter(this);
        if (visitor.visitLevenshteinExpression(this))
            this.expressions.visit(visitor);
        visitor.exit(this);
    }

    *iterateSlots(scope : ScopeMap) : Generator<OldSlot, [InvocationLike|null, ScopeMap]> {
        return yield* this.expressions.iterateSlots(scope);
    }

    *iterateSlots2(scope : ScopeMap) : Generator<DeviceSelector|AbstractSlot, [InvocationLike|null, ScopeMap]> {
        const [prim, newScope] = yield* this.expressions.iterateSlots2(scope);
        return [prim, newScope];
    }
}