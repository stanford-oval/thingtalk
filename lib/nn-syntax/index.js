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
const {
    AbstractEntityRetriever,
    EntityRetriever,
    SequentialEntityAllocator
} = require('./entity-retriever');

/**
 * Manipulating NN-syntax ThingTalk programs.
 *
 * NN-syntax is a syntax of ThingTalk optimized for sequential prediction.
 *
 * @namespace NNSyntax
 */

/**
 * Parse a sequence of tokens in NN syntax into a ThingTalk program.
 *
 * @param {string|Array<string>} sequence - the program to parse.
 * @param {Object<string, any>} entities - concrete values of the entities referred in the program.
 * @return {Ast.Input} - the parsed program
 * @alias NNSyntax.toNN
 */
function fromNN(sequence, entities) {
    let parser = new Parser();
    return parser.parse({
        [Symbol.iterator]() {
            return new Lexer(sequence, entities);
        }
    });
}

/**
 * Serialize a ThingTalk program to neural network syntax.
 *
 * @param {Ast.Input} program - the program to serialize
 * @param {string|Array<string>} sentence - the sentence associated with this program
 * @param {Object<string,any>|NNSyntax.AbstractEntityRetriever} entities - the entities contained
 *   in the sentence; this can be an object mapping entity tokens to values, or it can be an
 *   object to customize how entities are allocated (e.g. to support custom tokenization or
 *   heuristics)
 * @param {Object} [options={}] - additional options
 * @param {boolean} options.allocateEntities - allocate entities sequentially instead of
 *   retrieving them from the sentence; if `true`, `sentence` is ignored, and entities are added
 *   to `entities` as they are allocated
 * @param {boolean} options.explicitStrings - include string values explicitly when allocating
 *   entities sequentially
 * @param {boolean} options.typeAnnotations - include type annotations for parameters
 * @alias NNSyntax.toNN
 */
function toNN(program, sentence, entities, options = {}) {
    // for backward compatibility with the old API
    if (!entities) {
        entities = sentence;
        sentence = '';
    }

    let entityRetriever;
    if (options.allocateEntities)
        entityRetriever = new SequentialEntityAllocator(entities, options.explicitStrings);
    else if (entities instanceof AbstractEntityRetriever)
        entityRetriever = entities;
    else
        entityRetriever = new EntityRetriever(sentence, entities);

    let converter = new ToNNConverter(sentence, entityRetriever, options.typeAnnotations);
    return converter.toNN(program);
}

module.exports = {
    fromNN,
    toNN,
    UnsynthesizableError,
    AbstractEntityRetriever,
    EntityRetriever
};
