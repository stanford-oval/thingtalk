// -*- mode: typescript; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingTalk
//
// Copyright 2018-2020 The Board of Trustees of the Leland Stanford Junior University
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
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
//         Silei Xu <silei@cs.stanford.edu>

import assert from 'assert';

import {
    SourceRange,
    AnnotationSpec,
    NLAnnotationMap,
    AnnotationMap
} from './base';
import NodeVisitor from './visitor';
import { DeviceSelector } from './expression';
import {
    Expression,
    ChainExpression
} from './expression2';
import {
    ClassDef
} from './class_def';
import {
    Input,
    Statement,
    Assignment,
    Declaration
} from './program';
import {
    AbstractSlot,
    OldSlot
} from './slots';
import SchemaRetriever from '../schema';
import TypeChecker from '../typecheck';

import { TokenStream } from '../new-syntax/tokenstream';
import List from '../utils/list';

/**
 * A statement that evaluates an expression and presents the results
 * to the user.
 */
export class ExpressionStatement extends Statement {
    expression : ChainExpression;

    constructor(location : SourceRange|null,
                expression : Expression) {
        super(location);

        if (!(expression instanceof ChainExpression))
            this.expression = new ChainExpression(location, [expression], expression.schema);
        else
            this.expression = expression;

        assert(this.expression.expressions.length > 0);
    }

    get first() : Expression {
        return this.expression.expressions[0];
    }

    get last() : Expression {
        return this.expression.expressions[this.expression.expressions.length-1];
    }

    get stream() : Expression|null {
        const first = this.first;
        if (first.schema!.functionType === 'stream')
            return first;
        else
            return null;
    }

    get lastTable() : Expression|null {
        const expressions = this.expression.expressions;
        if (expressions.length === 1) {
            const single = expressions[0];
            if (single.schema!.functionType === 'action')
                return null;
            return single;
        } else {
            return expressions[expressions.length-2];
        }
    }

    toSource() : TokenStream {
        return List.concat(this.expression.toSource(), ';');
    }

    visit(visitor : NodeVisitor) : void {
        visitor.enter(this);
        if (visitor.visitExpressionStatement(this))
            this.expression.visit(visitor);
        visitor.exit(this);
    }

    *iterateSlots() : Generator<OldSlot, void> {
        yield* this.expression.iterateSlots({});
    }
    *iterateSlots2() : Generator<DeviceSelector|AbstractSlot, void> {
        yield* this.expression.iterateSlots2({});
    }

    clone() : ExpressionStatement {
        return new ExpressionStatement(this.location, this.expression.clone());
    }
}
Statement.Expression = ExpressionStatement;
ExpressionStatement.prototype.isExpression = true;

export type ExecutableStatement2 = Assignment | ExpressionStatement;

/**
 * An executable ThingTalk program (containing at least one executable
 * statement).
 */
export class Program2 extends Input {
    classes : ClassDef[];
    declarations : Declaration[];
    statements : ExecutableStatement2[];
    nl_annotations : NLAnnotationMap;
    impl_annotations : AnnotationMap;

    /**
     * Construct a new ThingTalk program.
     *
     * @param location - the position of this node in the source code
     * @param classes - locally defined classes
     * @param declarations - declaration statements
     * @param rules - executable statements (rules and commands)
     */
    constructor(location : SourceRange|null,
                classes : ClassDef[],
                declarations : Declaration[],
                statements : ExecutableStatement2[],
                { nl, impl } : AnnotationSpec = {}) {
        super(location);
        assert(Array.isArray(classes));
        this.classes = classes;
        assert(Array.isArray(declarations));
        this.declarations = declarations;
        assert(Array.isArray(statements));
        this.statements = statements;

        this.nl_annotations = nl || {};
        this.impl_annotations = impl || {};
    }

    toSource() : TokenStream {
        // TODO: deal with annotations

        let input : TokenStream = List.Nil;
        for (const classdef of this.classes)
            input = List.concat(input, classdef.toSource());
        for (const decl of this.declarations)
            input = List.concat(input, decl.toSource());
        for (const stmt of this.statements)
            input = List.concat(input, stmt.toSource());
        return input;
    }

    visit(visitor : NodeVisitor) : void {
        visitor.enter(this);
        if (visitor.visitProgram2(this)) {
            for (const classdef of this.classes)
                classdef.visit(visitor);
            for (const decl of this.declarations)
                decl.visit(visitor);
            for (const rule of this.statements)
                rule.visit(visitor);
        }
        visitor.exit(this);
    }

    *iterateSlots() : Generator<OldSlot, void> {
        for (const decl of this.declarations)
            yield* decl.iterateSlots();
        for (const rule of this.statements)
            yield* rule.iterateSlots();
    }
    *iterateSlots2() : Generator<DeviceSelector|AbstractSlot, void> {
        for (const decl of this.declarations)
            yield* decl.iterateSlots2();
        for (const rule of this.statements)
            yield* rule.iterateSlots2();
    }

    clone() : Program2 {
        // clone annotations
        const nl : NLAnnotationMap = {};
        Object.assign(nl, this.nl_annotations);
        const impl : AnnotationMap = {};
        Object.assign(impl, this.impl_annotations);
        const annotations = { nl, impl };

        return new Program2(
            this.location,
            this.classes.map((c) => c.clone()),
            this.declarations.map((d) => d.clone()),
            this.statements.map((s) => s.clone(),
            annotations)
        );
    }

    optimize() : Program2 {
        return this; // TODO
    }

    async typecheck(schemas : SchemaRetriever, getMeta = false) : Promise<this> {
        const typeChecker = new TypeChecker(schemas, getMeta);
        await typeChecker.typeCheckProgram2(this);
        return this;
    }
}
Program2.prototype.isProgram2 = true;
Input.Program2 = Program2;
