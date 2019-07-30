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

const adt = require('adt');

const { Input, BooleanExpression } = require('./program');
const { Value } = require('./values');

class BookkeepingInput extends Input {
    constructor(intent) {
        super();
        this.intent = intent;
    }

    clone() {
        return new BookkeepingInput(this.intent.clone());
    }

    *iteratePrimitives() {}
    *iterateSlots() {}
    *iterateSlots2() {}
}
Input.Bookkeeping = BookkeepingInput;
BookkeepingInput.prototype.isBookkeeping = true;

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

const BookkeepingIntent = adt.data({
    Special: {
        type: adt.only(String)
    },
    Choice: { value: adt.only(Number) },

    CommandList: { device: adt.only(Value), category: adt.only(String) },

    // on the chopping block after the contextual work is done...
    Answer: { value: adt.only(Value) },
    Predicate: { predicate: adt.only(BooleanExpression) },
});

module.exports = {
    BookkeepingSpecialTypes,
    BookkeepingIntent
};
