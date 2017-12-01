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

function log(message) {
    let debug = true;
    if (debug) console.log(message);
}

function ensureSchema(schemas, classes, prim, primType, useMeta) {
    if (prim.schema)
        return Q();

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
            type = scope[value.name];
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


function typecheckPrincipal(principal) {
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
            let paramType = schema.inReq[name] || schema.inOpt[name] || schema.out[name] || scope[name];
            if (!paramType)
                throw new TypeError('Invalid filter parameter ' + name);
            return paramType;
        }
        return typeForValue(ast.value, scope);
    }
    if (ast.Derived) {
        let operands = ast.operands.map((o) => resolveScalarExpression(o, schema, scope, schemas, classes, useMeta));
        return resolveScalarExpressionOps(operands[0], ast.Derived.op, operands[1]);
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
            let lhs = resolveScalarExpression(ast.lhs, schema, scope, schemas, classes, useMeta);
            let rhs = resolveScalarExpression(ast.rhs, schema, scope, schemas, classes, useMeta);
            resolveFilterOverload(lhs, ast.operator, rhs);
            return Q();
        } else {
            assert(ast.isExternal);
            return ensureSchema(schemas, classes, ast, 'query', useMeta).then(() => {
                typeCheckInputArgs(ast, schemas, scope, classes, useMeta);
                return typeCheckFilter(ast.filter, ast.schema, scope, schemas, classes, useMeta);
            });
        }
    })(ast);
}

function resolveAggregationOverload(aggregation, schema) {
    let fieldType = schema.out[aggregation.field];
    if (!fieldType)
        throw new TypeError('Invalid aggregation field ' + aggregation.field);
    let ag = Builtin.Aggregations[aggregation.type];
    if (!ag)
        throw new TypeError('Invalid aggregation ' + aggregation.type);

    for (let overload of ag.types) {
        let typeScope = {};
        if (!Type.isAssignable(fieldType, overload[0], typeScope, true))
            continue;

        aggregation.overload = overload.map((t) => resolveTypeVars(t, typeScope));
        return aggregation.overload[1];
    }

    throw new TypeError('Invalid field type ' + fieldType + ' for ' + aggregation.type);
}

function typeCheckAggregation(ast, scope) {
    // enforced by the grammar
    assert(ast.selector.isBuiltin);

    if (ast.aggregation.field === '*') {
        if (ast.aggregation.type !== 'count')
            throw new TypeError('* is not a valid argument to ' + ast.aggregation.type);
        ast.aggregation.overload = [Type.Any, Type.Number];

        if (ast.out_params) {
            assert(ast.out_params.length === 1);
            scope[ast.out_params[0].name] = Type.Number;
        }
    } else {
        let overloaded = resolveAggregationOverload(ast.aggregation, ast.schema);

        let schema = ast.schema;
        if (ast.out_params) {
            for (let outParam of ast.out_params) {
                if (outParam.value === ast.aggregation.field) {
                    scope[outParam.name] = overloaded;
                } else {
                    let outParamType = schema.out[outParam.value];
                    if (!outParamType)
                        throw new TypeError('Invalid output parameter ' + outParam.value);
                    scope[outParam.name] = outParamType;
                }
            }
        }
    }
}

function typeCheckProjection(args, schema, scope, classes, useMeta) {
    throw new Error('Not implemented yet: typeCheckProjection');
}

function typeCheckJoin() {
    throw new Error('Not implemented yet: typeCheckJoin');
}

function typeCheckArgMinMax() {
    throw new Error('Not implemented yet: typeCheckArgMinMax');
}

function typeCheckInputArgs(ast, schemas, scope, classes, useMeta) {
    let schema = ast.schema;
    if (ast.selector.kind in classes)
        ast.__effectiveSelector = Ast.Selector.Device(classes[ast.selector.kind].extends, ast.selector.id, ast.selector.principal);
    else
        ast.__effectiveSelector = ast.selector;
    var presentParams = new Set;
    for (let inParam of ast.in_params) {
        let inParamType = schema.inReq[inParam.name] || schema.inOpt[inParam.name];
        if (!inParamType)
            throw new TypeError('Invalid input parameter ' + inParam.name);
        if (!Type.isAssignable(resolveScalarExpression(inParam.value, schema, scope, schemas, classes, useMeta), inParamType, {}, true))
            throw new TypeError('Invalid type for parameter '+ inParam.name);
        if (presentParams.has(inParam.name))
            throw new TypeError('Duplicate input param ' + inParam.name);
        presentParams.add(inParam.name);
    }
    for (let inParam in schema.inReq) {
        if (!presentParams.has(inParam))
            throw new TypeError('Missing required parameter ' + inParam);
    }
}

function typeCheckInput(ast, schemas, scope, classes, useMeta = false) {
    return ensureSchema(schemas, classes, ast, 'query', useMeta).then(() => {
        typeCheckInputArgs(ast, schemas, scope, classes, useMeta);
        return typeCheckFilter(ast.filter, ast.schema, scope, schemas, classes, useMeta);
    }).then(() => {
        if (ast.aggregation)
            return typeCheckAggregation(ast, scope);
        Object.assign(scope, ast.schema.out);
        return Q();
    });
}

function typeCheckOutput(ast, schemas, scope, classes, useMeta = false) {
    log('Type check output ...');
    return ensureSchema(schemas, classes, ast, 'action', useMeta).then(() => {
        return typeCheckInputArgs(ast, schemas, scope, classes, useMeta);
    });
}

function typeCheckTable(ast, schemas, scope, classes, useMeta = false) {
    log('Type check table ...');
    if (ast.isVarRef) {
        throw new Error('Not implemented yet: typeCheckTable - varRef');
    }
    if (ast.isInvocation) {
        log('isInvocation');
        return ensureSchema(schemas, classes, ast.invocation, 'query', useMeta).then(() => {
            ast.schema = ast.invocation.schema;
            return typeCheckInput(ast.invocation, schemas, scope, classes, useMeta);
        });
    }
    if (ast.isFilter) {
        log('isFilter');
        return typeCheckTable(ast.table, schemas, scope, classes, useMeta).then(() => {
            ast.schema = ast.table.schema;
            return typeCheckFilter(ast.filter, ast.schema, scope, schemas, classes, useMeta);
        });
    }
    if (ast.isProjection) {
        return typeCheckTable(ast.table, schemas, scope, classes, useMeta).then(() => {
            ast.schema = ast.table.schema;
            return typeCheckProjection(ast.args, ast.schema, scope, schemas, classes, useMeta);
        });
    }
    if (ast.isAlias) {
        return typeCheckTable(ast.table, schemas, scope, classes, useMeta).then(() => {
            if (ast.name in scope) {
                throw new Error('Conflict on using ' + ast.name);
            } else {
                scope[ast.name] = Type.Table;
            }
            return Q();
        });
    }
    if (ast.isAggregation) {
        return typeCheckTable(ast.table, schemas, scope, classes, useMeta).then(() => {
            ast.schema = ast.table.schema;
            return typeCheckAggregation(); // need rewrite
        });
    }
    if (ast.isArgMinMax) {
        return typeCheckTable(ast.table, schemas, scope, classes, useMeta).then(() => {
            ast.schema = ast.table.schema;
            return typeCheckArgMinMax();
        });
    }
    if (ast.isJoin) {
        return Promise.all([
            typeCheckTable(ast.lhs, schemas, scope, classes, useMeta),
            typeCheckTable(ast.rhs, schemas, scope, classes, useMeta)
        ]).then(() => {
            return typeCheckJoin();
        });
    }
    if (ast.isWindow || ast.isTimeSeries) {
        throw new Error('Not implemented yet: typeCheckTable - window/timeSeries');
    }
    if (ast.isSequence || ast.isHistory) {
        throw new Error('Not implemented yet: typeCheckTable - sequence/history');
    }
}

function typeCheckStream(ast, schemas, scope, classes, useMeta = false) {
    log('Type check stream ...');
    if (ast.isVarRef) {
        throw new Error('Not implemented yet: typeCheckStream - varRef');
    }
    if (ast.isTimer) {
        throw new Error('Not implemented yet: typeCheckStream - timer');
    }
    if (ast.isAtTimer) {
        throw new Error('Not implemented yet: typeCheckStream - atTimer');
    }
    if (ast.isMonitor) {
        log('isMonitor');
        return typeCheckTable(ast.table, schemas, scope, classes, useMeta).then(() => {
            ast.schema = ast.table.schema;
            return Q();
        });
    }
    if (ast.isEdgeNew) {
        throw new Error('Not implemented yet: typeCheckStream - edgeNew');
    }
    if (ast.isFilter) {
        log('isFilter');
        return typeCheckStream(ast.stream, schemas, scope, classes, useMeta).then(() => {
            ast.schema = ast.stream.schema;
            return typeCheckFilter(ast.filter, ast.schema, scope, schemas, classes, useMeta);
        })
    }
    if (ast.isAlias) {
        throw new Error('Not implemented yet: typeCheckStream - alias');
    }
    if (ast.isJoin) {
        throw new Error('Not implemented yet: typeCheckStream - join');
    }

}

function typeCheckDeclaration(ast, schemas, scope, classes, useMeta) {
    return Promise.resolve().then(() => {
        if (ast.type === 'stream') {
            scope[ast.name] = ast;
            return typeCheckStream(ast.value, schemas, scope, classes, useMeta);
        } else if (ast.type === 'table') {
            scope[ast.name] = ast;
            return typeCheckTable(ast.value, schemas, scope, classes, useMeta);
        } else {
            throw new TypeError(`Invalid declaration type ${ast.type}`);
        }
    });
}

function typeCheckRule(ast, schemas, scope, classes, useMeta = false) {
    log('Type check rule ...');
    return Promise.resolve().then(() => {
        if (ast.table !== undefined && ast.table !== null)
            return typeCheckTable(ast.table, schemas, scope, classes, useMeta);
        else if (ast.stream !== undefined && ast.stream !== null)
            return typeCheckStream(ast.stream, schemas, scope, classes, useMeta);
        else
            return null;
    }).then(() => Promise.all(
        ast.actions.map((action) => typeCheckOutput(action, schemas, scope, classes, useMeta)))
    );
}

function typeCheckProgram(ast, schemas, useMeta = false) {
    const classes = {};
    ast.classes.forEach((ast) => {
        classes[ast.name] = ast;
    });
    const scope = {}; // get existing stream & table?
    if (ast.principal !== null)
        typecheckPrincipal(ast.principal);

    function declLoop(i) {
        if (i === ast.declarations.length)
            return Q();
        return typeCheckDeclaration(ast.declarations[i], schemas, scope, classes, useMeta).then(() => declLoop(i+1));
    }
    function ruleLoop(i) {
        if (i === ast.rules.length)
            return Q();
        return typeCheckRule(ast.rules[i], schemas, scope, classes, useMeta).then(() => ruleLoop(i+1));
    }

    return Promise.all([declLoop(0), ruleLoop(0)]);
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
        const scope = {
            __pi: Type.Entity('tt:contact')
        };
        function typecheckPermissionFunction(fn) {
            if (!fn.isSpecified)
                return Promise.resolve();

            return typeCheckFilter(fn.filter, fn.schema, scope, schemas, {}, getMeta).then(() => {
                for (let outParam of fn.out_params) {
                    let ptype = fn.schema.inReq[outParam.value] || fn.schema.inOpt[outParam.value] || fn.schema.out[outParam.value];
                    scope[outParam.name] = ptype;
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
