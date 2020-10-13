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

import Type from '../type';

import { SourceRange } from '../utils/source_locations';
import { AnyEntity, GenericEntity, EntityMap, EntityResolver } from '../entities';

interface FunctionToken {
    kind : string;
    channel : string;
}

interface ContextRefToken {
    name : string;
    type : Type;
}

interface GenericEntityToken {
    name : string;
    value : string;
    type : string;
}

type TokenValue = AnyEntity | GenericEntityToken | FunctionToken | ContextRefToken;

class TokenWrapper {
    location : SourceRange;

    constructor(public token : string,
                public value : TokenValue,
                location ?: number) {
        this.location = {
            start: {
                offset: 0,
                line: 0,
                column: 0,
                token: location
            },
            end: {
                offset: 0,
                line: 0,
                column: 0,
                token: location
            }
        };
    }

    toString() : string {
        return this.token;
    }
}

function isEntity(token : string) : boolean {
    // an entity is a token that starts with a fully uppercase word followed by _, followed by other stuff
    return /^[A-Z]+_/.test(token);
}


export default class SequenceLexer implements Iterator<TokenWrapper> {
    private _sequence : string[];
    private _entities : EntityResolver;
    private _i : number;
    private _lastfunction : string|null;
    private _lastparam : string|null;
    private _instring : boolean;

    constructor(sequence : Iterable<string>, entities : EntityResolver|EntityMap) {
        if (Array.isArray(sequence))
            this._sequence = sequence;
        else
            this._sequence = Array.from(sequence);

        if (typeof entities !== 'function') {
            this._entities = (next : string) : AnyEntity => {
                if (!(next in entities)) {
                    if (next.startsWith('SLOT_'))
                        return undefined;
                    throw new SyntaxError('Invalid entity ' + next + ', have ' + Object.keys(entities));
                }
                return entities[next];
            };
        } else {
            this._entities = entities;
        }

        this._i = 0;
        this._lastfunction = null;
        this._lastparam = null;
        this._instring = false;
    }

    next() : IteratorResult<TokenWrapper> {
        if (this._i >= this._sequence.length)
            return { done: true, value: undefined };

        const token = this._sequence[this._i++];
        let next : TokenWrapper|string = token;

        if (token === '"') {
            this._instring = !this._instring;
        } else if (this._instring) {
            next = new TokenWrapper('WORD', token, this._i);
        } else if (/^[0-9]+$/.test(next) && token !== '0' && token !== '1') {
            next = new TokenWrapper('LITERAL_INTEGER', parseInt(token));
        } else if (/^time:[0-9]{1,2}:[0-9]{1,2}:[0-9]{1,2}$/.test(token)) {
            // need to remove 'time:' prefix because parser.lr uses split(':')[0] for hour
            next = new TokenWrapper('LITERAL_TIME', token.replace('time:', ''));
        } else if (isEntity(token)) {
            // check if we have a unit next, to pass to the entity retriever
            let unit : string|null = null;
            // note that this._i has already been increased
            if (this._i < this._sequence.length && this._sequence[this._i].startsWith('unit:'))
                unit = this._sequence[this._i].substring('unit:'.length);

            // entity
            const entity = this._entities(token, this._lastparam, this._lastfunction, unit);
            const entityType = token.substring(0, token.lastIndexOf('_'));
            if (entityType.startsWith('GENERIC_ENTITY_')) {
                const generic = entity as GenericEntity;
                next = new TokenWrapper('GENERIC_ENTITY', {
                    value: generic.value,
                    display: generic.display,
                    type: entityType.substring('GENERIC_ENTITY_'.length)
                });
            } else if (entityType.startsWith('MEASURE_')) {
                next = new TokenWrapper('MEASURE', entity);
            } else {
                next = new TokenWrapper(entityType, entity);
            }
        } else if (token.startsWith('@')) {
            this._lastfunction = token;
            const lastPeriod = token.lastIndexOf('.');
            const kind = token.substring(1, lastPeriod);
            const channel = token.substring(lastPeriod+1);
            if (!kind || !channel)
                throw new Error('Invalid function ' + token);
            if (channel === '*')
                next = new TokenWrapper('CLASS_STAR', kind);
            else
                next = new TokenWrapper('FUNCTION', { kind, channel });
        } else if (next.startsWith('enum:')) {
            next = new TokenWrapper('ENUM', token.substring('enum:'.length));
        } else if (next.startsWith('param:')) {
            const [,paramname,] = next.split(':');
            this._lastparam = paramname;
            next = new TokenWrapper('PARAM_NAME', paramname);
        } else if (next.startsWith('attribute:')) {
            const [,paramname,] = next.split(':');
            this._lastparam = paramname;
            next = new TokenWrapper('ATTRIBUTE_NAME', paramname);
        } else if (next.startsWith('unit:$')) {
            next = new TokenWrapper('CURRENCY_CODE', token.substring('unit:$'.length));
        } else if (next.startsWith('unit:')) {
            next = new TokenWrapper('UNIT', token.substring('unit:'.length));
        } else if (next.startsWith('device:')) {
            next = new TokenWrapper('DEVICE', token.substring('device:'.length));
        } else if (next.startsWith('special:')) {
            next = new TokenWrapper('SPECIAL', token.substring('special:'.length));
        } else if (next.startsWith('context:')) {
            const withoutPrefix = token.substring('context:'.length);
            const colon = withoutPrefix.indexOf(':');
            const name = withoutPrefix.substring(0, colon);
            const type = Type.fromString(withoutPrefix.substring(colon+1));
            next = new TokenWrapper('CONTEXT_REF', { name, type });
        } else if (next.startsWith('^^')) {
            next = new TokenWrapper('ENTITY_TYPE', token.substring('^^'.length));
        }

        if (typeof next === 'string')
            next = new TokenWrapper(next, next);
        return { done: false, value: next };
    }
}
