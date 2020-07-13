// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
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
"use strict";

const assert = require('assert');
const util = require('util');

const { parseDate } = require('../date_utils');

const List = require('./list');

// convert AST values to on-the-wire entities, as returned by almond-tokenizer
// the two are mostly the same, except for some weird historical stuff where
// units are sometimes called codes and similar
function valueToEntity(type, value) {
    if (type === 'CURRENCY')
        return { unit: value.code, value: value.value };
    if (type === 'LOCATION') {
        if (value.value.isAbsolute)
            return { latitude: value.value.lat, longitude: value.value.lon, display: value.value.display };
        else // isUnresolved (because isRelative is handled elsewhere) - note that NaN !== NaN so this will never match (which is the goal)
            return { latitude: NaN, longitude: NaN, display: value.value.name };
    }
    if (type === 'DURATION' ||
        type.startsWith('MEASURE_'))
        return { unit: value.unit, value: value.value };
    if (type === 'TIME') // isRelative is handled elsewhere
        return { hour: value.value.hour, minute: value.value.minute, second: value.value.second };
    if (type.startsWith('GENERIC_ENTITY_'))
        return { value: value.value, display: value.display };

    return value.value;
}

function entitiesEqual(type, one, two) {
    if (one === two)
        return true;
    if (!one || !two)
        return false;
    if (type.startsWith('GENERIC_ENTITY_')) {
        if (!one.value && !two.value)
            return one.display === two.display;
        return (one.value === two.value);
    }

    if (type.startsWith('MEASURE_') ||
        type === 'DURATION')
        return one.value === two.value && one.unit === two.unit;

    switch (type) {
    case 'CURRENCY':
        return one.value === two.value && one.unit === two.unit;
    case 'TIME':
        return one.hour === two.hour &&
            one.minute === two.minute &&
            (one.second || 0) === (two.second || 0);
    case 'DATE':
        if (!(one instanceof Date))
            one = parseDate(one);
        if (!(two instanceof Date))
            two = parseDate(two);

        return +one === +two;
    case 'LOCATION':
        if (isNaN(one.latitude) && isNaN(two.latitude) && isNaN(one.longitude) && isNaN(two.longitude))
            return one.display === two.display;
        return Math.abs(one.latitude - two.latitude) < 0.01 &&
            Math.abs(one.longitude - two.longitude) < 0.01;
    }

    return false;
}

function entityToString(entityType, entity) {
    let entityString;

    if ((entityType.startsWith('GENERIC_ENTITY_') || entityType === 'LOCATION') && entity.display)
        entityString = entity.display;
    else
        entityString = String(entity);

    return entityString;
}

/**
 * Abstract class capable of allocating entity numbers when converting
 * ThingTalk code to NN syntax (which uses numbered entities matching the input sentence).
 *
 * @alias NNSyntax.AbstractEntityRetriever
 */
class AbstractEntityRetriever {
    /* instanbul ignore next */
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
    findEntity(entityType, value) {
        throw new Error('abstract method');
    }
}

/**
 * Entity retriever that looks for an entity in the tokenized entities, if any, and then
 * falls back to string matching in the sentence.
 *
 * @alias NNSyntax.EntityRetriever
 * @extends NNSyntax.AbstractEntityRetriever
 */
class EntityRetriever extends AbstractEntityRetriever {
    constructor(sentence, entities) {
        super();
        if (typeof sentence === 'string')
            sentence = sentence.split(' ');
        this.sentence = sentence;

        this.entities = {};
        Object.assign(this.entities, entities);

        this._used = {};
    }

    _sentenceContains(tokens) {
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
    _findEntityFromSentence(entityType, entityString, ignoreNotFound) {
        const entityTokens = entityString.toLowerCase().split(' ');
        let found = this._sentenceContains(entityTokens);
        if (found)
            return entityTokens.join(' ');
        else
            return undefined;
    }

    _findStringLikeEntity(entityType, entity, entityString, ignoreNotFound) {
        if (entityType === 'DATE') {
            const dateStr = entity.toISOString();
            if (this._sentenceContains([dateStr]))
                return List.concat('new', 'Date', '(', '"', dateStr, '"', ')');
        }

        if (entityType === 'QUOTED_STRING' || entityType === 'HASHTAG' || entityType === 'USERNAME' ||
            entityType === 'LOCATION' ||
            (entityType.startsWith('GENERIC_ENTITY_') && entity.display)) {

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

    _findEntityInBag(entityType, value, entities) {
        let candidates = [];

        for (let what in entities) {
            if (!what.startsWith(entityType + '_'))
                continue;

            if (entitiesEqual(entityType, entities[what], value))
                candidates.push(what);
        }
        return candidates;
    }

    findEntity(entityType, value, { ignoreNotFound = false }) {
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

            let reuse = this._findEntityInBag(entityType, entity, this._used);
            if (reuse.length > 0) {
                if (reuse.length > 1)
                    throw new Error('Ambiguous entity ' + entity + ' of type ' + entityType);
                return reuse[0];
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
            let result = candidates.shift();
            this._used[result] = this.entities[result];
            delete this.entities[result];
            return result;
        }
    }
}

class SequentialEntityAllocator extends AbstractEntityRetriever {
    constructor(entities, explicitStrings = false) {
        super();
        this.offsets = {};
        this.entities = entities;
        this.explicitStrings = explicitStrings;
        this.updateOffsets();
    }

    updateOffsets() {
        for (let entity in this.entities ) {
            const entityType = entity.slice(0, entity.lastIndexOf('_'));
            const offset = entity.slice(entity.lastIndexOf('_') + 1);
            assert(/^\d+$/.test(offset));
            this.offsets[entityType] = Math.max((this.entities[entityType] || -1), parseInt(offset) + 1);
        }
    }

    findEntity(entityType, value, { ignoreNotFound = false }) {
        const entity = valueToEntity(entityType, value);

        if (this.explicitStrings) {
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

        for (let what in this.entities) {
            if (!what.startsWith(entityType + '_'))
                continue;

            if (entitiesEqual(entityType, this.entities[what], entity))
                return what;
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
        return key;
    }
}

module.exports = {
    AbstractEntityRetriever,
    EntityRetriever,
    SequentialEntityAllocator
};
