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

import { parseDate } from './utils/date_utils';
import List from './utils/list';

import { SyntaxType } from './syntax_api';
import {
    MeasureEntity,
    LocationEntity,
    TimeEntity,
    DateEntity,
    GenericEntity,
    AnyEntity,
    EntityMap
} from './entities';
import { Temporal } from '@js-temporal/polyfill';

const EPSILON = 1e-8;

function entitiesEqual(type : string, one : AnyEntity, two : AnyEntity, timezone : string) : boolean {
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
            one = parseDate(one as DateEntity, timezone);
        if (!(two instanceof Date))
            two = parseDate(two as DateEntity, timezone);

        return +one === +two;
    case 'LOCATION': {
        const eone = one as LocationEntity;
        const etwo = two as LocationEntity;
        if (isNaN(eone.latitude) && isNaN(etwo.latitude) && isNaN(eone.longitude) && isNaN(etwo.longitude))
            return eone.display === etwo.display;
        return Math.abs(eone.latitude - etwo.latitude) < EPSILON &&
            Math.abs(eone.longitude - etwo.longitude) < EPSILON;
    }
    }

    return false;
}

function entityToString(entityType : string, entity : AnyEntity) : string {
    if ((entityType.startsWith('GENERIC_ENTITY_') || entityType === 'LOCATION')) {
        const generic = entity as GenericEntity;
        if (generic.display)
            return generic.display;
        if (generic.value)
            return generic.value;
    }
    return String(entity);
}

/**
 * Abstract class capable of allocating entity numbers when converting
 * ThingTalk code to NN syntax (which uses numbered entities matching the input sentence).
 */
export abstract class AbstractEntityRetriever {
    protected _syntaxType : SyntaxType.Tokenized|SyntaxType.LegacyNN;
    protected _timezone : string;

    constructor(options : {
        timezone : string|undefined
    }) {
        this._timezone = options.timezone ?? Temporal.Now.timeZone().id;
        this._syntaxType = SyntaxType.LegacyNN;
    }

    get timezone() {
        return this._timezone;
    }

    setSyntaxType(syntaxType : SyntaxType.Tokenized|SyntaxType.LegacyNN) {
        this._syntaxType = syntaxType;
    }

    /**
     * Find the entity with the given `entityType` (USERNAME, HASHTAG, etc.) and value.
     *
     * @param entityType - the type of entity to retrieve
     * @param value - the value to retrieve
     * @param options - additional options
     * @param options.ignoreNotFound - return `null` if the entity is not found, instead
     *   of throwing an exception.
     * @return the list of tokens making up this entity.
     */
    abstract findEntity(entityType : string, value : AnyEntity, options : { ignoreNotFound : true, includeEntityValue ?: boolean }) : List<string>|null;
    abstract findEntity(entityType : string, value : AnyEntity, options ?: { ignoreNotFound ?: false, includeEntityValue ?: boolean }) : List<string>;
}

/**
 * Entity retriever that looks for an entity in the tokenized entities, if any, and then
 * falls back to string matching in the sentence.
 */
export class EntityRetriever extends AbstractEntityRetriever {
    sentence : string[];
    entities : EntityMap;

    constructor(sentence : string|string[], entities : EntityMap, options : {
        timezone : string|undefined
    }) {
        super(options);
        if (typeof sentence === 'string')
            sentence = sentence.split(' ');
        this.sentence = sentence;

        this.entities = {};
        Object.assign(this.entities, entities);
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
     * @return the tokens to predict, or `undefined` if the entity is not mentioned in the sentence.
     */
    protected _findEntityFromSentence(entityType : string, entityString : string, ignoreNotFound : boolean) : string[]|undefined {
        const entityTokens = entityString.toLowerCase().split(' ');
        const found = this._sentenceContains(entityTokens);
        if (found)
            return entityTokens;
        else
            return undefined;
    }

    /**
     * Match a numeric entity from the sentence.
     *
     * This method should search for a mention of the number in the sentence, and return the value
     * to predict in NN-syntax, or `undefined` if the entity is not mentioned.
     * This method can be overridden to implement custom tokenization or normalization.
     *
     * @param {string} entityType - the numeric entity type (NUMBER, MEASURE, CURRENCY, etc.)
     * @param {number} number - the number to search
     * @param {boolean} ignoreNotFound - ignore if the number is not mentioned; subclasses can
     *   use this to hallucinate entities that are not mentioned, when `ignoreNotFound` is false
     * @return the tokens to predict, or `undefined` if the entity is not mentioned in the sentence.
     */
    protected _findNumberFromSentence(entityType : string, number : number, ignoreNotFound : boolean) : string[]|undefined {
        // by default, we normalize using JS syntax for numbers: "." for decimal
        // separator, and no thousand separator
        const entityTokens = [String(number)];
        const found = this._sentenceContains(entityTokens);
        if (found)
            return entityTokens;
        else
            return undefined;
    }

    private  _findStringLikeEntity(entityType : string,
                                   entity : AnyEntity,
                                   entityString : string,
                                   ignoreNotFound : boolean,
                                   includeEntityValue : boolean) : List<string>|undefined {
        if (entityType === 'DATE') {
            const dateStr = (entity as Date).toISOString();
            if (this._sentenceContains([dateStr]))
                return List.concat('new', 'Date', '(', '"', dateStr, '"', ')');
        }
        if (entityType === 'NUMBER') {
            const found = this._findNumberFromSentence(entityType, entity as number, ignoreNotFound);
            if (found) // ignore the returned tokens, and always predict normalized English-like syntax
                return List.singleton(String(entity));
        }
        if (entityType === 'CURRENCY' || entityType === 'DURATION' || entityType.startsWith('MEASURE_')) {
            const measure = entity as MeasureEntity;
            const found = this._findNumberFromSentence(entityType, measure.value, ignoreNotFound);
            if (found) // ignore the returned tokens, and always predict normalized English-like syntax
                return List.concat(String(measure.value), entityType === 'CURRENCY' ? ('$' + measure.unit) : measure.unit);
        }

        if (entityType === 'QUOTED_STRING' || entityType === 'HASHTAG' || entityType === 'USERNAME' ||
            entityType === 'PATH_NAME' || entityType === 'URL' || entityType === 'PHONE_NUMBER' ||
            entityType === 'EMAIL_ADDRESS' || entityType === 'LOCATION' || entityType.startsWith('GENERIC_ENTITY_')) {

            const found = this._findEntityFromSentence(entityType, entityString, ignoreNotFound);
            if (found) {
                if (entityType === 'QUOTED_STRING')
                    return List.concat('"', ...found, '"');
                else if (entityType === 'HASHTAG')
                    return List.concat('"', ...found, '"', '^^tt:hashtag');
                else if (entityType === 'USERNAME')
                    return List.concat('"', ...found, '"', '^^tt:username');
                else if (entityType === 'PATH_NAME')
                    return List.concat('"', ...found, '"', '^^tt:path_name');
                else if (entityType === 'URL')
                    return List.concat('"', ...found, '"', '^^tt:url');
                else if (entityType === 'PHONE_NUMBER')
                    return List.concat('"', ...found, '"', '^^tt:phone_number');
                else if (entityType === 'EMAIL_ADDRESS')
                    return List.concat('"', ...found, '"', '^^tt:email_address');

                if (this._syntaxType === SyntaxType.LegacyNN) {
                    if (entityType === 'LOCATION')
                        return List.concat('location:', '"', ...found, '"');
                    else
                        return List.concat('"', ...found, '"', '^^' + entityType.substring('GENERIC_ENTITY_'.length));
                } else {
                    if (entityType === 'LOCATION') {
                        return List.concat('new', 'Location', '(', '"', ...found, '"', ')');
                    } else {
                        const genericEntity = entity as GenericEntity;
                        const entityId = includeEntityValue && genericEntity.value ? [ '"', ...genericEntity.value.split(' '), '"'] : ['null'];
                        return List.concat(...entityId, '^^' + entityType.substring('GENERIC_ENTITY_'.length), '(', '"', ...found, '"', ')');
                    }
                }
            }
        }

        // always predict (not copy) these entities if they are missing from the sentence
        // (the neural model will learn the names of the devices
        if (entityType === 'GENERIC_ENTITY_tt:device') {
            const value = (entity as GenericEntity).value!;
            if (this._syntaxType === SyntaxType.LegacyNN)
                return List.singleton('device:' + value);
            else
                return List.singleton('@' + value);
        }
        if (entityType === 'GENERIC_ENTITY_tt:function') {
            const value = (entity as GenericEntity).value!;
            if (this._syntaxType === SyntaxType.LegacyNN) {
                return List.singleton('@' + value);
            } else {
                const dot = value.lastIndexOf('.');
                const kind = value.substring(0, dot);
                const name = value.substring(dot+1, value.length);
                return List.concat('@' + kind, '.', name);
            }
        }

        return undefined;
    }

    private _findEntityInBag(entityType : string, value : AnyEntity, entities : EntityMap) : List<string>|undefined {
        for (const what in entities) {
            if (!what.startsWith(entityType + '_'))
                continue;

            if (entitiesEqual(entityType, entities[what], value, this._timezone))
                return List.singleton(what);
        }
        return undefined;
    }

    findEntity(entityType : string, entity : AnyEntity, options : { ignoreNotFound : true, includeEntityValue ?: boolean }) : List<string>|null;
    findEntity(entityType : string, entity : AnyEntity, options ?: { ignoreNotFound ?: false, includeEntityValue ?: boolean }) : List<string>;
    findEntity(entityType : string, entity : AnyEntity, { ignoreNotFound = false, includeEntityValue = false } = {}) : List<string>|null {
        const entityString = entityToString(entityType, entity);

        // try in the sentence before we look in the bag of entities (which comes from the context)
        // this is so that we predict
        // " foo " ^^tt:whatever
        // if the sentence contains "foo", regardless of whether GENERIC_ENTITY_tt:whatever_0 is "foo" or not
        let found = this._findStringLikeEntity(entityType, entity, entityString, true, includeEntityValue);
        if (found)
            return found;

        found = this._findEntityInBag(entityType, entity, this.entities);
        if (found)
            return found;

        if (ignoreNotFound)
            return null;

        if (entityType.startsWith('GENERIC_ENTITY_') && this._syntaxType === SyntaxType.Tokenized) {
            const genericEntity = entity as GenericEntity;
            if (genericEntity.display) {
                found = this._findEntityInBag('QUOTED_STRING', genericEntity.display, this.entities);
                if (found) {
                    const entityId = includeEntityValue && genericEntity.value ? ['"', genericEntity.value, '"'] : ['null'];
                    return List.concat(...entityId, '^^' + entityType.substring('GENERIC_ENTITY_'.length), '(', found, ')');
                }
            }
        }

        found = this._findStringLikeEntity(entityType, entity, entityString, false, includeEntityValue);
        if (found)
            return found;

        throw new Error(`Cannot find entity ${entityString} of type ${entityType}, have ${util.inspect(this.entities)}`);
    }
}

export class SequentialEntityAllocator extends AbstractEntityRetriever {
    offsets : { [key : string] : number };
    entities : EntityMap;
    explicitStrings : boolean;

    constructor(entities : EntityMap, options : {
        timezone : string|undefined,
        explicitStrings ?: boolean
    }) {
        super(options);
        this.offsets = {};
        this.entities = entities;
        this.explicitStrings = !!options.explicitStrings;
        this.updateOffsets();
    }

    reset() {
        this.offsets = {};
        this.entities = {};
    }

    private updateOffsets() : void {
        for (const entity in this.entities) {
            const entityType = entity.slice(0, entity.lastIndexOf('_'));
            const offset = entity.slice(entity.lastIndexOf('_') + 1);
            assert(/^\d+$/.test(offset));
            this.offsets[entityType] = Math.max((this.offsets[entityType] || -1), parseInt(offset) + 1);
        }
    }

    findEntity(entityType : string, entity : AnyEntity, { ignoreNotFound = false, includeEntityValue = false } = {}) : List<string> {
        if (this.explicitStrings &&
            (entityType === 'QUOTED_STRING' || entityType === 'HASHTAG' || entityType === 'USERNAME' ||
            entityType === 'LOCATION' || entityType.startsWith('GENERIC_ENTITY_'))) {
            const entityString = entityToString(entityType, entity).split(' ');

            if (entityType === 'QUOTED_STRING')
                return List.concat('"', ...entityString, '"');
            else if (entityType === 'HASHTAG')
                return List.concat('"', ...entityString, '"', '^^tt:hashtag');
            else if (entityType === 'USERNAME')
                return List.concat('"', ...entityString, '"', '^^tt:username');

            if (this._syntaxType === SyntaxType.LegacyNN) {
                if (entityType === 'LOCATION')
                    return List.concat('location:', '"', ...entityString, '"');
                else
                    return List.concat('"', ...entityString, '"', '^^' + entityType.substring('GENERIC_ENTITY_'.length));
            } else {
                if (entityType === 'LOCATION') {
                    return List.concat('new', 'Location', '(', '"', ...entityString, '"', ')');
                } else {
                    const genericEntity = entity as GenericEntity;
                    const entityId = includeEntityValue && genericEntity.value ? ['"', genericEntity.value, '"'] : ['null'];
                    return List.concat(...entityId, '^^' + entityType.substring('GENERIC_ENTITY_'.length), '(', '"', ...entityString, '"', ')');
                }
            }
        }

        for (const what in this.entities) {
            if (!what.startsWith(entityType + '_'))
                continue;

            if (entitiesEqual(entityType, this.entities[what], entity, this._timezone))
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
