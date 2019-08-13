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

const assert = require('assert');

const Utils = require('./utils');

module.exports = class WikidataSparqlConverter {
    constructor() {
        this._nextTableIndex = 0;
        this._tableIndices = new Map; // from Invocation to number

        this._nextParamIndex = 0;
        this._boundParameters = new Set;

        this._whereClause = [];
        this._additionalSparql = [];
    }

    convert(program) {
        assert(program.isProgram && program.rules.length === 1 && program.rules[0].table);
        let table = program.rules[0].table;

        const [scope, proj] = this._tableToSubquery(table);
        return this.buildQuery(scope, proj);
    }

    _getSparqlVar(scope, name) {
        const scopeEntry = scope[name];
        if (scopeEntry.isId) {
            return '?table' + scopeEntry.tableIndex;
        } else {
            if (!this._boundParameters.has(scopeEntry.paramIndex)) {
                this._whereClause.add(['?table' + scopeEntry.tableIndex, 'wdt:' + name, '?p' + scopeEntry.paramIndex]);
                this._boundParameters.add(scopeEntry.paramIndex);
            }
            return '?p' + scopeEntry.paramIndex;
        }
    }

    _buildQuery(scope, proj) {
        const convertedProj = proj.map((pname) => {
            const cleanName = pname.replace(/\./g, '__');

            const scopeEntry = scope[pname];
            const sparqlVar = this._getSparqlVar(scope, pname);
            if (scopeEntry.type.isEntity) {
                return `(${sparqlVar} as ?${cleanName}) (${sparqlVar}Label as ?${cleanName}Label)`;
            } else {
                return `(${sparqlVar} as ?${cleanName})`;
            }
        });

        return `SELECT ${convertedProj.join(' ')} WHERE { ${this._whereClause.join('\n')} } ${this._additionalSparql}`;
    }

    _tableToSubquery(table) {
        if (table.isInvocation) {
            const tableIndex = this._nextTableIndex++;
            this._tableIndices.set(table.invocation, tableIndex);

            const scope = {};
            for (let argname in table.invocation.out) {
                const type = table.invocation.out[argname];
                if (argname === 'id') {
                    scope[argname] = {
                        isId: true,
                        tableIndex,
                        paramIndex: -1,
                        type
                    };
                } else {
                    const paramIndex = this._nextParamIndex++;
                    scope[argname] = {
                        isId: false,
                        tableIndex,
                        paramIndex,
                        type
                    };
                }
            }
            return [scope, table.schema.default_projection];
        } else if (table.isFilter) {
            const [scope, projection] = this._tableToSubquery(table.table);
            this._whereClause.push(...this._mapFilter(table.filter, scope));
            return [scope, projection];
        } else if (table.isAlias) {
            const [innerScope, innerProjection] = this._tableToSubquery(table.table);
            const outerScope = {};
            for (let name in innerScope) {
                outerScope[name] = innerScope[name];
                outerScope[table.name + '.' + name] = innerScope[name];
            }
            const outerProjection = innerProjection.slice();
            for (let arg of innerProjection)
                outerProjection.push(table.name + '.' + arg);

            return [outerScope, outerProjection];
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
            for (let rhsParam of rhsProj)
                outerProjection.push(rhsParam);

            for (let lhsParam of lhsProj) {
                if (outerProjection.indexOf(lhsParam) >= 0)
                    continue;
                outerProjection.push(lhsParam);
            }
            return [outerScope, outerProjection];
        } else if (table.isSort) {
            throw new Error(`todo`);
        } else if (Utils.isUnaryTableToTableOp(table)) {
            return this._tableToSubquery(table.table);
        } else {
            throw new TypeError(`Not implemented`);
        }
    }

    _mapFilter(filter, scope, negate = false) {
        if (filter.isTrue)
            return [];
        if (filter.isFalse)
            throw new TypeError(`false filter`);

        if (filter.isNot)
            return this._mapFilter(filter.expr, scope, !negate);

        if (filter.isAnd || filter.isOr) {
            let subclauses = [];

            for (let operand of filter.operands) {
                subclauses.push(this._mapFilter(operand, scope, negate));
            }

            if (filter.isAnd)
                return [].concat(...subclauses); // flatten the arrays
            else if (filter.isOr)
                throw new Error(`todo`);
        } else {
            if (filter.isExternal)
                throw new TypeError(`not implemented`);

            let operator = filter.operator;
            if (negate) {
                // todo invert operator
            }
            const value = filter.value;


            const filterLHS = this._getSparqlVar(scope, filter.name);
            let filterRHS;
            if (value.isVarRef) {
                filterRHS = this._getSparqlVar(scope, value.name);
            } else {
                // todo
            }

            return [`FILTER (${filterLHS} ${operator} ${filterRHS})`];
        }
    }
};
