// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingTalk
//
// Copyright 2017 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const Parser = require('./parser');
const Lexer = require('./lexer');
const ToNNConverter = require('./tonn_converter');
const { UnsynthesizableError } = require('./errors');

function fromNN(sequence, entities) {
    let parser = new Parser();
    return parser.parse({
        [Symbol.iterator]() {
            return new Lexer(sequence, entities);
        }
    });
}

function toNN(program, sentence, entities, options = {}) {
    // for backward compatibility with the old API
    if (!entities) {
        entities = sentence;
        sentence = '';
    }

    let converter = new ToNNConverter(sentence, entities, options.allocateEntities, options.typeAnnotations, options.explicitStrings);
    return converter.toNN(program);
}

module.exports = {
    fromNN,
    toNN,
    UnsynthesizableError
};
