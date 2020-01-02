// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingTalk
//
// Copyright 2015-2016 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const { stringEscape } = require('./escaping');

function prettyprintType(ast, prefix='') {
    if (ast.isTuple) {
        return '(' + ast.schema.map(prettyprintType).join(', ') + ')';
    } else if (ast.isArray) {
        return 'Array(' + prettyprintType(ast.elem, prefix) + ')';
    } else if (ast.isCompound) {
        const fields = Object.keys(ast.fields)
            .filter((f) => !f.includes('.')) // filter out fields flattened from compound
            .map((f) => `${f}: ${prettyprintType(ast.fields[f].type, prefix + '  ')}${prettyprintAnnotations(ast.fields[f], ' ', false)}`);
        return `{\n${prefix}  ${fields.join(',\n' + prefix + '  ')}\n${prefix}}`;
    } else {
        return ast.toString();
    }
}

function prettyprintLocation(ast) {
    if (ast.isAbsolute && ast.display)
        return 'makeLocation(' + ast.lat + ', ' + ast.lon + ', ' + stringEscape(ast.display) + ')';
    else if (ast.isAbsolute)
        return 'makeLocation(' + ast.lat + ', ' + ast.lon + ')';
    else if (ast.isUnresolved)
        return `makeLocation(${stringEscape(ast.name)})`;
    else
        return '$context.location.' + ast.relativeTag;
}

function prettyprintDate(value, operator, offset) {
    let base;
    if (value === null)
        base = 'makeDate()';
    else if (value.isDateEdge)
        base = `${value.edge}(${value.unit})`;
    else
        base = `makeDate(${value.getTime()})`;
    return base + (offset ? ` ${operator} ${prettyprintValue(offset)}` : '');
}

function prettyprintTime(ast) {
    if (ast.isAbsolute)
        return `makeTime(${ast.hour}, ${ast.minute})`;
    else
        return '$context.time.' + ast.relativeTag;
}

function prettyprintValue(ast) {
    if (ast.isVarRef)
        return ast.name;
    else if (ast.isUndefined)
        return ast.local ? '$?' : '$undefined.remote';
    else if (ast.isContextRef)
        return `$context.${ast.name} : ${ast.type}`;
    else if (ast.isArray)
        return `[${ast.value.map(prettyprintValue).join(', ')}]`;
    else if (ast.isBoolean)
        return String(ast.value);
    else if (ast.isString)
        return stringEscape(ast.value);
    else if (ast.isEnum)
        return `enum(${ast.value})`;
    else if (ast.isMeasure)
        return String(ast.value) + ast.unit;
    else if (ast.isCompoundMeasure && ast.value.length > 1)
        return `(${ast.value.map(prettyprintValue).join(' + ')})`;
    else if (ast.isCompoundMeasure)
        return prettyprintValue(ast.value[0]);
    else if (ast.isNumber)
        return String(ast.value);
    else if (ast.isCurrency)
        return `makeCurrency(${ast.value}, ${ast.code})`;
    else if (ast.isLocation)
        return prettyprintLocation(ast.value);
    else if (ast.isDate)
        return prettyprintDate(ast.value, ast.operator, ast.offset);
    else if (ast.isTime)
        return prettyprintTime(ast.value);
    else if (ast.isEntity)
        return (ast.value !== null ? stringEscape(ast.value) : 'null') + '^^' + ast.type + (ast.display ? '(' + stringEscape(ast.display) + ')' : '');
    else if (ast.isEvent)
        return '$event' + (ast.name ? '.' + ast.name : '');
    else if (ast.isArgMap)
        return `makeArgMap(${Object.entries(ast.value).map(([key, value]) => `${key}:${value.toString()}`).join(',')})`; //`
    else if (ast.isObject)
        return '{' + Object.entries(ast.value).map(([key, value]) => key+'='+prettyprintValue(value)).join(',') + '}';
    else
        throw new TypeError('Invalid value type ' + ast); // the other Value forms don't have literals
}

function prettyprintSelector(ast) {
    if (ast.isBuiltin)
        return '';

    if (ast.attributes.length > 0) {
        const attributes = ast.attributes.map(prettyprintInputParam).join(', ');

        if (ast.id)
            return `@${ast.kind}(id=${stringEscape(ast.id)}, ${attributes})`;
        else if (ast.all)
            return `@${ast.kind}(all=true, ${attributes})`;
        else
            return `@${ast.kind}(${attributes})`;
    } else {
        if (ast.id)
            return `@${ast.kind}(id=${stringEscape(ast.id)})`;
        else if (ast.all)
            return `@${ast.kind}(all=true)`;
        else
            return `@${ast.kind}`;
    }
}

function prettyprintInputParam(ast) {
    return ast.name + '=' + prettyprintValue(ast.value);
}

const INFIX_FILTERS = new Set(['>=', '<=', '>', '<', '=~', '~=', '==']);

function prettyprintExternalFilter(ast) {
    return `${prettyprintSelector(ast.selector)}.${ast.channel}(${ast.in_params.map(prettyprintInputParam).join(', ')}) { ${prettyprintFilterExpression(ast.filter)} }`;
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
    if (ast.isCompute)
        return `${prettyprintScalarExpression(ast.lhs)} ${ast.operator} ${prettyprintValue(ast.rhs)}`;
    if (ast.isVarRef)
        return `${prettyprintSelector(ast.selector)}.${ast.name}(${ast.in_params.map(prettyprintInputParam).join(', ')})`;

    if (INFIX_FILTERS.has(ast.operator))
        return `${ast.name} ${ast.operator} ${prettyprintValue(ast.value)}`;

    return `${ast.operator}(${ast.name}, ${prettyprintValue(ast.value)})`;
}

function prettyprintInvocation(ast) {
    if (!ast.selector)
        throw new Error('Invalid invocation ' + ast);
    if (ast.selector.isBuiltin)
        return ast.channel;
    return `${prettyprintSelector(ast.selector)}.${ast.channel}(${ast.in_params.map(prettyprintInputParam).join(', ')})`;
}

function prettyprintAction(action) {
    if (action.isVarRef)
        return prettyprintVarRef(action);
    else if (action.isInvocation)
        return prettyprintInvocation(action.invocation);
    else
        throw new TypeError();
}

function prettyprintActionList(actions) {
    if (actions.length === 1)
        return prettyprintAction(actions[0]);
    else
        return `{\n${actions.map((a) => '    ' + prettyprintAction(a) + ';\n').join('')} }`;
}

function prettyprintRule(ast, prefix = '  ') {
    if (ast.isRule)
        return `${prefix}${prettyprintStream(ast.stream)} => ${prettyprintActionList(ast.actions)};\n`;
    else if (ast.table === null)
        return `${prefix}now => ${prettyprintActionList(ast.actions)};\n`;
    else
        return `${prefix}now => ${prettyprintTable(ast.table)} => ${prettyprintActionList(ast.actions)};\n`;
}

function prettyprintListExpression(expr) {
    if (expr.filter)
        return `${expr.name}, ${prettyprintFilterExpression(expr.filter)}`;
    return `${expr.name}`;
}

function prettyprintAggregationFilter(expr) {
    if (expr.operator === 'count' || !expr.field)
        return `${expr.operator}(${prettyprintListExpression(expr.list)})`;
    return `${expr.operator}(${expr.field} of ${prettyprintListExpression(expr.list)})`;

}

const INFIX_OPERATORS = new Set(['+', '-', '/', '*', '%', '**']);
function prettyprintScalarExpression(expr) {
    if (expr.isPrimary)
        return prettyprintValue(expr.value);
    else if (expr.isDerived && INFIX_OPERATORS.has(expr.op))
        return `(${prettyprintScalarExpression(expr.operands[0])} ${expr.op} ${prettyprintScalarExpression(expr.operands[1])})`;
    else if (expr.isDerived)
        return `${expr.op}(${expr.operands.map(prettyprintScalarExpression).join(', ')})`;
    else if (expr.isAggregation)
        return prettyprintAggregationFilter(expr);
    else if (expr.isFilter)
        return `filter(${prettyprintListExpression(expr.list)})`;
    else if (expr.isFlattenedList)
        return `flat(${prettyprintListExpression(expr.list)})`;
    else if (expr.isVarRef)
        return `${prettyprintSelector(expr.selector)}.${expr.name}(${expr.in_params.map(prettyprintInputParam).join(', ')})`;
    else
        throw new TypeError();
}

function prettyprintVarRef(ast) {
    return `${ast.name}(${ast.in_params.map(prettyprintInputParam).join(', ')})`;
}

function prettyprintTable(table) {
    if (table.isVarRef)
        return prettyprintVarRef(table);
    else if (table.isResultRef && table.index.isNumber && table.index.value === -1)
        return `result(@${table.kind}.${table.channel})`;
    else if (table.isResultRef)
        return `result(@${table.kind}.${table.channel}[${prettyprintValue(table.index)}])`;
    else if (table.isInvocation)
        return prettyprintInvocation(table.invocation);
    else if (table.isFilter)
        return `(${prettyprintTable(table.table)}), ${prettyprintFilterExpression(table.filter)}`;
    else if (table.isProjection)
        return `[${table.args.join(', ')}] of (${prettyprintTable(table.table)})`;
    else if (table.isAlias)
        return `(${prettyprintTable(table.table)}) as ${table.name}`;
    else if (table.isCompute)
        return `compute ${prettyprintScalarExpression(table.expression)} ${table.alias !== null ? `as ${table.alias} ` : ''}of (${prettyprintTable(table.table)})`; //` <- GtkSourceView bug
    else if (table.isAggregation && table.operator === 'count' && table.field === '*')
        return `aggregate count ${table.alias !== null ? `as ${table.alias} ` : ''}of (${prettyprintTable(table.table)})`; //` <- GtkSourceView bug
    else if (table.isAggregation)
        return `aggregate ${table.operator} ${table.field} ${table.alias !== null ? `as ${table.alias} ` : ''}of (${prettyprintTable(table.table)})`; //` <- GtkSourceView bug
    else if (table.isSort)
        return `sort ${table.field} ${table.direction} of (${prettyprintTable(table.table)})`;
    else if (table.isIndex)
        return `(${prettyprintTable(table.table)})[${table.indices.map(prettyprintValue).join(', ')}]`;
    else if (table.isSlice)
        return `(${prettyprintTable(table.table)})[${prettyprintValue(table.base)} : ${prettyprintValue(table.limit)}]`;
    else if (table.isJoin && table.in_params.length > 0)
        return `(${prettyprintTable(table.lhs)} join ${prettyprintTable(table.rhs)} on (${table.in_params.map(prettyprintInputParam).join(', ')}))`;
    else if (table.isJoin)
        return `(${prettyprintTable(table.lhs)} join ${prettyprintTable(table.rhs)})`;
    else if (table.isWindow)
        return `window ${prettyprintValue(table.base)}, ${prettyprintValue(table.delta)} of (${prettyprintStream(table.stream)})`;
    else if (table.isTimeSeries)
        return `timeseries ${prettyprintValue(table.base)}, ${prettyprintValue(table.delta)} of (${prettyprintStream(table.stream)})`;
    else if (table.isSequence)
        return `sequence ${prettyprintValue(table.base)}, ${prettyprintValue(table.delta)} of (${prettyprintTable(table.table)})`;
    else if (table.isHistory)
        return `history ${prettyprintValue(table.base)}, ${prettyprintValue(table.delta)} of (${prettyprintTable(table.table)})`;
    else
        throw new TypeError();
}

function prettyprintTimer(stream) {
    if (stream.frequency === null)
        return `timer(base=${prettyprintValue(stream.base)}, interval=${prettyprintValue(stream.interval)})`;
    else
        return `timer(base=${prettyprintValue(stream.base)}, interval=${prettyprintValue(stream.interval)}, frequency=${prettyprintValue(stream.frequency)})`;
}

function prettyprintAtTimer(stream) {
    if (stream.expiration_date === null) {
        if (stream.time.length === 1)
            return `attimer(time=${prettyprintValue(stream.time[0])})`;
        else
            return `attimer(time=[${stream.time.map(prettyprintValue).join(', ')}])`;
    } else {
        if (stream.time.length === 1)
            return `attimer(time=${prettyprintValue(stream.time[0])}, expiration_date=${prettyprintValue(stream.expiration_date)})`;
        else
            return `attimer(time=[${stream.time.map(prettyprintValue).join(', ')}], expiration_date=${prettyprintValue(stream.expiration_date)})`;
    }
}

function prettyprintStream(stream) {
    if (stream.isVarRef)
        return prettyprintVarRef(stream);
    else if (stream.isTimer)
        return prettyprintTimer(stream);
    else if (stream.isAtTimer)
        return prettyprintAtTimer(stream);
    else if (stream.isMonitor)
        return `monitor (${prettyprintTable(stream.table)})` + ((stream.args && stream.args.length) ? ` on new [${stream.args.join(', ')}]` : '');
    else if (stream.isEdgeNew)
        return `edge (${prettyprintStream(stream.stream)}) on new`;
    else if (stream.isEdgeFilter)
        return `edge (${prettyprintStream(stream.stream)}) on ${prettyprintFilterExpression(stream.filter)}`;
    else if (stream.isFilter)
        return `${prettyprintStream(stream.stream)}, ${prettyprintFilterExpression(stream.filter)}`;
    else if (stream.isProjection)
        return `[${stream.args.join(', ')}] of (${prettyprintStream(stream.stream)})`;
    else if (stream.isCompute)
        return `compute ${prettyprintScalarExpression(stream.expression)} ${stream.alias !== null ? `as ${stream.alias} ` : ''}of (${prettyprintStream(stream.stream)})`; //` <- GtkSourceView bug
    else if (stream.isAlias)
        return `(${prettyprintStream(stream.stream)}) as ${stream.name}`;
    else if (stream.isJoin && stream.in_params.length > 0)
        return `(${prettyprintStream(stream.stream)} => ${prettyprintTable(stream.table)} on (${stream.in_params.map(prettyprintInputParam).join(', ')}))`;
    else if (stream.isJoin)
        return `(${prettyprintStream(stream.stream)} => ${prettyprintTable(stream.table)})`;
    else
        throw new TypeError();
}

function prettyprintDeclaration(decl, prefix = '') {
    let args = Object.keys(decl.args);
    let types = args.map((a) => decl.args[a]);

    let arg_decl = args.length > 0 ? `(${args.map((a, i) => a + ' :' + prettyprintType(types[i])).join(', ')})` : '';

    let value;
    switch (decl.type) {
    case 'stream':
        value = prettyprintStream(decl.value);
        break;
    case 'query':
        value = prettyprintTable(decl.value);
        break;
    case 'action':
        value = prettyprintAction(decl.value);
        break;
    case 'program':
    case 'procedure':
        value = prettyprintProgram(decl.value, false, prefix);
        break;
    default:
        throw new TypeError(`Unrecognized declaration type ${decl.type}`);
    }

    let annotations = prettyprintAnnotations(decl, prefix + '  ');
    if (decl.type === 'program' || decl.type === 'procedure')
        annotations = ' ' + annotations.trim();
    return `${prefix}let ${decl.type} ${decl.name}${arg_decl} := ${value}${annotations};\n`;
}

function prettyprintAssignment(ast, prefix = '  ') {
    return `${prefix}let result ${ast.name} := ${prettyprintTable(ast.value)};\n`;
}

function prettyprintImportStmt(ast) {
    if (ast.isClass)
        return `  import class @${ast.kind}${ast.alias ? `as ${ast.alias}` : ''};`; //`
    else if (ast.isMixin)
        return `  import ${ast.facets.join(', ')} from @${ast.module}(${ast.in_params.map(prettyprintInputParam).join(', ')});`;
    else
        throw new TypeError();
}

function prettyprintJson(value) {
    if (Array.isArray(value))
        return '[' + value.map((v) => prettyprintJson(v)).join(', ') + ']';
    if (typeof value === 'object')
        return '{' + Object.entries(value).map(([key, value]) => `${key}=${prettyprintJson(value)}`).join(',') + '}';
    if (typeof value === 'string')
        return stringEscape(value);
    return value.toString();
}

function isValidAnnotation(value) {
    return !(!value || 'value' in value && value.value.length === 0);
}

function prettyprintAnnotations(ast, prefix = '  ', linebreak = true) {
    let annotations = '';
    if (linebreak)
        prefix = '\n' + prefix;
    Object.entries(ast.metadata).forEach(([name, value]) => {
        if (typeof value === 'object' && Object.keys(value).length > 0 || value && value.length > 0)
            annotations += `${prefix}#_[${name}=${prettyprintJson(value)}]`;
    });
    Object.entries(ast.annotations).forEach(([name, value]) => {
        if (Array.isArray(value))
            annotations += `${prefix}#[${name}=[${(value.filter(isValidAnnotation).map((v) => prettyprintValue(v))).join(', ')}]]`;
        else if (isValidAnnotation(value))
            annotations += `${prefix}#[${name}=${prettyprintValue(value)}]`;
    });
    return annotations;
}

function prettyprintClassDef(ast, prefix = '  ') {
    let imports = ast.imports.map((i) => prefix + prettyprintImportStmt(i) + '\n').join('');
    let macros = Object.keys(ast.macros).map((m) => ast.macros[m].toString(prefix + '  ')  + '\n').join('\n');
    let queries = Object.keys(ast.queries).map((q) => ast.queries[q].toString(prefix + '  ') + '\n').join('\n');
    let actions = Object.keys(ast.actions).map((q) => ast.actions[q].toString(prefix + '  ') + '\n').join('\n');
    let annotations = prettyprintAnnotations(ast, prefix);

    let class_members = [];
    [imports, macros, queries, actions].forEach((member) => {
        if (member.length > 0)
            class_members.push(member);
    });

    let _extends = ast.extends ? ast.extends.map((e) => '@' + e).join(', ') : null;
    return `${prefix}${ast.is_abstract ? 'abstract ' : ''}class @${ast.kind}${_extends ? ' extends ' + _extends: ''}${annotations} {\n${class_members.join('\n')}${prefix}}\n`;
}

function prettyprintOnInputChoice(ast, prefix = '') {
    let buffer = prefix + '  ';
    if (ast.table)
        buffer += prettyprintTable(ast.table) + ' => ';
    buffer += prettyprintActionList(ast.actions);
    buffer += prettyprintAnnotations(ast, '   ');
    return buffer + ';\n';
}

function prettyprintProgram(ast, short = true, prefix = '') {
    let buffer = '';
    if (ast.principal !== null) {
        buffer = 'executor = ' + prettyprintValue(ast.principal) + ' : ';
        short = false;
    }

    prefix += short ? '' : '  ';

    if (!short)
        buffer += '{\n';
    for (let _class of ast.classes)
        buffer += prettyprintClassDef(_class, prefix);
    for (let decl of ast.declarations)
        buffer += prettyprintDeclaration(decl, prefix);
    for (let rule of ast.rules) {
        if (rule.isAssignment)
            buffer += prettyprintAssignment(rule, prefix);
        else
            buffer += prettyprintRule(rule, prefix);
    }
    if (ast.oninputs.length > 0) {
        buffer += 'oninput => {\n';
        for (let choice of ast.oninputs)
            buffer += prettyprintOnInputChoice(choice);
        buffer += '};\n';
    }

    if (!short)
        buffer += '}';
    return buffer.trim();
}

function prettyprintExample(ex, prefix = '') {
    let args = Object.keys(ex.args);
    let types = args.map((a) => ex.args[a]);

    let arg_decl = args.length > 0 ? `(${args.map((a, i) => a + ' :' + prettyprintType(types[i])).join(', ')}) ` : '';

    let value;
    switch (ex.type) {
        case 'stream':
            value = prettyprintStream(ex.value);
            break;
        case 'query':
            value = prettyprintTable(ex.value);
            break;
        case 'action':
            value = prettyprintAction(ex.value);
            break;
        case 'program':
            value = prettyprintProgram(ex.value, false);
            break;
        default:
            throw new TypeError();
    }
    let annotations = '';
    if (ex.utterances.length > 0)
        annotations += `\n${prefix}#_[utterances=[${ex.utterances.map(stringEscape).join(',')}]]`;
    if (ex.preprocessed.length > 0)
        annotations += `\n${prefix}#_[preprocessed=[${ex.preprocessed.map(stringEscape).join(',')}]]`;
    if (ex.id >= 0)
        annotations += `\n${prefix}#[id=${ex.id}]`;
    for (let key in ex.annotations)
        annotations += `\n${prefix}#[${key}=${typeof ex.annotations[key] === 'string' ? stringEscape(ex.annotations[key]) : ex.annotations[key]}]`;

    return `${prefix}${ex.type} ${arg_decl}:= ${value}${annotations};\n`;
}

function prettyprintDataset(ast, prefix = '') {
    const examples = ast.examples.map((ex) => prettyprintExample(ex, prefix + '  '));
    return `dataset ${ast.name} language "${ast.language}" {\n${examples.join('\n')}}\n`;
}

function prettyprintMeta(ast) {
    let meta = '';
    for (let klass of ast.classes)
        meta += prettyprintClassDef(klass, '');
    for (let dataset of ast.datasets)
        meta += prettyprintDataset(dataset);
    return meta;
}

function prettyprintBookkeepingIntent(intent) {
    if (intent.isSpecial)
        return intent.type;
    else if (intent.isCommandList)
        return `commands(category=${stringEscape(intent.category)}, device=${prettyprintValue(intent.device)})`;
    else if (intent.isChoice)
        return `choice(${intent.value})`;
    else if (intent.isAnswer)
        return `answer(${prettyprintValue(intent.value)})`;
    else if (intent.isPredicate)
        return `predicate(${prettyprintFilterExpression(intent.predicate)})`;
    else
        throw new TypeError(`Unrecognized bookkeeping intent ${intent}`);
}

function prettyprint(ast, short = true) {
    if (ast.isBookkeeping)
        return `bookkeeping(${prettyprintBookkeepingIntent(ast.intent)});`;

    if (ast.isProgram)
        return prettyprintProgram(ast, short);
    else if (ast.isPermissionRule)
        return prettyprintPermissionRule(ast);
    else if (ast.isMeta)
        return prettyprintMeta(ast);
    else
        throw new Error('Invalid input type');
}

function prettyprintPermissionFunction(fn) {
    if (fn.isStar)
        return '*';
    if (fn.isClassStar)
        return `@${fn.kind}.*`;

    if (fn.filter.isTrue)
        return `@${fn.kind}.${fn.channel}`;
    else
        return `@${fn.kind}.${fn.channel}, ${prettyprintFilterExpression(fn.filter)}`;
}

function prettyprintPermissionRule(allowed) {
    return `${prettyprintFilterExpression(allowed.principal)} : ${allowed.query.isBuiltin ? 'now' : prettyprintPermissionFunction(allowed.query)} => ${allowed.action.isBuiltin ? 'notify' : prettyprintPermissionFunction(allowed.action)};`;
}

module.exports = {
    prettyprint,
    prettyprintValue,
    prettyprintAnnotations,
    prettyprintExample,
    prettyprintScalarExpression,
    prettyprintFilterExpression,
    prettyprintType,
    prettyprintJson,
    prettyprintClassDef,
    prettyprintDataset
};
