// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
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

import assert from 'assert';

import * as Ast from '../ast';
import Type from '../type';
import List from '../utils/list';

import { UnsynthesizableError } from './errors';
import { UnserializableError } from "../utils/errors";

// small integers are predicted/translated by the neural network, while
// large integers are copied using NUMBER_* tokens
function isSmallInteger(value) {
    // the ceiling of 12 is chosen so all hours of the day are small integers
    // this way, we can predict times and numbers more or less indistinguishably
    return Math.floor(value) === value && value >= 0 && value <= 12;
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
            if (expr.expr.isAtom || expr.expr.isExternal || expr.expr.isDontCare || expr.expr.isCompute)
                return expr;
            if (expr.expr.isNot)
                return pushDownNegations(expr.expr.expr);
            if (expr.expr.isAnd)
                return new Ast.BooleanExpression.Or(null, expr.expr.operands.map((op) => pushDownNegations(new Ast.BooleanExpression.Not(null, op))));
            if (expr.expr.isOr)
                return new Ast.BooleanExpression.And(null, expr.expr.operands.map((op) => pushDownNegations(new Ast.BooleanExpression.Not(null, op))));
            if (expr.expr.isTrue)
                return Ast.BooleanExpression.False;
            if (expr.expr.isFalse)
                return Ast.BooleanExpression.True;
            throw new TypeError();
        } else if (expr.isAnd) {
            return new Ast.BooleanExpression.And(null, expr.operands.map(pushDownNegations));
        } else if (expr.isOr) {
            return new Ast.BooleanExpression.Or(null, expr.operands.map(pushDownNegations));
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
            if (or.isNot || or.isAtom || or.isExternal || or.isCompute || or.isDontCare) {
                currentClause.push(or);
                continue;
            }
            if (or.isOr) { // flatten
                ors.push(...or.operands);
                continue;
            }
            if (or.isExistentialSubquery || or.isComparisonSubquery) {
                const externalEquivalent = or.toLegacy();
                if (externalEquivalent)
                    currentClause.push(externalEquivalent);
                else
                    throw new UnserializableError('Subquery');
            }
            if (or.isAnd)
                throw new UnserializableError('AND boolean expression');
        }
        clauses.push(new Ast.BooleanExpression.Or(null, currentClause));
    }
    return new Ast.BooleanExpression.And(null, clauses);
}

class Scope {
    constructor(schema, parent = null) {
        this._schema = schema;
        this._parent = parent;
    }

    get(name) {
        return this._schema.getArgType(name) || this._parent.get(name);
    }

    has(name) {
        if (this._schema.hasArgument(name))
            return true;
        if (this._parent)
            return this._parent.has(name);
        else
            return false;
    }

    *_iterate() {
        for (let arg of this._schema.iterateArguments())
            yield arg.name;
        if (this._parent)
            yield* this._parent._iterate();
    }

    keys() {
        return Array.from(this._iterate());
    }
}

const INFIX_OPERATORS = new Set(['+', '-', '/', '*', '%', '**']);
export default class ToNNConverter {
    constructor(entityFinder, typeAnnotations = true) {
        this.typeAnnotations = typeAnnotations;
        this.entityFinder = entityFinder;
    }

    findEntity(entityType, value, options = {}) {
        return this.entityFinder.findEntity(entityType, value.toEntity(), options);
    }

    _compoundTypeToScope(type, parentscope) {
        let args = [];
        if (type.isCompound) {
            for (let field in type.fields)
                args.push(new Ast.ArgumentDef(null, 'out', field, type.fields[field].type, {}));
        } else {
            args.push(new Ast.ArgumentDef(null, 'out', 'value', type, {}));
        }
        const localschema = new Ast.FunctionDef(null, 'query', null, '', [], { is_list: false, is_monitorable: false }, args);
        return new Scope(localschema, parentscope);
    }

    valueToNN(value, scope) {
        if (value.isArray) {
            let list = this.valueToNN(value.value[0], scope);
            for (let i = 1; i < value.value.length; i++)
                list = List.concat(list, ',', this.valueToNN(value.value[i], scope));
            return List.concat('[', list, ']');
        } else if (value.isObject) {
            let sequence = List.concat('{');
            let first = true;
            for (let key in value.value) {
                if (first)
                    first = false;
                else
                    sequence = List.concat(sequence, ',');
                sequence = List.concat(sequence, `param:${key}`, `=`, this.valueToNN(value.value[key], scope));
            }
            return List.concat(sequence, '}');
        } else if (value.isVarRef) {
            if (value.name === null || value.name === 'null')
                throw new TypeError('???');
            if (value.name.startsWith('__const'))
                return constantToNN(value.name);
            else if (!scope.has(value.name))
                throw new TypeError(`No variable ${value.name} in schema, have ${scope.keys()}`);
            else if (this.typeAnnotations)
                return `param:${value.name}:${scope.get(value.name)}`;
            else
                return `param:${value.name}`;
        } else if (value.isComputation && INFIX_OPERATORS.has(value.op)) {
            let lhs, rhs;
            if (value.operands[0].isComputation)
                lhs = List.concat('(', this.valueToNN(value.operands[0], scope), ')');
            else
                lhs = this.valueToNN(value.operands[0], scope);
            if (value.operands[1].isComputation)
                rhs = List.concat('(', this.valueToNN(value.operands[1], scope), ')');
            else
                rhs = this.valueToNN(value.operands[1], scope);

            return List.concat(lhs, value.op, rhs);
        } else if (value.isComputation) {
            let list = List.concat(value.op, '(');
            let first = true;
            for (let operand of value.operands) {
                if (first)
                    first = false;
                else
                    list = List.concat(list, ',');
                list = List.concat(list, this.valueToNN(operand, scope));
            }
            list = List.concat(list, ')');
            return list;
        } else if (value.isFilter) {
            let optimized = filterToCNF(value.filter);
            if (optimized.isFalse)
                throw new UnsynthesizableError('Always false filters');
            if (optimized.isTrue)
                return this.valueToNN(value.value, scope);
            return List.concat(this.valueToNN(value.value, scope),
                'filter', '{', this.cnfFilterToNN(optimized, this._compoundTypeToScope(value.type.elem, scope)), '}');
        } else if (value.isArrayField) {
            if (this.typeAnnotations)
                return List.concat(`param:${value.field}:${value.type.elem}`, `of`, this.valueToNN(value.value, scope));
            else
                return List.concat(`param:${value.field}`, `of`, this.valueToNN(value.value, scope));
        } else if (value.isUndefined) {
            return 'undefined';
        } else if (value.isContextRef) {
            return `context:${value.name}:${value.type}`;
        } else if (value.isBoolean) {
            return value.value ? 'true' : 'false';
        } else if (value.isMeasure) {
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
            if (isSmallInteger(value.value))
                return List.concat(String(value.value), 'unit:' + value.unit);
            return List.concat(this.findEntity('NUMBER', new Ast.Value.Number(value.value)), 'unit:' + value.unit);
        } else if (value.isString) {
            if (value.value === '')
                return '""';
            return this.findEntity('QUOTED_STRING', value);
        } else if (value.isNumber) {
            if (isSmallInteger(value.value))
                return String(value.value);

            // if negative, try both ways, with preference on the positive value
            if (value.value < 0) {
                if (isSmallInteger(-value.value))
                    return List.concat('-', String(-value.value));

                let found = this.findEntity('NUMBER', new Ast.Value.Number(-value.value), { ignoreNotFound: true });
                if (found !== null)
                    return List.concat('-', found);
            }
            return this.findEntity('NUMBER', value);
        } else if (value.isCurrency) {
            let currency = this.findEntity('CURRENCY', value, { ignoreNotFound: true });
            if (currency !== null)
                return List.concat(currency);
            if (isSmallInteger(value.value))
                return List.concat(String(value.value), 'unit:$' + value.code);
            else
                return List.concat(this.findEntity('NUMBER', new Ast.Value.Number(value.value)), 'unit:$' + value.code);
        } else if (value.isLocation) {
            if (value.value.isRelative)
                return 'location:' + value.value.relativeTag;
            else
                return this.findEntity('LOCATION', value);
        } else if (value.isDate) {
            if (value.value === null) {
                return 'now';
            } else if (value.value instanceof Ast.DateEdge) {
                return List.concat(value.value.edge, 'unit:' + value.value.unit);
            } else if (value.value instanceof Ast.DatePiece) {
                let toReturn = List.concat('new', 'Date', '(');
                if (value.value.year !== null) {
                    let year;
                    if (value.value.year < 1950 || value.value.year >= 2050) {
                        year = this.findEntity('NUMBER', new Ast.Value.Number(value.value.year));
                    } else {
                        year = this.findEntity('NUMBER', new Ast.Value.Number(value.value.year), { ignoreNotFound: true });
                        if (year === null) { // look for the last two digits only
                            if (isSmallInteger(value.value.year % 100))
                                year = String(value.value.year % 100);
                            else
                                year = this.findEntity('NUMBER', new Ast.Value.Number(value.value.year % 100));
                        }
                    }
                    toReturn = List.concat(toReturn, year);
                }
                toReturn = List.concat(toReturn, ',');
                if (value.value.month !== null)
                    toReturn = List.concat(toReturn, String(value.value.month));
                toReturn = List.concat(toReturn, ',');
                if (value.value.day !== null) {
                    if (isSmallInteger(value.value.day))
                        toReturn = List.concat(toReturn, String(value.value.day));
                    else
                        toReturn = List.concat(toReturn, this.findEntity('NUMBER', new Ast.Value.Number(value.value.day)));
                }
                toReturn = List.concat(toReturn, ',');
                if (value.value.time !== null)
                    toReturn = List.concat(toReturn, this.findEntity('TIME', new Ast.Value.Time(value.value.time)));
                toReturn = List.concat(toReturn, ')');
                return toReturn;
            } else if (value.value instanceof Ast.WeekDayDate) {
                let toReturn = List.concat('new', 'Date', '(', 'enum:' + value.value.weekday);
                if (value.value.time !== null)
                    toReturn = List.concat(toReturn, ',', this.findEntity('TIME', new Ast.Value.Time(value.value.time)));
                toReturn = List.concat(toReturn, ')');
                return toReturn;
            } else {
                const found = this.findEntity('DATE', value, { ignoreNotFound: true });
                if (found)
                    return found;

                const str = this.findEntity('QUOTED_STRING', new Ast.Value.String(value.value.toISOString()), { ignoreNotFound: true });
                if (str)
                    return List.concat('new', 'Date', '(', str, ')');

                let toReturn = List.concat('new' , 'Date', '(');
                const year = value.value.getFullYear();
                let yearstr;
                if (year < 1950 || year >= 2050) {
                    yearstr = this.findEntity('NUMBER', new Ast.Value.Number(year));
                } else {
                    yearstr = this.findEntity('NUMBER', new Ast.Value.Number(year), { ignoreNotFound: true });
                    if (!yearstr) {
                        let twoDigitYear = year < 2000 ? year - 1900 : year - 2000;
                        if (isSmallInteger(twoDigitYear))
                            yearstr = String(twoDigitYear);
                        else
                            yearstr = this.findEntity('NUMBER', new Ast.Value.Number(twoDigitYear));
                    }
                }
                toReturn = List.concat(toReturn, yearstr, ',', String(value.value.getMonth()+1), ',');
                if (isSmallInteger(value.value.getDate()))
                    toReturn = List.concat(toReturn, String(value.value.getDate()));
                else
                    toReturn = List.concat(toReturn, this.findEntity('NUMBER', new Ast.Value.Number(value.value.getDate())));

                let hour = value.value.getHours(), minute = value.value.getMinutes(),
                    second = value.value.getSeconds();
                if (hour !== 0 || minute !== 0 || second !== 0) {
                    toReturn = List.concat(toReturn, ',', this.findEntity('TIME', new Ast.Value.Time(
                        new Ast.Time.Absolute(hour, minute, second))));
                }
                toReturn = List.concat(toReturn, ')');
                return toReturn;
            }
        } else if (value.isTime) {
            if (value.value.isRelative) {
                return 'time:' + value.value.relativeTag;
            } else {
                const found = this.findEntity('TIME', value, { ignoreNotFound: true });
                if (found)
                    return found;
                return `time:${value.value.hour}:${value.value.minute}:${value.value.second}`;
            }
        } else if (value.isEntity) {
            switch (value.type) {
            case 'tt:function':
                return '@' + value.value.replace(':', '.');
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
            case 'tt:picture':
                return this.findEntity('PICTURE', value);
            default:
                return this.findEntity('GENERIC_ENTITY_' + value.type, value);
            }
        } else if (value.isEnum) {
            return 'enum:' + value.value;
        } else if (value.isEvent) {
            if (value.name === null)
                return 'event';
            else if (value.name === 'source')
                return this.typeAnnotations ? 'param:source:Entity(tt:contact)' : 'param:source';
            else if (value.name === 'null')
                throw new TypeError('???');
            else
                throw new UnsynthesizableError('$event.* other than $event');
        } else if (value.isRecurrentTimeSpecification) {
            let first = true;
            let out = List.concat('new', 'RecurrentTimeSpecification', '(');
            for (let rule of value.rules) {
                let nnRule = List.concat('{',
                    'beginTime', '=', this.valueToNN(new Ast.Value.Time(rule.beginTime), scope), ',',
                    'endTime', '=', this.valueToNN(new Ast.Value.Time(rule.endTime), scope),
                );
                if (rule.interval.value !== 1 || rule.interval.unit !== 'day')
                    nnRule = List.concat(nnRule, ',', 'interval', '=', this.valueToNN(rule.interval, scope));
                if (rule.frequency !== 1)
                    nnRule = List.concat(nnRule, ',', 'frequency', '=', this.valueToNN(new Ast.Value.Number(rule.frequency), scope));
                if (rule.dayOfWeek)
                    nnRule = List.concat(nnRule, ',', 'dayOfWeek', '=', 'enum:' + rule.dayOfWeek);
                if (rule.beginDate)
                    nnRule = List.concat(nnRule, ',', 'beginDate', '=', this.valueToNN(new Ast.Value.Date(rule.beginDate), scope));
                if (rule.endDate)
                    nnRule = List.concat(nnRule, ',', 'endDate', '=', this.valueToNN(new Ast.Value.Date(rule.endDate), scope));
                if (rule.subtract)
                    nnRule = List.concat(nnRule, ',', 'subtract', '=', 'true');
                nnRule = List.concat(nnRule, '}');
                if (first)
                    first = false;
                else
                    out = List.concat(out, ',');
                out = List.concat(out, nnRule);
            }
            out = List.concat(out, ')');
            return out;
        } else {
            throw new TypeError('Unexpected value ' + value);
        }
    }

    cnfFilterToNN(filter, scope) {
        let result = List.Nil;

        let andclauses = [];
        for (let and of filter.operands) {
            let andclause = List.Nil;
            for (let or of and.operands) {
                let negate = or.isNot;
                if (negate)
                    or = or.expr;
                let orclause;
                if (or.isDontCare) {
                    scope.get(or.name);
                    if (this.typeAnnotations)
                        orclause = List.concat(`true`, `param:${or.name}:${scope.get(or.name)}`);
                    else
                        orclause = List.concat(`true`, `param:${or.name}`);
                } else if (or.isAtom) {
                    scope.get(or.name);
                    if (this.typeAnnotations)
                        orclause = List.concat(`param:${or.name}:${scope.get(or.name)}`, or.operator, this.valueToNN(or.value, scope));
                    else
                        orclause = List.concat(`param:${or.name}`, or.operator, this.valueToNN(or.value, scope));
                } else if (or.isCompute) {
                    let lhs;
                    if (or.lhs.isConstant())
                        lhs = List.concat('(', this.valueToNN(or.lhs, scope), ')');
                    else
                        lhs = this.valueToNN(or.lhs, scope);
                    orclause = List.concat(lhs, or.operator, this.valueToNN(or.rhs, scope));
                } else {
                    assert(or.isExternal);
                    orclause = List.concat(`@${or.selector.kind}.${or.channel}`);
                    for (let inParam of or.in_params) {
                        let ptype = or.schema.inReq[inParam.name] || or.schema.inOpt[inParam.name];
                        if (inParam.value.isUndefined && or.schema.inReq[inParam.name])
                            continue;
                        if (this.typeAnnotations)
                            orclause = List.concat(orclause, `param:${inParam.name}:${ptype}`, '=', this.valueToNN(inParam.value, scope));
                        else
                            orclause = List.concat(orclause, `param:${inParam.name}`, '=', this.valueToNN(inParam.value, scope));
                    }
                    orclause = List.concat(orclause, '{');
                    let subfilter = filterToCNF(or.filter);
                    if (subfilter.isFalse)
                        throw new UnsynthesizableError('Always false filters');
                    if (subfilter.isTrue)
                        orclause = List.concat(orclause, 'true', '}', ')');
                    else
                        orclause = List.concat(orclause, this.cnfFilterToNN(subfilter, new Scope(or.schema, scope)), '}');
                }
                if (negate)
                    orclause = List.concat('not', orclause);
                if (andclause === List.Nil)
                    andclause = orclause;
                else
                    andclause = List.concat(andclause, 'or', orclause);
            }
            andclauses.push(andclause);
        }
        andclauses.sort((a, b) => {
            a = a.flatten([]).join('');
            b = b.flatten([]).join('');
            if (a < b)
                return -1;
            else if (a > b)
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
            if (stream.frequency === null) {
                return List.concat('timer',
                    'base', '=', this.valueToNN(stream.base), ',',
                    'interval', '=', this.valueToNN(stream.interval));
            } else {
                return List.concat('timer',
                    'base', '=', this.valueToNN(stream.base), ',',
                    'interval', '=', this.valueToNN(stream.interval), ',',
                    'frequency', '=', this.valueToNN(stream.frequency));
            }
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
                let sortedArgs = stream.args.sort();
                let list;
                if (this.typeAnnotations)
                    list = `param:${sortedArgs[0]}:${stream.schema.out[sortedArgs[0]]}`;
                else
                    list = `param:${sortedArgs[0]}`;
                for (let i = 1; i < sortedArgs.length; i++) {
                    if (this.typeAnnotations)
                        list = List.concat(list, ',', `param:${sortedArgs[i]}:${stream.schema.out[sortedArgs[i]]}`);
                    else
                        list = List.concat(list, ',', `param:${sortedArgs[i]}`);
                }
                return List.concat(monitor, 'on', 'new', '[', list, ']');
            } else {
                if (this.typeAnnotations)
                    return List.concat(monitor, 'on', 'new', `param:${stream.args[0]}:${stream.schema.out[stream.args[0]]}`);
                else
                    return List.concat(monitor, 'on', 'new', `param:${stream.args[0]}`);
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
                return List.concat('edge', '(', this.streamToNN(stream.stream), ')', 'on', this.cnfFilterToNN(optimized, new Scope(stream.schema)));
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
            let first = true;
            let list = List.Nil;
            for (let arg of stream.args.sort()) {
                if (first)
                    first = false;
                else
                    list = List.concat(list, ',');
                if (this.typeAnnotations)
                    list = List.concat(list, 'param:' + arg + ':' + stream.schema.out[arg]);
                else
                    list = List.concat(list, 'param:' + arg);
            }

            return List.concat('[', list, ']', 'of', '(', this.streamToNN(stream.stream), ')');
        } else if (stream.isCompute) {
            let expr = this.valueToNN(stream.expression, new Scope(stream.stream.schema));
            // wrap constants in () to avoid syntactic ambiguity
            if (stream.expression.isConstant())
                expr = List.concat('(', expr, ')');

            return List.concat('compute', expr, 'of', '(',
                this.streamToNN(stream.stream), ')');
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
                assert(ptype);
                if (this.typeAnnotations) {
                    param_passing = List.concat(param_passing, 'on', `param:${inParam.name}:${ptype}`,
                        '=', this.valueToNN(inParam.value, new Scope(stream.stream.schema)));
                } else {
                    param_passing = List.concat(param_passing, 'on', `param:${inParam.name}`,
                        '=', this.valueToNN(inParam.value, new Scope(stream.stream.schema)));
                }
            }
            return List.concat('(', this.streamToNN(stream.stream), ')',
                '=>', '(', this.tableToNN(stream.table), ')', param_passing);
        } else {
            throw new TypeError();
        }
    }

    _invocationToNN(invocation) {
        const selector = invocation.selector;
        let fn = `@${selector.kind}.${invocation.channel}`;
        if (selector.all) {
            if (this.typeAnnotations)
                fn = List.concat(fn, 'attribute:all:Boolean', '=', 'true');
            else
                fn = List.concat(fn, 'attribute:all', '=', 'true');
        } else if (selector.id && selector.id !== selector.kind) {
            // note: we omit the device ID if it is identical to the kind (which indicates there can only be
            // one device of this type in the system)
            // this reduces the amount of stuff we have to encode/predict for the common cases

            const name = selector.attributes.find((attr) => attr.name === 'name');
            const id = new Ast.Value.Entity(selector.id, 'tt:device_id', name ? name.value.toJS() : null);
            if (this.typeAnnotations)
                fn = List.concat(fn, 'attribute:id:Entity(tt:device_id)', '=', this.valueToNN(id, null));
            else
                fn = List.concat(fn, 'attribute:id', '=', this.valueToNN(id, null));
        }

        selector.attributes.sort((p1, p2) => {
            if (p1.name < p2.name)
                return -1;
            if (p1.name > p2.name)
                return 1;
            return 0;
        });

        for (let attr of selector.attributes) {
            if (attr.value.isUndefined && attr.value.local)
                continue;
            if (attr.name === 'name' && selector.id)
                continue;

            // explicitly pass null to valueToNN because there should be no parameter passing in NN-syntax
            if (this.typeAnnotations)
                fn = List.concat(fn, `attribute:${attr.name}:String`, '=', this.valueToNN(attr.value, null));
            else
                fn = List.concat(fn, `attribute:${attr.name}`, '=', this.valueToNN(attr.value, null));
        }

        return fn;
    }

    tableToNN(table) {
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
                if (table.invocation.schema.inReq[inParam.name] &&
                    inParam.value.isUndefined && inParam.value.local)
                    continue;

                let ptype = table.invocation.schema.inReq[inParam.name] || table.invocation.schema.inOpt[inParam.name];
                // explicitly pass null to valueToNN because there should be no parameter passing at this level
                if (this.typeAnnotations)
                    params = List.concat(params, `param:${inParam.name}:${ptype}`, '=', this.valueToNN(inParam.value, null));
                else
                    params = List.concat(params, `param:${inParam.name}`, '=', this.valueToNN(inParam.value, null));
            }

            return List.concat(this._invocationToNN(table.invocation), params);
        } else if (table.isFilter) {
            let optimized = filterToCNF(table.filter);
            if (optimized.isFalse)
                throw new UnsynthesizableError('Always false filters');
            if (optimized.isTrue)
                return this.tableToNN(table.table);
            return List.concat('(', this.tableToNN(table.table), ')',
                'filter', this.cnfFilterToNN(optimized, new Scope(table.schema)));
        } else if (table.isProjection) {
            let first = true;
            let list = List.Nil;
            for (let arg of table.args.sort()) {
                if (first)
                    first = false;
                else
                    list = List.concat(list, ',');
                if (this.typeAnnotations)
                    list = List.concat(list, 'param:' + arg + ':' + table.schema.out[arg]);
                else
                    list = List.concat(list, 'param:' + arg);
            }

            return List.concat('[', list, ']', 'of', '(', this.tableToNN(table.table), ')');
        } else if (table.isCompute) {
            let expr = this.valueToNN(table.expression, new Scope(table.table.schema));
            // wrap constants in () to avoid syntactic ambiguity
            if (table.expression.isConstant())
                expr = List.concat('(', expr, ')');

            return List.concat('compute', expr, 'of', '(',
                this.tableToNN(table.table), ')');
        } else if (table.isAlias) {
            throw new UnsynthesizableError('Alias expressions');
        } else if (table.isAggregation) {
            if (table.alias)
                throw new UnsynthesizableError('Aggregation alias');
            if (table.field === '*' && table.operator === 'count') {
                return List.concat('aggregate', 'count', 'of', '(',
                    this.tableToNN(table.table), ')');
            } else {
                if (this.typeAnnotations) {
                    return List.concat('aggregate', table.operator, 'param:' + table.field + ':' + table.schema.out[table.field],
                        'of', '(', this.tableToNN(table.table), ')');
                } else {
                    return List.concat('aggregate', table.operator, 'param:' + table.field,
                        'of', '(', this.tableToNN(table.table), ')');
                }
            }
        } else if (table.isSort) {
            if (this.typeAnnotations) {
                return List.concat('sort', 'param:' + table.field + ':' + table.schema.out[table.field], table.direction, 'of',
                    '(', this.tableToNN(table.table), ')');
            } else {
                return List.concat('sort', 'param:' + table.field, table.direction, 'of',
                    '(', this.tableToNN(table.table), ')');
            }
        } else if (table.isIndex) {
            return List.concat('(', this.tableToNN(table.table), ')', this.valueToNN(new Ast.Value.Array(table.indices)));
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

                if (this.typeAnnotations) {
                    param_passing = List.concat(param_passing, 'on', `param:${inParam.name}:${ptype}`,
                        '=', this.valueToNN(inParam.value, new Scope(table.lhs.schema)));
                } else {
                    param_passing = List.concat(param_passing, 'on', `param:${inParam.name}`,
                        '=', this.valueToNN(inParam.value, new Scope(table.lhs.schema)));
                }
            }
            return List.concat('(', this.tableToNN(table.lhs), ')',
                'join', '(', this.tableToNN(table.rhs), ')', param_passing);
        } else {
            throw new TypeError();
        }
    }

    actionInvocationToNN(action, outschema) {
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
            assert(ptype);

            if ((inParam.value.isVarRef && !inParam.value.name.startsWith('__const')) || inParam.value.isEvent) {
                if (this.typeAnnotations) {
                    param_passing = List.concat(param_passing, 'on', `param:${inParam.name}:${ptype}`, '=',
                        this.valueToNN(inParam.value, new Scope(outschema)));
                } else {
                    param_passing = List.concat(param_passing, 'on', `param:${inParam.name}`, '=',
                        this.valueToNN(inParam.value, new Scope(outschema)));
                }
            } else {
                if (this.typeAnnotations) {
                    const_param = List.concat(const_param, `param:${inParam.name}:${ptype}`, '=',
                        this.valueToNN(inParam.value, new Scope(outschema)));
                } else {
                    const_param = List.concat(const_param, `param:${inParam.name}`, '=',
                        this.valueToNN(inParam.value, new Scope(outschema)));
                }
            }
        }

        return List.concat(this._invocationToNN(action), const_param, param_passing);
    }

    actionToNN(action, outschema) {
        if (action.isVarRef)
            throw new UnsynthesizableError('Action macros');
        if (action.isNotify)
            return action.name;
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
    assignmentToNN(ass) {
        return List.concat('let', 'param:' + ass.name, '=', '(', this.tableToNN(ass.value.toLegacy()), ')');
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
            return List.concat(`@${fn.kind}.${fn.channel}`, 'filter', this.cnfFilterToNN(filter, new Scope(fn.schema)));
    }

    permissionRuleToNN(rule) {
        let principal;
        let filter = filterToCNF(rule.principal);
        if (filter.isFalse)
            throw new UnsynthesizableError('Always false filters');
        if (filter.isTrue) {
            principal = 'true';
        } else {
            const localschema = new Ast.FunctionDef(null, 'query', null, '', [], { is_list:false, is_monitorable:false }, [
                new Ast.ArgumentDef(null, Ast.ArgDirection.OUT, 'source', new Type.Entity('tt:contact'), {}, {}),
            ]);
            principal = this.cnfFilterToNN(filter, new Scope(localschema));
        }
        let first = this.permissionFunctionToNN(rule.query, 'now');
        let second = this.permissionFunctionToNN(rule.action, 'notify');

        const sequence = List.concat('policy', principal, ':', first, '=>', second);
        return sequence.flatten([]);
    }

    programToNN(program) {
        if (program.classes.length !== 0 ||
            program.declarations.length !== 0 ||
            program.statements.length !== 1)
            throw new UnsynthesizableError('Programs with declarations or multiple rules');

        let principal = null;
        if (program.principal)
            principal = this.valueToNN(program.principal);
        let sequence;

        if (program.statements[0] instanceof Ast.Assignment) {
            sequence = this.assignmentToNN(program.statements[0]);
        } else {
            const legacyRule = program.statements[0].toLegacy();

            if (legacyRule.isRule)
                sequence = this.ruleToNN(legacyRule);
            else
                sequence = this.commandToNN(legacyRule);
            if (program.principal)
                sequence = List.concat('executor', '=', principal, ':', sequence);
        }

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
        else if (intent.isChoice)
            return List.concat('choice', String(intent.value));
        else if (intent.isAnswer)
            return List.concat('answer', this.valueToNN(intent.value));
        else
            throw new TypeError(`Unrecognized bookkeeping intent ${intent}`);
    }

    bookkeepingToNN(program) {
        return List.concat('bookkeeping', this._bookkeepingIntentToNN(program.intent)).flatten([]);
    }

    _historyResultToNN(ast) {
        let sequence = List.concat('#[', 'results', '=', '[');
        let first = true;
        for (let result of ast.results) {
            if (first)
                first = false;
            else
                sequence = List.concat(sequence, ',');
            sequence = List.concat(sequence, this.valueToNN(new Ast.Value.Object(result.value), null));
        }
        sequence = List.concat(sequence, ']', ']');
        if (!ast.count.isNumber || ast.count.value > ast.results.length)
            sequence = List.concat(sequence, '#[', 'count', '=', this.valueToNN(ast.count, null), ']');
        if (ast.more)
            sequence = List.concat(sequence, '#[', 'more', '=', 'true', ']');
        if (ast.error)
            sequence = List.concat(sequence, '#[', 'error', '=', this.valueToNN(ast.error, null), ']');
        return sequence;
    }

    _historyItemToNN(item) {
        let sequence;

        const legacyRule = item.stmt.toLegacy();
        if (legacyRule.isRule)
            sequence = List.concat(this.ruleToNN(legacyRule));
        else
            sequence = List.concat(this.commandToNN(legacyRule));
        if (item.results !== null)
            sequence = List.concat(sequence, this._historyResultToNN(item.results));
        else if (item.confirm !== 'accepted')
            sequence = List.concat(sequence, '#[', 'confirm', '=', 'enum:' + item.confirm, ']');

        return List.concat(sequence, ';');
    }

    dialogueStateToNN(state) {
        let list = List.concat('$dialogue', `@${state.policy}.${state.dialogueAct}`);
        assert(state.dialogueActParam === null || Array.isArray(state.dialogueActParam));
        if (state.dialogueActParam) {
            let first = true;
            for (let arg of state.dialogueActParam.sort()) {
                if (first)
                    first = false;
                else
                    list = List.concat(list, ',');
                list = List.concat(list, 'param:' + arg);
            }
        }
        list = List.concat(list, ';');
        for (let item of state.history)
            list = List.concat(list, this._historyItemToNN(item));
        return list.flatten([]);
    }

    toNN(program) {
        if (program instanceof Ast.ControlCommand)
            return this.bookkeepingToNN(program);
        else if (program instanceof Ast.Program)
            return this.programToNN(program);
        else if (program instanceof Ast.PermissionRule)
            return this.permissionRuleToNN(program);
        else if (program instanceof Ast.DialogueState)
            return this.dialogueStateToNN(program);
        else
            throw new TypeError();
    }
}
