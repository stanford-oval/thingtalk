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
import Node, { SourceRange } from './base';
import { FunctionDef } from './function_def';
import { DeviceSelector } from './invocation';
import { BooleanExpression } from './boolean_expression';
import {
    makeScope,
    AbstractSlot,
    OldSlot,
    ScopeMap,
    InvocationLike,
} from './slots';
import NodeVisitor from './visitor';

import { TokenStream } from '../new-syntax/tokenstream';
import List from '../utils/list';

/**
 * The base class of all function clauses in a ThingTalk
 * permission rule.
 *
 */
export abstract class PermissionFunction extends Node {
    static Specified : typeof SpecifiedPermissionFunction;
    isSpecified ! : boolean;
    static Builtin : PermissionFunction;
    isBuiltin ! : boolean;
    static ClassStar : typeof ClassStarPermissionFunction;
    isClassStar ! : boolean;
    static Star : PermissionFunction;
    isStar ! : boolean;

    abstract clone() : PermissionFunction;

    *iterateSlots(scope : ScopeMap) : Generator<OldSlot, [InvocationLike|null, ScopeMap]> {
        return [null, {}];
    }

    *iterateSlots2(scope : ScopeMap) : Generator<DeviceSelector|AbstractSlot, [InvocationLike|null, ScopeMap]> {
        return [null, {}];
    }
}
PermissionFunction.prototype.isSpecified = false;
PermissionFunction.prototype.isBuiltin = false;
PermissionFunction.prototype.isClassStar = false;
PermissionFunction.prototype.isStar = false;

/**
 * A permission function that applies only to a specific
 * Thingpedia function.
 *
 */
export class SpecifiedPermissionFunction extends PermissionFunction {
    kind : string;
    channel : string;
    filter : BooleanExpression;
    schema : FunctionDef|null;

    /**
     * Construct a new specified permission function.
     *
     * @param location - the position of this node in the source code
     * @param kind - the class that the function belongs to
     * @param channel - the name of the function
     * @param filter - a predicate on the input and output
     *        parameters of the function restricting when the permission applies
     * @param schema - type signature of the underlying Thingpedia function
     */
    constructor(location : SourceRange|null,
                kind : string,
                channel : string,
                filter : BooleanExpression,
                schema : FunctionDef|null) {
        super(location);

        assert(typeof kind === 'string');
        this.kind = kind;

        assert(typeof channel === 'string');
        this.channel = channel;

        assert(filter instanceof BooleanExpression);
        this.filter = filter;

        assert(schema === null || schema instanceof FunctionDef);
        this.schema = schema;
    }

    optimize() : this {
        this.filter = this.filter.optimize();
        return this;
    }

    toSource() : TokenStream {
        if (this.filter.isTrue)
            return List.concat('@' + this.kind, '.', this.channel);
        return List.concat('@' + this.kind, '.', this.channel, 'filter',
            this.filter.toSource());
    }

    visit(visitor : NodeVisitor) : void {
        visitor.enter(this);
        if (visitor.visitSpecifiedPermissionFunction(this))
            this.filter.visit(visitor);
        visitor.exit(this);
    }

    clone() : SpecifiedPermissionFunction {
        return new SpecifiedPermissionFunction(
            this.location,
            this.kind,
            this.channel,
            this.filter.clone(),
            this.schema ? this.schema.clone() : null
        );
    }

    *iterateSlots(scope : ScopeMap) : Generator<OldSlot, [InvocationLike, ScopeMap]> {
        yield* this.filter.iterateSlots(this.schema, this, scope);
        return [this, makeScope(this)];
    }

    *iterateSlots2(scope : ScopeMap) : Generator<DeviceSelector|AbstractSlot, [InvocationLike, ScopeMap]> {
        yield* this.filter.iterateSlots2(this.schema, this, scope);
        return [this, makeScope(this)];
    }
}
PermissionFunction.Specified = SpecifiedPermissionFunction;
PermissionFunction.Specified.prototype.isSpecified = true;

export class BuiltinPermissionFunction extends PermissionFunction {
    constructor() {
        super(null);
    }

    visit(visitor : NodeVisitor) : void {
        visitor.enter(this);
        visitor.visitBuiltinPermissionFunction(this);
        visitor.exit(this);
    }

    toSource() : TokenStream {
        return List.singleton('notify');
    }

    clone() : BuiltinPermissionFunction {
        return this;
    }
}
BuiltinPermissionFunction.prototype.isBuiltin = true;

/**
 * A permission function that applies only to the builtins `now` and
 * `notify`.
 *
 * This is a singleton, not a class.
 */
PermissionFunction.Builtin = new BuiltinPermissionFunction();

/**
 * A permission function that applies to all functions of a class,
 * unconditionally.
 *
 */
export class ClassStarPermissionFunction extends PermissionFunction {
    kind : string;

    /**
     * Construct a new class start permission function.
     *
     * @param location - the position of this node in the source code
     * @param kind - the class to apply the permission to
     */
    constructor(location : SourceRange|null, kind : string) {
        super(location);

        assert(typeof kind === 'string');
        this.kind = kind;
    }

    toSource() : TokenStream {
        return List.concat('@' + this.kind, '.', '*');
    }

    visit(visitor : NodeVisitor) : void {
        visitor.enter(this);
        visitor.visitClassStarPermissionFunction(this);
        visitor.exit(this);
    }

    clone() : ClassStarPermissionFunction {
        return new ClassStarPermissionFunction(this.location, this.kind);
    }
}
PermissionFunction.ClassStar = ClassStarPermissionFunction;
PermissionFunction.ClassStar.prototype.isClassStar = true;

export class StarPermissionFunction extends PermissionFunction {
    constructor() {
        super(null);
    }

    visit(visitor : NodeVisitor) : void {
        visitor.enter(this);
        visitor.visitStarPermissionFunction(this);
        visitor.exit(this);
    }

    toSource() : TokenStream {
        return List.singleton('*');
    }

    clone() : StarPermissionFunction {
        return this;
    }
}
StarPermissionFunction.prototype.isStar = true;

/**
 * The universal permission function, that applies to all functions
 * of all classes, unconditionally.
 *
 * This is a singleton, not a class.
 */
PermissionFunction.Star = new StarPermissionFunction();
