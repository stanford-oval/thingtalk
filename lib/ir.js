// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingEngine
//
// Copyright 2015-2016 Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details

const adt = require('adt');
const Type = require('./type');
const Ast = require('./ast');

const Invocation = adt.data({
    Trigger: {
        selector: adt.only(Ast.Selector),
        channel: adt.only(String),
        params: adt.only(Array), // of Ast.Value
        filter: adt.only(Function),
        output: adt.only(Function),
        once: adt.only(Boolean)
    },

    Query: {
        selector: adt.only(Ast.Selector),
        channel: adt.only(String),
        params: adt.only(Array), // of Function
        filter: adt.only(Function),
        output: adt.only(Function)
    },

    Action: {
        selector: adt.only(Ast.Selector),
        channel: adt.only(String),
        params: adt.only(Array), // of Function
    }
});
module.exports.Invocation = Invocation.seal();

const Rule = adt.newtype('Rule', {
    trigger: adt.only(Invocation),
    queries: adt.only(Array), // of Invocation
    actions: adt.only(Array) // of Invocation
});
module.exports.Rule = Rule.seal();

const Command = adt.newtype('Command', {
    queries: adt.only(Array), // of Invocation
    actions: adt.only(Array) // of Invocation
})
module.exports.Command = Command.seal();
