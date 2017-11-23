// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingTalk
//
// Copyright 2017 Silei Xu <silei@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const assert = require('assert');

const { stringEscape } = require('./escaping');

const prefix = 'memory_';

// Compile a substatement of ThingTalk into a SQL query
module.exports = class SqlCompiler {
    constructor(queries, versions, scope) {
        this._queries = queries;

        this._versions = versions;
        this._scope = scope;

        this._binders = {};
        this._revbinders = {};
        this._outputs = {};
        this._nextbinder = 1; // sqlite binders start at 1
    }

    get binders() {
        return this._binders;
    }

    get outputs() {
        return this._outputs;
    }

    compile() {
        if (this._queries.length > 1) {
            // we need to compile a join
            throw new Error('NOT IMPLEMENTED: joins');
        }

        return this._genCommand(this._queries[0], true);
    }

    _bindVariable(varName) {
        if (varName in this._revbinders)
            return this._revbinders[varName];

        let binder = this._nextbinder++;
        this._binders[binder] = varName;
        this._revbinders[varName] = '?' + binder;
        return '?' + binder;
    }

    _genCommand(query, setOutput) {
        let version = this._bindVariable(this._versions[query.__table]);

        let where;
        let parsed = this._filterParser(query);
        if (parsed.length > 0)
            where = `where ${parsed} and _id <= ${version}`;
        else
            where = `where _id <= ${version}`;

        let table = query.__table;
        let aggregation = query.aggregation;
        let isArgMinMax = aggregation && aggregation.type.startsWith('argm');

        let aggregationAlias;
        if (aggregation && !isArgMinMax) {
            if (aggregation.type === 'count' && aggregation.field === '*')
                aggregationAlias = '__count_star';
            else
                aggregationAlias = `__${aggregation.type}_${aggregation.field}`;
        }
        let cols = [];
        if (setOutput) {
            for (let out_param of query.out_params) {
                if (aggregation && !isArgMinMax)
                    this._outputs[out_param.name] = aggregationAlias;
                else
                    this._outputs[out_param.name] = out_param.value;
                cols.push(out_param.value);
            }
        }

        if (!aggregation)
            return this._queryCommand(table, cols, where);
        else if (isArgMinMax)
            return this._queryArgm(table, aggregation, where);
        else
            return this._queryAggregation(table, aggregation, aggregationAlias, where);
    }

    _queryCommand(table, cols, where) {
        return `select ${cols.length ? cols.join(', ') : '*'} from "${prefix+table}" ${where}`;
    }

    _queryAggregation(table, aggregation, aggregationAlias, where) {
        return `select ${aggregation.type}(${aggregation.field}) as ${aggregationAlias} from "${prefix+table}" ${where}`;
    }

    _queryArgm(table, cols, aggregation, where) {
        let subAggregation = aggregation.set({ type: aggregation.type.substring('arg'.length) });
        if (subAggregation.count) {
            let order = (subAggregation.type === 'max') ? 'desc' : 'asc';
            where += `order by ${aggregation.field} ${order} limit ${aggregation.count}`;
        } else {
            let subquery = this._queryAggregation(table, subAggregation, '__ignored', where);
            if (where)
                where += `and ${aggregation.field} = (${subquery}) `;
            else
                where += `where ${aggregation.field} = (${subquery}) `;
        }
        return this._queryCommand(table, cols, where);
    }

    _filterParser(query) {
        const schema = query.schema;
        const self = this;

        return (function recursiveHelper(expr) {
            if (!expr || expr.isTrue || (expr.isAnd && expr.operands.length === 0)) return '1'; //always true
            if (expr.isFalse || (expr.isOr && expr.operands.length === 0)) return '0'; //always false

            if ((expr.isAnd || expr.isOr) && expr.operands.length === 1) return recursiveHelper(expr.operands[0]);

            if (expr.isAnd)
                return '(' + expr.operands.map(recursiveHelper).reduce((x, y) => `${x} and ${y}`) + ')';
            if (expr.isOr)
                return '(' + expr.operands.map(recursiveHelper).reduce((x, y) => `${x} or ${y}`) + ')';
            if (expr.isNot)
                return `not (${recursiveHelper(expr.expr)})`;
            if (expr.isExternal) {
                if (expr.selector.isBuiltin && expr.channel === 'get_record') {
                    let subquery = self._genCommand(expr, false);
                    return `exists (${subquery})`;
                }
                throw new Error("Not implemented yet.");
            }

            let filter = expr.filter;
            let arg = filter.name;

            let lhs;
            if (schema.out[arg]) {
                // use the field name directly
                lhs = arg;
            } else if (schema.inReq[arg] || schema.inOpt[arg]) {
                switch (arg) {
                case 'table':
                    lhs = stringEscape(query.__table);
                    break;
                case 'principal':
                    lhs = query.__principal ? stringEscape(query.__principal.value.toJS()) : 'null';
                    break;
                default:
                    throw new Error('Unexpected input argument to get_record()');
                }
            } else {
                assert(self._scope[arg]);
                lhs = self._bindVariable(self._scope[arg]);
            }

            let op = filter.operator;
            let value = filter.value;

            let rhs;
            if (value.isVarRef) {
                if (schema.out[value.name]) {
                    // use the field name directly
                    rhs = arg;
                } else if (schema.inReq[value.name] || schema.inOpt[value.name]) {
                    switch (value.name) {
                    case 'table':
                        rhs = stringEscape(query.__table);
                        break;
                    case 'principal':
                        rhs = query.__principal ? stringEscape(query.__principal.value.toJS()) : 'null';
                        break;
                    default:
                        throw new Error('Unexpected input argument to get_record()');
                    }
                } else {
                    assert(self._scope[value.name]);
                    rhs = self._bindVariable(self._scope[value.name]);
                }
            } else if (value.isEvent) {
                if (value.name === 'type')
                    rhs = self._bindVariable(self._scope.$outputType);
                else
                    throw new Error('NOT IMPLEMENTED: $event in get_record() filter');
            } else if (value.isString || value.isEntity) {
                rhs = stringEscape(String(value.toJS()));
            } else if (value.isBoolean) {
                rhs = value.value ? '1' : '0';
            } else {
                rhs = value.toJS();
            }

            switch (op) {
                case '=~':
                    return `instr(lower(${lhs}), lower(${rhs})) > 0`;
                case '~=':
                    return `instr(lower(${rhs}), lower(${lhs})) > 0`;

                case 'starts_with':
                    return `instr(lower(${lhs}), lower(${rhs})) = 1`;
                case 'prefix_of':
                    return `instr(lower(${rhs}), lower(${lhs})) = 1`;

                case 'ends_with':
                    return `substr(lower(${lhs}), -length(${rhs}) = ${rhs}`;
                case 'suffix_of':
                    return `substr(lower(${rhs}), -length(${lhs}) = ${lhs}`;

                // TODO: handle arrays by joins
                case 'contains':
                case 'in_array':
                case 'has_member':
                case 'group_member': throw new Error('Not supported operator in memory: ' + op);

                default:
                    return `${lhs} ${op} ${rhs}`;
            }
        })(query.filter);
    }
}
