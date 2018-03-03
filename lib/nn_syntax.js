// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingEngine
//
// Copyright 2017 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const adt = require('adt');
const util = require('util');

const { optimizeFilter } = require('./optimize');
const Ast = require('./ast');
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
    }

    next() {
        if (this._i >= this._sequence.length)
            return { done: true };

        let next = this._sequence[this._i++];
        if (/^[A-Z]/.test(next)) {
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

function parseDate(form) {
    let now = new Date;
    let year = form.year;
    if (year < 0)
        year = now.getFullYear();
    let month = form.month;
    if (month < 0)
        month = now.getMonth() + 1;
    let day = form.day;
    if (day < 0)
        day = now.getDate();
    let hour = 0, minute = 0, second = 0;
    hour = form.hour;
    if (hour < 0)
        hour = now.getHours();
    minute = form.minute;
    if (minute < 0)
        minute = now.getMinutes();
    second = form.second;
    if (second < 0)
        second = now.getSeconds();

    return new Date(year, month-1, day, hour, minute, second);
}

function findEntity(entityType, value, entities, { ignoreNotFound = false, ignoreMultiple = true } = {}) {
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

        let reuse = findEntity(entityType, value, entities.$used || {}, { ignoreMultiple: false, ignoreNotFound: true });
        if (reuse !== null)
            return reuse;
        else if (entityType === 'GENERIC_ENTITY_tt:country' && value === 'uk')
            return findEntity(entityType, 'gb', entities);
        else
            throw new Error('Cannot find entity ' + value + ' of type ' + entityType + ', have ' + util.inspect(entities));
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

function valueToNN(value, entities, schema) {
    if (value.isArray) {
        let list = valueToNN(value.value[0], entities);
        for (let i = 1; i < value.value.length; i++)
            list = List.concat(list, ',', valueToNN(value.value[i], entities));
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
            let duration = findEntity('DURATION', value, entities, { ignoreNotFound: true });
            if (duration !== null)
                return List.concat(duration);
        }
        return List.concat(findEntity('NUMBER', value.value, entities), 'unit:' + value.unit);
    } else if (value.isString) {
        if (value.value === '')
            return '""';
        return findEntity('QUOTED_STRING', value.value, entities);
    } else if (value.isCompoundMeasure) {
        let list = valueToNN(value.value[0], entities);
        for (let i = 1; i < value.value.length; i++)
            list = List.Concat(list, valueToNN(value.value[i], entities));
        return list;
    } else if (value.isNumber) {
        if (value.value === 0)
            return '0';
        if (value.value === 1)
            return '1';
        return findEntity('NUMBER', value.value, entities);
    } else if (value.isCurrency) {
        return findEntity('CURRENCY', value, entities);
    } else if (value.isLocation) {
        if (value.value.isRelative)
            return 'location:' + value.value.relativeTag;
        else
            return findEntity('LOCATION', value.value, entities);
    } else if (value.isDate) {
        let base;
        if (value.value === null)
            base = 'now';
        else if (value.value instanceof Ast.DateEdge)
            base = List.concat(value.value.edge, 'unit:' + value.value.unit);
        else
            base = findEntity('DATE', value.value, entities);
        let offset;
        if (value.offset === null)
            offset = List.Nil;
        else
            offset = List.Cons(value.operator, valueToNN(value.offset));
        return List.concat(base, offset);
    } else if (value.isTime) {
        return findEntity('TIME', value, entities);
    } else if (value.isEntity) {
        switch (value.type) {
        case 'tt:device':
            return 'device:' + value.value;
        case 'tt:username':
        case 'tt:contact_name':
            return findEntity('USERNAME', value.value, entities);
        case 'tt:hashtag':
            return findEntity('HASHTAG', value.value, entities);
        case 'tt:url':
            return findEntity('URL', value.value, entities);
        case 'tt:phone_number':
            return findEntity('PHONE_NUMBER', value.value, entities);
        case 'tt:email_address':
            return findEntity('EMAIL_ADDRESS', value.value, entities);
        case 'tt:path_name':
            return findEntity('PATH_NAME', value.value, entities);
        default:
            return findEntity('GENERIC_ENTITY_' + value.type, value.value, entities);
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

    filter = optimizeFilter(filter);
    if (filter.isTrue || filter.isFalse)
        return false;

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

function cnfFilterToNN(filter, entities, schema) {
    let result = List.Nil;

    let andclauses = [];
    for (let and of filter.operands) {
        let andclause = List.Nil;
        for (let or of and.operands) {
            let negate = or.isNot;
            if (negate)
                or = or.expr;
            let orclause;
            if (or.isAtom)
                orclause = List.concat(`param:${or.name}:${schema.out[or.name]}`, or.operator, valueToNN(or.value, entities, schema));
            else
                throw new UnsynthesizableError('GET-predicates');
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

function streamToNN(stream, entities) {
    if (stream.isVarRef) {
        throw new UnsynthesizableError('Stream macros');
    } else if (stream.isTimer) {
        return List.concat('timer',
            'base', '=', valueToNN(stream.base, entities), ',',
            'interval', '=', valueToNN(stream.interval, entities));
    } else if (stream.isAtTimer) {
        return List.concat('attimer', 'time', '=', valueToNN(stream.time, entities));
    } else if (stream.isMonitor) {
        const monitor = List.concat('monitor', '(', tableToNN(stream.table, entities), ')');

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
            return List.concat('edge', '(', streamToNN(stream.stream, entities), ')', 'on', 'true');
        else
            return List.concat('edge', '(', streamToNN(stream.stream, entities), ')', 'on', cnfFilterToNN(optimized, entities, stream.schema));
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
                '=', valueToNN(inParam.value, entities, stream.stream.schema));
        }
        return List.concat('(', streamToNN(stream.stream, entities), ')',
            'join', '(', tableToNN(stream.table, entities), ')', param_passing);
    } else {
        throw new TypeError();
    }
}

function tableToNN(table, entities) {
    if (table.isVarRef) {
        throw new UnsynthesizableError('Table macros');
    } else if (table.isInvocation) {
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
            params = List.concat(params, `param:${inParam.name}:${ptype}`, '=', valueToNN(inParam.value, entities, null));
        }
        return List.concat(`@${table.invocation.selector.kind}.${table.invocation.channel}`, params);
    } else if (table.isFilter) {
        let optimized = filterToCNF(table.filter);
        if (optimized.isFalse)
            throw new UnsynthesizableError('Always false filters');
        if (optimized.isTrue)
            return tableToNN(table.table, entities);
        return List.concat('(', tableToNN(table.table, entities), ')',
            'filter', cnfFilterToNN(optimized, entities, table.schema));
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
                tableToNN(table.table, entities), ')');
        } else {
            return List.concat('aggregate', table.operator, 'param:' + table.field,
                'of', '(', tableToNN(table.table, entities), ')');
        }
    } else if (table.isArgMinMax) {
        return List.concat('aggregate', table.operator, 'param:' + table.field,
            valueToNN(table.base, entities), ',', valueToNN(table.limit, entities),
            'of', '(', tableToNN(table.table, entities), ')');
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
                '=', valueToNN(inParam.value, entities, table.lhs.schema));
        }
        return List.concat('(', tableToNN(table.lhs, entities), ')',
            'join', '(', tableToNN(table.rhs, entities), ')', param_passing);
    } else if (table.isWindow) {
        return List.concat('window', valueToNN(table.base, entities), ',',
            valueToNN(table.delta, entities), 'of',
            '(', streamToNN(table.stream), ')');
    } else if (table.isTimeSeries) {
        return List.concat('timeseries', valueToNN(table.base, entities), ',',
            valueToNN(table.delta, entities), 'of',
            '(', streamToNN(table.stream), ')');
    } else if (table.isHistory) {
        return List.concat('history', valueToNN(table.base, entities), ',',
            valueToNN(table.delta, entities), 'of',
            '(', streamToNN(table.stream), ')');
    } else if (table.isSequence) {
        return List.concat('sequence', valueToNN(table.base, entities), ',',
            valueToNN(table.delta, entities), 'of',
            '(', streamToNN(table.stream), ')');
    } else {
        throw new TypeError();
    }
}

function actionToNN(action, entities, outschema) {
    if (action.selector.isBuiltin)
        return 'notify';

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
                valueToNN(inParam.value, entities, outschema));
        } else {
            const_param = List.concat(const_param, `param:${inParam.name}:${ptype}`, '=', valueToNN(inParam.value, entities));
        }
    }

    return List.concat(`@${action.selector.kind}.${action.channel}`,
        const_param, param_passing);
}

function ruleToNN(rule, entities) {
    if (rule.actions.length !== 1)
        throw new UnsynthesizableError('Rules with more than one action');
    return List.concat(streamToNN(rule.stream, entities), '=>',
        actionToNN(rule.actions[0], entities, rule.stream.schema));
}
function commandToNN(command, entities) {
    if (command.actions.length !== 1)
        throw new UnsynthesizableError('Rules with more than one action');
    if (command.table === null)
        return List.concat('now', '=>', actionToNN(command.actions[0], entities, null));
    return List.concat('now', '=>', tableToNN(command.table, entities),
        '=>', actionToNN(command.actions[0], entities, command.table.schema));
}

function toNN(program, entities) {
    if (program.classes.length !== 0 ||
        program.declarations.length !== 0 ||
        program.rules.length !== 1)
        throw new UnsynthesizableError('Programs with declarations or multiple rules');

    let sequence;
    if (program.rules[0].isRule)
        sequence = ruleToNN(program.rules[0], entities);
    else
        sequence = commandToNN(program.rules[0], entities);
    if (program.principal)
        sequence = List.concat(valueToNN(program.principal, entities), ':', sequence);

    // do something
    return sequence.flatten([]);
}

module.exports = {
    fromNN,
    toNN,
    UnsynthesizableError
};
