// -*- mode: typescript; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingTalk
//
// Copyright 2020 The Board of Trustees of the Leland Stanford Junior University
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

import assert from 'assert';

import AstNode, { SourceRange } from './base';
import { Input, ExpressionStatement } from './program';
import * as Optimizer from '../optimize';
import TypeChecker from '../typecheck';
import { DeviceSelector, Invocation } from './expression';
import { Value, NumberValue, EnumValue, BooleanValue } from './values';
import { FunctionDef } from './function_def';
import NodeVisitor from './visitor';
import {
    OldSlot,
    AbstractSlot,
    ResultSlot,
    recursiveYieldArraySlots
} from './slots';
import type SchemaRetriever from '../schema';

import { TokenStream } from '../new-syntax/tokenstream';
import List from '../utils/list';

type ResultMap = { [key : string] : Value };
type RawResultMap = { [key : string] : unknown };

export class DialogueHistoryResultItem extends AstNode {
    value : ResultMap;
    raw : RawResultMap|null;

    constructor(location : SourceRange|null,
                value : ResultMap,
                raw : RawResultMap|null = null) {
        super(location);

        assert(typeof value === 'object');
        this.value = value;

        assert(raw === null || typeof raw === 'object');
        this.raw = raw;
    }

    toSource() : TokenStream {
        return new Value.Object(this.value).toSource();
    }

    clone() : DialogueHistoryResultItem {
        const newValue : ResultMap = {};
        Object.assign(newValue, this.value);
        return new DialogueHistoryResultItem(this.location, newValue, this.raw);
    }

    visit(visitor : NodeVisitor) : void {
        visitor.enter(this);
        if (visitor.visitDialogueHistoryResultItem(this)) {
            for (const key in this.value)
                this.value[key].visit(visitor);
        }
        visitor.exit(this);
    }

    *iterateSlots2(schema : FunctionDef|null) : Generator<DeviceSelector|AbstractSlot, void> {
        for (const key in this.value) {
            const arg = (schema ? schema.getArgument(key) : null) || null;
            yield* recursiveYieldArraySlots(new ResultSlot(null, {}, arg, this.value, key));
        }
    }

    equals(other : DialogueHistoryResultItem) : boolean {
        const keys = Object.keys(this.value).sort();
        const otherkeys = Object.keys(other.value).sort();
        if (keys.length !== otherkeys.length)
            return false;
        for (let i = 0; i < keys.length; i++) {
            if (keys[i] !== otherkeys[i])
                return false;
            if (!this.value[keys[i]].equals(other.value[otherkeys[i]]))
                return false;
        }
        return true;
    }
}

function setEquals<T>(set1 : Set<T>, set2 : Set<T>) : boolean {
    if (set1.size !== set2.size)
        return false;
    for (const el of set1) {
        if (!set2.has(el))
            return false;
    }
    return true;
}

/**
 * A wrapper for results that contains the current page of results to present, the
 * total number of results and whether there are more results that have not been
 * fetched.
 *
 */
export class DialogueHistoryResultList extends AstNode {
    results : DialogueHistoryResultItem[];
    count : Value;
    more : boolean;
    error : Value|null;

    constructor(location : SourceRange|null,
                results : DialogueHistoryResultItem[],
                count : Value,
                more = false,
                error : Value|null = null) {
        super(location);
        assert(Array.isArray(results));
        assert(count instanceof Value);
        // either count is not a number (it's a __const_ token) or it's at least as many as the results we see
        assert(!(count instanceof NumberValue) || count.value >= results.length);
        // at least one results is always presented, unless there are truly no results
        assert(results.length > 0 || (count instanceof NumberValue && count.value === 0));
        assert(typeof more === 'boolean');

        this.results = results;
        this.count = count;
        this.more = more;
        this.error = error;
    }

    toSource() : TokenStream {
        let list : TokenStream;
        if (this.results.length === 0) {
            list = List.concat('#[', 'results', '=', '[', ']', ']');
        } else {
            list = List.concat('#[', 'results', '=', '[', '\n', '\t+');
            let first = true;
            for (const result of this.results) {
                if (first)
                    first = false;
                else
                    list = List.concat(list, ',', '\n');
                list = List.concat(list, result.toSource());
            }
            list = List.concat(list, '\n', '\t-', ']', ']');
        }
        if (!(this.count instanceof Value.Number && this.count.value <= this.results.length))
            list = List.concat(list, '\n', '#[', 'count', '=', this.count.toSource(), ']');
        if (this.more)
            list = List.concat(list, '\n', '#[', 'more', '=', 'true', ']');
        if (this.error)
            list = List.concat(list, '\n', '#[', 'error', '=', this.error.toSource(), ']');
        return list;
    }

    clone() : DialogueHistoryResultList {
        return new DialogueHistoryResultList(this.location, this.results.map((r) => r.clone()), this.count.clone(), this.more, this.error);
    }

    visit(visitor : NodeVisitor) : void {
        visitor.enter(this);
        if (visitor.visitDialogueHistoryResultList(this)) {
            for (const result of this.results)
                result.visit(visitor);
            if (this.error)
                this.error.visit(visitor);
        }
        visitor.exit(this);
    }

    *iterateSlots2(schema : FunctionDef|null) : Generator<DeviceSelector|AbstractSlot, void> {
        for (const result of this.results)
            yield* result.iterateSlots2(schema);
    }

    equals(other : DialogueHistoryResultList) : boolean {
        if (this === other)
            return true;
        if (this.more !== other.more || !this.count.equals(other.count))
            return false;
        if (this.error !== other.error) {
            if (!this.error || !other.error)
                return false;
            if (!this.error.equals(other.error))
                return false;
        }

        if (this.results.length !== other.results.length)
            return false;
        for (let i = 0; i < this.results.length; i++) {
            if (!this.results[i].equals(other.results[i]))
                return false;
        }
        return true;
    }
}

export type ConfirmationState = 'proposed' | 'accepted' | 'confirmed';

/**
 * A single item in the dialogue state. Consists of a program and optionally
 * the results from that program.
 *
 */
export class DialogueHistoryItem extends AstNode {
    stmt : ExpressionStatement;
    results : DialogueHistoryResultList|null;
    confirm : ConfirmationState;

    constructor(location : SourceRange|null,
                stmt : ExpressionStatement,
                results : DialogueHistoryResultList|null,
                confirm : string|boolean) {
        super(location);
        assert(stmt instanceof ExpressionStatement);
        assert(results === null || results instanceof DialogueHistoryResultList);
        if (typeof confirm === 'boolean')
            confirm = confirm ? 'confirmed' : 'accepted';
        assert(confirm === 'proposed' || confirm === 'accepted' || confirm === 'confirmed');
        assert(confirm === 'confirmed' || results === null);

        this.stmt = stmt;
        this.results = results;
        this.confirm = confirm;
    }

    toSource() : TokenStream {
        // note: we punch through to stmt.expression because stmt.toSource() will
        // add the semicolon, which we don't want
        if (this.results !== null)
            return List.concat(this.stmt.expression.toSource(), '\n', this.results.toSource(), ';');
        else if (this.confirm !== 'accepted')
            return List.concat(this.stmt.expression.toSource(), '\n', '#[', 'confirm', '=', new Value.Enum(this.confirm).toSource(), ']', ';');
        else
            return List.concat(this.stmt.expression.toSource(), ';');
    }

    private _getFunctions() {
        const functions = new Set;
        const visitor = new class extends NodeVisitor {
            visitInvocation(invocation : Invocation) {
                functions.add(`call:${invocation.selector.kind}:${invocation.channel}`);
                return false;
            }
        };
        this.stmt.visit(visitor);
        return functions;
    }

    compatible(other : DialogueHistoryItem) : boolean {
        return setEquals(this._getFunctions(), other._getFunctions());
    }

    isExecutable() : boolean {
        let hasUndefined = false;
        const visitor = new class extends NodeVisitor {
            visitInvocation(invocation : Invocation) {
                const schema = invocation.schema;
                assert(schema instanceof FunctionDef);

                const params = new Map<string, Value>();
                for (const in_param of invocation.in_params)
                    params.set(in_param.name, in_param.value);

                const requireEither = schema.getImplementationAnnotation<string[][]>('require_either');
                if (requireEither) {
                    for (const requirement of requireEither) {
                        let satisfied = false;
                        for (const option of requirement) {
                            if (params.has(option)) {
                                satisfied = true;
                                break;
                            }
                        }
                        if (!satisfied)
                            hasUndefined = true;
                    }
                }

                for (const arg of schema.iterateArguments()) {
                    const requiredIf = arg.getImplementationAnnotation<string[]>('required_if');
                    if (requiredIf && !params.has(arg.name)) {
                        let required = false;
                        for (const requirement of requiredIf) {
                            const [param, value] = requirement.split('=');
                            const current = params.get(param);
                            if (!current)
                                continue;
                            if ((current instanceof EnumValue && current.value === value) ||
                                (current instanceof BooleanValue && current.value === (value === 'true'))) {
                                required = true;
                                break;
                            }
                        }
                        if (required)
                            hasUndefined = true;
                    }
                }

                return true;
            }

            visitValue(value : Value) {
                if (value.isUndefined || !value.isConcrete())
                    hasUndefined = true;
                return true;
            }
        };
        this.stmt.visit(visitor);
        return !hasUndefined;
    }

    equals(other : DialogueHistoryItem) : boolean {
        if (this === other)
            return true;
        if (this.confirm !== other.confirm)
            return false;

        // HACK prettyprint to compare for equality is quite expensive, we should open-code
        // equality properly
        if (this.stmt.prettyprint() !== other.stmt.prettyprint())
            return false;

        if (this.results === other.results)
            return true;
        if (this.results === null || other.results === null)
            return false;
        return this.results.equals(other.results);
    }

    optimize() : this {
        const newStmt = Optimizer.optimizeRule(this.stmt);
        this.stmt = newStmt;
        return this;
    }

    clone() : DialogueHistoryItem {
        return new DialogueHistoryItem(this.location, this.stmt.clone(), this.results ? this.results.clone() : null, this.confirm);
    }

    visit(visitor : NodeVisitor) : void {
        visitor.enter(this);
        if (visitor.visitDialogueHistoryItem(this)) {
            this.stmt.visit(visitor);
            if (this.results !== null)
                this.results.visit(visitor);
        }
        visitor.exit(this);
    }

    *iterateSlots() : Generator<OldSlot, void> {
        yield* this.stmt.iterateSlots();
        // no slots in a HistoryResult
    }
    *iterateSlots2() : Generator<DeviceSelector|AbstractSlot, void> {
        yield* this.stmt.iterateSlots2();
        if (this.results === null)
            return;

        const stmtSchema = this.stmt.expression.schema!;
        yield* this.results.iterateSlots2(stmtSchema);
    }
}

/**
 * The representation of a dialogue state.
 *
 * It is composed of:
 *
 * - A policy name (which is used as a namespace for the dialogueAct)
 * - The current abstract dialogue act
 * - An parameter name that modifies the current dialogue act (optional, used for questions from the agent)
 * - The history of all programs up to that point, and all programs that are scheduled to execute
 *
 */
export class DialogueState extends Input {
    policy : string;
    dialogueAct : string;
    dialogueActParam : Array<string|Value>|null;
    history : DialogueHistoryItem[];

    private _current : DialogueHistoryItem|null;

    constructor(location : SourceRange|null,
                policy : string,
                dialogueAct : string,
                dialogueActParam : Array<string|Value>|string|null,
                history : DialogueHistoryItem[]) {
        super(location);
        assert(typeof policy === 'string');
        assert(typeof dialogueAct === 'string');
        assert(dialogueActParam === null || typeof dialogueActParam === 'string' || Array.isArray(dialogueActParam));

        this.dialogueAct = dialogueAct;
        this.dialogueActParam = typeof dialogueActParam === 'string' ? [dialogueActParam] : dialogueActParam;
        this.history = history;
        this.policy = policy;

        this._current = null;
        this.updateCurrent();
    }

    /**
     * The most recently executed history item.
     */
    get current() : DialogueHistoryItem|null {
        return this._current;
    }

    private updateCurrent() {
        for (const item of this.history) {
            if (item.results !== null)
                this._current = item;
        }
    }

    optimize() : this {
        this.history = this.history.map((prog) => prog.optimize())
            .filter((prog) => prog !== null) as DialogueHistoryItem[];
        return this;
    }

    toSource() : TokenStream {
        let list : TokenStream = List.concat('$dialogue', '@' + this.policy, '.', this.dialogueAct);
        if (this.dialogueActParam)
            list = List.concat(list, '(', List.join(this.dialogueActParam.map((p) => typeof p === 'string' ? List.singleton(p) : p.toSource()), ','), ')');
        list = List.concat(list, ';');
        for (const item of this.history)
            list = List.concat(list, '\n', item.toSource());
        return list;
    }

    clone() : DialogueState {
        return new DialogueState(this.location, this.policy, this.dialogueAct,
            this.dialogueActParam ? this.dialogueActParam.map((v) => typeof v === 'string' ? v : v.clone()) : null,
            this.history.map((item) => item.clone()));
    }

    async typecheck(schemas : SchemaRetriever, getMeta = false) : Promise<this> {
        const typeChecker = new TypeChecker(schemas, getMeta);
        await typeChecker.typeCheckDialogue(this);
        return this;
    }

    visit(visitor : NodeVisitor) : void {
        visitor.enter(this);
        if (visitor.visitDialogueState(this)) {
            for (const item of this.history)
                item.visit(visitor);
        }
        visitor.exit(this);
    }

    *iterateSlots() : Generator<OldSlot, void> {
        for (const item of this.history)
            yield* item.iterateSlots();
    }
    *iterateSlots2() : Generator<DeviceSelector|AbstractSlot, void> {
        for (const item of this.history)
            yield* item.iterateSlots2();
    }
}
DialogueState.prototype.isDialogueState = true;
Input.DialogueState = DialogueState;
