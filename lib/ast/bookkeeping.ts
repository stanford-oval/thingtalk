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
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>

import assert from 'assert';

import Node, { SourceRange } from './base';
import NodeVisitor from './visitor';
import { Input } from './program';
import { Value } from './values';
import { BooleanExpression } from './expression';
import TypeChecker from '../typecheck';
import SchemaRetriever from '../schema';

/**
 * A ThingTalk input that drives the dialog.
 *
 * Bookkeeping inputs are special commands like yes, no or cancel
 * whose purpose is to drive a dialog agent, but have no direct executable
 * semantic.
 *
 * Their definition is included in ThingTalk to aid using ThingTalk as a
 * virtual assistant representation language without extensions.
 *
 * @alias Ast.Input.Bookkeeping
 * @extends Ast.Input
 */
export class Bookkeeping extends Input {
    intent : BookkeepingIntent;

    /**
     * Construct a new bookkeeping input.
     *
     * @param location - the position of this node
     *        in the source code
     * @param intent - the current intent
     */
    constructor(location : SourceRange|null, intent : BookkeepingIntent) {
        super(location);

        /**
         * The intent associated with this input.
         *
         * @type {Ast.BookkeepingIntent}
         * @readonly
         */
        this.intent = intent;
    }

    visit(visitor : NodeVisitor) : void {
        visitor.enter(this);
        if (visitor.visitBookkeeping(this))
            this.intent.visit(visitor);
        visitor.exit(this);
    }

    clone() : Bookkeeping {
        return new Bookkeeping(this.location, this.intent.clone());
    }

    async typecheck(schemas : SchemaRetriever, getMeta = false) : Promise<this> {
        const typeChecker = new TypeChecker(schemas, getMeta);
        await typeChecker.typeCheckBookkeeping(this.intent);
        return this;
    }
}
Input.Bookkeeping = Bookkeeping;
Bookkeeping.prototype.isBookkeeping = true;

/**
 * All types of special bookkeeping commands.
 *
 * @alias Ast.BookkeepingSpecialTypes
 * @type {string[]}
 */
export const BookkeepingSpecialTypes = [
    'yes',
    'no',
    'failed',
    'train',
    'back', // go back / go to the previous page
    'more', // show more results / go to the next page
    'empty', // default trigger/action, in make dialog
    'debug',
    'maybe', // "yes with filters", for permission grant
    'nevermind', // cancel the current task
    'stop', // cancel the current task, quietly
    'help', // ask for contextual help, or start a new task
    'makerule', // reset and start a new task
    'wakeup', // do nothing and wake up the screen
];

/**
 * Base class of all the bookkeeping intents.
 *
 * The meaning of all bookkeeping commands is mapped to a subclass of
 * this class.
 *
 * @alias Ast.BookkeepingIntent
 */
export abstract class BookkeepingIntent extends Node {
    static Special : any;
    isSpecial ! : boolean;
    static CommandList : any;
    isCommandList ! : boolean;
    static Choice : any;
    isChoice ! : boolean;
    static Answer : any;
    isAnswer ! : boolean;
    static Predicate : any;
    isPredicate ! : boolean;

    abstract clone() : BookkeepingIntent;
}
BookkeepingIntent.prototype.isSpecial = false;
BookkeepingIntent.prototype.isCommandList = false;
BookkeepingIntent.prototype.isChoice = false;
BookkeepingIntent.prototype.isAnswer = false;
BookkeepingIntent.prototype.isPredicate = false;

/**
 * A special bookkeeping command.
 *
 * Special commands have no parameters, and are expected to trigger
 * unusual behavior from the dialog agent.
 *
 * @alias Ast.BookkeepingIntent.Special
 * @extends Ast.BookkeepingIntent
 */
export class SpecialBookkeepingIntent extends BookkeepingIntent {
    type : string;

    /**
     * Construct a new special command.
     *
     * @param location - the position of this node
     *        in the source code
     * @param type - the command type (one of {@link Ast.BookkeepingSpecialTypes})
     */
    constructor(location : SourceRange|null, type : string) {
        super(location);

        assert(typeof type === 'string');
        /**
         * The special command type (one of {@link Ast.BookkeepingSpecialTypes}).
         * @type {string}
         */
        this.type = type;
    }

    visit(visitor : NodeVisitor) : void {
        visitor.enter(this);
        visitor.visitSpecialBookkeepingIntent(this);
        visitor.exit(this);
    }

    clone() : SpecialBookkeepingIntent {
        return new SpecialBookkeepingIntent(this.location, this.type);
    }
}
SpecialBookkeepingIntent.prototype.isSpecial = true;
BookkeepingIntent.Special = SpecialBookkeepingIntent;

/**
 * A multiple-choice bookkeeping command.
 *
 * This indicates the user chose one option out of the just-presented list.
 *
 * @alias Ast.BookkeepingIntent.Choice
 * @extends Ast.BookkeepingIntent
 */
export class ChoiceBookkeepingIntent extends BookkeepingIntent {
    value : number;

    /**
     * Construct a new choice command.
     *
     * @param {Ast~SourceRange|null} location - the position of this node
     *        in the source code
     * @param {number} value - the choice index
     */
    constructor(location : SourceRange|null, value : number) {
        super(location);

        assert(typeof value === 'number');
        /**
         * The choice index.
         * @type {number}
         */
        this.value = value;
    }

    visit(visitor : NodeVisitor) : void {
        visitor.enter(this);
        visitor.visitChoiceBookkeepingIntent(this);
        visitor.exit(this);
    }

    clone() : ChoiceBookkeepingIntent {
        return new ChoiceBookkeepingIntent(this.location, this.value);
    }
}
ChoiceBookkeepingIntent.prototype.isChoice = true;
BookkeepingIntent.Choice = ChoiceBookkeepingIntent;

/**
 * A command that triggers a command list.
 *
 * Used to request help for a specific device or category of devices.
 *
 * @alias Ast.BookkeepingIntent.CommandList
 * @extends Ast.BookkeepingIntent
 */
export class CommandListBookkeepingIntent extends BookkeepingIntent {
    device : Value;
    category : string;

    /**
     * Construct a new command list command.
     *
     * @param location - the position of this node
     *        in the source code
     * @param device - the device to ask for (an `Entity` or `Undefined` value)
     * @param category - the Thingpedia (sub)category to ask for
     */
    constructor(location : SourceRange|null, device : Value, category : string) {
        super(location);

        assert(device instanceof Value);
        /**
         * The device to list commands for
         * @type {Ast.Value}
         */
        this.device = device;

        assert(typeof category === 'string');
        /**
         * The (sub)category to ask for
         * @type {string}
         */
        this.category = category;
    }

    visit(visitor : NodeVisitor) : void {
        visitor.enter(this);
        if (visitor.visitCommandListBookkeepingIntent(this))
            this.device.visit(visitor);
        visitor.exit(this);
    }

    clone() : CommandListBookkeepingIntent {
        return new CommandListBookkeepingIntent(this.location, this.device, this.category);
    }
}
CommandListBookkeepingIntent.prototype.isCommandList = true;
BookkeepingIntent.CommandList = CommandListBookkeepingIntent;

// these are on the chopping block after the contextual work is done...

/**
 * A direct answer to a slot-filling question.
 *
 * @alias Ast.BookkeepingIntent.Answer
 * @extends Ast.BookkeepingIntent
 */
export class AnswerBookkeepingIntent extends BookkeepingIntent {
    value : Value;

    /**
     * Construct a new answer command.
     *
     * @param location - the position of this node in the source code
     * @param value - the answer value
     */
    constructor(location : SourceRange|null, value : Value) {
        super(location);

        assert(value instanceof Value);
        /**
         * The answer value.
         * @type {Ast.Value}
         */
        this.value = value;
    }

    visit(visitor : NodeVisitor) : void {
        visitor.enter(this);
        if (visitor.visitAnswerBookkeepingIntent(this))
            this.value.visit(visitor);
        visitor.exit(this);
    }

    clone() : AnswerBookkeepingIntent {
        return new AnswerBookkeepingIntent(this.location, this.value);
    }
}
AnswerBookkeepingIntent.prototype.isAnswer = true;
BookkeepingIntent.Answer = AnswerBookkeepingIntent;

/**
 * A standalone predicate to add to the current command.
 *
 * @alias Ast.BookkeepingIntent.Predicate
 * @extends Ast.BookkeepingIntent
 * @deprecated Predicates cannot be typechecked in isolation, and should be replaced with
 *             contextual commands instead.
 */
export class PredicateBookkeepingIntent extends BookkeepingIntent {
    predicate : BooleanExpression;

    /**
     * Construct a new answer command.
     *
     * @param location - the position of this node in the source code
     * @param predicate - the predicate to add
     */
    constructor(location : SourceRange|null, predicate : BooleanExpression) {
        super(location);

        assert(predicate instanceof BooleanExpression);
        /**
         * The predicate to add
         * @type {Ast.BooleanExpression}
         */
        this.predicate = predicate;
    }

    visit(visitor : NodeVisitor) : void {
        visitor.enter(this);
        if (visitor.visitPredicateBookkeepingIntent(this))
            this.predicate.visit(visitor);
        visitor.exit(this);
    }

    clone() : PredicateBookkeepingIntent {
        return new PredicateBookkeepingIntent(this.location, this.predicate);
    }
}
PredicateBookkeepingIntent.prototype.isPredicate = true;
BookkeepingIntent.Predicate = PredicateBookkeepingIntent;
