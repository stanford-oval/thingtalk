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

const util = require('util');

const Ast = require('../ast');
const Type = require('../type');
const { parseDate } = require('../date_utils');

const List = require('./list');
const { UnsynthesizableError } = require('./errors');

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
    if (type === 'TIME')
        return { hour: value.hour, minute: value.minute, second: value.second };
    if (type.startsWith('GENERIC_ENTITY_'))
        return { value: value.value, display: value.display };

    return value.value;
}

function entitiesEqual(type, one, two) {
    if (one === two)
        return true;
    if (!one || !two)
        return false;
    if (type.startsWith('GENERIC_ENTITY_'))
        return (one.value === two.value);

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
        return Math.abs(one.latitude - two.latitude) < 0.01 &&
            Math.abs(one.longitude - two.longitude) < 0.01;
    }

    return false;
}

class EntityRetriever {
    constructor(sentence, entities) {
        if (typeof sentence === 'string')
            sentence = sentence.split(' ');
        this.sentence = sentence;

        this.entities = {};
        Object.assign(this.entities, entities);

        this._used = {};
    }

    _findEntityFromSentence(entityType, entity) {
        let entityString;

        if (entityType.startsWith('GENERIC_ENTITY_') || entityType === 'LOCATION')
            entityString = entity.display.toLowerCase();
        else
            entityString = entity;

        if (entityType === 'QUOTED_STRING' || entityType === 'HASHTAG' || entityType === 'USERNAME' ||
            (entityType === 'LOCATION' && Number.isNaN(entity.latitude) && Number.isNaN(entity.longitude)) ||
            (entityType.startsWith('GENERIC_ENTITY_') && entity.display)) {

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
                    else if (entityType === 'LOCATION')
                        return List.concat('location:', '"', entityString, '"');
                    else
                        return List.concat('"', entityString, '"', '^^' + entityType.substring('GENERIC_ENTITY_'.length));
                }
            }
        }
        throw new Error('Cannot find entity ' + entityString + ' of type ' + entityType + ', have ' + util.inspect(this.entities));
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
        const candidates = this._findEntityInBag(entityType, entity, this.entities);

        if (ignoreNotFound && candidates.length === 0)
            return null;

        if (candidates.length === 0) {
            // uh oh we don't have the entity we want
            // see if we have an used pile, and try there for an unambiguous one

            let reuse = this._findEntityInBag(entityType, entity, this._used);
            if (reuse.length > 0) {
                if (reuse.length > 1)
                    throw new Error('Ambiguous entity ' + entity + ' of type ' + entityType);
                return reuse[0];
            }

            return this._findEntityFromSentence(entityType, entity);
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

class SequentialEntityAllocator {
    constructor(entities) {
        this.offsets = {};
        this.entities = entities;
    }

    findEntity(entityType, value, { ignoreNotFound = false }) {
        const entity = valueToEntity(entityType, value);

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

module.exports = class ToNNConverter {
    constructor(sentence, entities, allocateEntities) {
        if (allocateEntities)
            this.entityFinder = new SequentialEntityAllocator(entities);
        else
            this.entityFinder = new EntityRetriever(sentence, entities);
    }

    findEntity(entityType, value, options = {}) {
        return this.entityFinder.findEntity(entityType, value, options);
    }

    valueToNN(value, schema) {
        if (value.isArray) {
            let list = this.valueToNN(value.value[0], schema);
            for (let i = 1; i < value.value.length; i++)
                list = List.concat(list, ',', this.valueToNN(value.value[i], schema));
            return List.concat('[', list, ']');
        } else if (value.isVarRef) {
            if (value.name === null || value.name === 'null')
                throw new TypeError('???');
            if (value.name.startsWith('__const'))
                return constantToNN(value.name);
            else if (!schema.out[value.name])
                throw new TypeError(`No variable ${value.name} in schema, have ${Object.keys(schema.out)}`);
            else
                return `param:${value.name}:${schema.out[value.name]}`;
        } else if (value.isUndefined) {
            return 'undefined';
        } else if (value.isBoolean) {
            return value.value ? 'true' : 'false';
        } else if (value.isMeasure) {
            if (value.value === 0)
                return List.concat('0', 'unit:' + value.unit);
            if (value.value === 1)
                return List.concat('1', 'unit:' + value.unit);

            const baseunit = value.getType().unit;
            if (baseunit === 'ms') {
                let duration = this.findEntity('DURATION', value, { ignoreNotFound: true });
                if (duration !== null)
                    return List.concat(duration);
            } else {
                let measure = this.findEntity('MEASURE_' + baseunit, value, { ignoreNotFound: true });
                if (measure !== null)
                    return List.concat(measure);
            }
            return List.concat(this.findEntity('NUMBER', value), 'unit:' + value.unit);
        } else if (value.isString) {
            if (value.value === '')
                return '""';
            return this.findEntity('QUOTED_STRING', value);
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
            // if negative, try both ways, with preference on the positive value
            if (value.value < 0) {
                let found = this.findEntity('NUMBER', new Ast.Value.Number(-value.value), { ignoreNotFound: true });
                if (found !== null)
                    return List.concat('-', found);
            }
            return this.findEntity('NUMBER', value);
        } else if (value.isCurrency) {
            return this.findEntity('CURRENCY', value);
        } else if (value.isLocation) {
            if (value.value.isRelative)
                return 'location:' + value.value.relativeTag;
            else
                return this.findEntity('LOCATION', value);
        } else if (value.isDate) {
            let base;
            if (value.value === null)
                base = 'now';
            else if (value.value instanceof Ast.DateEdge)
                base = List.concat(value.value.edge, 'unit:' + value.value.unit);
            else
                base = this.findEntity('DATE', value);
            let offset;
            if (value.offset === null)
                offset = List.Nil;
            else
                offset = List.Cons(value.operator, this.valueToNN(value.offset));
            return List.concat(base, offset);
        } else if (value.isTime) {
            return this.findEntity('TIME', value);
        } else if (value.isEntity) {
            switch (value.type) {
            case 'tt:function':
            case 'tt:picture':
                throw new UnsynthesizableError('Constant of entity type ' + value.type);
            case 'tt:device':
                return 'device:' + value.value;
            case 'tt:username':
            case 'tt:contact_name':
                return this.findEntity('USERNAME', value);
            case 'tt:hashtag':
                return this.findEntity('HASHTAG', value);
            case 'tt:url':
                return this.findEntity('URL', value);
            case 'tt:phone_number':
                return this.findEntity('PHONE_NUMBER', value);
            case 'tt:email_address':
                return this.findEntity('EMAIL_ADDRESS', value);
            case 'tt:path_name':
                return this.findEntity('PATH_NAME', value);
            default:
                return this.findEntity('GENERIC_ENTITY_' + value.type, value);
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
          if (stream.expiration_date === null) {
            if (stream.time.length === 1) {
                return List.concat('attimer', 'time', '=', this.valueToNN(stream.time[0]));
            } else {
                let list = this.valueToNN(stream.time[0]);
                for (let i = 1; i < stream.time.length; i++)
                    list = List.concat(list, ',', this.valueToNN(stream.time[i]));
                return List.concat('attimer', 'time', '=', '[', list, ']');
            }
          } else {
            if (stream.time.length === 1) {
                return List.concat('attimer',
                  'time', '=', this.valueToNN(stream.time[0]),
                  'expiration_date', '=', this.valueToNN(stream.expiration_date));
            } else {
                let list = this.valueToNN(stream.time[0]);
                for (let i = 1; i < stream.time.length; i++)
                    list = List.concat(list, ',', this.valueToNN(stream.time[i]));
                return List.concat('attimer',
                  'time', '=', '[', list, ']',
                  'expiration_date', '=', this.valueToNN(stream.expiration_date));
            }
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
        } else if (table.isResultRef) {
            if (table.index.isNumber && table.index.value === -1)
                return List.concat(`result`, '(', `@${table.kind}.${table.channel}`, ')');
            else
                return List.concat(`result`, '(', `@${table.kind}.${table.channel}`, '[', this.valueToNN(table.index, null), ']', ')');
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
                if (table.invocation.schema.inReq[inParam.name] &&
                    inParam.value.isUndefined && inParam.value.local)
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
            let first = true;
            let list = List.Nil;
            for (let arg of table.args) {
                if (first)
                    first = false;
                else
                    list = List.concat(list, ',');
                list = List.concat(list, 'param:' + arg + ':' + table.schema.out[arg]);
            }

            return List.concat('[', list, ']', 'of', '(', this.tableToNN(table.table), ')');
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
                return List.concat('aggregate', table.operator, 'param:' + table.field + ':' + table.schema.out[table.field],
                    'of', '(', this.tableToNN(table.table), ')');
            }
        } else if (table.isSort) {
            return List.concat('sort', 'param:' + table.field + ':' + table.schema.out[table.field], table.direction, 'of',
                '(', this.tableToNN(table.table), ')');
        } else if (table.isIndex) {
            return List.concat('(', this.tableToNN(table.table), ')', this.valueToNN(Ast.Value.Array(table.indices)));
        } else if (table.isSlice) {
            return List.concat('(', this.tableToNN(table.table), ')', '[', this.valueToNN(table.base), ':', this.valueToNN(table.limit), ']');
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
            if (action.schema.inReq[inParam.name] &&
                inParam.value.isUndefined && inParam.value.local)
                continue;
            let ptype = action.schema.inReq[inParam.name] || action.schema.inOpt[inParam.name];

            if ((inParam.value.isVarRef && !inParam.value.name.startsWith('__const')) || inParam.value.isEvent) {
                param_passing = List.concat(param_passing, 'on', `param:${inParam.name}:${ptype}`, '=',
                    this.valueToNN(inParam.value, outschema));
            } else {
                const_param = List.concat(const_param, `param:${inParam.name}:${ptype}`, '=', this.valueToNN(inParam.value, outschema));
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
        if (program.oninput)
            throw new UnsynthesizableError(`oninput statement`);
        if (program.rules[0].isAssignment)
            throw new UnsynthesizableError(`assignment statement`);

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

    _bookkeepingFilterToNN(filter) {
        filter = filterToCNF(filter);
        if (filter.isFalse)
            throw new UnsynthesizableError('Always false filters');
        if (filter.isTrue)
            throw new UnsynthesizableError('Always true filters');
        return this.cnfFilterToNN(filter, null);
    }

    _bookkeepingIntentToNN(intent) {
        if (intent.isSpecial)
            return List.concat('special', 'special:' + intent.type);
        else if (intent.isCommandList && intent.device.isUndefined)
            return List.concat('category', intent.category);
        else if (intent.isCommandList)
            return List.concat('commands', intent.category, this.valueToNN(intent.device));
        else if (intent.isChoice)
            return List.concat('choice', String(intent.value));
        else if (intent.isAnswer)
            return List.concat('answer', this.valueToNN(intent.value));
        else if (intent.isPredicate)
            return List.concat('filter', this._bookkeepingFilterToNN(intent.predicate));
        else
            throw new TypeError(`Unrecognized bookkeeping intent ${intent}`);
    }

    bookkeepingToNN(program) {
        return List.concat('bookkeeping', this._bookkeepingIntentToNN(program.intent)).flatten([]);
    }

    toNN(program) {
        if (program instanceof Ast.Input.Bookkeeping)
            return this.bookkeepingToNN(program);
        else if (program instanceof Ast.Program)
            return this.programToNN(program);
        else if (program instanceof Ast.PermissionRule)
            return this.permissionRuleToNN(program);
        else
            throw new TypeError();
    }
};
