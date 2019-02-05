// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingTalk
//
// Copyright 2019 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Silei Xu <silei@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const assert = require('assert');
const { NotImplementedError } = require('./errors');

// Compile a substatement of ThingTalk into a SQL query
module.exports = class SqlCompiler {
    constructor(ast, scope) {
        this._ast = ast; // Statement.Rule or Statement.Command
        this._aliasIndex = 0;
        this._scope = scope;

        this._binderIndex = 1; // SQLite binders starts at 1
        this._binders = {};
        this._revbinders = {};
    }

    get binders() {
        return this._binders;
    }

    compile() {
        assert(this._ast.isRule || this._ast.isCommand);
        if (this._ast.isRule) return this._compileStream(this._ast.stream);
        return this._compileTable(this._ast.table);
    }

    _bindVariable(value) {
        if (value in this._revbinders)
            return this._revbinders[value];

        let binder = this._binderIndex++;
        this._binders[binder] = value;
        this._revbinders[value] = '?' + binder;
        return '?' + binder;
    }

    _compileStream(ast, cols='*', where='1') {
        // TODO: use sqlite triggers to compile streams
        throw new NotImplementedError(ast);
    }

    _compileTable(ast, cols='*', where='1') {
        if (ast.isInvocation) {
            return this._compileInvocation(ast, cols, where);
        } else if (ast.isJoin) {
            let join;
            if (ast.in_params.length === 0) {
                join = `((${this._compileTable(ast.lhs)}) join (${this._compileTable(ast.rhs)}))`;
            } else {
                let alias_lhs = `_t${this._aliasIndex++}`, alias_rhs = `_t${this._aliasIndex++}`;
                let lhs = `${this._compileTable(ast.lhs)} as ${alias_lhs}`;
                let rhs = `${this._compileTable(ast.rhs)} as ${alias_rhs}`;
                join = `((${lhs}) join (${rhs}) on (${this._compileJoinCondition(ast.in_params, alias_lhs, alias_rhs)}))`;
            }
            return `select ${cols} from ${join} where ${where}`;
        } else if (ast.isProjection) {
            return this._compileTable(ast.table, ast.args.join(','), where);
        } else if (ast.isFilter) {
            return this._compileTable(ast.table, cols, `${where} and ${this._compileFilter(ast.filter)}`);
        } else {
            throw new NotImplementedError(ast);
        }
    }

    _compileInvocation(ast, cols='*', where='1') {
        // TODO: handle in_params (or disallow the use of in_params for db devices?)
        let table = ast.invocation.selector, channel = ast.invocation.channel;
        return `select ${cols} from "${table.kind}.${channel}" where ${where}`;
    }

    _compileJoinCondition(in_params, lhs, rhs) {
        return in_params.map((param) => {
            let name = param.name, value = param.value;
            return `${lhs}.${name} = ${rhs}.${this._compileValue(value)}`;
        }).join(',');
    }

    // when compiling value for joins: resolve_ref = false, ie, simply return the variable name
    // when compiling value for filters: resolve_ref = true, ie, return the actual value of the variable
    _compileValue(value, resolve_ref = false) {
        if (value.isVarRef) {
            if (resolve_ref) {
                if (this._scope[value.name])
                    return this._bindVariable(this._compileValue(this._scope[value.name]));
                throw new Error("Variable not in scope: " + value.name);
            } else {
                return value.name;
            }
        } else if (value.isEvent) {
            if (value.name === 'type') throw new Error("Not implemented yet");
            throw new Error("Not implemented yet");
        } else if (value.isString || value.isEntry) {
            return this._bindVariable(String(value.toJS()));
        } else if (value.isBoolean) {
            return value.value ? '1' : '0';
        } else {
            return this._bindVariable(value.toJS());
        }
    }

    _compileFilter(filter) {
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
            if (expr.isExternal)
                throw new Error("Not implemented yet.");

            let lhs = expr.name;
            let op = expr.operator;
            let rhs = self._compileValue(expr.value, true);

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
        })(filter);
    }
};