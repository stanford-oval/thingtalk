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
}
Input.Bookkeeping = BookkeepingInput;
BookkeepingInput.prototype.isBookkeeping = true;

const BookkeepingIntent = adt.data({
    Failed: { command: adt.only(Object, null) },
    Train: { command: adt.only(Object, null), fallbacks: adt.only(Array, null) },
    Back: null, // go back / go to the previous page
    More: null, // show more results / go to the next page
    Empty: null, // default trigger/action, in make dialog
    Debug: null,
    Maybe: null, // "yes with filters", for permission grant
    NeverMind: null, // cancel the current task
    Stop: null, // cancel the current task, quietly
    Help: null, // ask for contextual help, or start a new task
    Make: null, // reset and start a new task
    WakeUp: null, // do nothing and wake up the screen

    Example: { utterance: adt.only(String), targetCode: adt.only(String) },
    CommandList: { device: adt.only(String, null), category: adt.only(String) },

    // on the chopping block after the contextual work is done...
    Answer: { value: adt.only(Value, Number) },
    Predicate: { predicate: adt.only(BooleanExpression) },
});

module.exports = {
    BookkeepingIntent
};
