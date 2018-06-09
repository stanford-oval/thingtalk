// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Almond
//
// Copyright 2016 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const assert = require('assert');

const Ast = require('./ast');
const Type = require('./type');
const { clean } = require('./utils');

function displayLocation(_, loc) {
    if (loc.isAbsolute) {
        if (loc.display)
            return loc.display;
        else
            return '[Latitude: ' + Number(loc.lat).toFixed(3) + ' deg, Longitude: ' + Number(loc.lon).toFixed(3) + ' deg]';
    } else {
        switch (loc.relativeTag) {
        case 'current_location':
            return _("here");
        case 'home':
            return _("at home");
        case 'work':
            return _("at work");
        default:
            return loc.relativeTag;
        }
    }
}

function describeDate(_, date, operator, offset) {
    let base;

    if (date === null) {
        base = _("now");
    } else if (date.isDateEdge) {
        let unit;
        switch (date.unit) {
        case 'ms':
            unit = _("this millisecond");
            break;
        case 's':
            unit = _("this second");
            break;
        case 'm':
            unit = _("this minute");
            break;
        case 'h':
            unit = _("this hour");
            break;
        case 'day':
            unit = _("today");
            break;
        case 'week':
            unit = _("this week");
            break;
        case 'mon':
            unit = _("this month");
            break;
        case 'year':
            unit = _("this year");
            break;
        }
        if (date.edge === 'start_of')
            base = _("the start of %s").format(unit);
        else
            base = _("the end of %s").format(unit);
    } else {
        if (date.getHours() === 0 && date.getMinutes() === 0 && date.getSeconds() === 0)
            base = date.toLocaleDateString();
        else
            base = date.toLocaleString();
    }

    if (offset && operator === '+')
        return _("%s past %s").format(describeArg(_, offset, {}), base);
    else if (offset && operator === '-')
        return _("%s before %s").format(describeArg(_, offset, {}), base);
    else
        return base;
}

function describeTime(_, time) {
    if (time.second !== 0)
        return "%02d:%02d:%02d".format(time.hour, time.minute, time.second);

    if (time.hour > 0 && time.hour < 12)
        return "%d:%02dam".format(time.hour, time.minute);
    if (time.hour === 0)
        return "12:%02dam".format(time.minute);
    if (time.hour === 12)
        return "12:%02dpm".format(time.minute);
    return "%d:%02dpm".format(time.hour-12, time.minute);
}

function describeArg(_, arg, scope = {}) {
    if (arg.display)
        return arg.display;
    if (arg.isArray)
        return arg.value.map((v) => describeArg(_, v, scope)).join(', ');
    if (arg.isVarRef) {
        let name;
        if (arg.name in scope)
            name = scope[arg.name];
        else
            name = clean(arg.name);
        return _("the %s").format(name);
    }
    if (arg.isUndefined)
        return '____';
    if (arg.isEvent) {
        switch (arg.name) {
        case 'program_id':
            return _("the program ID");
        case 'type':
            return _("the device type");
        default:
            return _("the result");
        }
    }
    if (arg.isLocation)
        return displayLocation(_, arg.value);
    if (arg.isString)
        return '"' + arg.value + '"';
    if (arg.isEntity) {
        if (arg.type === 'tt:username' || arg.type === 'tt:contact_name' || arg.type === 'tt:contact_group_name')
            return '@' + arg.value;
        if (arg.type === 'tt:hashtag')
            return '#' + arg.value;
        return arg.value;
    }
    if (arg.isNumber)
        return arg.value;
    if (arg.isEnum)
        return clean(arg.value);
    if (arg.isMeasure)
        return arg.value + ' ' + arg.unit;
    if (arg.isBoolean)
        return arg.value ? _("true") : _("false");
    if (arg.isDate)
        return describeDate(_, arg.value, arg.operator, arg.offset);
    if (arg.isTime)
        return describeTime(_, arg);

    return String(arg);
}

function describePlaceholder(_, type) {
    return '____';
}

function describeOperator(_, argcanonical, op, value, negate, ptype) {
    switch (op) {
    case 'contains':
        if (negate)
            return _("the %s do not contain %s").format(argcanonical, value);
        else
            return _("the %s contain %s").format(argcanonical, value);
    case 'substr':
    case '=~':
        if (negate)
            return _("the %s does not contain %s").format(argcanonical, value);
        else
            return _("the %s contains %s").format(argcanonical, value);
    case 'in_array':
    case '~=':
        if (negate)
            return _("%s does not contain the %s").format(value, argcanonical);
        else
            return _("%s contains the %s").format(value, argcanonical);
    case 'starts_with':
        if (negate)
            return _("the %s does not start with %s").format(argcanonical, value);
        else
            return _("the %s starts with %s").format(argcanonical, value);
    case 'ends_with':
        if (negate)
            return _("the %s does not end with %s").format(argcanonical, value);
        else
            return _("the %s ends with %s").format(argcanonical, value);
    case 'prefix_of':
        if (negate)
            return _("the %s is not a prefix of %s").format(argcanonical, value);
        else
            return _("the %s is a prefix of %s").format(argcanonical, value);
    case 'suffix_of':
        if (negate)
            return _("the %s is not a suffix of %s").format(argcanonical, value);
        else
            return _("the %s is a suffix of %s").format(argcanonical, value);
    case '==':
        if (negate)
            return _("the %s is not equal to %s").format(argcanonical, value);
        else
            return _("the %s is equal to %s").format(argcanonical, value);
    case '<=':
        if (ptype.isTime || ptype.isDate) {
            if (negate)
                return _("the %s is after %s").format(argcanonical, value);
            else
                return _("the %s is before %s").format(argcanonical, value);
        } else {
            if (negate)
                return _("the %s is greater than %s").format(argcanonical, value);
            else
                return _("the %s is less than or equal to %s").format(argcanonical, value);
        }
    case '>=':
        if (ptype.isTime || ptype.isDate) {
            if (negate)
                return _("the %s is before %s").format(argcanonical, value);
            else
                return _("the %s is after %s").format(argcanonical, value);
        } else {
            if (negate)
                return _("the %s is less than %s").format(argcanonical, value);
            else
                return _("the %s is greater than or equal to %s").format(argcanonical, value);
        }
    default:
        throw new TypeError('Invalid operator ' + op);
    }
}

function describeAtomFilter(_, expr, schema, scope, negate) {
    let filter = expr;
    let argname = filter.name;
    let argcanonical;
    if (schema) {
        if (argname in schema.index) {
            let index = schema.index[argname];
            argcanonical = schema.argcanonicals[index] || clean(argname);
        } else {
            argcanonical = scope[argname];
        }
    } else {
        argcanonical = scope[argname];
    }
    let value =  describeArg(_, filter.value, scope);
    let ptype;
    if (schema === null)
        ptype = Type.Entity('tt:contact');
    else
        ptype = schema.out[argname] || schema.inReq[argname] || schema.inOpt[argname];
    return describeOperator(_, argcanonical, filter.operator, value, negate, ptype);
}

function describeFilter(_, expr, schema, scope = {}) {
    return (function recursiveHelper(expr) {
        if (expr.isTrue || (expr.isAnd && expr.operands.length === 0))
            return _("true");
        if (expr.isFalse || (expr.isOr && expr.operands.length === 0))
            return _("false");
        if (expr.isAnd)
            return expr.operands.map(recursiveHelper).reduce((x, y) => _("%s and %s").format(x, y));
        if (expr.isOr)
            return expr.operands.map(recursiveHelper).reduce((x, y) => _("%s or %s").format(x, y));
        if (expr.isNot && expr.expr.isAtom)
            return describeAtomFilter(_, expr.expr, schema, scope, true);
        if (expr.isNot)
            return _("not %s").format(recursiveHelper(expr.expr));
        if (expr.isExternal) {
            if (expr.selector.kind === 'org.thingpedia.builtin.thingengine.builtin' &&
                expr.channel === 'get_time') {
                const schema = expr.schema.clone();
                schema.argcanonicals[0] = _("current time");
                return describeFilter(_, expr.filter, schema, scope);
            }
            if (expr.selector.kind === 'org.thingpedia.builtin.thingengine.phone' &&
                expr.channel === 'get_gps') {
                const schema = expr.schema.clone();
                schema.argcanonicals[0] = _("my location");
                return describeFilter(_, expr.filter, schema, scope);
            }

            const primdesc = describePrimitive(_, expr, scope, []);

            if (expr.filter.isAtom) {
                // common case
                return describeOperator(_, _("the %s of %s").format(expr.filter.name, primdesc),
                                        expr.filter.operator, describeArg(_, expr.filter.value, scope), false,
                                        expr.schema.out[expr.filter.name]);
            } else if (expr.filter.isNot && expr.filter.expr.isAtom) {
                // common case 2
                return describeOperator(_, _("the %s of %s").format(expr.filter.expr.name, primdesc),
                                        expr.filter.expr.operator, describeArg(_, expr.filter.expr.value, scope), true,
                                        expr.schema.out[expr.filter.expr.name]);
            } else {
                // general case
                return _("for %s, %s").format(primdesc, describeFilter(_, expr.filter, expr.schema, scope));
            }
        }
        return describeAtomFilter(_, expr, schema, scope, false);
    })(expr);
}

function describePrimitive(_, obj, scope, extraInParams = []) {
    if (obj.selector.isBuiltin) {
        if (obj.channel === 'return')
            return _("send it to me");
        else if (obj.channel === 'notify')
            return _("notify you");
        else if (obj.channel === 'save')
            return _("save it");
        else
            throw new TypeError();
    }

    var kind = obj.selector.kind;
    var channel = obj.channel;
    var schema = obj.schema;

    var confirm;
    if (kind === 'remote' || kind.startsWith('__dyn')) {
        // special case internal sending/receiving
        if (channel === 'send')
            confirm = _("send it to $__principal");
        else if (channel === 'receive')
            confirm = _("you receive something from $__principal");
        else
            throw TypeError('Invalid @remote channel ' + channel);
    } else {
        confirm = schema.confirmation;
        if (obj.selector.device)
            confirm = confirm.replace('$__device', obj.selector.device.name);
        else
            confirm = confirm.replace('$__device', clean(kind));
    }

    let firstExtra = true;
    for (let inParam of obj.in_params.concat(extraInParams)) {
        let argname = inParam.name;
        let ptype = obj.schema.inReq[argname] || obj.schema.inOpt[argname];
        let index = obj.schema.index[argname];
        let argcanonical = obj.schema.argcanonicals[index] || clean(argname);
        let value = inParam.value.isUndefined ? describePlaceholder(_, ptype) : describeArg(_, inParam.value, scope);
        if (confirm.indexOf('$' + argname) >= 0) {
            confirm = confirm.replace('$' + argname, value);
        } else if (confirm.indexOf('${' + argname + '}') >= 0) {
            confirm = confirm.replace('${' + argname + '}', value);
        } else {
            if (argname.startsWith('__'))
                continue;
            if (kind === 'remote' || kind.startsWith('__dyn'))
                continue;
            if (inParam.value.isUndefined && inParam.name in obj.schema.inReq)
                continue;
            if (firstExtra) {
                confirm = confirm + _(" with %s equal to %s").format(argcanonical, value);
                firstExtra = false;
            } else {
                confirm = confirm + _(" and %s equal to %s").format(argcanonical, value);
            }
        }
    }

    return confirm;
}

function describeTable(_, table, extraInParams) {
    if (table.isVarRef) {
        return clean(table.name);
    } else if (table.isInvocation) {
        return describePrimitive(_, table.invocation, {}, extraInParams);
    } else if (table.isFilter) {
        return _("%s if %s").format(describeTable(_, table.table, extraInParams),
            describeFilter(_, table.filter, table.schema));
    } else if (table.isProjection) {
        return _("the %s of %s").format(
            describeArgList(_, table.args, table.schema),
            describeTable(_, table.table, extraInParams));
    } else if (table.isCompute) {
        return _("a value computed from %s").format(
            describeTable(_, table.table, extraInParams)); // FIXME
    } else if (table.isAlias) {
        return describeTable(_, table.table, extraInParams);
    } else if (table.isAggregation) {
        if (table.field === '*')
            return _("the count of %s").format(describeTable(_, table.table, extraInParams));
        return _("the %s of %s in %s").format(
            table.operator,
            describeArgName(_, table.field, table.schema).
            describeTable(_, table.table, extraInParams));
    } else if (table.isArgMinMax) {
        if (table.operator === 'argmin') {
            return _("the %s with the minimum %s").format(
                describeTable(_, table.table, extraInParams),
                describeArgName(_, table.field, table.schema));
        } else {
            return _("the %s with the maximum %s").format(
                describeTable(_, table.table, extraInParams),
                describeArgName(_, table.field, table.schema));
        }
    } else if (table.isJoin) {
        let lhsParams = extraInParams.filter((p) => p.name in table.lhs.schema.inReq || p.name in table.lhs.schema.inOpt);
        let rhsParams = extraInParams.filter((p) => p.name in table.rhs.schema.inReq || p.name in table.rhs.schema.inOpt);

        return _("%s and %s").format(describeTable(_, table.lhs, lhsParams),
            describeTable(_, table.rhs, rhsParams.concat(table.in_params)));
    } else if (table.isWindow) {
        if (table.base.isNumber && table.base.value === 1) {
            return _("the latest %s results of %s").format(describeArg(_, table.delta),
                describeStream(_, table.stream));
        } else {
            return _("the latest %s results, starting at the %d-th, of %s").format(
                describeArg(_, table.delta),
                describeArg(_, table.base),
                describeStream(_, table.stream));
        }
    } else if (table.isTimeSeries) {
        if (table.base.isDate && table.base.value === null) {
            return _("the results in the last %s of %s").format(
                describeArg(_, table.delta),
                describeStream(_, table.stream));
        } else {
            return _("the results in the %s prior to %s of %s").format(
                describeArg(_, table.delta),
                describeArg(_, table.base),
                describeStream(_, table.stream));
        }
    } else if (table.isSequence) {
        if (table.base.isNumber && table.base.value === 1) {
            return _("the latest %s %s").format(describeArg(_, table.delta),
                describeTable(_, table.table, []));
        } else {
            return _("the latest %s %s, starting at the %d-th").format(
                describeArg(_, table.delta),
                describeTable(_, table.table, []),
                describeArg(_, table.base));
        }
    } else if (table.isHistory) {
        if (table.base.isDate && table.base.value === null) {
            return _("the %s that changed in in the last %s").format(
                describeTable(_, table.table, []),
                describeArg(_, table.delta));
        } else {
            return _("the %s that changed in the %s prior to %s").format(
                describeTable(_, table.table, []),
                describeArg(_, table.delta),
                describeArg(_, table.base));
        }
    } else {
        throw new TypeError();
    }
}

function describeArgName(_, argname, schema) {
    let index = schema.index[argname];
    return schema.argcanonicals[index] || clean(argname);
}

function describeArgList(_, args, schema) {
    return args.map((argname) => describeArgName(argname, schema)).join(", ");
}

function describeStream(_, stream) {
    if (stream.isVarRef) {
        return clean(stream.name);
    } else if (stream.isTimer) {
        if (stream.base.value === null) {
            return _("every %s").format(describeArg(_, stream.interval));
        } else {
            return _("every %s starting %s").format(describeArg(_, stream.interval),
                describeArg(_, stream.base));
        }
    } else if (stream.isAtTimer) {
        return _("every day at %s").format(describeArg(_, stream.time));
    } else if (stream.isMonitor) {
        if (stream.table.isFilter) {
            // flip monitor of filter to filter of monitor
            if (stream.table.schema.is_list) {
                return _("when %s change if %s").format(describeTable(_, stream.table.table, []),
                    describeFilter(_, stream.table.filter, stream.table.schema));
            } else {
                return _("when %s changes if %s").format(describeTable(_, stream.table.table, []),
                    describeFilter(_, stream.table.filter, stream.table.schema));
            }
        }

        if (stream.table.schema.is_list)
            return _("when %s change").format(describeTable(_, stream.table, []));
        else
            return _("when %s changes").format(describeTable(_, stream.table, []));
    } else if (stream.isEdgeNew) {
        return _("%s changes").format(describeStream(_, stream.stream)); // XXX weird
    } else if (stream.isEdgeFilter) {
        return _("%s and it becomes true that %s").format(describeStream(_, stream.stream),
            describeFilter(_, stream.filter, stream.schema));
    } else if (stream.isFilter) {
        return _("%s and %s").format(describeStream(_, stream.stream),
            describeFilter(_, stream.filter, stream.schema));
    } else if (stream.isProjection) {
        return _("the %s of %s").format(
            describeArgList(_, stream.args, stream.schema),
            describeStream(_, stream.stream));
    }  else if (stream.isCompute) {
        return _("a value computed from %s").format(
            describeStream(_, stream.stream)); // FIXME
    } else if (stream.isAlias) {
        return describeStream(_, stream.stream);
    } else if (stream.isJoin) {
        return _("%s and then get %s").format(
            describeStream(_, stream.stream),
            describeTable(_, stream.table, stream.in_params)
        );
    } else {
        throw new TypeError();
    }
}

function describeActionList(_, actions) {
    return actions.map((a) => describePrimitive(_, a)).join(', ');
}

function describeRule(_, r) {
    if (r.isRule) {
        return _("%s %s").format(
            describeActionList(_, r.actions),
            describeStream(_, r.stream));
    } else if (r.table !== null) {
        return _("get %s and then %s").format(describeTable(_, r.table, []),
            describeActionList(_, r.actions));
    } else {
        return describeActionList(_, r.actions);
    }
}

function describeDeclaration(_, d) {
    if (d.type === 'stream')
        return _("let %s be %s").format(clean(d.name), describeStream(_, d.value));
    else if (d.type === 'table')
        return _("let %s be %s").format(clean(d.name), describeTable(_, d.value));
    else
        return _("let %s be %s").format(clean(d.name), describePrimitive(_, d.value));
}

function describeProgram(_, program) {
    let desc = program.declarations.concat(program.rules).map((r) => {
        if (r.isDeclaration)
            return describeDeclaration(_, r);
        else
            return describeRule(_, r);
    }).join('; ');
    if (program.principal)
        return _("tell %s: %s").format(describeArg(_, program.principal), desc);
    else
        return desc;
}

function describePermissionFunction(_, permissionFunction, functionType, scope) {
    if (permissionFunction.isSpecified) {
        let kind = permissionFunction.kind;
        let schema = permissionFunction.schema;

        let confirm = schema.confirmation;
        confirm = confirm.replace('$__device', clean(kind));

        if (!permissionFunction.filter.isTrue) {
            let filterClone = permissionFunction.filter.clone().optimize();

            if (!filterClone.isAnd)
                filterClone = Ast.BooleanExpression.And([filterClone]);

            filterClone.operands.forEach((operand, i) => {
                // don't traverse Ors or Nots
                if (!operand.isAtom)
                    return;
                if (operand.operator !== '==')
                    return;

                let argname = operand.name;
                if (confirm.indexOf('$' + argname) >= 0) {
                    confirm = confirm.replace('$' + argname, describeArg(_, operand.value, scope));
                    filterClone.operands[i] = Ast.BooleanExpression.True;
                } else if (confirm.indexOf('${' + argname + '}') >= 0) {
                    confirm = confirm.replace('${' + argname + '}', describeArg(_, operand.value, scope));
                    filterClone.operands[i] = Ast.BooleanExpression.True;
                }
            });
            filterClone = filterClone.optimize();

            if (!filterClone.isTrue)
                confirm = _("%s if %s").format(confirm, describeFilter(_, filterClone, schema, scope));
        }
        for (let argname of schema.args) {
            let index = schema.index[argname];
            let argcanonical = schema.argcanonicals[index];
            if (confirm.indexOf('$' + argname) >= 0)
                confirm = confirm.replace('$' + argname, _("any %s").format(argcanonical));
            else if (confirm.indexOf('${' + argname + '}') >= 0)
                confirm = confirm.replace('${' + argname + '}', _("any %s").format(argcanonical));
        }

        for (let argname in permissionFunction.schema.out) {
            let index = schema.index[argname];
            let argcanonical = schema.argcanonicals[index] || clean(argname);
            scope[argname] = argcanonical;
        }

        return confirm;
    } else {
        assert(permissionFunction.isClassStar);

        // class star
        let kind = permissionFunction.kind;
        if (kind === 'org.thingpedia.builtin.thingengine.builtin') {
            // very weird edge cases...
            switch (functionType) {
            case 'query':
                return _("your clock");
            case 'action':
                return _("send you messages, configure new accounts and open links");
            }
        }

        switch (functionType) {
        case 'query':
            return _("your %s").format(doCapitalizeSelector(kind));
        case 'action':
            return _("perform any action on your %s").format(doCapitalizeSelector(kind));
        default:
            return '';
        }
    }
}

function describePermissionRule(_, permissionRule) {
    let principal;
    if (permissionRule.principal.isTrue)
        principal = _("anyone");
    else if (permissionRule.principal.isAtom && permissionRule.principal.operator === '==')
        principal = describeArg(_, permissionRule.principal.value);
    else if (permissionRule.principal.isAtom && permissionRule.principal.operator === 'group_member')
        principal = _("anyone in the %s group").format(describeArg(_, permissionRule.principal.value));
    else
        principal = _("anyone if %s").format(describeFilter(_, permissionRule.principal, null, { source: _("requester") }));

    const scope = {};
    if (permissionRule.query.isBuiltin) {
        if (permissionRule.action.isBuiltin) {
            throw new Error();
        } else if (permissionRule.action.isStar) {
            return _("%s is allowed to perform any action").format(principal);
        } else {
            return _("%s is allowed to %s").format(principal,
                describePermissionFunction(_, permissionRule.action, 'action', scope));
        }
    } else if (permissionRule.query.isStar) {
        if (permissionRule.action.isBuiltin) {
            return _("%s is allowed to read all your data").format(principal);
        } else if (permissionRule.action.isStar) {
            return _("%s is allowed to read all your data and then perform any action with it").format(principal);
        } else {
            return _("%s is allowed to read all your data and then use it to %s").format(
                principal,
                describePermissionFunction(_, permissionRule.action, 'action', scope));
        }
    } else {
        if (permissionRule.action.isBuiltin) {
            return _("%s is allowed to read %s").format(
                principal,
                describePermissionFunction(_, permissionRule.query, 'query', scope));
        } else if (permissionRule.action.isStar) {
            return _("%s is allowed to read %s and then perform any action with it").format(
                principal,
                describePermissionFunction(_, permissionRule.query, 'query', scope));
        } else {
            return _("%s is allowed to read %s and then use it to %s").format(
                principal,
                describePermissionFunction(_, permissionRule.query, 'query', scope),
                describePermissionFunction(_, permissionRule.action, 'action', scope));
        }
    }
}

function capitalize(str) {
    return (str[0].toUpperCase() + str.substr(1)).replace(/[.\-_]([a-z])/g, (whole, char) => ' ' + char.toUpperCase()).replace(/[.\-_]/g, '');
}

function capitalizeSelector(prim) {
    return doCapitalizeSelector(prim.selector.kind, prim.channel);
}

function doCapitalizeSelector(kind, channel) {
    // thingengine.phone -> phone
    if (kind.startsWith('org.thingpedia.builtin.thingengine.'))
        kind = kind.substr('org.thingpedia.builtin.thingengine.'.length);
    // org.thingpedia.builtin.omlet -> omlet
    if (kind.startsWith('org.thingpedia.builtin.'))
        kind = kind.substr('org.thingpedia.builtin.'.length);
    // org.thingpedia.weather -> weather
    if (kind.startsWith('org.thingpedia.'))
        kind = kind.substr('org.thingpedia.'.length);
    // com.xkcd -> xkcd
    if (kind.startsWith('com.'))
        kind = kind.substr('com.'.length);
    if (kind.startsWith('gov.'))
        kind = kind.substr('gov.'.length);
    if (kind.startsWith('org.'))
        kind = kind.substr('org.'.length);
    if (kind.startsWith('uk.co.'))
        kind = kind.substr('uk.co.'.length);

    if (kind === 'builtin' || kind === 'remote' || kind.startsWith('__dyn_'))
        return capitalize(channel);
    else
        return capitalize(kind);
}

function getProgramName(_, program) {
    let descriptions = [];
    for (let [,prim] of program.iteratePrimitives()) {
        if (prim.selector.isBuiltin)
            descriptions.push(_("Notification"));
        else
            descriptions.push(capitalizeSelector(prim));
    }
    return descriptions.join(" ⇒ ");
}

function pubDescribeArg(gettext, arg) {
    return describeArg(gettext.dgettext.bind(gettext, 'thingtalk'), arg, {});
}
function pubDescribeFilter(gettext, filter, schema, scope = {}) {
    return describeFilter(gettext.dgettext.bind(gettext, 'thingtalk'), filter, schema, scope);
}
function pubDescribeProgram(gettext, program) {
    return describeProgram(gettext.dgettext.bind(gettext, 'thingtalk'), program);
}
function pubGetProgramName(gettext, program) {
    return getProgramName(gettext.dgettext.bind(gettext, 'thingtalk'), program);
}
function pubDescribePrimitive(gettext, prim, scope) {
    return describePrimitive(gettext.dgettext.bind(gettext, 'thingtalk'), prim, scope);
}
function pubDescribeStream(gettext, stream) {
    return describeStream(gettext.dgettext.bind(gettext, 'thingtalk'), stream);
}
function pubDescribeTable(gettext, table, extraInParams = []) {
    return describeTable(gettext.dgettext.bind(gettext, 'thingtalk'), table, extraInParams);
}

function pubDescribePermissionRule(gettext, permissionRule) {
    return describePermissionRule(gettext.dgettext.bind(gettext, 'thingtalk'), permissionRule);
}
function pubDescribePermissionFunction(gettext, permissionFunction, functionType, scope) {
    return describePermissionFunction(gettext.dgettext.bind(gettext, 'thingtalk'), permissionFunction, functionType, scope);
}


module.exports = {
    describeArg: pubDescribeArg,
    describeFilter: pubDescribeFilter,
    describeProgram: pubDescribeProgram,
    describePrimitive: pubDescribePrimitive,
    describeStream: pubDescribeStream,
    describeTable: pubDescribeTable,
    describePermissionRule: pubDescribePermissionRule,
    describePermissionFunction: pubDescribePermissionFunction,
    getProgramName: pubGetProgramName
};