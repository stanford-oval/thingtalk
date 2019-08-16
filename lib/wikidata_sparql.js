// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingTalk
//
// Copyright 2019 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Ryan Cheng <ryachen@nuevaschool.org>
//         Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const assert = require("assert");

const Utils = require("./utils");

const Units = require("./units");

module.exports = class WikidataSparqlConverter {
    convert(program) {
        this._nextTableIndex = 0;
        this._tableIndices = new Map(); // from Invocation to number

        this._nextParamId = 0;
        this._boundParameters = new Set();

        this._limitOffset = 0;

        this._whereClause = [];
        this._additionalSparql = [];
        this._stringConversions = [];
        this._restrictDomains = [];

        assert(
            program.isProgram &&
                program.rules.length === 1 &&
                program.rules[0].table
        );
        let table = program.rules[0].table;

        const [scope, proj] = this._tableToSubquery(table);

        return this._buildQuery(scope, proj);
    }

    _getSparqlVar(scope, name) {
        let scopeEntry;
        if (name.isVarRef) {
            scopeEntry = scope[name.name];
            name = name.name.split(".")[1];
        } else {
            scopeEntry = scope[name];
        }

        if (scopeEntry.isId) {
            return "?table" + scopeEntry.tableIndex;
        } else {
            if (!this._boundParameters.has(`${scopeEntry.paramId}`)) {
                this._whereClause.push([
                    `?table${scopeEntry.tableIndex} wdt:${name} ?p${scopeEntry.paramId}`,
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

        return `SELECT ${convertedProj.join(" ")} WHERE {
        ${this._stringConversions.join(" ")}
        ${this._whereClause.join(".\n")}.
        ${this._restrictDomains.join(".\n")}
        SERVICE wikibase:label { bd:serviceParam wikibase:language "en". ${getLabels}}}
        ${this._additionalSparql}
        limit1 offset ${this._limitOffset}`;
    }

    _tableToSubquery(table) {
        if (table.isInvocation) {
            const wikidataSubject = table.schema.getAnnotation(
                "wikidata_subject"
            );

            if (wikidataSubject !== undefined) {
                this._restrictDomains.push(
                    `?table${this._nextTableIndex} wdt:P31 wd:${wikidataSubject}`
                );
            }
            const tableIndex = this._nextTableIndex++;

            this._tableIndices.set(table.invocation, tableIndex);
            const scope = {};
            for (let argname in table.invocation.schema.out) {
                const type = table.invocation.schema.out[argname];
                const isUnique = table.invocation.schema.getArgument(argname)
                    .unique;

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
                    };
                }
            }
            return [scope, table.schema.default_projection];
        } else if (table.isFilter) {
            const [scope, projection] = this._tableToSubquery(table.table);
            this._whereClause.push(...this._mapFilter(table.filter, scope));
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
            const [scope, innerProjection] = this._tableToSubquery(table.table);
            const outerProjection = innerProjection.slice();

            for (let args of table.args) {
                if (outerProjection.indexOf(args) >= 0) continue;
                outerProjection.push(args);
            }
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
            let sort_code = `ORDER BY ${direction}(${filterLHS})`;
            this._additionalSparql.push(sort_code);
            return [scope, projection];
        } else if (table.isIndex) {
            const [scope, projection] = this._tableToSubquery(table.table);
            const indices = table.indices;
            if (indices.length > 1)
                throw new TypeError(`Array indexing is not supported`);

            this._limitOffset = indices[0].value;
            return [scope, projection];
        } else if (Utils.isUnaryTableToTableOp(table)) {
            return this._tableToSubquery(table.table);
        } else {
            throw new TypeError(`Not implemented`);
        }
    }

    _mapFilter(filter, scope, negate = false) {
        if (filter.isTrue) return [];
        if (filter.isFalse) throw new TypeError(`false filter`);

        if (filter.isNot) return this._mapFilter(filter.expr, scope, !negate);

        if (filter.isAnd || filter.isOr) {
            let subclauses = [];

            for (let operand of filter.operands) {
                const name = operand.name;
                if (name !== undefined && typeof name === "string") {
                    const scopeEntry = scope[name];
                    if (this._boundParameters.has(`${scopeEntry.paramId}`))
                        this._nextParamId++;
                }
                subclauses.push(this._mapFilter(operand, scope, negate));
            }

            if (filter.isAnd) {
                return [].concat(...subclauses); // flatten the arrays
            } else {
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
            if (operator === "==" || operator === "contains") operator = "=";

            if (negate) {
                switch (operator) {
                    case "==":
                    case "contains":
                        operator = "!=";
                        break;
                    case ">":
                        operator = "<=";
                        break;
                    case "<":
                        operator = ">=";
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

            if (value.isVarRef) {
                filterRHS = this._getSparqlVar(scope, value);
                filterLHS = this._getSparqlVar(scope, filter.name);
            } else {
                let filterValue = value.toJS();
                const unit = value.unit;
                const scopeEntry = scope[filter.name];
                const isUnique = scopeEntry.isUnique;

                if (value.isArray) {
                    let filterTriplets = [];

                    for (let i = 0; i < filterValue.length; i++) {
                        const parameterIndex = this._nextParamId++;
                        scope[filter.name].paramId = parameterIndex;
                        filterLHS = this._getSparqlVar(scope, filter.name, 0);
                        filterTriplets.push(
                            `FILTER (${filterLHS} ${operator} wd:${filterValue[i]})`
                        );
                    }

                    return filterTriplets;
                }
                filterLHS = this._getSparqlVar(scope, filter.name);

                if (value.isNumber || value.isMeasure) {
                    //converts value to the correct units
                    if (unit !== undefined) {
                        let numValue =
                            filterValue / Units.UnitsTransformToBaseUnit[unit];
                        filterRHS = `"${numValue}"^^xsd:decimal`;
                    }
                } else if (value.isDate) {
                    //reformat date
                    filterRHS = reformat_date(filterValue);
                } else if (value.isString) {
                    if (!isUnique) {
                        const stringIndex = `${scopeEntry.paramId}`;
                        filterRHS = `?string${stringIndex}`;

                        this._stringConversions.push(
                            `${filterRHS} ?label${stringIndex} '${filterValue}'@en.\n`
                        );
                    } else {
                        filterRHS = `wd:${filterValue}`;
                    }
                } else if (value.isEntity) {
                    filterRHS = `wd:${filterValue}`;
                } else {
                    filterRHS = `wd:${filterValue}`;
                }
            }
            if (operator === "=~") {
                const paramId = this._nextParamId++;

                if (negate) {
                    return [
                        `
                    ${filterLHS} rdfs:label ?p${paramId}.
                    FILTER NOT EXISTS {FILTER CONTAINS(?p${paramId}, '${value.toJS()}')}
                    `,
                    ];
                }
                return [
                    `
                  ${filterLHS} rdfs:label ?p${paramId}.
                  FILTER CONTAINS(?p${paramId}, '${value.toJS()}')
                  `,
                ];
            }

            if (scope[filter.name].isId) {
                //if ID is a parameter for a fitler
                //filterLHS will be a table and filterRHS will be a parameter
                //parameters must come before tables, so the order is reversed

                return [`FILTER (${filterRHS} ${operator} ${filterLHS})`];
            }

            return [`FILTER (${filterLHS} ${operator} ${filterRHS})`];
        }
    }
};

function reformat_date(date) {
    let year = date.getFullYear();
    //ensures that the month and date are two digit values
    let month = ("0" + (date.getMonth() + 1)).slice(-2);
    let day = ("0" + date.getDate()).slice(-2);
    const formatted_date = `"${year}-${month}-${day}"^^xsd:dateTime`;
    return formatted_date;
}
