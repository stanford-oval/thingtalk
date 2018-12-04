// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingTalk
//
// Copyright 2017 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const adt = require('adt');
const util = require('util');

const Ast = require('./ast');
const Type = require('./type');
const NNOutputParser = require('./nn_output_parser');
const { parseDate } = require('./date_utils');

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
            next = new TokenWrapper('WORD', next);
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
        } else if (next.startsWith('^^')) {
            next = new TokenWrapper('ENTITY_TYPE', next.substring('^^'.length));
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


// A lazy functional list
const List = adt.data(function() {
    return {
        Nil: null,
        Cons: {
            head: adt.any,
            tail: adt.only(this)
        },
        Snoc: {
            head: adt.only(this),
            tail: adt.any
        },
        Concat: {
            first: adt.only(this),
            second: adt.only(this)
        }
    };
});
List.prototype.flatten = function(into) {
    if (this.isNil)
        return into;
    if (this.isCons) {
        into.push(this.head);
        return this.tail.flatten(into);
    } else if (this.isSnoc) {
        this.head.flatten(into);
        into.push(this.tail);
        return into;
    } else if (this.isConcat) {
        this.first.flatten(into);
        return this.second.flatten(into);
    } else {
        throw new TypeError();
    }
};
List.prototype.getFirst = function() {
    if (this.isNil)
        return null;
    if (this.isCons)
        return this.head;
    if (this.isSnoc)
        return this.head.getFirst();
    if (this.isConcat)
        return this.first.getFirst();
    throw new TypeError();
};
List.concat = function(...lists) {
    let result = List.Nil;
    for (let i = lists.length-1; i >= 0; i--) {
        if (lists[i] instanceof List)
            result = List.Concat(lists[i], result);
        else
            result = List.Cons(lists[i], result);
    }
    return result;
};
List.singleton = function(el) {
    return List.Cons(el, List.Nil);
};

class UnsynthesizableError extends Error {
    constructor(what) {
        super(what + ' cannot be synthesized');
    }
}

function unescape(symbol) {
    return symbol.replace(/_([0-9a-fA-Z]{2}|_)/g, (match, ch) => {
        if (ch === '_') return ch;
        return String.fromCharCode(parseInt(ch, 16));
    });
}

function constantToNN(constant) {
    let measure = /__const_NUMBER_([0-9]+)__([a-z0-9A-Z]+)/.exec(constant);
    if (measure !== null)
        return List.concat('NUMBER_' + measure[1], 'unit:' + measure[2]);

    return List.singleton(unescape(constant.substring('__const_'.length)));
}

function filterToCNF(filter) {
    filter = (function pushDownNegations(expr) {
        if (expr.isNot) {
            if (expr.expr.isAtom || expr.expr.isExternal)
                return expr;
            if (expr.expr.isAnd)
                return Ast.BooleanExpression.Or(expr.expr.operands.map(pushDownNegations));
            if (expr.expr.isOr)
                return Ast.BooleanExpression.And(expr.expr.operands.map(pushDownNegations));
            if (expr.expr.isTrue)
                return Ast.BooleanExpression.False;
            if (expr.expr.isFalse)
                return Ast.BooleanExpression.True;
            throw new TypeError();
        } else if (expr.isAnd) {
            return Ast.BooleanExpression.And(expr.operands.map(pushDownNegations));
        } else if (expr.isOr) {
            return Ast.BooleanExpression.Or(expr.operands.map(pushDownNegations));
        } else {
            return expr;
        }
    })(filter);

    filter = filter.optimize();
    if (filter.isTrue || filter.isFalse)
        return filter;

    let clauses = [];
    let ands;
    if (!filter.isAnd)
        ands = [filter];
    else
        ands = filter.operands;

    for (let and of ands) {
        let currentClause = [];

        let ors;
        if (and.isOr)
            ors = and.operands;
        else
            ors = [and];

        for (let or of ors) {
            if (or.isNot || or.isAtom || or.isExternal) {
                currentClause.push(or);
                continue;
            }
            if (or.isOr) { // flatten
                ors.push(...or.operands);
                continue;
            }
            if (or.isAnd)
                throw new Error('TODO');
        }
        clauses.push(Ast.BooleanExpression.Or(currentClause));
    }
    return Ast.BooleanExpression.And(clauses);
}

class ToNNConverter {
    constructor(sentence, entities) {
        if (typeof sentence === 'string')
            sentence = sentence.split(' ');
        this.sentence = sentence;
        this.entities = entities;
    }

    findEntityFromSentence(entityType, value, display) {
        let entityString = entityType.startsWith('GENERIC_ENTITY_') ? display : value;
        if (entityType === 'QUOTED_STRING' || entityType === 'HASHTAG' || entityType === 'USERNAME' ||
            (entityType.startsWith('GENERIC_ENTITY_') && value === null && display)) {

            let entityTokens = entityString.split(' ');
            for (let i = 0; i <= this.sentence.length-entityTokens.length; i++) {
                let found = true;
                for (let j = 0; j < entityTokens.length; j++) {
                    if (entityTokens[j] !== this.sentence[i+j]) {
                        found = false;
                        break;
                    }
                }
                if (found) {
                    if (entityType === 'QUOTED_STRING')
                        return List.concat('"', entityString, '"');
                    else if (entityType === 'HASHTAG')
                        return List.concat('"', entityString, '"', '^^tt:hashtag');
                    else if (entityType === 'USERNAME')
                        return List.concat('"', entityString, '"', '^^tt:username');
                    else
                        return List.concat('"', entityString, '"', '^^' + entityType.substring('GENERIC_ENTITY_'.length));
                }
            }
        }
        throw new Error('Cannot find entity ' + entityString + ' of type ' + entityType + ', have ' + util.inspect(this.entities));
    }

    findEntity(entityType, value, display, entities, { ignoreNotFound = false, ignoreMultiple = true } = {}) {
        let candidates = [];

        for (let what in entities) {
            if (what === '$used')
                continue;
            if (!what.startsWith(entityType + '_'))
                continue;

            if (entities[what] === value)
                candidates.push(what);
            if (entityType.startsWith('GENERIC_ENTITY_') && entities[what].value === value)
                candidates.push(what);

            switch (entityType) {
            case 'DURATION':
                if (entities[what].value === value.value &&
                    entities[what].unit === value.unit)
                    candidates.push(what);
                break;
            case 'CURRENCY':
                if (entities[what].value === value.value &&
                    entities[what].unit === value.code)
                    candidates.push(what);
                break;
            case 'TIME':
                if (entities[what].hour === value.hour &&
                    entities[what].minute === value.minute &&
                    (entities[what].second || 0) === value.second)
                    candidates.push(what);
                break;
            case 'DATE':
                if (!(entities[what] instanceof Date))
                    entities[what] = parseDate(entities[what]);
                if (+entities[what] === +value)
                    candidates.push(what);
                break;
            case 'LOCATION':
                if (Math.abs(entities[what].latitude - value.lat) < 0.01 &&
                    Math.abs(entities[what].longitude - value.lon) < 0.01)
                    candidates.push(what);
                break;
            }
        }

        if (!ignoreMultiple && candidates.length > 1)
            throw new Error('Ambiguous entity ' + value + ' of type ' + entityType);

        if (ignoreNotFound && candidates.length === 0)
            return null;
        if (!ignoreMultiple)
            return candidates[0];

        if (candidates.length === 0) {
            // uh oh we don't have the entity we want
            // see if we have an used pile, and try there for an unambiguous one

            let reuse = this.findEntity(entityType, value, display, entities.$used || {}, { ignoreMultiple: false, ignoreNotFound: true });
            if (reuse !== null)
                return reuse;
            else if (entityType === 'GENERIC_ENTITY_tt:country' && value === 'uk')
                return this.findEntity(entityType, 'gb', display, entities);
            else
                return this.findEntityFromSentence(entityType, value, display);
        } else {
            if (!entities.$used)
                Object.defineProperty(entities, '$used', { value: {}, writable: true, enumerable: false });

            // move the first entity (in sentence order) from this pile to the
            candidates.sort();
            let result = candidates.shift();
            entities.$used[result] = entities[result];
            delete entities[result];
            return result;
        }
    }

    valueToNN(value, schema) {
        if (value.isArray) {
            let list = this.valueToNN(value.value[0]);
            for (let i = 1; i < value.value.length; i++)
                list = List.concat(list, ',', this.valueToNN(value.value[i]));
            return List.concat('[', list, ']');
        } else if (value.isVarRef) {
            if (value.name === null || value.name === 'null')
                throw new TypeError('???');
            if (value.name.startsWith('__const'))
                return constantToNN(value.name);
            else
                return `param:${value.name}:${schema.out[value.name]}`;
        } else if (value.isUndefined) {
            throw new UnsynthesizableError('undefined value');
        } else if (value.isBoolean) {
            return value.value ? 'true' : 'false';
        } else if (value.isMeasure) {
            if (value.value === 0)
                return List.concat('0', 'unit:' + value.unit);
            if (value.value === 1)
                return List.concat('1', 'unit:' + value.unit);
            if (value.getType().unit === 'ms') {
                let duration = this.findEntity('DURATION', value, null, this.entities, { ignoreNotFound: true });
                if (duration !== null)
                    return List.concat(duration);
            }
            return List.concat(this.findEntity('NUMBER', value.value, null, this.entities), 'unit:' + value.unit);
        } else if (value.isString) {
            if (value.value === '')
                return '""';
            return this.findEntity('QUOTED_STRING', value.value, null, this.entities);
        } else if (value.isCompoundMeasure) {
            let list = this.valueToNN(value.value[0]);
            for (let i = 1; i < value.value.length; i++)
                list = List.Concat(list, this.valueToNN(value.value[i]));
            return list;
        } else if (value.isNumber) {
            if (value.value === 0)
                return '0';
            if (value.value === 1)
                return '1';
            return this.findEntity('NUMBER', value.value, null, this.entities);
        } else if (value.isCurrency) {
            return this.findEntity('CURRENCY', value, null, this.entities);
        } else if (value.isLocation) {
            if (value.value.isRelative)
                return 'location:' + value.value.relativeTag;
            else
                return this.findEntity('LOCATION', value.value, null, this.entities);
        } else if (value.isDate) {
            let base;
            if (value.value === null)
                base = 'now';
            else if (value.value instanceof Ast.DateEdge)
                base = List.concat(value.value.edge, 'unit:' + value.value.unit);
            else
                base = this.findEntity('DATE', value.value, null, this.entities);
            let offset;
            if (value.offset === null)
                offset = List.Nil;
            else
                offset = List.Cons(value.operator, this.valueToNN(value.offset));
            return List.concat(base, offset);
        } else if (value.isTime) {
            return this.findEntity('TIME', value, null, this.entities);
        } else if (value.isEntity) {
            switch (value.type) {
            case 'tt:function':
            case 'tt:picture':
                throw new UnsynthesizableError('Constant of entity type ' + value.type);
            case 'tt:device':
                return 'device:' + value.value;
            case 'tt:username':
            case 'tt:contact_name':
                return this.findEntity('USERNAME', value.value, null, this.entities);
            case 'tt:hashtag':
                return this.findEntity('HASHTAG', value.value, null, this.entities);
            case 'tt:url':
                return this.findEntity('URL', value.value, null, this.entities);
            case 'tt:phone_number':
                return this.findEntity('PHONE_NUMBER', value.value, null, this.entities);
            case 'tt:email_address':
                return this.findEntity('EMAIL_ADDRESS', value.value, null, this.entities);
            case 'tt:path_name':
                return this.findEntity('PATH_NAME', value.value, null, this.entities);
            default:
                return this.findEntity('GENERIC_ENTITY_' + value.type, value.value, value.display, this.entities);
            }
        } else if (value.isEnum) {
            return 'enum:' + value.value;
        } else if (value.isEvent) {
            if (value.name === null)
                return 'event';
            else if (value.name === 'null')
                throw new TypeError('???');
            else
                throw new UnsynthesizableError('$event.* other than $event');
        } else {
            throw new TypeError('Unexpected value ' + value);
        }
    }

    cnfFilterToNN(filter, schema) {
        let result = List.Nil;

        let andclauses = [];
        for (let and of filter.operands) {
            let andclause = List.Nil;
            for (let or of and.operands) {
                let negate = or.isNot;
                if (negate)
                    or = or.expr;
                let orclause;
                if (or.isAtom) {
                    orclause = List.concat(`param:${or.name}:${schema.out[or.name] || schema.inReq[or.name] || schema.inOpt[or.name]}`, or.operator, this.valueToNN(or.value, schema));
                } else {
                    orclause = List.concat(`@${or.selector.kind}.${or.channel}`);
                    for (let inParam of or.in_params) {
                        let ptype = or.schema.inReq[inParam.name] || or.schema.inOpt[inParam.name];
                        if (inParam.value.isUndefined && or.schema.inReq[inParam.name])
                            continue;
                        orclause = List.concat(orclause, `param:${inParam.name}:${ptype}`, '=', this.valueToNN(inParam.value));
                    }
                    orclause = List.concat(orclause, '{');
                    let subfilter = filterToCNF(or.filter);
                    if (subfilter.isFalse)
                        throw new UnsynthesizableError('Always false filters');
                    if (subfilter.isTrue)
                        orclause = List.concat(orclause, 'true', '}', ')');
                    else
                        orclause = List.concat(orclause, this.cnfFilterToNN(subfilter, or.schema), '}');
                }
                if (negate)
                    orclause = List.Cons('not', orclause);
                if (andclause === List.Nil)
                    andclause = orclause;
                else
                    andclause = List.concat(andclause, 'or', orclause);
            }
            andclauses.push(andclause);
        }
        andclauses.sort((a, b) => {
            let afirst = a.getFirst();
            let bfirst = b.getFirst();
            if (afirst < bfirst)
                return -1;
            else if (afirst > bfirst)
                return 1;
            return 0;
        });

        for (let andclause of andclauses) {
            if (result === List.Nil)
                result = andclause;
            else
                result = List.concat(result, 'and', andclause);
        }
        return result;
    }

    streamToNN(stream) {
        if (stream.isVarRef) {
            throw new UnsynthesizableError('Stream macros');
        } else if (stream.isTimer) {
            return List.concat('timer',
                'base', '=', this.valueToNN(stream.base), ',',
                'interval', '=', this.valueToNN(stream.interval));
        } else if (stream.isAtTimer) {
            if (stream.time.length === 1) {
                return List.concat('attimer', 'time', '=', this.valueToNN(stream.time[0]));
            } else {
                let list = this.valueToNN(stream.time[0]);
                for (let i = 1; i < stream.time.length; i++)
                    list = List.concat(list, ',', this.valueToNN(stream.time[i]));
                return List.concat('attimer', 'time', '=', '[', list, ']');
            }
        } else if (stream.isMonitor) {
            const monitor = List.concat('monitor', '(', this.tableToNN(stream.table), ')');

            if (stream.args === null) {
                return monitor;
            } else if (stream.args.length > 1) {
                let list = `param:${stream.args[0]}:${stream.schema.out[stream.args[0]]}`;
                for (let i = 1; i < stream.args.length; i++)
                    list = List.concat(list, ',', `param:${stream.args[i]}:${stream.schema.out[stream.args[i]]}`);
                return List.concat(monitor, 'on', 'new', '[', list, ']');
            } else {
                return List.concat(monitor, 'on', 'new', `param:${stream.args[0]}:${stream.schema.out[stream.args[0]]}`);
            }
        } else if (stream.isEdgeNew) {
            throw new UnsynthesizableError('EdgeNew expressions');
        } else if (stream.isEdgeFilter) {
            let optimized = filterToCNF(stream.filter);
            if (optimized.isFalse)
                throw new UnsynthesizableError('Always false filters');
            if (optimized.isTrue)
                return List.concat('edge', '(', this.streamToNN(stream.stream), ')', 'on', 'true');
            else
                return List.concat('edge', '(', this.streamToNN(stream.stream), ')', 'on', this.cnfFilterToNN(optimized, stream.schema));
        } else if (stream.isFilter) {
            throw new UnsynthesizableError('Stream filters');
            /*let optimized = filterToCNF(stream.filter);
            if (optimized.isFalse)
                throw new UnsynthesizableError('Always false filters');
            if (optimized.isTrue)
                return streamToNN(stream.stream, entities);
            return List.concat('(', streamToNN(stream.stream, entities), ')',
                'filter', cnfFilterToNN(optimized, entities));*/
        } else if (stream.isProjection) {
            throw new UnsynthesizableError('Projection expressions');
        } else if (stream.isCompute) {
            throw new UnsynthesizableError('Compute expressions');
        } else if (stream.isAlias) {
            throw new UnsynthesizableError('Alias expressions');
        } else if (stream.isJoin) {
            let param_passing = List.Nil;
            stream.in_params.sort((p1, p2) => {
                if (p1.name < p2.name)
                    return -1;
                if (p1.name > p2.name)
                    return 1;
                return 0;
            });

            for (let inParam of stream.in_params) {
                let ptype = stream.table.schema.inReq[inParam.name] || stream.table.schema.inOpt[inParam.name];
                param_passing = List.concat(param_passing, 'on', `param:${inParam.name}:${ptype}`,
                    '=', this.valueToNN(inParam.value, stream.stream.schema));
            }
            return List.concat('(', this.streamToNN(stream.stream), ')',
                '=>', '(', this.tableToNN(stream.table), ')', param_passing);
        } else {
            throw new TypeError();
        }
    }

    tableToNN(table) {
        if (table.isVarRef) {
            throw new UnsynthesizableError('Table macros');
        } else if (table.isInvocation) {
            let principal = null;
            if (table.invocation.selector.principal !== null)
                principal = this.valueToNN(table.invocation.selector.principal, null);

            let params = List.Nil;
            table.invocation.in_params.sort((p1, p2) => {
                if (p1.name < p2.name)
                    return -1;
                if (p1.name > p2.name)
                    return 1;
                return 0;
            });
            for (let inParam of table.invocation.in_params) {
                if (inParam.value.isUndefined && inParam.value.local)
                    continue;

                let ptype = table.invocation.schema.inReq[inParam.name] || table.invocation.schema.inOpt[inParam.name];
                // explicitly pass null to valueToNN because there should be no parameter passing at this level
                params = List.concat(params, `param:${inParam.name}:${ptype}`, '=', this.valueToNN(inParam.value, null));
            }

            let fn = `@${table.invocation.selector.kind}.${table.invocation.channel}`;
            if (principal)
                return List.concat(fn, 'of', principal, params);
            else
                return List.concat(fn, params);
        } else if (table.isFilter) {
            let optimized = filterToCNF(table.filter);
            if (optimized.isFalse)
                throw new UnsynthesizableError('Always false filters');
            if (optimized.isTrue)
                return this.tableToNN(table.table);
            return List.concat('(', this.tableToNN(table.table), ')',
                'filter', this.cnfFilterToNN(optimized, table.schema));
        } else if (table.isProjection) {
            throw new UnsynthesizableError('Projection expressions');
        } else if (table.isCompute) {
            throw new UnsynthesizableError('Compute expressions');
        } else if (table.isAlias) {
            throw new UnsynthesizableError('Alias expressions');
        } else if (table.isAggregation) {
            if (table.alias)
                throw new UnsynthesizableError('Aggregation alias');
            if (table.field === '*' && table.operator === 'count') {
                return List.concat('aggregate', 'count', 'of', '(',
                    this.tableToNN(table.table), ')');
            } else {
                return List.concat('aggregate', table.operator, 'param:' + table.field,
                    'of', '(', this.tableToNN(table.table), ')');
            }
        } else if (table.isArgMinMax) {
            return List.concat('aggregate', table.operator, 'param:' + table.field,
                this.valueToNN(table.base), ',', this.valueToNN(table.limit),
                'of', '(', this.tableToNN(table.table), ')');
        } else if (table.isJoin) {
            let param_passing = List.Nil;
            table.in_params.sort((p1, p2) => {
                if (p1.name < p2.name)
                    return -1;
                if (p1.name > p2.name)
                    return 1;
                return 0;
            });
            for (let inParam of table.in_params) {
                let ptype = table.rhs.schema.inReq[inParam.name] || table.rhs.schema.inOpt[inParam.name];

                param_passing = List.concat(param_passing, 'on', `param:${inParam.name}:${ptype}`,
                    '=', this.valueToNN(inParam.value, table.lhs.schema));
            }
            return List.concat('(', this.tableToNN(table.lhs), ')',
                'join', '(', this.tableToNN(table.rhs), ')', param_passing);
        } else if (table.isWindow) {
            return List.concat('window', this.valueToNN(table.base), ',',
                this.valueToNN(table.delta), 'of',
                '(', this.streamToNN(table.stream), ')');
        } else if (table.isTimeSeries) {
            return List.concat('timeseries', this.valueToNN(table.base), ',',
                this.valueToNN(table.delta), 'of',
                '(', this.streamToNN(table.stream), ')');
        } else if (table.isHistory) {
            return List.concat('history', this.valueToNN(table.base), ',',
                this.valueToNN(table.delta), 'of',
                '(', this.streamToNN(table.stream), ')');
        } else if (table.isSequence) {
            return List.concat('sequence', this.valueToNN(table.base), ',',
                this.valueToNN(table.delta), 'of',
                '(', this.streamToNN(table.stream), ')');
        } else {
            throw new TypeError();
        }
    }

    actionInvocationToNN(action, outschema) {
        let principal = null;
        if (action.selector.principal !== null)
            principal = this.valueToNN(action.selector.principal, null);

        let const_param = List.Nil;
        let param_passing = List.Nil;

        action.in_params.sort((p1, p2) => {
            if (p1.name < p2.name)
                return -1;
            if (p1.name > p2.name)
                return 1;
            return 0;
        });
        for (let inParam of action.in_params) {
            if (inParam.value.isUndefined && inParam.value.local)
                continue;
            let ptype = action.schema.inReq[inParam.name] || action.schema.inOpt[inParam.name];

            if ((inParam.value.isVarRef && !inParam.value.name.startsWith('__const')) || inParam.value.isEvent) {
                param_passing = List.concat(param_passing, 'on', `param:${inParam.name}:${ptype}`, '=',
                    this.valueToNN(inParam.value, outschema));
            } else {
                const_param = List.concat(const_param, `param:${inParam.name}:${ptype}`, '=', this.valueToNN(inParam.value));
            }
        }

        const fn = `@${action.selector.kind}.${action.channel}`;
        if (principal)
            return List.concat(fn, 'of', principal, const_param, param_passing);
        else
            return List.concat(fn, const_param, param_passing);
    }

    actionToNN(action, outschema) {
        if (action.isVarRef)
            throw new UnsynthesizableError('Action macros');
        if (action.invocation.selector.isBuiltin)
            return action.invocation.channel;
        return this.actionInvocationToNN(action.invocation, outschema);
    }

    ruleToNN(rule) {
        if (rule.actions.length !== 1)
            throw new UnsynthesizableError('Rules with more than one action');
        return List.concat(this.streamToNN(rule.stream), '=>',
            this.actionToNN(rule.actions[0], rule.stream.schema));
    }
    commandToNN(command) {
        if (command.actions.length !== 1)
            throw new UnsynthesizableError('Rules with more than one action');
        if (command.table === null)
            return List.concat('now', '=>', this.actionToNN(command.actions[0], null));
        return List.concat('now', '=>', this.tableToNN(command.table),
            '=>', this.actionToNN(command.actions[0], command.table.schema));
    }

    permissionFunctionToNN(fn, ifbuiltin) {
        if (fn.isBuiltin)
            return ifbuiltin;
        if (fn.isStar)
            return '*';
        if (fn.isClassStar)
            return `@${fn.kind}.*`;

        let filter = filterToCNF(fn.filter);
        if (filter.isFalse)
            throw new UnsynthesizableError('Always false filters');
        if (filter.isTrue)
            return List.concat(`@${fn.kind}.${fn.channel}`);
        else
            return List.concat(`@${fn.kind}.${fn.channel}`, 'filter', this.cnfFilterToNN(filter, fn.schema));
    }

    permissionRuleToNN(rule) {
        let principal;
        let filter = filterToCNF(rule.principal);
        if (filter.isFalse)
            throw new UnsynthesizableError('Always false filters');
        if (filter.isTrue)
            principal = 'true';
        else
            principal = this.cnfFilterToNN(filter, { out: { source: Type.Entity('tt:contact') }, inReq: {}, inOpt: {} });
        let first = this.permissionFunctionToNN(rule.query, 'now');
        let second = this.permissionFunctionToNN(rule.action, 'notify');

        const sequence = List.concat('policy', principal, ':', first, '=>', second);
        return sequence.flatten([]);
    }

    programToNN(program) {
        if (program.classes.length !== 0 ||
            program.declarations.length !== 0 ||
            program.rules.length !== 1)
            throw new UnsynthesizableError('Programs with declarations or multiple rules');

        let principal = null;
        if (program.principal)
            principal = this.valueToNN(program.principal);
        let sequence;
        if (program.rules[0].isRule)
            sequence = this.ruleToNN(program.rules[0]);
        else
            sequence = this.commandToNN(program.rules[0]);
        if (program.principal)
            sequence = List.concat('executor', '=', principal, ':', sequence);

        // do something
        return sequence.flatten([]);
    }

    toNN(program) {
        if (program instanceof Ast.Program)
            return this.programToNN(program);
        else if (program instanceof Ast.PermissionRule)
            return this.permissionRuleToNN(program);
        else
            throw new TypeError();
    }
}

function toNN(program, sentence, entities) {
    // for backward compatibility with the old API
    if (!entities) {
        entities = sentence;
        sentence = '';
    }

    let converter = new ToNNConverter(sentence, entities);
    return converter.toNN(program);
}

module.exports = {
    fromNN,
    toNN,
    UnsynthesizableError
};
