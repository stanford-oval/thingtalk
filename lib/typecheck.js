// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingEngine
//
// Copyright 2015-2016 Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const Q = require('q');
const assert = require('assert');

const Ast = require('./ast');
const Type = require('./type');
const Utils = require('./utils');
const Builtin = require('./builtin');

const ALLOWED_PRINCIPAL_TYPES = new Set([
    'tt:contact', 'tt:contact_name', 'tt:contact_group', 'tt:contact_group_name'
]);
const ALLOWED_PRINCIPAL_TYPES_FOR_MEMORY = new Set([
    'tt:contact', 'tt:contact_name'
]);

function log(message) {
    let debug = true;
    if (debug) console.log(message);
}

class Scope {
    constructor(existing) {
        this._globalScope = existing ? existing._globalScope : {};
        this._scope = {};
        this._conflicts = new Set(); // conflicts in joins which won't be able to use
        this.$has_event = false;
    }

    has(name) {
        return name in this._scope;
    }

    hasGlobal(name) {
        return name in this._globalScope;
    }

    getSchema(name) {
        if (this.hasGlobal(name)) {
            return this._globalScope[name];
        }
    }

    add(name, type) {
        if (this.has(name))
            this._conflicts.add(name);
        this._scope[name] = type;
    }

    addGlobal(name, schema) {
        if (this.hasGlobal(name))
            throw new TypeError('Conflict on using ' + name);
        this._globalScope[name] = schema;
    }

    addConflict(name) {
        this._conflicts.add(name);
    }

    remove(name) {
        delete this._scope[name];
    }

    assign(name_type_pairs) {
        for (let name in name_type_pairs) {
            let type = name_type_pairs[name];
            if (type.isTable || type.isStream)
                this.addGlobal(name, Builtin.emptyFunction);
            else if (type.isFunctionDef)
                this.addGlobal(name, type);
            else
                this.add(name, type);
        }
    }

    merge(scope) {
        for (let name in scope._globalScope)
            this.add(name, scope.get(name));
        for (let name in scope._scope)
            this.add(name, scope.get(name));
    }

    clean(args) {
        this._scope = {};
        if (args)
            Object.keys(args).forEach((name) => delete this._globalScope[name]);
    }

    prefix(prefix) {
        let new_scope = {};
        for (let name in this._scope)
            new_scope[prefix + '.' + name] = this._scope[name];
        this._scope = new_scope;
    }

    get(name) {
        if (this._conflicts.has(name))
            throw new TypeError('Conflicted field name ' + name + ' after join, cannot be used.');
        return this._globalScope[name] || this._scope[name];
    }
}

function ensureSchema(schemas, classes, prim, primType, useMeta) {
    if (prim.schema)
        return Q();

    if (prim.isVarRef) {
        let principal;
        if (prim.principal) {
            typecheckPrincipal(prim.principal, true);
            principal = prim.principal.value;
        } else {
            principal = null;
        }
        return Utils.getMemorySchema(schemas, '', prim.name, principal, useMeta).then((schema) => {
            if (schema === null)
                throw new TypeError('Cannot find table ' + prim.name + ' in memory');
            prim.schema = schema;
        });
    }

    if (prim.selector.isBuiltin && ['new_record', 'get_record'].indexOf(prim.channel) > -1) {
        let table = findTableName(prim);
        prim.__table = table;
        let principal = findPrincipal(prim);
        prim.__principal = principal;
        return Utils.getMemorySchema(schemas, prim.channel, table,
            principal !== null ? principal.value.toJS() : null, useMeta)
            .then((schema) => {
                if (!schema)
                    throw new TypeError(`The table "${table}" does not exist`);
                prim.schema = schema;
            });
    }
    if (prim.selector.isBuiltin && primType === 'action') {
        if (prim.channel === 'notify')
            prim.schema = Builtin.Actions.notify;
        else if (prim.channel === 'return')
            prim.schema = Builtin.Actions['return'];
        else if (prim.channel === 'save')
            prim.schema = Builtin.Actions['save'];
        else
            throw new TypeError('Invalid builtin action ' + prim.channel);
        return Q();
    }
    if (prim.selector.isBuiltin) {
        throw new TypeError('Invalid builtin ' + primType + ' ' + prim.channel);
    }

    if (prim.selector.principal !== null)
        typecheckPrincipal(prim.selector.principal);

    return Utils.getSchemaForSelector(schemas, prim.selector.kind, prim.channel, primType, useMeta, classes).then((schema) => {
        prim.schema = schema;
    });
}

function typeForValue(value, scope) {
    if (value.isVarRef) {
        let type;
        if (value.name.startsWith('$context.location')) {
            type = Type.Location;
        } else {
            type = scope.get(value.name);
        }
        if (!type)
            throw new TypeError('Variable ' + value.name + ' is not in scope');
        return type;
    }
    if (value.isEvent && value.name !== 'program_id' && !scope.$has_event)
        throw new TypeError('Cannot access $event variables in the trigger');
    return value.getType();
}

function resolveTypeVars(type, typeScope) {
    if (type === 'string')
        return resolveTypeVars(typeScope[type], typeScope);
    if (type.isArray)
        return Type.Array(resolveTypeVars(type.elem, typeScope));
    if (type.isTuple)
        return Type.Tuple(type.schema.map((t) => resolveTypeVars(t, typeScope)));
    if (type.isMeasure && typeScope._unit)
        return Type.Measure(typeScope._unit);
    return type;
}


function typecheckPrincipal(principal, forMemory = false) {
    if (principal.isArray && principal.value.length === 0)
        return;
    if (principal.isArray) {
        for (let elem of principal.value) {
            if (!Type.isAssignable(elem.getType(), Type.Entity('tt:contact')))
                throw new TypeError('Invalid inline group specification, must consist of all contacts or contact names');
        }
    } else {
        assert(principal.isEntity);
        if (!ALLOWED_PRINCIPAL_TYPES.has(principal.type))
            throw new TypeError('Invalid principal, must be a contact or a group');
        if (!ALLOWED_PRINCIPAL_TYPES_FOR_MEMORY.has(principal.type) && forMemory)
            throw new TypeError('Invalid principal for memory access, must be a contact, not a group');
    }
}

function findPrincipal(prim) {
    let principal = prim.in_params.find((e) => {
        return e.name === 'principal'
    });
    if (!principal)
        return null;
    if (principal.value.isVarRef || principal.value.isEvent)
        throw new TypeError(`Parameter 'principal' of ${prim.channel} must be a constant`);
    if (!Type.isAssignable(principal.value.getType(), Type.Entity('tt:contact'), {}, true))
        throw new TypeError(`Invalid type for parameter 'principal' (got ${principal.value.getType()}, expected Entity(tt:contact))`);
    return principal;
}

function findTableName(prim) {
    let table = prim.in_params.find((e) => {
        return e.name === 'table'
    });
    if (!table)
        throw new TypeError('Missing required parameter table');
    if (table.value.isVarRef || table.value.isEvent)
        throw new TypeError(`Parameter 'table' of ${prim.channel} must be a constant`);
    if (!Type.isAssignable(table.value.getType(), Type.Entity('tt:table'), {}, true))
        throw new TypeError(`Invalid type for parameter table (got ${table.value.getType()}, expected Entity(tt:table))`);
    return String(table.value.toJS());
}

function resolveScalarExpressionOps(type_lhs, operator, type_rhs) {
    let op = Builtin.ScalarExpressionOps[operator];
    if (!op)
        throw new TypeError('Invalid operator ' + operator);
    for (let overload of op) {
        let typeScope = {};
        if (!Type.isAssignable(type_lhs, overload[0], typeScope, true))
            continue;
        if (!Type.isAssignable(type_rhs, overload[1], typeScope, true))
            continue;

        if (overload[2].isMeasure && typeScope['_unit'])
            return Type.Measure(typeScope['_unit']);
        return overload[2];
    }
    throw new TypeError(`Invalid parameter types ${type_lhs} and ${type_rhs} for ${operator}`);
}

function resolveScalarExpression(ast, schema, scope, schemas, classes, useMeta) {
    log('Type check scalar expression');
    if (ast.isBoolean) {
        typeCheckFilter(ast.value, schema, scope, schemas, classes, useMeta);
        return Type.Boolean;
    }
    if (ast.isPrimary) {
        if (ast.value.isVarRef) {
            let name = ast.value.name;
            let paramType = schema.inReq[name] || schema.inOpt[name] || schema.out[name] || scope.get(name);
            if (!paramType)
                throw new TypeError('Invalid filter parameter ' + name);
            return paramType;
        }
        return typeForValue(ast.value, scope);
    }
    if (ast.isDerived) {
        let operands = ast.operands.map((o) => resolveScalarExpression(o, schema, scope, schemas, classes, useMeta));
        return resolveScalarExpressionOps(operands[0], ast.op, operands[1]);
    }
}

function resolveFilterOverload(type_lhs, operator, type_rhs) {
    log('resolve filter overload');
    let op = Builtin.BinaryOps[operator];
    if (!op)
        throw new TypeError('Invalid operator ' + operator);
    for (let overload of op.types) {
        let typeScope = {};
        if (!Type.isAssignable(type_lhs, overload[0], typeScope, true))
            continue;
        if (!Type.isAssignable(type_rhs, overload[1], typeScope, true))
            continue;
        if (!Type.isAssignable(overload[2], Type.Boolean, typeScope, true))
            continue;
        return;
    }
    throw new TypeError(`Invalid parameter types ${type_lhs} and ${type_rhs} for ${operator}`);
}

function typeCheckFilter(ast, schema, scope, schemas, classes, useMeta) {
    log('Type check filter ...');
    return (function recursiveHelper(ast) {
        if (!ast)
            return Q();
        if (ast.isTrue || ast.isFalse)
            return Q();
        if (ast.isAnd || ast.isOr)
            return Q.all(ast.operands.map((op) => recursiveHelper(op)));
        if (ast.isNot)
            return recursiveHelper(ast.expr);

        if (ast.isAtom) {
            let name = ast.name;
            let type_lhs = schema.inReq[name] || schema.inOpt[name] || schema.out[name] || scope[name];
            if (!type_lhs)
                throw new TypeError('Invalid filter parameter ' + name);
            let type_rhs = typeForValue(ast.value, scope);
            resolveFilterOverload(type_lhs, ast.operator, type_rhs);
            return Q();
        } else {
            assert(ast.isExternal);
            return ensureSchema(schemas, classes, ast, 'query', useMeta).then(() => {
                typeCheckInputArgs(ast, scope, classes);
                return typeCheckFilter(ast.filter, ast.schema, scope, schemas, classes, useMeta);
            });
        }
    })(ast);
}

function resolveAggregationOverload(ast, operator, field, schema) {
    let fieldType = schema.out[field];
    if (!fieldType)
        throw new TypeError('Invalid aggregation field ' + field);
    let ag = Builtin.Aggregations[operator];
    if (!ag)
        throw new TypeError('Invalid aggregation ' + operator);

    for (let overload of ag.types) {
        let typeScope = {};
        if (!Type.isAssignable(fieldType, overload[0], typeScope, true))
            continue;

        ast.overload = overload.map((t) => resolveTypeVars(t, typeScope));
        return ast.overload[1];
    }

    throw new TypeError('Invalid field type ' + fieldType + ' for ' + operator);
}

function typeCheckAggregation(ast, scope) {
    if (ast.field === '*') {
        if (ast.operator !== 'count')
            throw new TypeError('* is not a valid argument to ' + ast.operator);
        ast.overload = [Type.Any, Type.Number];
        let name = ast.alias ? ast.alias : 'count';
        scope.add(name, Type.Number);
    } else {
        let overloaded = resolveAggregationOverload(ast, ast.operator, ast.field, ast.schema);
        let name = ast.alias ? ast.alias : ast.operator;
        scope.add(name, overloaded);
    }
}

function typeCheckArgMinMax(ast) {
    let argm = Builtin.ArgMinMax[ast.operator];
    if (!argm)
        throw new TypeError('Invalid aggregation ' + ast.operator);
    let fieldType = ast.schema.out[ast.field];
    if (!fieldType)
        throw new TypeError('Invalid field ' + ast.field);
    if (Builtin.ArgMinMax[ast.operator].types.indexOf(fieldType) === -1)
        throw new TypeError('Invalid ' + ast.operator + ' field ' + ast.field);
    if (!ast.base.isNumber || !ast.limit.isNumber)
        throw new TypeError('Invalid range for ' + ast.operator);
}

function resolveProjection(args, schema, scope) {
    args.forEach((arg) => {
        if (schema.args.indexOf(arg) === -1)
            throw new TypeError('Invalid field name ' + arg);
    });
    schema.args = ['table', 'principal'].concat(args);
    schema.types = schema.args.map((arg) => schema.types[schema.index[arg]]);
    schema.index = schema.args.reduce((res, arg, i) => {
        res[arg] = i;
        return res;
    }, {});
    Object.keys(schema.out).forEach((arg) => {
        if (schema.args.indexOf(arg) === -1) {
            delete schema.out[arg];
            scope.remove(arg);
        }
    });
}

function resolveJoin(ast, lhs, rhs) {
    ast.schema = Object.assign({}, lhs.schema);
    ast.schema.args = ast.schema.args.concat(rhs.schema.args.slice(2));
    ast.schema.types = ast.schema.types.concat(rhs.schema.types.slice(2));
    ast.schema.index = rhs.schema.args.slice(2).reduce((res, arg) => {
        res[arg] = Object.keys(res).length;
        return res;
    }, lhs.schema.index);
    ast.schema.out = Object.assign(ast.schema.out, rhs.schema.out);
}

function typeCheckInputArgs(ast, scope, classes) {
    let schema = ast.schema;
    if (!ast.isVarRef) {
        if (ast.selector.kind in classes)
            ast.__effectiveSelector = Ast.Selector.Device(classes[ast.selector.kind].extends, ast.selector.id, ast.selector.principal);
        else
            ast.__effectiveSelector = ast.selector;
    }
    var presentParams = new Set;
    for (let inParam of ast.in_params) {
        let inParamType = schema.inReq[inParam.name] || schema.inOpt[inParam.name];
        if (!inParamType)
            throw new TypeError('Invalid input parameter ' + inParam.name);
        if (!Type.isAssignable(typeForValue(inParam.value, scope), inParamType, {}, true))
            throw new TypeError('Invalid type for parameter '+ inParam.name);
        if (presentParams.has(inParam.name))
            throw new TypeError('Duplicate input param ' + inParam.name);
        presentParams.add(inParam.name);
    }
    for (let inParam in schema.inReq) {
        if (inParam !== 'table' && !presentParams.has(inParam))
            throw new TypeError('Missing required parameter ' + inParam);
    }
}

function typeCheckInput(ast, schemas, scope, classes, useMeta = false) {
    return ensureSchema(schemas, classes, ast, 'query', useMeta).then(() => {
        typeCheckInputArgs(ast, scope, classes);
        return typeCheckFilter(ast.filter, ast.schema, scope, schemas, classes, useMeta);
    }).then(() => {
        if (ast.aggregation)
            return typeCheckAggregation(ast, scope);
        scope.assign(ast.schema.out);
        return Q();
    });
}

function typeCheckOutput(ast, schemas, scope, classes, useMeta = false) {
    log('Type check output ...');
    return ensureSchema(schemas, classes, ast, 'action', useMeta).then(() => {
        return typeCheckInputArgs(ast, scope, classes);
    });
}

function typeCheckTable(ast, schemas, scope, classes, useMeta = false) {
    log('Type check table ...');
    if (ast.isVarRef) {
        log('VarRef');
        if (scope.hasGlobal(ast.name)) {
            ast.schema = scope.getSchema(ast.name);
        }
        return ensureSchema(schemas, classes, ast, 'query', useMeta).then(() => {
            return typeCheckInput(ast, schemas, scope, classes, useMeta);
        });
    }
    if (ast.isInvocation) {
        log('Invocation');
        return ensureSchema(schemas, classes, ast.invocation, 'query', useMeta).then(() => {
            ast.schema = ast.invocation.schema;
            return typeCheckInput(ast.invocation, schemas, scope, classes, useMeta);
        });
    }
    if (ast.isFilter) {
        log('Filter');
        return typeCheckTable(ast.table, schemas, scope, classes, useMeta).then(() => {
            ast.schema = ast.table.schema;
            return typeCheckFilter(ast.filter, ast.schema, scope, schemas, classes, useMeta);
        });
    }
    if (ast.isProjection) {
        log('Projection');
        return typeCheckTable(ast.table, schemas, scope, classes, useMeta).then(() => {
            ast.schema = ast.table.schema;
            resolveProjection(ast.args, ast.schema, scope);
            return Q();
        });
    }
    if (ast.isAlias) {
        log('Alias');
        return typeCheckTable(ast.table, schemas, scope, classes, useMeta).then(() => {
            ast.schema = ast.table.schema;
            scope.addGlobal(ast.name, ast.schema);
            scope.prefix(ast.name);
            return Q();
        });
    }
    if (ast.isAggregation) {
        log('Aggregation');
        return typeCheckTable(ast.table, schemas, scope, classes, useMeta).then(() => {
            ast.schema = ast.table.schema;
            return typeCheckAggregation(ast, scope);
        });
    }
    if (ast.isArgMinMax) {
        log('ArgMinMax');
        return typeCheckTable(ast.table, schemas, scope, classes, useMeta).then(() => {
            ast.schema = ast.table.schema;
            return typeCheckArgMinMax(ast);
        });
    }
    if (ast.isJoin) {
        log('Join');
        return Promise.resolve()
            .then(() => typeCheckTable(ast.lhs, schemas, scope, classes, useMeta))
            .then(() => typeCheckTable(ast.rhs, schemas, scope, classes, useMeta))
            .then(() => resolveJoin(ast, ast.lhs, ast.rhs));
    }
    if (ast.isWindow || ast.isTimeSeries) {
        log('Window or TimeSeries');
        if (ast.isWindow && (!typeForValue(ast.base, scope).isNumber || !typeForValue(ast.delta, scope).isNumber))
            throw new TypeError('Invalid range for window');
        if (ast.isTimeSeries && (!typeForValue(ast.base, scope).isDate
                || !typeForValue(ast.delta, scope).isMeasure
                || typeForValue(ast.delta, scope).unit !== 'ms'))
            throw new TypeError('Invalid time range');
        return typeCheckStream(ast.stream, schemas, scope, classes, useMeta).then(() => {
            ast.schema = ast.stream.schema;
            return Q();
        });
    }
    if (ast.isSequence || ast.isHistory) {
        log('Sequence or History');
        if (ast.isSequence && (!typeForValue(ast.base, scope).isNumber || !typeForValue(ast.delta, scope).isNumber))
            throw new TypeError('Invalid range for window');
        if (ast.isHistory && (!typeForValue(ast.base, scope).isDate
                || !typeForValue(ast.delta, scope).isMeasure
                || typeForValue(ast.delta, scope).unit !== 'ms'))
            throw new TypeError('Invalid time range');
        return typeCheckStream(ast.table, schemas, scope, classes, useMeta).then(() => {
            ast.schema = ast.table.schema;
            return Q();
        });
    }
    throw new Error('Not Implemented');
}

function typeCheckStream(ast, schemas, scope, classes, useMeta = false) {
    log('Type check stream ...');
    if (ast.isVarRef) {
        if (scope.hasGlobal(ast.name)) {
            ast.schema = scope.getSchema(ast.name);
        }
        return ensureSchema(schemas, classes, ast, 'query', useMeta).then(() => {
            return typeCheckInput(ast, schemas, scope, classes, useMeta);
        })
    }
    if (ast.isTimer || ast.isAtTimer) {
        return Q(); // Do we need anything else here?
    }
    if (ast.isMonitor) {
        log('Monitor');
        return typeCheckTable(ast.table, schemas, scope, classes, useMeta).then(() => {
            ast.schema = ast.table.schema;
            return Q();
        });
    }
    if (ast.isEdgeNew) {
        return typeCheckStream(ast.stream, schemas, scope, classes, useMeta).then(() => {
            ast.schema = ast.stream.schema;
            return Q();
        })
    }
    if (ast.isEdgeFilter) {
        return typeCheckStream(ast.stream, schemas, scope, classes, useMeta).then(() => {
            ast.schema = ast.stream.schema;
            return typeCheckFilter(ast.filter, ast.schema, scope, schemas, classes, useMeta);
        });
    }
    if (ast.isFilter) {
        log('Filter');
        return typeCheckStream(ast.stream, schemas, scope, classes, useMeta).then(() => {
            ast.schema = ast.stream.schema;
            return typeCheckFilter(ast.filter, ast.schema, scope, schemas, classes, useMeta);
        })
    }
    if (ast.isAlias) {
        return typeCheckStream(ast.stream, schemas, scope, classes, useMeta).then(() => {
            ast.schema = ast.stream.schema;
            scope.addGlobal(ast.name, ast.schema);
            scope.prefix(ast.name);
            return Q();
        });
    }
    if (ast.isProjection) {
        log('Projection');
        return typeCheckStream(ast.stream, schemas, scope, classes, useMeta).then(() => {
            ast.schema = ast.stream.schema;
            resolveProjection(ast.args, ast.schema, scope);
            return Q();
        });
    }
    if (ast.isJoin) {
        log('Join');
        return Promise.resolve()
            .then(() => typeCheckStream(ast.stream, schemas, scope, classes, useMeta))
            .then(() => typeCheckTable(ast.table, schemas, scope, classes, useMeta))
            .then(() => resolveJoin(ast, ast.stream, ast.table));
    }
    throw new Error('Not Implemented');
}

function typeCheckDeclaration(ast, schemas, scope, classes, useMeta) {
    return Promise.resolve().then(() => {
        if (ast.type === 'stream') {
            scope.assign(ast.args);
            return typeCheckStream(ast.value, schemas, scope, classes, useMeta).then(() => {
                scope.clean(ast.args);
                scope.addGlobal(ast.name, ast.value.schema);
                return Q();
            });
        } else if (ast.type === 'table') {
            scope.assign(ast.args);
            return typeCheckTable(ast.value, schemas, scope, classes, useMeta).then(() => {
                scope.clean(ast.args);
                scope.addGlobal(ast.name, ast.value.schema);
                return Q();
            });
        } else {
            throw new TypeError(`Invalid declaration type ${ast.type}`);
        }
    });
}

function typeCheckRule(ast, schemas, scope, classes, useMeta = false) {
    log('Type check rule ...');
    return Promise.resolve().then(() => {
        if (ast.table !== undefined && ast.table !== null) {
            return typeCheckTable(ast.table, schemas, scope, classes, useMeta);
        } else if (ast.stream !== undefined && ast.stream !== null) {
            scope.$has_event = true;
            return typeCheckStream(ast.stream, schemas, scope, classes, useMeta);
        } else {
            return null;
        }
    }).then(() => Promise.all(
        ast.actions.map((action) => typeCheckOutput(action, schemas, scope, classes, useMeta)))
    );
}

function typeCheckProgram(ast, schemas, useMeta = false) {
    const classes = {};
    ast.classes.forEach((ast) => {
        classes[ast.name] = ast;
    });
    const scope = new Scope();
    if (ast.principal !== null)
        typecheckPrincipal(ast.principal);

    function declLoop(i) {
        if (i === ast.declarations.length)
            return Q();
        scope.clean();
        return typeCheckDeclaration(ast.declarations[i], schemas, scope, classes, useMeta).then(() => declLoop(i+1));
    }
    function ruleLoop(i) {
        if (i === ast.rules.length)
            return Q();
        scope.clean();
        return typeCheckRule(ast.rules[i], schemas, scope, classes, useMeta).then(() => ruleLoop(i+1));
    }

    return Promise.resolve().then(() => declLoop(0)).then(() => ruleLoop(0));
}

function getAllowedSchema(allowed, schemaType, schemas, getMeta) {
    if (!allowed.isSpecified)
        return Promise.resolve();
    if (allowed.schema) {
        return Promise.resolve(allowed.schema);
    } else {
        return Utils.getSchemaForSelector(schemas, allowed.kind, allowed.channel, schemaType, getMeta, {})
            .then((schema) => {
                allowed.schema = schema;
                return schema;
            });
    }
}

function typeCheckPermissionRule(permissionRule, schemas, getMeta = false) {
    return Promise.all([
        getAllowedSchema(permissionRule.trigger, 'triggers', schemas, getMeta),
        getAllowedSchema(permissionRule.query, 'queries', schemas, getMeta),
        getAllowedSchema(permissionRule.action, 'actions', schemas, getMeta)
    ]).then(() => {
        const scope = new Scope();
        scope.add('__pi', Type.Entity('tt:contact'));
        function typecheckPermissionFunction(fn) {
            if (!fn.isSpecified)
                return Promise.resolve();

            return typeCheckFilter(fn.filter, fn.schema, scope, schemas, {}, getMeta).then(() => {
                for (let outParam of fn.out_params) {
                    let ptype = fn.schema.inReq[outParam.value] || fn.schema.inOpt[outParam.value] || fn.schema.out[outParam.value];
                    scope.add(outParam.name, ptype);
                }
            });
        }
        if (permissionRule.principal !== null) {
            typecheckPrincipal(permissionRule.principal);
        }

        return typecheckPermissionFunction(permissionRule.trigger).then(() => {
            scope.$has_event = true;
            return typecheckPermissionFunction(permissionRule.query);
        }).then(() => {
            return typecheckPermissionFunction(permissionRule.action);
        });
    });
}

module.exports = {
    typeCheckInput,
    typeCheckOutput,
    typeCheckRule,
    typeCheckTable,
    typeCheckStream,
    typeCheckProgram,
    typeCheckFilter,
    typeCheckPermissionRule
};
