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
    return '"' + str.replace(/([\"\'\\])/g, '\\$1').replace(/\n/g, '\\n') + '"';
    // the following comment fixes broken syntax highlighting in GtkSourceView
    //]/
}

function codegenType(ast) {
    if (ast.isTuple)
        return '(' + ast.schema.map(codegenType).join(', ') + ')';
    else if (ast.isArray)
        return 'Array(' + codegenType(ast.elem) + ')';
    else if (ast.isMap)
        return 'Map(' + codegenType(ast.key) + ', ' + codegenType(ast.value) + ')';
    else
        return ast.toString();
}

function codegenParamList(ast) {
    return ast.map(function(p) {
        return p.name + ': ' + codegenType(p.type);
    }).join(', ');
}

function codegenValue(ast) {
    if (ast.isVarRef)
        return ast.name;
    else if (ast.isBoolean)
        return String(ast.value);
    else if (ast.isString || ast.isEnum)
        return stringEscape(ast.value);
    else if (ast.isMeasure)
        return String(ast.value) + ast.unit;
    else if (ast.isNumber)
        return String(ast.value);
    else if (ast.isPicture)
        return '$makePicture(' + stringEscape(ast.value) + ')';
    else if (ast.isURL)
        return '$makeURL(' + stringEscape(ast.value) + ')';
    else if (ast.isUsername)
        return '$makeUsername(' + stringEscape(ast.value) + ')';
    else if (ast.isHashtag)
        return '$makeHashtag(' + stringEscape(ast.value) + ')';
    else if (ast.isResource)
        return '$makeResource(' + stringEscape(ast.value) + ')';
    else if (ast.isLocation)
        return '$makeLocation(' + String(ast.y) + ',' + String(ast.x) + ')';
    else if (ast.isDate)
        return '$makeDate(' + ast.value.getTime() + ')';
    else if (ast.isPhoneNumber)
        return '$makePhoneNumber(' + stringEscape(ast.value) + ')';
    else if (ast.isEmailAddress)
        return '$makeEmailAddress(' + stringEscape(ast.value) + ')';
    else if (ast.isTime)
        return '$makeTime(' + ast.hour + ',' + ast.minute + ')';
    else
        throw new TypeError(); // the other Value forms don't have literals
}

function codegenExpression(ast) {
    if (ast.isNull)
        return '_';
    else if (ast.isConstant)
        return codegenValue(ast.value);
    else if (ast.isVarRef)
        return ast.name;
    else if (ast.isMemberRef)
        return codegenExpression(ast.object) + '.' + ast.name;
    else if (ast.isFunctionCall)
        return '$' + ast.name + '(' + ast.args.map(codegenExpression).join(', ') + ')';
    else if (ast.isUnaryOp)
        return ast.opcode + codegenExpression(ast.arg);
    else if (ast.isBinaryOp)
        return codegenExpression(ast.lhs) + ' ' + ast.opcode + ' ' +
            codegenExpression(ast.rhs);
    else if (ast.isTuple)
        return '(' + ast.args.map(codegenExpression).join(', ') + ')';
    else if (ast.isArray)
        return '[' + ast.args.map(codegenExpression).join(', ') + ']';
    else
        throw new TypeError();
}

function codegenKeyword(ast) {
    return (ast.negative ? '!' : '') + ast.keyword.name
        + '(' + ast.params.map(codegenExpression).join(', ') + ')';
}

function codegenAttribute(ast) {
    return ast.name + '=' + codegenValue(ast.value);
}

function codegenSelector(ast) {
    if (ast.isGlobalName)
        return '@' + ast.name;
    else if (ast.isAttributes)
        return '@(' + ast.attributes.map(codegenAttribute).join(', ') + ')';
    else if (ast.isBuiltin)
        return '@builtin';
}

function codegenInvocation(ast) {
    if (ast.selector.isBuiltin && ast.name === 'notify' && ast.params.length === 0)
        return 'notify';
    return codegenSelector(ast.selector) +
        (ast.name !== null ? '.' + ast.name : '') + '(' +
        ast.params.map(codegenExpression).join(', ') + ')';
}

function codegenRulePart(ast) {
    if (ast.isInvocation)
        return codegenInvocation(ast);
    else if (ast.isKeyword)
        return codegenKeyword(ast);
    else if (ast.isBinding)
        return ast.name + ' = ' + codegenExpression(ast.expr);
    else if (ast.isMemberBinding)
        return ast.name + ' in F';
    else if (ast.isBuiltinPredicate || ast.isCondition)
        return codegenExpression(ast.expr);
    else
        throw new TypeError();
}

function codegenSequence(ast) {
    return ast.map(codegenRulePart).join(', ');
}

function codegenAction(ast) {
    if (ast.length === 1) {
        return codegenRulePart(ast[0]) + ';\n';
    } else {
        return '{\n' + ast.map(codegenRulePart).map((r) => '        ' + r + ';\n').join('') + '}';
    }
}

function codegenRule(ast) {
    if (ast.queries.length > 0) {
        return '    ' + codegenSequence(ast.trigger) + ' => ' + ast.queries.map(codegenSequence).join(' => ') +
            ' => ' + codegenAction(ast.actions);
    } else {
        return '    ' + codegenSequence(ast.trigger) + ' => ' + codegenAction(ast.actions);
    }
}

function codegenCommand(ast) {
    if (ast.queries.length > 0)
        return '    now => ' + ast.queries.map(codegenSequence).join(' => ') + ' => ' + codegenAction(ast.actions);
    else
        return '    now => ' + codegenAction(ast.actions);
}

function codegenVarDecl(ast) {
    return '    var ' +
        ast.name.name + ' : ' + codegenType(ast.type) +
        ';\n';
}

function codegenComputeStmt(ast) {
    if (ast.isEventDecl)
        return '        event ' + ast.name + '(' + codegenParamList(ast.params) + ');\n';
    else if (ast.isFunctionDecl)
        return '        function ' + ast.name + '(' + codegenParamList(ast.params) + ') {'
        + ast.code + '}\n';
    else
        throw TypeError();
}

function codegenComputeModule(ast) {
    return '    module ' + ast.name + ' {\n' +
        ast.statements.map(codegenComputeStmt).join('') + '    }\n';
}

function codegenStmt(ast) {
    if (ast.isComputeModule)
        return codegenComputeModule(ast);
    else if (ast.isVarDecl)
        return codegenVarDecl(ast);
    else if (ast.isRule)
        return codegenRule(ast);
    else if (ast.isCommand)
        return codegenCommand(ast);
    else
        throw new TypeError();
}

function codegen(ast) {
    return ast.name.name + '(' +
            codegenParamList(ast.params) + ') {\n' +
            ast.statements.map(codegenStmt).join('') + '}';
}

module.exports = codegen;
