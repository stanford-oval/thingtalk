// -*- mode: typescript; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingTalk
//
// Copyright 2020 The Board of Trustees of the Leland Stanford Junior University
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
import * as util from 'util';

import * as Ast from '../ast';

import { parseDate } from '../date_utils';
import {
    EntityMap,
    MeasureEntity,
    LocationEntity,
    TimeEntity,
    DateEntity,
    GenericEntity,
    AnyEntity
} from './entities';

import List from './list';

// convert AST values to on-the-wire entities, as returned by almond-tokenizer
// the two are mostly the same, except for some weird historical stuff where
// units are sometimes called codes and similar
function valueToEntity(type : string, value : Ast.Value) : AnyEntity {
    if (type === 'CURRENCY') {
        assert(value instanceof Ast.CurrencyValue);
        return { unit: value.code, value: value.value };
    }
    if (type === 'LOCATION') {
        assert(value instanceof Ast.LocationValue);
        const loc = value.value;
        if (loc instanceof Ast.AbsoluteLocation) {
            return { latitude: loc.lat, longitude: loc.lon, display: loc.display };
        } else {
            // (isRelative is handled elsewhere)
            assert(loc instanceof Ast.UnresolvedLocation);
            // note that NaN !== NaN so this will never match (which is the goal)
            return { latitude: NaN, longitude: NaN, display: loc.name };
        }
    }
    if (type === 'DURATION' ||
        type.startsWith('MEASURE_')) {
        assert(value instanceof Ast.MeasureValue);
        return { unit: value.unit, value: value.value };
    }
    if (type === 'TIME') {
        assert(value instanceof Ast.TimeValue);
        const time = value.value;
        assert(time instanceof Ast.AbsoluteTime); // isRelative is handled elsewhere
        return { hour: time.hour, minute: time.minute, second: time.second };
    }
    if (type.startsWith('GENERIC_ENTITY_')) {
        assert(value instanceof Ast.EntityValue);
        return { value: value.value, display: value.display };
    }
    if (type === 'DATE') {
        assert(value instanceof Ast.DateValue);
        const date = value.value;
        assert(date instanceof Date);
        return date;
    }

    assert(value instanceof Ast.StringValue ||
           value instanceof Ast.NumberValue ||
           value instanceof Ast.CurrencyValue /* for NUMBER + currency code */ ||
           value instanceof Ast.MeasureValue /* for NUMBER + unit */ ||
           value instanceof Ast.EntityValue /* for special entities like hashtags */);
    return value.value!;
}

function entitiesEqual(type : string, one : AnyEntity, two : AnyEntity) : boolean {
    if (one === two)
        return true;
    if (!one || !two)
        return false;
    if (type.startsWith('GENERIC_ENTITY_')) {
        const eone = one as GenericEntity;
        const etwo = two as GenericEntity;

        if (!eone.value && !etwo.value)
            return eone.display === etwo.display;
        return (eone.value === etwo.value);
    }

    if (type.startsWith('MEASURE_') ||
        type === 'DURATION') {
        const eone = one as MeasureEntity;
        const etwo = two as MeasureEntity;
        return eone.value === etwo.value && eone.unit === etwo.unit;
    }

    switch (type) {
    case 'CURRENCY': {
        const eone = one as MeasureEntity;
        const etwo = two as MeasureEntity;
        return eone.value === etwo.value && eone.unit === etwo.unit;
    }
    case 'TIME': {
        const eone = one as TimeEntity;
        const etwo = two as TimeEntity;
        return eone.hour === etwo.hour &&
            eone.minute === etwo.minute &&
            (eone.second || 0) === (etwo.second || 0);
    }
    case 'DATE':
        if (!(one instanceof Date))
            one = parseDate(one as DateEntity);
        if (!(two instanceof Date))
            two = parseDate(two as DateEntity);

        return +one === +two;
    case 'LOCATION': {
        const eone = one as LocationEntity;
        const etwo = two as LocationEntity;
        if (isNaN(eone.latitude) && isNaN(etwo.latitude) && isNaN(eone.longitude) && isNaN(etwo.longitude))
            return eone.display === etwo.display;
        return Math.abs(eone.latitude - etwo.latitude) < 0.01 &&
            Math.abs(eone.longitude - etwo.longitude) < 0.01;
    }
    }

    return false;
}

function entityToString(entityType : string, entity : AnyEntity) : string {
    if ((entityType.startsWith('GENERIC_ENTITY_') || entityType === 'LOCATION')) {
        const generic = entity as GenericEntity;
        if (generic.display)
            return generic.display;
    }
    return String(entity);
}

/**
 * Abstract class capable of allocating entity numbers when converting
 * ThingTalk code to NN syntax (which uses numbered entities matching the input sentence).
 *
 * @alias NNSyntax.AbstractEntityRetriever
 */
export abstract class AbstractEntityRetriever {
    /**
     * Find the entity with the given `entityType` (USERNAME, HASHTAG, etc.) and value.
     *
     * @param {string} entityType - the type of entity to retrieve
     * @param {Ast.Value} value - the value to retrieve
     * @param {Object} options - additional options
     * @param {boolean} options.ignoreNotFound - return `null` if the entity is not found, instead
     *   of throwing an exception.
     * @return {Array<string>} - the list of tokens making up this entity.
     */
    abstract findEntity(entityType : string, value : Ast.Value, options : { ignoreNotFound ?: boolean; }) : List<string>|null;
}

/**
 * Entity retriever that looks for an entity in the tokenized entities, if any, and then
 * falls back to string matching in the sentence.
 *
 * @alias NNSyntax.EntityRetriever
 * @extends NNSyntax.AbstractEntityRetriever
 */
export class EntityRetriever extends AbstractEntityRetriever {
    sentence : string[];
    entities : EntityMap;
    protected _used : EntityMap;

    constructor(sentence : string|string[], entities : EntityMap) {
        super();
        if (typeof sentence === 'string')
            sentence = sentence.split(' ');
        this.sentence = sentence;

        this.entities = {};
        Object.assign(this.entities, entities);

        this._used = {};
    }

    protected _sentenceContains(tokens : string[]) : boolean {
        for (let i = 0; i <= this.sentence.length-tokens.length; i++) {
            let found = true;
            for (let j = 0; j < tokens.length; j++) {
                if (tokens[j] !== this.sentence[i+j]) {
                    found = false;
                    break;
                }
            }
            if (found)
                return true;
        }
        return false;
    }

    /**
     * Match an entity from the sentence.
     *
     * This method should search for the entity string in the sentence, and return the value
     * to predict in NN-syntax, or `undefined` if the entity is not mentioned.
     * This method can be overridden to implement custom tokenization or normalization.
     *
     * @param {string} entityType - the entity type (USERNAME, HASHTAG, QUOTED_STRING, etc.)
     * @param {string} entityString - the string to search
     * @param {boolean} ignoreNotFound - ignore if the entity is not mentioned; subclasses can
     *   use this to hallucinate entities that are not mentioned, when `ignoreNotFound` is false
     * @return {undefined|string} - the tokens to predict, space-separated, or `undefined` if the entity
     *   is not mentioned in the sentence.
     */
    protected _findEntityFromSentence(entityType : string, entityString : string, ignoreNotFound : boolean) : string|undefined {
        const entityTokens = entityString.toLowerCase().split(' ');
        const found = this._sentenceContains(entityTokens);
        if (found)
            return entityTokens.join(' ');
        else
            return undefined;
    }

    protected _findStringLikeEntity(entityType : string,
                                    entity : AnyEntity,
                                    entityString : string,
                                    ignoreNotFound : boolean) : List<string>|undefined {
        if (entityType === 'DATE') {
            const dateStr = (entity as Date).toISOString();
            if (this._sentenceContains([dateStr]))
                return List.concat('new', 'Date', '(', '"', dateStr, '"', ')');
        }

        if (entityType === 'QUOTED_STRING' || entityType === 'HASHTAG' || entityType === 'USERNAME' ||
            entityType === 'LOCATION' ||
            (entityType.startsWith('GENERIC_ENTITY_') && (entity as GenericEntity).display)) {

            const found = this._findEntityFromSentence(entityType, entityString, ignoreNotFound);
            if (found) {
                if (entityType === 'QUOTED_STRING')
                    return List.concat('"', found, '"');
                else if (entityType === 'HASHTAG')
                    return List.concat('"', found, '"', '^^tt:hashtag');
                else if (entityType === 'USERNAME')
                    return List.concat('"', found, '"', '^^tt:username');
                else if (entityType === 'LOCATION')
                    return List.concat('location:', '"', found, '"');
                else
                    return List.concat('"', found, '"', '^^' + entityType.substring('GENERIC_ENTITY_'.length));
            }
        }

        return undefined;
    }

    protected _findEntityInBag(entityType : string, value : AnyEntity, entities : EntityMap) : string[] {
        const candidates = [];

        for (const what in entities) {
            if (!what.startsWith(entityType + '_'))
                continue;

            if (entitiesEqual(entityType, entities[what], value))
                candidates.push(what);
        }
        return candidates;
    }

    findEntity(entityType : string, value : Ast.Value, { ignoreNotFound = false }) : List<string>|null {
        const entity = valueToEntity(entityType, value);

        const entityString = entityToString(entityType, entity);

        // try in the sentence before we look in the bag of entities (which comes from the context)
        // this is so that we predict
        // " foo " ^^tt:whatever
        // if the sentence contains "foo", regardless of whether GENERIC_ENTITY_tt:whatever_0 is "foo" or not
        const found = this._findStringLikeEntity(entityType, entity, entityString, true);
        if (found)
            return found;

        const candidates = this._findEntityInBag(entityType, entity, this.entities);

        if (candidates.length === 0) {
            // uh oh we don't have the entity we want
            // see if we have an used pile, and try there for an unambiguous one

            const reuse = this._findEntityInBag(entityType, entity, this._used);
            if (reuse.length > 0) {
                if (reuse.length > 1)
                    throw new Error('Ambiguous entity ' + entity + ' of type ' + entityType);
                return List.singleton(reuse[0]);
            }

            if (ignoreNotFound && candidates.length === 0)
                return null;

            const found = this._findStringLikeEntity(entityType, entity, entityString, false);
            if (found)
                return found;

            throw new Error(`Cannot find entity ${entityString} of type ${entityType}, have ${util.inspect(this.entities)} / ${util.inspect(this._used)}`);
        } else {
            // move the first entity (in sentence order) from the main bag to the used bag
            candidates.sort();
            const result = candidates.shift();
            assert(result !== undefined);
            this._used[result] = this.entities[result];
            delete this.entities[result];
            return List.singleton(result);
        }
    }
}

export class SequentialEntityAllocator extends AbstractEntityRetriever {
    offsets : { [key : string] : number };
    entities : EntityMap;
    explicitStrings : boolean;

    constructor(entities : EntityMap, explicitStrings = false) {
        super();
        this.offsets = {};
        this.entities = entities;
        this.explicitStrings = explicitStrings;
        this.updateOffsets();
    }

    private updateOffsets() : void {
        for (const entity in this.entities) {
            const entityType = entity.slice(0, entity.lastIndexOf('_'));
            const offset = entity.slice(entity.lastIndexOf('_') + 1);
            assert(/^\d+$/.test(offset));
            this.offsets[entityType] = Math.max((this.offsets[entityType] || -1), parseInt(offset) + 1);
        }
    }

    findEntity(entityType : string, value : Ast.Value, { ignoreNotFound = false }) : List<string>|null {
        const entity = valueToEntity(entityType, value);

        if (this.explicitStrings &&
            (entityType === 'QUOTED_STRING' || entityType === 'HASHTAG' || entityType === 'USERNAME' ||
            entityType === 'LOCATION' || entityType.startsWith('GENERIC_ENTITY_'))) {
            const entityString = entityToString(entityType, entity);

            if (entityType === 'QUOTED_STRING')
                return List.concat('"', entityString, '"');
            else if (entityType === 'HASHTAG')
                return List.concat('"', entityString, '"', '^^tt:hashtag');
            else if (entityType === 'USERNAME')
                return List.concat('"', entityString, '"', '^^tt:username');
            else if (entityType === 'LOCATION')
                return List.concat('location:', '"', entityString, '"');
            else
                return List.concat('"', entityString, '"', '^^' + entityType.substring('GENERIC_ENTITY_'.length));
        }

        for (const what in this.entities) {
            if (!what.startsWith(entityType + '_'))
                continue;

            if (entitiesEqual(entityType, this.entities[what], entity))
                return List.singleton(what);
        }

        let num;
        if (entityType in this.offsets) {
            num = this.offsets[entityType];
            this.offsets[entityType] += 1;
        } else {
            num = 0;
            this.offsets[entityType] = 1;
        }

        const key = entityType + '_' + num;
        this.entities[key] = entity;
        return List.singleton(key);
    }
}
