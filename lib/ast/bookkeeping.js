// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingTalk
//
// Copyright 2015-2016 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const assert = require('assert');

const Node = require('./base');
const { Input } = require('./program');
const { Value } = require('./values');
const { BooleanExpression } = require('./expression');
const Typechecking = require('../typecheck');

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
class Bookkeeping extends Input {
    /**
     * Construct a new bookkeeping input.
     *
     * @param {Ast~SourceRange|null} location - the position of this node
     *        in the source code
     * @param {Ast.BookkeepingIntent} intent - the current intent
     */
    constructor(location, intent) {
        super(location);

        /**
         * The intent associated with this input.
         *
         * @type {Ast.BookkeepingIntent}
         * @readonly
         */
        this.intent = intent;
    }

    visit(visitor) {
        visitor.enter(this);
        if (visitor.visitBookkeeping(this))
            this.intent.visit(visitor);
        visitor.exit(this);
    }

    clone() {
        return new Bookkeeping(this.location, this.intent.clone());
    }

    *iteratePrimitives() {}
    *iterateSlots() {}
    *iterateSlots2() {}

    typecheck(schemas, getMeta = false) {
        return Typechecking.typeCheckBookkeeping(this.intent).then(() => this);
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
const BookkeepingSpecialTypes = [
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
 * @extends Ast~Node
 */
class BookkeepingIntent extends Node {
}

/**
 * A special bookkeeping command.
 *
 * Special commands have no parameters, and are expected to trigger
 * unusual behavior from the dialog agent.
 *
 * @alias Ast.BookkeepingIntent.Special
 * @extends Ast.BookkeepingIntent
 */
class SpecialBookkeepingIntent extends BookkeepingIntent {
    /**
     * Construct a new special command.
     *
     * @param {Ast~SourceRange|null} location - the position of this node
     *        in the source code
     * @param {string} type - the command type (one of {@link Ast.BookkeepingSpecialTypes})
     */
    constructor(location, type) {
        super(location);

        assert(typeof type === 'string');
        /**
         * The special command type (one of {@link Ast.BookkeepingSpecialTypes}).
         * @type {string}
         */
        this.type = type;
    }

    visit(visitor) {
        visitor.enter(this);
        visitor.visitSpecialBookkeepingIntent(this);
        visitor.exit(this);
    }

    clone() {
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
class ChoiceBookkeepingIntent extends BookkeepingIntent {
    /**
     * Construct a new choice command.
     *
     * @param {Ast~SourceRange|null} location - the position of this node
     *        in the source code
     * @param {number} value - the choice index
     */
    constructor(location, value) {
        super(location);

        assert(typeof value === 'number');
        /**
         * The choice index.
         * @type {number}
         */
        this.value = value;
    }

    visit(visitor) {
        visitor.enter(this);
        visitor.visitChoiceBookkeepingIntent(this);
        visitor.exit(this);
    }

    clone() {
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
class CommandListBookkeepingIntent extends BookkeepingIntent {
    /**
     * Construct a new command list command.
     *
     * @param {Ast~SourceRange|null} location - the position of this node
     *        in the source code
     * @param {Ast.Value} device - the device to ask for (an `Entity` or `Undefined` value)
     * @param {string} category - the Thingpedia (sub)category to ask for
     */
    constructor(location, device, category) {
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

    visit(visitor) {
        visitor.enter(this);
        if (visitor.visitCommandListBookkeepingIntent(this))
            this.device.visit(visitor);
        visitor.exit(this);
    }

    clone() {
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
class AnswerBookkeepingIntent extends BookkeepingIntent {
    /**
     * Construct a new answer command.
     *
     * @param {Ast~SourceRange|null} location - the position of this node
     *        in the source code
     * @param {Ast.Value} value - the answer value
     */
    constructor(location, value) {
        super(location);

        assert(value instanceof Value);
        /**
         * The answer value.
         * @type {Ast.Value}
         */
        this.value = value;
    }

    visit(visitor) {
        visitor.enter(this);
        if (visitor.visitAnswerBookkeepingIntent(this))
            this.value.visit(visitor);
        visitor.exit(this);
    }

    clone() {
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
class PredicateBookkeepingIntent extends BookkeepingIntent {
    /**
     * Construct a new answer command.
     *
     * @param {Ast~SourceRange|null} location - the position of this node
     *        in the source code
     * @param {Ast.BooleanExpression} predicate - the predicate to add
     */
    constructor(location, predicate) {
        super(location);

        assert(predicate instanceof BooleanExpression);
        /**
         * The predicate to add
         * @type {Ast.BooleanExpression}
         */
        this.predicate = predicate;
    }

    visit(visitor) {
        visitor.enter(this);
        if (visitor.visitPredicateBookkeepingIntent(this))
            this.predicate.visit(visitor);
        visitor.exit(this);
    }

    clone() {
        return new PredicateBookkeepingIntent(this.location, this.predicate);
    }
}
PredicateBookkeepingIntent.prototype.isPredicate = true;
BookkeepingIntent.Predicate = PredicateBookkeepingIntent;

module.exports = {
    BookkeepingSpecialTypes,
    BookkeepingIntent
};
