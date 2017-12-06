// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingEngine
//
// Copyright 2017 Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const NNOutputParser = require('./nn_output_parser');

class TokenWrapper {
    constructor(token, value) {
        this.token = token;
        this.value = value;
    }

    toString() {
        return this.token;
    }
}

class SequenceLexer {
    constructor(sequence, entities) {
        this._sequence = sequence;
        this._entities = entities;
        this._i = 0;
    }

    next() {
        if (this._i >= this._sequence.length)
            return { done: true };

        let next = this._sequence[this._i++];
        if (/^[A-Z]/.test(next)) {
            // entity
            if (!(next in this._entities))
                throw new SyntaxError('Invalid entity ' + next);

            const entityType = next.substring(0, next.lastIndexOf('_'));
            next = new TokenWrapper(entityType, this._entities[next]);
        } else if (next.startsWith('@')) {
            let lastPeriod = next.lastIndexOf('.');
            let kind = next.substring(1, lastPeriod);
            let channel = next.substring(lastPeriod+1);
            if (!kind || !channel)
                throw new Error('Invalid function ' + next);
            next = new TokenWrapper('FUNCTION', { kind, channel });
        } else if (next.startsWith('enum:')) {
            next = new TokenWrapper('ENUM', next.substring('enum:'.length));
        } else if (next.startsWith('param:')) {
            next = new TokenWrapper('PARAM_NAME', next.substring('param:'.length));
        } else if (next.startsWith('unit:')) {
            next = new TokenWrapper('UNIT', next.substring('unit:'.length));
        }
        return { done: false, value: next };
    }
}


function fromNN(sequence, entities) {
    let parser = new NNOutputParser();
    return parser.parse({
        [Symbol.iterator]() {
            return new SequenceLexer(sequence, entities);
        }
    });
}

function toNN(program) {
    // do something
    return { sequence: [], entities: {} };
}

module.exports = {
    fromNN,
    toNN
};
