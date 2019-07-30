// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingTalk
//
// Copyright 2017-2018 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

class TokenWrapper {
    constructor(token, value, location) {
        this.token = token;
        this.value = value;
        this.location = location;
    }

    toString() {
        return this.token;
    }
}

module.exports = class SequenceLexer {
    constructor(sequence, entities) {
        this._sequence = sequence;
        if (!Array.isArray(sequence))
            this._sequence = Array.from(sequence);

        if (typeof entities !== 'function') {
            this._entities = (next) => {
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

    next() {
        if (this._i >= this._sequence.length)
            return { done: true };

        let next = this._sequence[this._i++];
        if (next === '"') {
            this._instring = !this._instring;
        } else if (this._instring) {
            next = new TokenWrapper('WORD', next, this._i);
        } else if (/^[0-9]+$/.test(next) && next !== '0' && next !== '1') {
            next = new TokenWrapper('LITERAL_INTEGER', parseInt(next));
        } else if (/^TIME:[0-9]{1,2}:[0-9]{1,2}:[0-9]{1,2}$/.test(next)) {
            next = new TokenWrapper('LITERAL_TIME', next);
        } else if (/^[A-Z]/.test(next)) {
            // check if we have a unit next, to pass to the entity retriever
            let unit = null;
            // note that this._i has already been increased
            if (this._i < this._sequence.length && this._sequence[this._i].startsWith('unit:'))
                unit = this._sequence[this._i].substring('unit:'.length);

            // entity
            const entity = this._entities(next, this._lastparam, this._lastfunction, unit);
            const entityType = next.substring(0, next.lastIndexOf('_'));
            if (entityType.startsWith('GENERIC_ENTITY_')) {
                next = new TokenWrapper('GENERIC_ENTITY', {
                    value: entity.value,
                    display: entity.display,
                    type: entityType.substring('GENERIC_ENTITY_'.length)
                });
            } else if (entityType.startsWith('MEASURE_')) {
                next = new TokenWrapper('MEASURE', entity);
            } else {
                next = new TokenWrapper(entityType, entity);
            }
        } else if (next.startsWith('@')) {
            this._lastfunction = next;
            let lastPeriod = next.lastIndexOf('.');
            let kind = next.substring(1, lastPeriod);
            let channel = next.substring(lastPeriod+1);
            if (!kind || !channel)
                throw new Error('Invalid function ' + next);
            if (channel === '*')
                next = new TokenWrapper('CLASS_STAR', kind);
            else
                next = new TokenWrapper('FUNCTION', { kind, channel });
        } else if (next.startsWith('enum:')) {
            next = new TokenWrapper('ENUM', next.substring('enum:'.length));
        } else if (next.startsWith('param:')) {
            let [,paramname,] = next.split(':');
            this._lastparam = paramname;
            next = new TokenWrapper('PARAM_NAME', paramname);
        } else if (next.startsWith('unit:')) {
            next = new TokenWrapper('UNIT', next.substring('unit:'.length));
        } else if (next.startsWith('device:')) {
            next = new TokenWrapper('DEVICE', next.substring('device:'.length));
        } else if (next.startsWith('special:')) {
            next = new TokenWrapper('SPECIAL', next.substring('special:'.length));
        } else if (next.startsWith('^^')) {
            next = new TokenWrapper('ENTITY_TYPE', next.substring('^^'.length));
        }
        return { done: false, value: next };
    }
};
