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

import type * as Ast from '../ast';
import Parser from './parser';
import Lexer from './lexer';
import ToNNConverter from './tonn_converter';
import { UnsynthesizableError } from './errors';
import {
    AbstractEntityRetriever,
    EntityRetriever,
} from '../entity-retriever';
import {
    MeasureEntity,
    LocationEntity,
    TimeEntity,
    GenericEntity,
    DateEntity,
    EntityMap,
    EntityResolver,
    AnyEntity
} from '../entities';
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
 */
function fromNN(input : string|string[], entities : EntityMap|EntityResolver, options : {
    locale ?: string,
    timezone ?: string
} = {}) : Ast.Input {
    let sequence : string[];
    if (typeof input === 'string')
        sequence = input.split(' ');
    else
        sequence = input;

    const parser = new Parser(options);
    return parser.parse({
        [Symbol.iterator]() {
            return new Lexer(sequence, entities);
        }
    }) as unknown as Ast.Input;
}

interface SerializeOptions {
    typeAnnotations ?: boolean;
}

function toNN(program : Ast.Input, entityRetriever : AbstractEntityRetriever, options : SerializeOptions) : string[] {
    const converter = new ToNNConverter(entityRetriever, options.typeAnnotations);
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
