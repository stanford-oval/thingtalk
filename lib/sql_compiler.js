// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingTalk
//
// Copyright 2017-2018 The Board of Trustees of the Leland Stanford Junior University
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
// Author: Silei Xu <silei@cs.stanford.edu>

import assert from 'assert';

import { stringEscape } from './utils/escaping';

const prefix = 'memory_';

// Compile a substatement of ThingTalk into a SQL query
export default class SqlCompiler {
    constructor(queries, versions, scope) {
        this._queries = queries;

        this._versions = versions;
        this._outerscope = scope;
        this._scope = {};

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
        let prevquery = null;
        for (let i = 0; i < this._queries.length-1; i++)
            prevquery = this._genCommand(this._queries[i], prevquery, i, false);

        return this._genCommand(this._queries[this._queries.length-1], prevquery, this._queries.length-1, true);
    }

    _bindVariable(varName) {
        if (varName in this._revbinders)
            return this._revbinders[varName];

        let binder = this._nextbinder++;
        this._binders[binder] = varName;
        this._revbinders[varName] = '?' + binder;
        return '?' + binder;
    }

    _genCommand(query, prevquery, index, setOutput) {
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
        if (query.out_params) {
            if (setOutput) {
                for (let out_param of query.out_params) {
                    if (aggregation && !isArgMinMax)
                        this._outputs[out_param.name] = aggregationAlias;
                    else
                        this._outputs[out_param.name] = out_param.value;
                    cols.push(out_param.value);
                }
            } else {
                for (let out_param of query.out_params) {
                    if (aggregation && !isArgMinMax)
                        this._scope[out_param.name] = `__q${index}.${aggregationAlias}`;
                    else
                        this._scope[out_param.name] = `__q${index}.${out_param.value}`;
                    cols.push(out_param.value);
                }
            }
        }

        if (!aggregation)
            return this._queryCommand(table, cols, prevquery, index-1, where);
        else if (isArgMinMax)
            return this._queryArgm(table, cols, aggregation, prevquery, index-1, where);
        else
            return this._queryAggregation(table, aggregation, aggregationAlias, prevquery, index-1, where);
    }

    _queryCommand(table, cols, prevquery, prevqueryindex, where) {
        if (prevquery)
            return `select ${cols.length ? cols.join(', ') : '1'} from (${prevquery}) as __q${prevqueryindex} join "${prefix+table}" ${where}`;
        else
            return `select ${cols.length ? cols.join(', ') : '1'} from "${prefix+table}" ${where}`;
    }

    _queryAggregation(table, aggregation, aggregationAlias, prevquery, prevqueryindex, where) {
        if (prevquery)
            return `select ${aggregation.type}(${aggregation.field}) as ${aggregationAlias} from (${prevquery}) as __q${prevqueryindex} join "${prefix+table}" ${where}`;
        else
            return `select ${aggregation.type}(${aggregation.field}) as ${aggregationAlias} from "${prefix+table}" ${where}`;
    }

    _queryArgm(table, cols, aggregation, prevquery, prevqueryindex, where) {
        let subAggregation = aggregation.set({ type: aggregation.type.substring('arg'.length) });
        if (subAggregation.count) {
            let order = (subAggregation.type === 'max') ? 'desc' : 'asc';
            where += `order by ${aggregation.field} ${order} limit ${aggregation.count}`;
        } else {
            let subquery = this._queryAggregation(table, subAggregation, '__ignored', null, 0, where);
            if (where)
                where += `and ${aggregation.field} = (${subquery}) `;
            else
                where += `where ${aggregation.field} = (${subquery}) `;
        }
        return this._queryCommand(table, cols, prevquery, prevqueryindex, where);
    }

    _findFilterVariable(arg, query) {
        const schema = query.schema;
        if (schema.out[arg]) {
            // use the field name directly
            return arg;
        } else if (schema.inReq[arg] || schema.inOpt[arg]) {
            switch (arg) {
            case 'table':
                return stringEscape(query.__table);
            case 'principal':
                return query.__principal ? stringEscape(query.__principal.value.toJS()) : 'null';
            default:
                throw new Error('Unexpected input argument to get_record()');
            }
        } else if (this._scope[arg]) {
            return this._scope[arg];
        } else {
            assert(this._outerscope[arg]);
            return this._bindVariable(this._outerscope[arg]);
        }
    }

    _filterParser(query) {
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

            let lhs = self._findFilterVariable(arg, query);

            let op = filter.operator;
            let value = filter.value;

            let rhs;
            if (value.isVarRef) {
                rhs = self._findFilterVariable(value.name, query);
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
