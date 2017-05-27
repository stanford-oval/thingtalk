// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingEngine
//
// Copyright 2015-2016 Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const adt = require('adt');
const Type = require('./type');
const Ast = require('./ast');

function stringEscape(str) {
    return '"' + str.replace(/([\"\\])/g, '\\$1').replace(/\n/g, '\\n') + '"';
    // the following comment fixes broken syntax highlighting in GtkSourceView
    //]/
}

function prettyprintType(ast) {
    if (ast.isTuple)
        return '(' + ast.schema.map(prettyprintType).join(', ') + ')';
    else if (ast.isArray)
        return 'Array(' + prettyprintType(ast.elem) + ')';
    else
        return ast.toString();
}

function prettyprintParamList(ast) {
    return ast.map(function(p) {
        return p.name + ': ' + prettyprintType(p.type);
    }).join(', ');
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
        return '@(type=' + stringEscape(ast.kind) + ',id=' + stringEscape(ast.id) +
            ',principal=' + prettyprintValue(ast.principal) + ')';
    }
    if (ast.id)
        return '@(type=' + stringEscape(ast.kind) + ',id=' + stringEscape(ast.id) + ')';
    if (ast.principal)
        return '@(type=' + stringEscape(ast.kind) + ',principal=' + prettyprintValue(ast.principal) + ')';
    return '@' + ast.kind;
}

function prettyprintInputParam(ast) {
    return ast.name + '=' + prettyprintValue(ast.value);
}
function prettyprintFilter(ast) {
    if (ast.operator === 'contains')
        return ', contains(' + ast.name + ', ' + prettyprintValue(ast.value) + ')';
    else
        return ', ' + ast.name + ' ' + ast.operator + ' ' + prettyprintValue(ast.value);
}
function prettyprintOutputParam(ast) {
    return ', ' + ast.name + ' := ' + ast.value;
}

function prettyprintRulePart(ast) {
    if (ast.selector.isBuiltin)
        return ast.channel;

    return prettyprintSelector(ast.selector) + '.' + ast.channel + '(' +
        ast.in_params.map(prettyprintInputParam).join(', ') + ')' +
        ast.filters.map(prettyprintFilter).join('') + ' ' +
        ast.out_params.map(prettyprintOutputParam).join('');
}

function prettyprintActions(ast) {
    if (ast.length === 1) {
        return prettyprintRulePart(ast[0]) + ';\n';
    } else {
        return '{\n' + ast.map(prettyprintRulePart).map((r) => '        ' + r + ';\n').join('') + '}';
    }
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

function prettyprint(ast, short) {
    if (short && ast.params.length === 0) // omit the name if asked
        return ast.rules.map(prettyprintRule).join('');

    return ast.name + '(' +
            prettyprintParamList(ast.params) + ') {\n' +
            ast.rules.map(prettyprintRule).join('') + '}';
}

module.exports = prettyprint;
