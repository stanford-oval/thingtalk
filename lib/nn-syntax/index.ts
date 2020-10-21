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

import * as Ast from '../ast';
import Parser from './parser';
import Lexer from './lexer';
import ToNNConverter from './tonn_converter';
import { UnsynthesizableError } from './errors';
import {
    AbstractEntityRetriever,
    EntityRetriever,
    SequentialEntityAllocator,
} from './entity-retriever';
import {
    MeasureEntity,
    LocationEntity,
    TimeEntity,
    GenericEntity,
    DateEntity,
    EntityMap,
    AnyEntity
} from './entities';
import applyCompatibility from './compat';

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
function fromNN(sequence : Iterable<string>, entities : EntityMap) : Ast.Input {
    const parser = new Parser();
    return parser.parse({
        [Symbol.iterator]() {
            return new Lexer(sequence, entities);
        }
    }) as unknown as Ast.Input;
}

interface SerializeOptions {
    allocateEntities ?: boolean;
    explicitStrings ?: boolean;
    typeAnnotations ?: boolean;
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
function toNN(program : Ast.Input, sentence : string[], entities : EntityMap|AbstractEntityRetriever, options : SerializeOptions = {}) : string[] {
    let entityRetriever : AbstractEntityRetriever;
    if (options.allocateEntities)
        entityRetriever = new SequentialEntityAllocator(entities as EntityMap, options.explicitStrings);
    else if (entities instanceof AbstractEntityRetriever)
        entityRetriever = entities;
    else
        entityRetriever = new EntityRetriever(sentence, entities);

    const converter = new ToNNConverter(sentence, entityRetriever, options.typeAnnotations);
    return converter.toNN(program);
}

export {
    fromNN,
    toNN,
    applyCompatibility,
    UnsynthesizableError,
    AbstractEntityRetriever,
    EntityRetriever,
    EntityMap,
    MeasureEntity,
    LocationEntity,
    TimeEntity,
    GenericEntity,
    DateEntity,
    AnyEntity
};
