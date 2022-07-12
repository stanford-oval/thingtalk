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

import Type from '../type';
import { toTemporalInstant } from '@js-temporal/polyfill';

import {
    AbstractEntityRetriever,
} from '../entity-retriever';

import {
    TokenStream,
    ConstantToken,
    AnyConstantToken
} from './tokenstream';
import List from '../utils/list';

// small integers are predicted/translated by the neural network, while
// large integers are copied using NUMBER_* tokens
function isSmallPositiveInteger(value : number) : boolean {
    // the ceiling of 12 is chosen so all hours of the day are small integers
    // this way, we can predict times and numbers more or less indistinguishably
    return Math.floor(value) === value && value >= 0 && value <= 12;
}

function findNumber(value : number, entityRetriever : AbstractEntityRetriever, ignoreNotFound = false) : List<string> {
    if (isSmallPositiveInteger(value))
        return List.singleton(String(value));

    // if negative, try both ways, with preference on the positive value
    if (value < 0) {
        if (isSmallPositiveInteger(-value))
            return List.concat('-', String(-value));

        const found = entityRetriever.findEntity('NUMBER', -value, { ignoreNotFound: true });
        if (found !== null)
            return List.concat('-', found);
    }
    if (ignoreNotFound) {
        const found = entityRetriever.findEntity('NUMBER', value, { ignoreNotFound: true });
        if (found)
            return found;
        return List.singleton(String(value));
    } else {
        return entityRetriever.findEntity('NUMBER', value, { ignoreNotFound: false });
    }
}

function findYear(year : number, entityRetriever : AbstractEntityRetriever) : List<string> {
    // the rules for encoding years are complex to account for two digit years
    // (between 1950 and 2050)

    // no heuristic outside that range
    if (!(year >= 1950 && year < 2050))
        return entityRetriever.findEntity('NUMBER', year);

    // try as four digit number
    const found4digit = entityRetriever.findEntity('NUMBER', year, { ignoreNotFound: true });
    if (found4digit)
        return found4digit;

    // try as two digit number
    const twoDigitYear = year < 2000 ? year - 1900 : year - 2000;
    const found2digit = entityRetriever.findEntity('NUMBER', twoDigitYear, { ignoreNotFound: true });
    if (found2digit)
        return found2digit;

    // now, if the two digit year is a small number, we'll take it
    if (isSmallPositiveInteger(twoDigitYear))
        return List.singleton(String(twoDigitYear));

    // else, try again as 4 digit number - this will fail with an exception now
    return entityRetriever.findEntity('NUMBER', year);
}

function findEntity(constant : AnyConstantToken,
                    entityRetriever : AbstractEntityRetriever,
                    options ?: { includeEntityValue ?: boolean, excludeEntityDisplay ?: boolean }) : List<string> {
    switch (constant.name) {
    case 'QUOTED_STRING':
        if (constant.value === '')
            return List.singleton('""');
        // fall through
    case 'PICTURE':
    case 'USERNAME':
    case 'HASHTAG':
    case 'URL':
    case 'PHONE_NUMBER':
    case 'EMAIL_ADDRESS':
    case 'PATH_NAME':
    case 'LOCATION':
        return entityRetriever.findEntity(constant.name, constant.value);
    case 'GENERIC_ENTITY': {
        const entity = constant.value;
        return entityRetriever.findEntity(constant.name + '_' + entity.type, {
            // remove "type" property from entity
            value: entity.value,
            display: entity.display
        }, options);
    }

    case 'NUMBER':
        return findNumber(constant.value, entityRetriever);
    case 'MEASURE': {
        const measure = constant.value;
        const baseunit = new Type.Measure(measure.unit).unit;
        if (baseunit === 'ms') {
            const found = entityRetriever.findEntity('DURATION', measure, { ignoreNotFound: true });
            if (found)
                return found;
        } else {
            const found = entityRetriever.findEntity('MEASURE_' + baseunit, measure, { ignoreNotFound: true });
            if (found)
                return found;
        }
        return List.concat(findNumber(measure.value, entityRetriever), measure.unit);
    }
    case 'CURRENCY': {
        const currency = constant.value;
        const found = entityRetriever.findEntity('CURRENCY', currency, { ignoreNotFound: true });
        if (found)
            return found;
        return List.concat(findNumber(currency.value, entityRetriever), '$' + currency.unit);
    }
    case 'DATE': {
        const date = constant.value;
        const found = entityRetriever.findEntity('DATE', date, { ignoreNotFound: true });
        if (found)
            return found;

        const str = entityRetriever.findEntity('QUOTED_STRING', date.toISOString(), { ignoreNotFound: true });
        if (str)
            return List.concat('new', 'Date', '(', str, ')');

        const datetz = toTemporalInstant.call(date).toZonedDateTime({
            calendar: 'iso8601',
            timeZone: entityRetriever.timezone
        });

        let syntax = List.concat('new', 'Date', '(', findYear(datetz.year, entityRetriever));
        if (datetz.month !== 1 || datetz.day !== 1 || datetz.hour !== 0 && datetz.minute !== 0 || datetz.second !== 0)
            syntax = List.concat(syntax, ',', findNumber(datetz.month, entityRetriever));
        if (datetz.day !== 1 || datetz.hour !== 0 && datetz.minute !== 0 || datetz.second !== 0)
            syntax = List.concat(syntax, ',', findNumber(datetz.day, entityRetriever));
        if (datetz.hour !== 0 || datetz.minute !== 0 || datetz.second !== 0)
            syntax = List.concat(syntax, ',', findEntity(new ConstantToken('TIME', { hour: datetz.hour, minute: datetz.minute, second: datetz.second }), entityRetriever));
        syntax = List.concat(syntax, ')');
        return syntax;
    }
    case 'TIME': {
        const time = constant.value;
        const found = entityRetriever.findEntity('TIME', time, { ignoreNotFound: true });
        if (found)
            return found;
        if (time.second !== 0) {
            return List.concat('new', 'Time', '(',
                findNumber(time.hour, entityRetriever, true), ',',
                findNumber(time.minute, entityRetriever, true), ',',
                findNumber(time.second, entityRetriever, true), ')');
        } else {
            return List.concat('new', 'Time', '(',
                findNumber(time.hour, entityRetriever, true), ',',
                findNumber(time.minute, entityRetriever, true), ')');
        }
    }

    default:
        // statically provable that this is impossible, but the linter does not like that
        throw new TypeError(`Unrecognized entity type`);
    }
}

export function nnSerialize(tokens : TokenStream,
                            entityRetriever : AbstractEntityRetriever,
                            options ?: { includeEntityValue ?: boolean, excludeEntityDisplay ?: boolean }) : string[] {
    const output = [];

    for (const token of tokens) {
        if (typeof token === 'string') {
            // ignore the prettyprinting control tokens
            switch (token) {
            case ' ': // explicitly add a space
            case '\t+': // increase basic indentation
            case '\t-': // decrease basic indentation
            case '\t=+': // add a tab stop at the current position
            case '\t=-': // remove a previously added tab stop
            case '\n-': // remove the last newline
            case '\n':
                continue;
            default:
            }

            if (/[ \n\t]/.test(String(token)))
                throw new Error(`Invalid control token "${token}"`);

            output.push(token);
        } else {
            findEntity(token, entityRetriever, options).traverse((tok) => {
                output.push(tok);
            });
        }
    }

    return output;
}
