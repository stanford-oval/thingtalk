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

import * as assert from 'assert';

import { AnyEntity, EntityMap, EntityResolver, GenericEntity, MeasureEntity } from '../entities';
import { SourceRange, SourceLocation } from '../utils/source_locations';
import { ThingTalkSyntaxError } from '../utils/errors';
import { DOLLAR_KEYWORDS, FORBIDDEN_KEYWORDS, KEYWORDS } from './keywords';
import { Token } from './token';

const DECIMAL_LITERAL = /^-?(?:(?:0|[1-9][0-9]*)\.[0-9]*(?:[eE][+-]?[0-9]+)?|\.[0-9]+(?:[eE][+-]?[0-9]+)?|(?:0|[1-9][0-9]*)(?:[eE][+-]?[0-9]+)?)$/;
const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;

function isEntity(token : string) {
    return /^(?:QUOTED_STRING|NUMBER|CURRENCY|TIME|DATE|LOCATION|USERNAME|HASHTAG|URL|PHONE_NUMBER|EMAIL_ADDRESS|PATH_NAME|PICTURE|GENERIC_ENTITY)_/.test(token);
}

function isIdentifier(token : string) {
    return IDENTIFIER.test(token) && !KEYWORDS.has(token);
}

function isUnit(token : string) {
    return isIdentifier(token) || token === 'in';
}

interface LanguagePack {
    detokenizeSentence(words : string[]) : string;
}

class DummyLanguagePack {
    detokenizeSentence(words : string[]) : string {
        return words.join(' ');
    }
}

export function* nnLexer(input : Iterable<string>,
                         entities : EntityResolver|EntityMap,
                         languagePack : LanguagePack = new DummyLanguagePack()) : IterableIterator<Token> {
    let sequence : string[];
    if (!Array.isArray(input))
        sequence = Array.from(input);
    else
        sequence = input;

    let getEntity : EntityResolver;
    if (typeof entities !== 'function') {
        getEntity = (next : string) => {
            if (!(next in entities)) {
                if (next.startsWith('SLOT_'))
                    return undefined;
                throw new ThingTalkSyntaxError(`Invalid entity ${next}, have [${Object.keys(entities)}]`,
                    makeLocation());
            }
            return entities[next];
        };
    } else {
        getEntity = entities;
    }

    let i = 0;
    let charoffset = 0;
    // FIXME
    const lastfunction : string|null = null;
    const lastparam : string|null = null;

    function makeLocation() : SourceRange {
        const tok = sequence[i];
        const start : SourceLocation = {
            offset: 1 + charoffset,
            column: 1 + charoffset,
            line: 1,
            token: i
        };
        const end : SourceLocation = {
            offset: 1 + charoffset + tok.length,
            column: 1 + charoffset + tok.length,
            line: 1,
            token: i + 1
        };
        return { start, end };
    }
    function advance() {
        const tok = sequence[i];
        if (i > 0)
            charoffset += 1;
        charoffset += tok.length;
        i++;
    }

    for (let i = 0; i < sequence.length; advance()) {
        const next = sequence[i];
        if (next === '"') {
            const start : SourceLocation = {
                offset: 1 + charoffset,
                column: 1 + charoffset,
                line: 1,
                token: i
            };
            const words : string[] = [];
            for (advance(); i < sequence.length; advance()) {
                if (sequence[i] === '"')
                    break;
                words.push(sequence[i]);
            }
            if (i >= sequence.length)
                throw new ThingTalkSyntaxError(`Unterminated string literal`, makeLocation());
            assert.strictEqual(sequence[i], '"');
            const end : SourceLocation = {
                offset: 1 + charoffset + '"'.length,
                column: 1 + charoffset + '"'.length,
                line: 1,
                token: i+1
            };
            yield new Token('QUOTED_STRING', { start, end }, languagePack.detokenizeSentence(words));
        } else if (FORBIDDEN_KEYWORDS.has(next)) {
            throw new ThingTalkSyntaxError(`Use of forbidden token ${next}`, makeLocation());
        } else if (DECIMAL_LITERAL.test(next)) {
            yield new Token('NUMBER', makeLocation(), parseFloat(next));
        } else if (isEntity(next)) {
            // check if we have a unit next, to pass to the entity retriever
            let unit : string|null = null;
            if (i < sequence.length - 1 && isUnit(sequence[i+1]))
                unit = sequence[i+1];

            // entity
            const entity = getEntity(next, lastparam, lastfunction, unit);
            const entityType = next.substring(0, next.lastIndexOf('_'));
            if (entityType.startsWith('GENERIC_ENTITY_')) {
                const generic = entity as GenericEntity;
                yield new Token('GENERIC_ENTITY', makeLocation(), {
                    value: generic.value,
                    display: generic.display,
                    type: entityType.substring('GENERIC_ENTITY_'.length)
                });
            } else if (entityType.startsWith('MEASURE_')) {
                yield new Token('MEASURE', makeLocation(), entity as MeasureEntity);
            } else {
                yield new Token(entityType, makeLocation(), entity as AnyEntity);
            }
        } else if (next.startsWith('@')) {
            yield new Token('CLASS_OR_FUNCTION_REF', makeLocation(), next.substring(1));
        } else if (next.startsWith('$')) {
            if (DOLLAR_KEYWORDS.has(next))
                yield new Token(next, makeLocation(), null);
            else
                yield new Token('DOLLARIDENTIFIER', makeLocation(), next.substring(1));
        } else if (next.startsWith('^^')) {
            yield new Token('ENTITY_NAME', makeLocation(), next.substring(2));
        }
    }
}
