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
// Author: Ryan Cheng <ryachen@nuevaschool.org>
//         Giovanni Campagna <gcampagn@cs.stanford.edu>

import * as Ast from './ast';
import assert from "assert";

import * as Utils from "./utils";

function prettyprint(sparql) {
    sparql = sparql.replace(/\s+/g, ' ').trim();

    const tokens = sparql.split(' ');
    const prettyprinted = [];
    let tab = 0;
    let newline = false;
    for (let token of tokens) {
        const prefix =  Array(tab * 2).fill(' ').join('');
        if (newline)
            prettyprinted.push(prefix);
        newline = false;
        if (token === 'WHERE')
            prettyprinted.push('\n');
        if (token === '{') {
            tab += 1;
            prettyprinted.push('{\n');
            newline = true;
            continue;
        }
        if (token === '}') {
            tab -= 1;
            prettyprinted.push('\n');
            prettyprinted.push(Array(tab * 2).fill(' ').join(''));
            prettyprinted.push('}\n');
            newline = true;
            continue;
        }
        if (token.endsWith('.')) {
            prettyprinted.push(token + '\n');
            newline = true;
            continue;
        }
        newline = false;
        prettyprinted.push(token + ' ');
    }
    return prettyprinted.join('').replace(/\n\s*\n/g, '\n').trim();
}

export default class WikidataSparqlConverter {
    convert(program) {
        this._nextTableIndex = 0;
        this._tableIndices = new Map(); // from Invocation to number

        this._nextParamId = 0;
        this._boundParameters = new Set();

        this._limitCount = 5;
        this._limitOffset = 0;

        this._whereClause = [];
        this._additionalSparql = [];
        this._restrictDomains = [];

        assert(
            program.isProgram &&
                program.statements.length === 1 &&
                program.statements[0] instanceof Ast.ExpressionStatement
        );
        const expression = program.statements[0].expression;
        const table = expression.toLegacy();
        assert(table instanceof Ast.Table);

        const [scope, proj] = this._tableToSubquery(table);

        return this._buildQuery(scope, proj);
    }

    _getSparqlVar(scope, name) {
        let scopeEntry;
        if (name.isVarRef)
            scopeEntry = scope[name.name];
        else
            scopeEntry = scope[name];


        if (scopeEntry.isId) {
            return "?table" + scopeEntry.tableIndex;
        } else {
            if (!this._boundParameters.has(`${scopeEntry.paramId}`)) {
                this._whereClause.push([
                    `?table${scopeEntry.tableIndex} wdt:${scopeEntry.wikidataId} ?p${scopeEntry.paramId}`,
                ]);

                this._boundParameters.add(`${scopeEntry.paramId}`);
            }
            return "?p" + scopeEntry.paramId;
        }
    }

    _buildQuery(scope, proj) {
        let getLabels = "";

        const convertedProj = proj.map((pname) => {
            const cleanName = pname.replace(/\./g, "__");

            const scopeEntry = scope[pname];
            let sparqlVar = this._getSparqlVar(scope, pname);

            getLabels += `${sparqlVar} rdfs:label ${sparqlVar}Label. `;
            if (scopeEntry.type.isEntity)
                return `(${sparqlVar} as ?${cleanName}) (${sparqlVar}Label as ?${cleanName}Label)`;
            else return `(${sparqlVar} as ?${cleanName})`;
        });

        const query = `SELECT DISTINCT ${convertedProj.join(" ")} WHERE {
        ${this._whereClause.join(".\n")}${this._whereClause.length > 0 ? '.' : ''}
        ${this._restrictDomains.join(".\n")}.
        SERVICE wikibase:label { bd:serviceParam wikibase:language "en". ${getLabels}}
        }${this._additionalSparql} LIMIT ${this._limitCount} OFFSET ${this._limitOffset}`;
        return prettyprint(query);
    }

    _tableToSubquery(table) {
        if (table.isInvocation) {
            const wikidataSubject = table.schema.getAnnotation(
                "wikidata_subject"
            );

            if (wikidataSubject !== undefined) {
                this._restrictDomains.push(
                    `?table${this._nextTableIndex} p:P31/ps:P31/wdt:P279* wd:${wikidataSubject}`
                );
            }
            const tableIndex = this._nextTableIndex++;

            this._tableIndices.set(table.invocation, tableIndex);
            const scope = {};
            for (let argname in table.invocation.schema.out) {
                const arg = table.invocation.schema.getArgument(argname);
                const type = table.invocation.schema.out[argname];
                const isUnique = arg.unique;

                if (argname === "id") {
                    scope[argname] = {
                        isId: true,
                        isUnique: isUnique,
                        tableIndex,
                        paramId: -1,
                        type,
                    };
                } else {
                    const paramId = this._nextParamId++;
                    scope[argname] = {
                        isId: false,
                        isUnique: isUnique,
                        tableIndex,
                        paramId,
                        type,
                        wikidataId: arg.getImplementationAnnotation('wikidata_id')
                    };
                }
            }
            return [scope, table.schema.default_projection.length > 0 ? table.schema.default_projection : ['id']];
        } else if (table.isFilter) {
            const [scope, projection] = this._tableToSubquery(table.table);
            this._whereClause.push(...this._mapFilter(table, table.filter, scope));
            return [scope, projection];
        } else if (table.isAlias) {
            const [innerScope, innerProjection] = this._tableToSubquery(
                table.table
            );
            const outerScope = {};
            for (let name in innerScope) {
                outerScope[name] = innerScope[name];
                outerScope[table.name + "." + name] = innerScope[name];
            }
            const outerProjection = innerProjection.slice();
            for (let arg of innerProjection)
                outerProjection.push(table.name + "." + arg);

            return [outerScope, outerProjection];
        } else if (table.isProjection) {
            const [scope, ] = this._tableToSubquery(table.table);
            const outerProjection = table.args;
            return [scope, outerProjection];
        } else if (table.isJoin) {
            assert(table.in_params.length === 0);
            const [lhsScope, lhsProj] = this._tableToSubquery(table.lhs);
            const [rhsScope, rhsProj] = this._tableToSubquery(table.rhs);

            const outerScope = {};
            for (let lhsParam in lhsScope)
                outerScope[lhsParam] = lhsScope[lhsParam];
            for (let rhsParam in rhsScope)
                outerScope[rhsParam] = rhsScope[rhsParam];

            const outerProjection = [];
            for (let rhsParam of rhsProj) outerProjection.push(rhsParam);

            for (let lhsParam of lhsProj) {
                if (outerProjection.indexOf(lhsParam) >= 0) continue;
                outerProjection.push(lhsParam);
            }
            return [outerScope, outerProjection];
        } else if (table.isSort) {
            const [scope, projection] = this._tableToSubquery(table.table);
            let field = table.field;
            let direction = table.direction;
            const filterLHS = this._getSparqlVar(scope, field);
            let sort_code = ` ORDER BY ${direction}(${filterLHS})`;
            this._additionalSparql.push(sort_code);
            return [scope, projection];
        } else if (table.isIndex) {
            const [scope, projection] = this._tableToSubquery(table.table);
            const indices = table.indices;
            if (indices.length > 1)
                throw new TypeError(`Array indexing is not supported`);

            this._limitCount = 1;
            this._limitOffset = indices[0].value - 1;
            return [scope, projection];
        } else if (table.isSlice) {
            const [scope, projection] = this._tableToSubquery(table.table);
            this._limitCount = table.limit.value - table.base.value;
            this._limitOffset = table.base.value;
            return [scope, projection];
        } else if (Utils.isUnaryTableToTableOp(table)) {
            return this._tableToSubquery(table.table);
        } else {
            throw new TypeError(`Not implemented`);
        }
    }

    _mapFilter(table, filter, scope, negate = false) {
        if (filter.isTrue) return [];
        if (filter.isFalse) throw new TypeError(`false filter`);

        if (filter.isNot) return this._mapFilter(table, filter.expr, scope, !negate);

        if (filter.isAnd || filter.isOr) {
            let subclauses = [];

            for (let operand of filter.operands) {
                const name = operand.name;
                if (name !== undefined && typeof name === "string") {
                    const scopeEntry = scope[name];
                    if (this._boundParameters.has(`${scopeEntry.paramId}`))
                        this._nextParamId++;
                }
                subclauses.push(this._mapFilter(table, operand, scope, negate));
            }

            if (filter.isAnd) {
                return [].concat(...subclauses); // flatten the arrays
            } else {
                // FIXME: OR fitler is broken
                const filterClauses = [].concat(...subclauses);

                const orRHSIndex = this._whereClause.length - 1;
                const orLHSIndex =
                    this._whereClause.length - filterClauses.length;

                const UnionRHS = this._whereClause[orRHSIndex];
                const UnionLHS = this._whereClause.slice(
                    orLHSIndex,
                    filterClauses.length - 1
                );

                //moves filters into the union
                const rhsFilter = filterClauses[filterClauses.length - 1];
                filterClauses.pop();

                const UnionClause = `
                {${UnionRHS} \n ${rhsFilter}}
                UNION
                {${UnionLHS.join(".\n")}}
                `;

                //remove independent clauses and replace them with a union clause
                this._whereClause.splice(
                    orLHSIndex,
                    this._whereClause.length - orLHSIndex
                );
                this._whereClause.push(UnionClause);

                return filterClauses;
            }
        } else {
            if (filter.isExternal) throw new TypeError(`not implemented`);

            let operator = filter.operator;
            if (operator.startsWith('in_array')) {
                const newOperator = operator.endsWith('~') ? '=~' : '==';
                const newFilter = new Ast.BooleanExpression.Or(null, filter.value.value.map((value) => {
                    return new Ast.BooleanExpression.Atom(null, filter.name, newOperator, value);
                }));
                return this._mapFilter(table, newFilter, scope, negate);
            }

            if (operator === "==" || operator === "contains") operator = "=";
            if (operator === "contains~") operator = "=~";

            if (negate) {
                switch (operator) {
                case "==":
                case "contains":
                    operator = "!=";
                    break;
                case ">=":
                    operator = "<";
                    break;
                case "<=":
                    operator = ">";
                    break;
                case "!=":
                    operator = "=";
                    break;
                }
            }

            const value = filter.value;

            let filterRHS;
            let filterLHS;

            if (value.isLocation && (!value.value.lat || !value.value.lon))
                throw new Error('Conversion to SPARQL for location type is not supported yet.');

            if (value.isVarRef) {
                filterRHS = this._getSparqlVar(scope, value);
                filterLHS = this._getSparqlVar(scope, filter.name);
            } else {
                const scopeEntry = scope[filter.name];
                const isUnique = scopeEntry.isUnique;

                if (value.isArray) {
                    let filterTriplets = [];

                    const array = value.toJS();
                    for (let i = 0; i < array.length; i++) {
                        const parameterIndex = this._nextParamId++;
                        scope[filter.name].paramId = parameterIndex;
                        filterLHS = this._getSparqlVar(scope, filter.name, 0);
                        filterTriplets.push(
                            `FILTER (${filterLHS} ${operator} wd:${array[i]})`
                        );
                    }

                    return filterTriplets;
                }
                filterLHS = this._getSparqlVar(scope, filter.name);

                if (value.isNumber || value.isMeasure) {
                    //converts value to the correct units
                    let numValue = value.toJS();
                    filterRHS = `"${numValue}"^^xsd:decimal`;
                } else if (value.isDate) {
                    //reformat date
                    filterRHS = reformat_date(value.toJS());
                } else if (value.isString) {
                    if (!isUnique) {
                        const stringIndex = `${scopeEntry.paramId}`;
                        filterRHS = `?string${stringIndex}`;
                    } else {
                        filterRHS = `wd:${value.toJS()}`;
                    }
                } else if (value.isEntity) {
                    if (value.value) {
                        filterRHS = `wd:${value.toJS()}`;
                    } else {
                        const paramId = this._nextParamId++;
                        return [ `
                          ${filterLHS} rdfs:label ?p${paramId}.
                          FILTER CONTAINS(lcase(?p${paramId}), '${value.display}')
                          `
                        ];
                    }
                } else {
                    filterRHS = `wd:${value.toJS()}`;
                }
            }

            if (operator === "=~" && table.schema.getArgType(filter.name).isString) {
                const paramId = this._nextParamId++;
                if (negate) {
                    return [
                        `
                    OPTIONAL { ${filterLHS} rdfs:label ?p${paramId} }
                    FILTER NOT EXISTS { FILTER (CONTAINS(lcase(?p${paramId}), '${value.toJS()}') && CONTAINS(lcase(${filterLHS}), '${value.toJS()}) }
                    `,
                    ];
                }
                return [
                    `
                  OPTIONAL { ${filterLHS} rdfs:label ?p${paramId} }
                  FILTER (CONTAINS(lcase(?p${paramId}), '${value.toJS()}') || CONTAINS(lcase(${filterLHS}), '${value.toJS()}'))
                  `,
                ];
            } else if (operator === "=~") {
                const paramId = this._nextParamId++;
                if (negate) {
                    return [
                        `
                    ${filterLHS} rdfs:label ?p${paramId}.
                    FILTER NOT EXISTS { FILTER CONTAINS(lcase(?p${paramId}), '${value.toJS()}' }
                    `,
                    ];
                }
                return [
                    `
                  ${filterLHS} rdfs:label ?p${paramId}. 
                  FILTER CONTAINS(lcase(?p${paramId}), '${value.toJS()}')
                  `,
                ];
            }

            if (scope[filter.name].isId && operator === '==') {
                // if ID is a parameter for a filter
                // filterLHS will be a table and filterRHS will be a parameter
                // parameters must come before tables, so the order is reversed

                return [`FILTER (${filterRHS} ${operator} ${filterLHS})`];
            }

            return [`FILTER (${filterLHS} ${operator} ${filterRHS})`];
        }
    }
}

function reformat_date(date) {
    let year = date.getFullYear();
    //ensures that the month and date are two digit values
    let month = ("0" + (date.getMonth() + 1)).slice(-2);
    let day = ("0" + date.getDate()).slice(-2);
    const formatted_date = `"${year}-${month}-${day}"^^xsd:dateTime`;
    return formatted_date;
}
