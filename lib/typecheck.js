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

function resolveFilterOverload(paramType, filter, scope) {
    let ft = Builtin.BinaryOps[filter.operator];
    if (!ft)
        throw new TypeError('Invalid operator ' + filter.operator);

    let valueType = typeForValue(filter.value, scope);
    for (let overload of ft.types) {
        let typeScope = {};
        if (!Type.isAssignable(paramType, overload[0], typeScope, true))
            continue;
        if (!Type.isAssignable(valueType, overload[1], typeScope, true))
            continue;
        if (!Type.isAssignable(overload[2], Type.Boolean, typeScope, true))
            continue;

        filter.overload = overload.map((t) => resolveTypeVars(t, typeScope));
        return;
    }

    throw new TypeError('Invalid parameter types ' + paramType + ' and ' + valueType + ' for ' + filter.operator);
}

function typeCheckInputArgs(ast, scope, classes) {
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
        if (!Type.isAssignable(typeForValue(inParam.value, scope), inParamType, {}, true))
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

function typeCheckFilter(ast, schema, scope, schemas, classes, useMeta) {
    return (function recursiveHelper(ast) {
        if (ast.isTrue || ast.isFalse)
            return Q();
        if (ast.isAnd || ast.isOr)
            return Q.all(ast.operands.map((op) => recursiveHelper(op)));
        if (ast.isNot)
            return recursiveHelper(ast.expr);

        if (ast.isAtom) {
            let filter = ast.filter;
            let paramType = schema.inReq[filter.name] || schema.inOpt[filter.name] || schema.out[filter.name] || scope[filter.name];
            if (!paramType)
                throw new TypeError('Invalid filter parameter ' + filter.name);

            resolveFilterOverload(paramType, filter, scope);
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

const ALLOWED_PRINCIPAL_TYPES = new Set(['tt:contact', 'tt:contact_name', 'tt:contact_group', 'tt:contact_group_name']);

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

    let schemaType;
    switch (primType) {
    case 'trigger':
        schemaType = 'triggers';
        break;
    case 'query':
        schemaType = 'queries';
        break;
    case 'action':
        schemaType = 'actions';
        break;
    }
    return Utils.getSchemaForSelector(schemas, prim.selector.kind, prim.channel, schemaType, useMeta, classes).then((schema) => {
        prim.schema = schema;
    });
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

function typeCheckInput(ast, schemas, scope, forTrigger, classes, useMeta = false) {
    return ensureSchema(schemas, classes, ast, forTrigger ? 'trigger':'query', useMeta).then(() => {
        typeCheckInputArgs(ast, scope, classes);
        return typeCheckFilter(ast.filter, ast.schema, scope, schemas, classes, useMeta);
    }).then(() => {
        if (ast.aggregation) {
            typeCheckAggregation(ast, scope);
        } else {
            if (ast.out_params.length === 1 && ast.out_params[0].name === '*') {
                // enforced by the grammar
                assert(ast.out_params[0].value === '*');

                let newOutParams = [];
                for (let name in ast.schema.out) {
                    newOutParams.push(Ast.OutputParam(name, name));
                    scope[name] = ast.schema.out[name];
                }
                ast.out_params = newOutParams;
            } else {
                let schema = ast.schema;
                for (let outParam of ast.out_params) {
                    assert(outParam.name !== '*');
                    assert(outParam.value !== '*');
                    let outParamType = schema.out[outParam.value];
                    if (!outParamType)
                        throw new TypeError('Invalid output parameter ' + outParam.value);
                    scope[outParam.name] = outParamType;
                }
            }
        }
    });
}

function typeCheckOutput(ast, schemas, scope, classes, useMeta = false) {
    return ensureSchema(schemas, classes, ast, 'action', useMeta).then(() => {
        typeCheckInputArgs(ast, scope, classes);
        if (!ast.filter.isTrue || ast.out_params.length)
            throw new TypeError('Actions cannot have filters or output parameters');
    });
}

function typeCheckSave(ast, schemas, scope, classes, useMeta) {
    if (!ast.table)
        ast.table = genAutoTableName(ast);
    if (ast.table === null)
        return Q();

    return Utils.ensureSaveSchema(schemas, ast, scope, useMeta).then(() => {
        let schema = ast.tableschema;

        for (let name in scope) {
            if (name === '$has_event')
                continue;
            if (!(name in schema.inOpt))
                throw new TypeError(`Cannot save variable ${name} in table ${ast.table} (no such column)`);

            if (!Type.isAssignable(scope[name], schema.inOpt[name]))
                throw new TypeError(`Cannot save variable ${name} in table ${ast.table} (invalid type)`);
        }
    });
}

function genAutoTableName(rule) {
    let buf = 'auto';
    let anyDevice = false;

    function addInvocation(inv) {
        let fname;
        if (inv.selector.isBuiltin) {
            if (inv.channel === 'new_record' || inv.channel === 'get_record')
                fname = inv.__table;
            else
                return;
        } else {
            fname = inv.selector.kind + ':' + inv.channel;
            if (!inv.selector.kind.startsWith('__dyn_') &&
                inv.selector.kind !== 'org.thingpedia.builtin.thingengine.builtin')
                anyDevice = true;
        }
        assert(fname);

        let out_params = [];
        let is_std_schema = !inv.aggregation;
        if (is_std_schema) {
            for (let out_param of inv.out_params) {
                if (out_param.name !== out_param.value) {
                    is_std_schema = false;
                    break;
                }
                out_params.push(out_param.name);
            }
            is_std_schema = out_params.length === Object.keys(inv.schema.out).length;
        }
        if (is_std_schema) {
            buf += '+' + fname + ':*';
        } else {
            buf += '+' + fname + ':' + inv.out_params.map((op) => {
                if (inv.aggregation && op.value === inv.aggregation.field)
                    return `${op.name}:${inv.aggregation.type}(${op.value})`;
                if (op.name === op.value)
                    return op.name;
                return op.name + ':' + op.value;
            }).join(',');
        }
    }
    if (rule.trigger)
        addInvocation(rule.trigger);
    for (let query of rule.queries)
        addInvocation(query);

    if (!anyDevice)
        return null;
    return buf;
}

function typeCheckRule(ast, schemas, params, classes, useMeta = false) {
    const scope = {};
    for (let name in params)
        scope[name] = params[name];
    return Promise.resolve().then(() => {
        if (ast.trigger !== null)
            return typeCheckInput(ast.trigger, schemas, scope, true, classes, useMeta);
        else
            return null;
    }).then(() => {
        scope.$has_event = true;
        function typeCheckQueryLoop(i) {
            if (i === ast.queries.length)
                return Q();
            return typeCheckInput(ast.queries[i], schemas, scope, false, classes, useMeta).then(() => typeCheckQueryLoop(i+1));
        }
        return typeCheckQueryLoop(0);
    }).then(() => typeCheckSave(ast, schemas, scope, classes, useMeta))
    .then(() => Promise.all(ast.actions.map((action) => typeCheckOutput(action, schemas, scope, classes, useMeta))));
}

function typeCheckProgram(ast, schemas, useMeta = false) {
    const params = {};
    ast.params.forEach((ast) => {
        params[ast.name] = ast.type;
    });
    const classes = {};
    ast.classes.forEach((ast) => {
        classes[ast.name] = ast;
    });
    if (ast.principal !== null)
        typecheckPrincipal(ast.principal);

    function loop(i) {
        if (i === ast.rules.length)
            return Q();

        return typeCheckRule(ast.rules[i], schemas, params, classes, useMeta).then(() => loop(i+1));
    }
    return loop(0);
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
    typeCheckProgram,
    typeCheckFilter,
    typeCheckPermissionRule
};
