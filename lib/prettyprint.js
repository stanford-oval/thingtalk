// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingEngine
//
// Copyright 2015-2016 Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const { stringEscape } = require('./escaping');

function prettyprintType(ast) {
    if (ast.isTuple)
        return '(' + ast.schema.map(prettyprintType).join(', ') + ')';
    else if (ast.isArray)
        return 'Array(' + prettyprintType(ast.elem) + ')';
    else
        return ast.toString();
}

function prettyprintParamList(ast) {
    return ast.map((p) => p.name + ': ' + prettyprintType(p.type));
}

function prettyprintLocation(ast) {
    if (ast.isAbsolute && ast.display)
        return 'makeLocation(' + ast.lat + ', ' + ast.lon + ', ' + stringEscape(ast.display) + ')';
    else if (ast.isAbsolute)
        return 'makeLocation(' + ast.lat + ', ' + ast.lon + ')';
    else
        return '$context.location.' + ast.relativeTag;
}

function prettyprintValue(ast) {
    if (ast.isVarRef)
        return ast.name;
    else if (ast.isUndefined)
        return '$undefined' + (ast.local ? '' : '.remote');
    else if (ast.isBoolean)
        return String(ast.value);
    else if (ast.isString)
        return stringEscape(ast.value);
    else if (ast.isEnum)
        return 'enum(' + ast.value + ')';
    else if (ast.isMeasure)
        return String(ast.value) + ast.unit;
    else if (ast.isNumber)
        return String(ast.value);
    else if (ast.isLocation)
        return prettyprintLocation(ast.value);
    else if (ast.isDate)
        return 'makeDate(' + ast.value.getTime() + ')';
    else if (ast.isTime)
        return 'makeTime(' + ast.hour + ',' + ast.minute + ')';
    else if (ast.isEntity)
        return stringEscape(ast.value) + '^^' + ast.type + (ast.display ? '(' + stringEscape(ast.display) + ')' : '');
    else if (ast.isEvent)
        return '$event' + (ast.name ? '.' + ast.name : '');
    else
        throw new TypeError('Invalid value type ' + ast); // the other Value forms don't have literals
}

function prettyprintSelector(ast) {
    if (ast.isBuiltin)
        return '';

    if (ast.id && ast.principal) {
        return '@' + ast.kind + '(id=' + stringEscape(ast.id) +
            ',principal=' + prettyprintValue(ast.principal) + ')';
    }
    if (ast.id)
        return '@' + ast.kind + '(id=' + stringEscape(ast.id) + ')';
    if (ast.principal)
        return '@' + ast.kind + '(principal=' + prettyprintValue(ast.principal) + ')';
    return '@' + ast.kind;
}

function prettyprintInputParam(ast) {
    return ast.name + '=' + prettyprintValue(ast.value);
}

const INFIX_FILTERS = new Set(['>=', '<=', '>', '<', '=~', '~=', '=', '!=']);

function prettyprintFilter(ast) {
    if (INFIX_FILTERS.has(ast.operator))
        return ast.name + ' ' + ast.operator + ' ' + prettyprintValue(ast.value);

    return ast.operator + '(' + ast.name + ', ' + prettyprintValue(ast.value) + ')';
}
function prettyprintExternalFilter(ast) {
    return `${prettyprintSelector(ast.selector)}.${ast.channel}(${ast.in_params.map(prettyprintInputParam).join(', ')}) { ${prettyprintFilterExpression(ast.filter)} }`
}

function prettyprintFilterExpression(ast) {
    if (ast.isTrue || (ast.isAnd && ast.operands.length === 0))
        return 'true';
    if (ast.isFalse || (ast.isOr && ast.operands.length === 0))
        return 'false';
    if (ast.isNot)
        return `!(${prettyprintFilterExpression(ast.expr)})`;
    if (ast.isAnd)
        return `(${ast.operands.map(prettyprintFilterExpression).join(' && ')})`;
    if (ast.isOr)
        return `(${ast.operands.map(prettyprintFilterExpression).join(' || ')})`;
    if (ast.isExternal)
        return prettyprintExternalFilter(ast);
    return prettyprintFilter(ast.filter);
}

function prettyprintOutputParam(ast) {
    return ', ' + ast.name + ' := ' + ast.value;
}

function prettyprintRulePart(ast) {
    if (ast.selector.isBuiltin)
        return ast.channel;

    return prettyprintSelector(ast.selector) + '.' + ast.channel + '(' +
        ast.in_params.map(prettyprintInputParam).join(', ') + ')' +
        (!ast.filter.isTrue ? ', ' + prettyprintFilterExpression(ast.filter) : '') + ' ' +
        ast.out_params.map(prettyprintOutputParam).join('');
}

function prettyprintActions(ast) {
    if (ast.length === 1)
        return prettyprintRulePart(ast[0]) + ';\n';
    else
        return '{\n' + ast.map(prettyprintRulePart).map((r) => '        ' + r + ';\n').join('') + '}';
}

function prettyprintTrigger(ast) {
    if (ast === null)
        return 'now';
    return prettyprintRulePart(ast);
}

function prettyprintRule(ast) {
    if (ast.queries.length > 0) {
        return '    ' + (ast.once ? 'once ' : '') + prettyprintTrigger(ast.trigger) + ' => ' + ast.queries.map(prettyprintRulePart).join(' => ') +
            ' => ' + prettyprintActions(ast.actions);
    } else {
        return '    ' + (ast.once ? 'once ' : '') + prettyprintTrigger(ast.trigger) + ' => ' + prettyprintActions(ast.actions);
    }
}

function prettyprintArgDef(fndef, argname) {
    if (fndef.inReq[argname])
        return 'in req ' + argname + ' : ' + fndef.inReq[argname];
    else if (fndef.inOpt[argname])
        return 'in opt ' + argname + ' : ' + fndef.inOpt[argname];
    else
        return 'out ' + argname + ' : ' + fndef.out[argname];
}

function prettyprintFunctionDef(prefix, ast) {
    return function(name) {
        return '        ' + prefix + ' ' + name + ' (' + ast[name].args.map((argname) => prettyprintArgDef(ast[name], argname)).join(', ') + ');\n';
    };
}

function prettyprintClassDef(ast) {
    return '    class @' + ast.name + ' extends @' + ast.extends + ' {\n' +
        Object.keys(ast.triggers).map(prettyprintFunctionDef('trigger', ast.triggers)) +
        Object.keys(ast.queries).map(prettyprintFunctionDef('query', ast.queries)) +
        Object.keys(ast.actions).map(prettyprintFunctionDef('action', ast.actions)) + '    }\n';
}

function prettyprint(ast, short) {
    let prefix;
    if (ast.principal !== null)
        prefix = prettyprintValue(ast.principal) + ' : ';
    else
        prefix = '';

    if (short && ast.params.length === 0 && ast.classes.length === 0) // omit the name if asked
        return prefix + ast.rules.map(prettyprintRule).join('');

    return prefix + ast.name + '(' +
            prettyprintParamList(ast.params) + ') {\n' +
            ast.classes.map(prettyprintClassDef).join('') +
            ast.rules.map(prettyprintRule).join('') + '}';
}

function prettyprintPermissionFunction(fn) {
    if (fn.isStar)
        return '*';
    if (fn.isClassStar)
        return '@' + fn.kind + '.*';

    return ('@' + fn.kind + '.' + fn.channel + ', ' +
        prettyprintFilterExpression(fn.filter)) + ' ' + fn.out_params.map(prettyprintOutputParam).join('');
}

function prettyprintPermissionRule(allowed) {
    let buffer ='';

    if (allowed.principal !== null)
        buffer += prettyprintValue(allowed.principal) + ' : ';
    buffer += (allowed.trigger.isBuiltin ? 'now' : prettyprintPermissionFunction(allowed.trigger));
    buffer += (allowed.query.isBuiltin ? '' : ' => ' + prettyprintPermissionFunction(allowed.query));
    buffer += (allowed.action.isBuiltin ? ' => notify' : ' => ' + prettyprintPermissionFunction(allowed.action));
    return buffer;
}

module.exports = {
    prettyprint,
    prettyprintClassDef,
    prettyprintFilterExpression,
    prettyprintPermissionRule
};
