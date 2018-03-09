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

const { optimizeFilter } = require('./optimize');
const Ast = require('./ast');
const { clean } = require('./utils');
const Generate = require('./generate');

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

function describeDate(_, date, offset) {
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
        case 'month':
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
        base = date.toLocaleString();
    }

    if (offset)
        return _("%s past %s").format(describeArg(_, offset, {}), base);
    else
        return base;
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
        case null:
            return _("the result");
        case 'title':
            return _("the notification title");
        case 'body':
            return _("the notification body");
        }
    }
    if (arg.isLocation)
        return displayLocation(_, arg.value);
    if (arg.isString)
        return '"' + arg.value + '"';
    if (arg.isEntity) {
        if (arg.type === 'tt:username' || arg.type === 'tt:contact_name')
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
        return describeDate(_, arg.value, arg.offset);
    if (arg.isTime)
        return arg.second === 0 ? "%02d:%02d".format(arg.hour, arg.minute) : "%02d:%02d:%02d".format(arg.hour, arg.minute, arg.second);

    return String(arg);
}

function describePlaceholder(_, type) {
    return '____';
}

function describeFilter(_, expr, schema, scope = {}) {
    return (function recursiveHelper(expr) {
        if (expr.isTrue || (expr.isAnd && expr.operands.length === 0))
            return _("true");
        if (expr.isFalse || (expr.isOr && expr.operands.length === 0))
            return _("false");
        if ((expr.isAnd || expr.isOr) && expr.operands.length === 1)
            return recursiveHelper(expr.operands[0]);
        if (expr.isAnd)
            return expr.operands.map(recursiveHelper).reduce((x, y) => _("%s and %s").format(x, y));
        if (expr.isOr)
            return expr.operands.map(recursiveHelper).reduce((x, y) => _("%s or %s").format(x, y));
        if (expr.isNot)
            return _("not %s").format(recursiveHelper(expr.expr));
        if (expr.isExternal)
            return describePrimitive(_, expr, 'query', scope);

        let filter = expr;
        let argname = filter.name;
        let argcanonical;
        if (argname in schema.index) {
            let index = schema.index[argname];
            argcanonical = schema.argcanonicals[index] || clean(argname);
        } else {
            argcanonical = scope[argname];
        }
        let value =  describeArg(_, filter.value, scope);
        switch (filter.operator) {
        case 'contains':
        case 'substr':
        case '=~':
            return _("%s contains %s").format(argcanonical, value);
        case 'in_array':
        case '~=':
            return _("%s contains %s").format(value, argcanonical);
        case 'starts_with':
            return _("%s starts with %s").format(argcanonical, value);
        case 'ends_with':
            return _("%s ends with %s").format(argcanonical, value);
        case 'prefix_of':
            return _("%s starts with %s").format(value, argcanonical);
        case 'suffix_of':
            return _("%s ends with %s").format(value, argcanonical);
        case '=':
            return _("%s is equal to %s").format(argcanonical, value);
        case '!=':
            return _("%s is not equal to %s").format(argcanonical, value);
        case '<':
            return _("%s is less than %s").format(argcanonical, value);
        case '>':
            return _("%s is greater than %s").format(argcanonical, value);
        case '<=':
            return _("%s is less than or equal to %s").format(argcanonical, value);
        case '>=':
            return _("%s is greater than or equal to %s").format(argcanonical, value);
        default:
            throw new TypeError('Invalid operator ' + filter.operator);
        }
    })(expr);
}

function describeMemoryPrimitive(_, obj, primType, scope) {
    let confirm = obj.channel.split('_')[0] + ' ';
    if (obj.aggregation) {
        switch(obj.aggregation.type) {
            case 'max':
            case 'min':
            case 'avg':
            case 'sum': confirm += `${obj.aggregation.type} of ${obj.aggregation.field}`; break;
            case 'count':
                if (obj.aggregation.field === '*')
                    confirm += `count of records`;
                else
                    confirm += `count of ${obj.aggregation.field}`;
                break;
            case 'argmax':
            case 'argmin':
                confirm += obj.aggregation.cols.length ? obj.aggregation.cols.join(', ') : 'records';
                confirm += ` where ${obj.aggregation.field} is ${obj.aggregation.type.substring('arg'.length)}imum`;
                break;
            default:
                throw new Error('Unsupported aggregation type: ' + obj.aggregation.type);
        }
    } else {
        confirm += obj.out_params.length ? obj.out_params.join(', ') : 'records';
    }
    confirm += ` from table ${obj.in_params[0].value.value} in memory`;

    const schema = obj.schema;
    if (!obj.filter.isTrue) {
        if (primType === 'trigger')
            confirm = _("%s and %s").format(confirm, describeFilter(_, obj.filter, schema, scope));
        else if (primType === 'query')
            confirm = _("%s if %s").format(confirm, describeFilter(_, obj.filter, schema, scope));
    }
    return confirm;
}

function describePrimitive(_, obj, primType, scope) {
    if (obj.selector.isBuiltin) {
        if (obj.channel === 'return')
            return _("send it to me");
        else if (obj.channel === 'notify')
            return _("notify you");
        else if (obj.channel === 'save')
            return _("save it");
        else if (obj.channel === 'get_record' || obj.channel === 'new_record')
            return describeMemoryPrimitive(_, obj, primType, scope);
        else
            throw new TypeError();
    }

    var kind = obj.selector.kind;
    var owner = obj.selector.principal;
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
    } else if (owner) {
        confirm = schema.confirmation_remote;
        if (!confirm)
            confirm = schema.confirmation;
        if (confirm === schema.confirmation)
            confirm = confirm.replace('your', describeArg(_, owner) + '\'s').replace('you', describeArg(_, owner));
        else
            confirm = confirm.replace('$__person', describeArg(_, owner));
    } else {
        confirm = schema.confirmation;
        if (obj.selector.device)
            confirm = confirm.replace('$__device', obj.selector.device.name);
        else
            confirm = confirm.replace('$__device', clean(kind));
    }

    let firstExtra = true;
    for (let inParam of obj.in_params) {
        let argname = inParam.name;
        let ptype = obj.schema.inReq[argname] || obj.schema.inOpt[argname];
        let index = obj.schema.index[argname];
        let argcanonical = obj.schema.argcanonicals[index] || clean(argname);
        let value = inParam.value.isUndefined ? describePlaceholder(_, ptype) : describeArg(_, inParam.value, scope);
        if (confirm.indexOf('$' + argname) >= 0) {
            confirm = confirm.replace('$' + argname, value);
        } else {
            if (argname.startsWith('__'))
                continue;
            if (kind === 'remote' || kind.startsWith('__dyn'))
                continue;
            if (inParam.value.isUndefined)
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

function describeTable(_, table) {
    if (table.isVarRef) {
        return clean(table.name);
    } else if (table.isInvocation) {
        return describePrimitive(_, table.invocation);
    } else if (table.isFilter) {
        return _("%s if %s").format(describeTable(_, table.table),
            describeFilter(_, table.filter, table.schema));
    } else if (table.isProjection) {
        return _("the %s of %s").format(
            describeArgList(_, table.args, table.schema),
            describeTable(_, table.table));
    } else if (table.isCompute) {
        return _("a value computed from %s").format(
            describeTable(_, table.table)); // FIXME
    } else if (table.isAlias) {
        return describeTable(_, table.table);
    } else if (table.isAggregation) {
        if (table.field === '*')
            return _("the count of %s").format(describeTable(_, table.table));
        return _("the %s of %s in %s").format(
            table.operator,
            describeArgName(_, table.field, table.schema).
            describeTable(_, table.table));
    } else if (table.isArgMinMax) {
        if (table.operator === 'argmin') {
            return _("the %s with the minimum %s").format(
                describeTable(_, table.table),
                describeArgName(_, table.field, table.schema));
        } else {
            return _("the %s with the maximum %s").format(
                describeTable(_, table.table),
                describeArgName(_, table.field, table.schema));
        }
    } else if (table.isJoin) {
        return _("%s and %s").format(describeTable(_, table.lhs), describeTable(_, table.rhs));
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
                describeTable(_, table.table));
        } else {
            return _("the latest %s %s, starting at the %d-th").format(
                describeArg(_, table.delta),
                describeTable(_, table.table),
                describeArg(_, table.base));
        }
    } else if (table.isHistory) {
        if (table.base.isDate && table.base.value === null) {
            return _("the %s that changed in in the last %s").format(
                describeTable(_, table.table),
                describeArg(_, table.delta));
        } else {
            return _("the %s that changed in the %s prior to %s").format(
                describeTable(_, table.table),
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
        return _("when %s changes").format(describeTable(_, stream.table));
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
            describeTable(_, stream.table)
            // FIXME in_params
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
        return _("get %s and then %s").format(describeTable(_, r.table),
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
            let filterClone = optimizeFilter(permissionFunction.filter.clone());

            if (!filterClone.isAnd)
                filterClone = Ast.BooleanExpression.And([filterClone]);

            filterClone.operands.forEach((operand, i) => {
                // don't traverse Ors or Nots
                if (!operand.isAtom)
                    return;
                if (operand.filter.operator !== '=')
                    return;

                let argname = operand.filter.name;
                if (confirm.indexOf('$' + argname) >= 0) {
                    confirm = confirm.replace('$' + argname, describeArg(_, operand.filter.value, scope));
                    filterClone.operands[i] = Ast.BooleanExpression.True;
                }
            });
            filterClone = optimizeFilter(filterClone);

            if (!filterClone.isTrue)
                confirm = _("%s if %s").format(confirm, describeFilter(_, filterClone, schema, scope));
        }
        for (let argname of schema.args) {
            if (confirm.indexOf('$' + argname) >= 0) {
                let index = schema.index[argname];
                let argcanonical = schema.argcanonicals[index];
                confirm = confirm.replace('$' + argname, _("any %s").format(argcanonical));
            }
        }
        if (functionType === 'trigger')
            confirm = _("monitor if %s").format(confirm);

        for (let outParam of permissionFunction.out_params) {
            let argname = outParam.value;
            let index = schema.index[argname];
            let argcanonical = schema.argcanonicals[index] || clean(argname);
            scope[outParam.name] = argcanonical;
        }

        return confirm;
    } else {
        assert(permissionFunction.isClassStar);

        // class star
        let kind = permissionFunction.kind;
        if (kind === 'org.thingpedia.builtin.thingengine.builtin') {
            // very weird edge cases...
            switch (functionType) {
            case 'trigger':
            case 'query':
                return _("use your clock");
            case 'action':
                return _("send you messages");
            }
        }

        switch (functionType) {
        case 'trigger':
            return _("monitor your %s").format(doCapitalizeSelector(kind));
        case 'query':
            return _("read your %s").format(doCapitalizeSelector(kind));
        case 'action':
            return _("perform any action on your %s").format(doCapitalizeSelector(kind));
        default:
            return '';
        }
    }
}

function describePermissionRule(_, permissionRule) {
    let principal;
    if (permissionRule.principal !== null) {
        if (permissionRule.principal.type === 'tt:group' || permissionRule.principal.type === 'tt:contact_group_name')
            principal = _("anyone in the group %s").format(describeArg(_, permissionRule.principal));
        else
            principal = describeArg(_, permissionRule.principal);
    } else {
        principal = _("anyone");
    }

    const scope = {};
    if (permissionRule.query.isBuiltin) {
        if (permissionRule.trigger.isStar) {
            if (permissionRule.action.isBuiltin) {
                return _("%s is allowed to monitor any of your devices").format(principal);
            } else if (permissionRule.action.isStar) {
                return _("%s is allowed to monitor any of your devices and then perform any action with it").format(principal);
            } else {
                return _("%s is allowed to monitor and read any of your devices and then %s").format(
                    principal,
                    describePermissionFunction(_, permissionRule.action, 'action', scope));
            }
        } else if (permissionRule.trigger.isBuiltin) {
            if (permissionRule.action.isBuiltin) {
                console.log('Invalid permission rule now => noop => notify');
                return '';
            } else if (permissionRule.action.isStar) {
                return _("%s is allowed to perform any action").format(principal);
            } else {
                return _("%s is allowed to %s").format(
                    principal,
                    describePermissionFunction(_, permissionRule.action, 'action', scope));
            }
        } else {
            if (permissionRule.action.isBuiltin) {
                return _("%s is allowed to %s").format(
                    principal,
                    describePermissionFunction(_, permissionRule.trigger, 'trigger', scope));
            } else if (permissionRule.action.isStar) {
                return _("%s is allowed to %s and then perform any action with it").format(
                    principal,
                    describePermissionFunction(_, permissionRule.trigger, 'trigger', scope));
            } else {
                return _("%s is allowed to %s and then %s").format(
                    principal,
                    describePermissionFunction(_, permissionRule.trigger, 'trigger', scope),
                    describePermissionFunction(_, permissionRule.action, 'action', scope));
            }
        }
    } else if (permissionRule.query.isStar) {
        if (permissionRule.trigger.isStar) {
            if (permissionRule.action.isBuiltin) {
                return _("%s is allowed to monitor and read any of your devices").format(principal);
            } else if (permissionRule.action.isStar) {
                return _("%s is allowed to monitor and read any of your devices and then perform any action with it").format(principal);
            } else {
                return _("%s is allowed to monitor and read any of your devices and then %s").format(
                    principal,
                    describePermissionFunction(_, permissionRule.action, 'action', scope));
            }
        } else if (permissionRule.trigger.isBuiltin) {
            if (permissionRule.action.isBuiltin) {
                return _("%s is allowed to read any of your devices").format(principal);
            } else if (permissionRule.action.isStar) {
                return _("%s is allowed to read any of your devices and then perform any action with it").format(principal);
            } else {
                return _("%s is allowed to read any of your devices and then %s").format(
                    principal,
                    describePermissionFunction(_, permissionRule.action, 'action', scope));
            }
        } else {
            if (permissionRule.action.isBuiltin) {
                return _("%s is allowed to %s, read any of your devices").format(
                    principal,
                    describePermissionFunction(_, permissionRule.trigger, 'trigger', scope));
            } else if (permissionRule.action.isStar) {
                return _("%s is allowed to %s, read any of your devices and then perform any action with it").format(
                    principal,
                    describePermissionFunction(_, permissionRule.trigger, 'trigger', scope));
            } else {
                return _("%s is allowed to %s, read any of your devices and then %s").format(
                    principal,
                    describePermissionFunction(_, permissionRule.trigger, 'trigger', scope),
                    describePermissionFunction(_, permissionRule.action, 'action', scope));
            }
        }
    } else {
        if (permissionRule.trigger.isStar) {
            if (permissionRule.action.isBuiltin) {
                return _("%s is allowed to monitor any of your devices and %s").format(
                    principal,
                    describePermissionFunction(_, permissionRule.query, 'query', scope));
            } else if (permissionRule.action.isStar) {
                return _("%s is allowed to monitor any of your devices, %s and then perform any action with it").format(
                    principal,
                    describePermissionFunction(_, permissionRule.query, 'query', scope));
            } else {
                return _("%s is allowed to monitor any of your devices, %s and then use it to %s").format(
                    principal,
                    describePermissionFunction(_, permissionRule.query, 'query', scope),
                    describePermissionFunction(_, permissionRule.action, 'action', scope));
            }
        } else if (permissionRule.trigger.isBuiltin) {
            if (permissionRule.action.isBuiltin) {
                return _("%s is allowed to %s").format(
                    principal,
                    describePermissionFunction(_, permissionRule.query, 'query', scope));
            } else if (permissionRule.action.isStar) {
                return _("%s is allowed to %s and then perform any action with it").format(
                    principal,
                    describePermissionFunction(_, permissionRule.query, 'query', scope));
            } else {
                return _("%s is allowed to %s and then use it to %s").format(
                    principal,
                    describePermissionFunction(_, permissionRule.query, 'query', scope),
                    describePermissionFunction(_, permissionRule.action, 'action', scope));
            }
        } else {
            if (permissionRule.action.isBuiltin) {
                return _("%s is allowed to %s and then %s").format(
                    principal,
                    describePermissionFunction(_, permissionRule.trigger, 'trigger', scope),
                    describePermissionFunction(_, permissionRule.query, 'query', scope));
            } else if (permissionRule.action.isStar) {
                return _("%s is allowed to %s then %s and then perform any action with it").format(
                    principal,
                    describePermissionFunction(_, permissionRule.trigger, 'trigger', scope),
                    describePermissionFunction(_, permissionRule.query, 'query', scope));
            } else {
                return _("%s is allowed to %s then %s and then use it to %s").format(
                    principal,
                    describePermissionFunction(_, permissionRule.trigger, 'trigger', scope),
                    describePermissionFunction(_, permissionRule.query, 'query', scope),
                    describePermissionFunction(_, permissionRule.action, 'action', scope));
            }
        }
    }
}

function capitalize(str) {
    return (str[0].toUpperCase() + str.substr(1)).replace(/[.\-_]([a-z])/g, (whole, char) => char.toUpperCase()).replace(/[.\-_]/g, '');
}

function capitalizeSelector(prim) {
    if (prim.selector.isBuiltin)
        return doCapitalizeSelector('builtin', prim.channel);
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
    for (let [,prim] of Generate.iteratePrimitives(program)) {
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
function pubDescribeProgram(gettext, program) {
    return describeProgram(gettext.dgettext.bind(gettext, 'thingtalk'), program);
}
function pubGetProgramName(gettext, program) {
    return getProgramName(gettext.dgettext.bind(gettext, 'thingtalk'), program);
}
function pubDescribePrimitive(gettext, prim, scope) {
    return describePrimitive(gettext.dgettext.bind(gettext, 'thingtalk'), prim, scope);
}
function pubDescribeStream(gettext, stream, scope) {
    return describeStream(gettext.dgettext.bind(gettext, 'thingtalk'), stream, scope);
}
function pubDescribeTable(gettext, table, scope) {
    return describeTable(gettext.dgettext.bind(gettext, 'thingtalk'), table, scope);
}

function pubDescribePermissionRule(gettext, permissionRule) {
    return describePermissionRule(gettext.dgettext.bind(gettext, 'thingtalk'), permissionRule);
}
function pubDescribePermissionFunction(gettext, permissionFunction, functionType, scope) {
    return describePermissionFunction(gettext.dgettext.bind(gettext, 'thingtalk'), permissionFunction, functionType, scope);
}

module.exports = {
    describeArg: pubDescribeArg,
    describeProgram: pubDescribeProgram,
    describePrimitive: pubDescribePrimitive,
    describeStream: pubDescribeStream,
    describeTable: pubDescribeTable,
    describePermissionRule: pubDescribePermissionRule,
    describePermissionFunction: pubDescribePermissionFunction,
    getProgramName: pubGetProgramName
};
