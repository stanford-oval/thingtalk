// -*- mode: typescript; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingTalk
//
// Copyright 2017-2020 The Board of Trustees of the Leland Stanford Junior University
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//    http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>

import assert from 'assert';
import { stringEscape } from './utils/escaping';
import * as Ast from './ast';
import Type from './type';
import { UnserializableError } from './utils/errors';

function prettyprintType(ast : Type, prefix='') : string {
    if (ast instanceof Type.Array) {
        return 'Array(' + prettyprintType(ast.elem as Type, prefix) + ')';
    } else if (ast instanceof Type.Compound) {
        const fields = Object.keys(ast.fields)
            .filter((f) => !f.includes('.')) // filter out fields flattened from compound
            .map((f) => `${f}: ${prettyprintType(ast.fields[f].type, prefix + '  ')}${prettyprintAnnotations(ast.fields[f], prefix + '  ', true)}`);
        return `{\n${prefix}  ${fields.join(',\n' + prefix + '  ')}\n${prefix}}`;
    } else {
        return ast.toString();
    }
}

function prettyprintLocation(ast : Ast.Location) {
    if (ast instanceof Ast.AbsoluteLocation && ast.display)
        return 'new Location(' + ast.lat + ', ' + ast.lon + ', ' + stringEscape(ast.display) + ')';
    else if (ast instanceof Ast.AbsoluteLocation)
        return 'new Location(' + ast.lat + ', ' + ast.lon + ')';
    else if (ast instanceof Ast.UnresolvedLocation)
        return `new Location(${stringEscape(ast.name)})`;
    else if (ast instanceof Ast.RelativeLocation)
        return '$context.location.' + ast.relativeTag;
    else
        throw TypeError();
}

function prettyprintTime(ast : Ast.Time) {
    if (ast instanceof Ast.AbsoluteTime)
        return `new Time(${ast.hour}, ${ast.minute})`;
    else if (ast instanceof Ast.RelativeTime)
        return '$context.time.' + ast.relativeTag;
    else
        throw TypeError();
}

function prettyprintDate(value : Date|Ast.DateEdge|Ast.DatePiece|Ast.WeekDayDate|null) {
    if (value === null) {
        return 'new Date()';
    } else if (value instanceof Ast.DateEdge) {
        return `${value.edge}(${value.unit})`;
    } else if (value instanceof Ast.DatePiece) {
        if (value.time === null)
            return `new Date(${value.year || ''}, ${value.month || ''}, ${value.day || ''})`;
        else
            return `new Date(${value.year || ''}, ${value.month || ''}, ${value.day || ''}, ${value.time.hour}, ${value.time.minute}, ${value.time.second})`;
    } else if (value instanceof Ast.WeekDayDate) {
        if (value.time === null)
            return `new Date(${value.weekday})`;
        else
            return `new Date(${value.weekday}, ${value.time.hour}, ${value.time.minute}, ${value.time.second})`;
    } else {
        return `new Date(${stringEscape(value.toISOString())})`;
    }
}

function prettyprintRecurrentTimeRule(value : Ast.RecurrentTimeRule) {
    let buffer = `{ beginTime = ${prettyprintTime(value.beginTime)}, endTime = ${prettyprintTime(value.endTime)},`;
    if (value.interval.value !== 1 || value.interval.unit !== 'day')
        buffer += ` interval = ${value.interval.value}${value.interval.unit},`;
    if (value.frequency !== 1)
        buffer += ` frequency = ${value.frequency},`;
    if (value.dayOfWeek)
        buffer += ` dayOfWeek = enum(${value.dayOfWeek}),`;
    if (value.beginDate)
        buffer += ` beginDate = ${prettyprintDate(value.beginDate)},`;
    if (value.endDate)
        buffer += ` endDate = ${prettyprintDate(value.endDate)},`;
    if (value.subtract)
        buffer += ` subtract = true,`;
    buffer += ` }`;
    return buffer;
}

const INFIX_OPERATORS = new Set(['+', '-', '/', '*', '%', '**']);
function prettyprintInfixComputation(ast : Ast.ComputationValue) {
    let lhs, rhs;
    if (ast.operands[0] instanceof Ast.ComputationValue)
        lhs = `(${prettyprintValue(ast.operands[0])})`;
    else
        lhs = prettyprintValue(ast.operands[0]);
    if (ast.operands[1] instanceof Ast.ComputationValue)
        rhs = `(${prettyprintValue(ast.operands[1])})`;
    else
        rhs = prettyprintValue(ast.operands[1]);
    return `${lhs} ${ast.op} ${rhs}`;
}

function prettyprintValue(ast : Ast.Value) : string {
    if (ast instanceof Ast.VarRefValue)
        return ast.name;
    else if (ast instanceof Ast.UndefinedValue)
        return ast.local ? '$?' : '$undefined.remote';
    else if (ast instanceof Ast.ContextRefValue)
        return `$context.${ast.name} : ${ast.type}`;
    else if (ast instanceof Ast.ComputationValue && INFIX_OPERATORS.has(ast.op))
        return prettyprintInfixComputation(ast);
    else if (ast instanceof Ast.ComputationValue)
        return `${ast.op}(${ast.operands.map(prettyprintValue).join(', ')})`;
    else if (ast instanceof Ast.ArrayFieldValue)
        return `${ast.field} of (${prettyprintValue(ast.value)})`;
    else if (ast instanceof Ast.FilterValue)
        return `(${prettyprintValue(ast.value)}) filter { ${prettyprintFilterExpression(ast.filter)} }`;
    else if (ast instanceof Ast.ArrayValue)
        return `[${ast.value.map(prettyprintValue).join(', ')}]`;
    else if (ast instanceof Ast.BooleanValue)
        return String(ast.value);
    else if (ast instanceof Ast.StringValue)
        return stringEscape(ast.value);
    else if (ast instanceof Ast.EnumValue)
        return `enum(${ast.value})`;
    else if (ast instanceof Ast.MeasureValue)
        return String(ast.value) + ast.unit;
    else if (ast instanceof Ast.NumberValue)
        return String(ast.value);
    else if (ast instanceof Ast.CurrencyValue)
        return `${ast.value}$${ast.code}`;
    else if (ast instanceof Ast.LocationValue)
        return prettyprintLocation(ast.value);
    else if (ast instanceof Ast.DateValue)
        return prettyprintDate(ast.value);
    else if (ast instanceof Ast.TimeValue)
        return prettyprintTime(ast.value);
    else if (ast instanceof Ast.RecurrentTimeSpecificationValue)
        return `new RecurrentTimeSpecification(${ast.rules.map(prettyprintRecurrentTimeRule).join(', ')})`;
    else if (ast instanceof Ast.EntityValue)
        return (ast.value !== null ? stringEscape(ast.value) : 'null') + '^^' + ast.type + (ast.display ? '(' + stringEscape(ast.display) + ')' : '');
    else if (ast instanceof Ast.EventValue)
        return '$event' + (ast.name ? '.' + ast.name : '');
    else if (ast instanceof Ast.ArgMapValue)
        return `new ArgMap(${Object.entries(ast.value).map(([key, value]) => `${key}:${value.toString()}`).join(',')})`; //`
    else if (ast instanceof Ast.ObjectValue)
        return '{' + Object.entries(ast.value).map(([key, value]) => key+'='+prettyprintValue(value)).join(',') + '}';
    else
        throw new TypeError('Invalid value type ' + ast); // the other Value forms don't have literals
}

function prettyprintSelector(ast : Ast.DeviceSelector) {
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

function prettyprintInputParam(ast : Ast.InputParam) {
    return ast.name + '=' + prettyprintValue(ast.value);
}

const INFIX_FILTERS = new Set(['>=', '<=', '>', '<', '=~', '~=', '==']);

function prettyprintExternalFilter(ast : Ast.ExternalBooleanExpression) {
    return `${prettyprintSelector(ast.selector)}.${ast.channel}(${ast.in_params.map(prettyprintInputParam).join(', ')}) { ${prettyprintFilterExpression(ast.filter)} }`;
}

function prettyprintFilterExpression(ast : Ast.BooleanExpression) : string {
    if (ast.isTrue)
        return 'true';
    if (ast.isFalse)
        return 'false';
    if (ast instanceof Ast.DontCareBooleanExpression)
        return `true(${ast.name})`;
    if (ast instanceof Ast.NotBooleanExpression)
        return `!(${prettyprintFilterExpression(ast.expr)})`;
    if (ast instanceof Ast.AndBooleanExpression)
        return `(${ast.operands.map(prettyprintFilterExpression).join(' && ')})`;
    if (ast instanceof Ast.OrBooleanExpression)
        return `(${ast.operands.map(prettyprintFilterExpression).join(' || ')})`;
    if (ast instanceof Ast.ExternalBooleanExpression)
        return prettyprintExternalFilter(ast);
    if (ast instanceof Ast.ComputeBooleanExpression)
        return `${prettyprintValue(ast.lhs)} ${ast.operator} ${prettyprintValue(ast.rhs)}`;
    if (ast instanceof Ast.ComparisonSubqueryBooleanExpression || ast instanceof Ast.ExistentialSubqueryBooleanExpression)
        return prettyprintExternalFilter(ast.toLegacy());
    assert(ast instanceof Ast.AtomBooleanExpression);

    if (INFIX_FILTERS.has(ast.operator))
        return `${ast.name} ${ast.operator} ${prettyprintValue(ast.value)}`;

    return `${ast.operator}(${ast.name}, ${prettyprintValue(ast.value)})`;
}

function prettyprintInvocation(ast : Ast.Invocation) {
    if (!ast.selector)
        throw new Error('Invalid invocation ' + ast);
    const in_params = ast.in_params.filter((ip) => {
        const arg = ast.schema!.getArgument(ip.name);
        if (arg && arg.required && ip.value instanceof Ast.UndefinedValue)
            return false;
        return true;
    });
    return `${prettyprintSelector(ast.selector)}.${ast.channel}(${in_params.map(prettyprintInputParam).join(', ')})`;
}

function prettyprintAction(action : Ast.Action) {
    if (action instanceof Ast.VarRefAction)
        return prettyprintVarRef(action);
    else if (action instanceof Ast.InvocationAction)
        return prettyprintInvocation(action.invocation);
    else if (action instanceof Ast.NotifyAction)
        return action.name;
    else
        throw new TypeError();
}

function prettyprintActionList(actions : Ast.Action[]) {
    if (actions.length === 1)
        return prettyprintAction(actions[0]);
    else
        return `{\n${actions.map((a) => '    ' + prettyprintAction(a) + ';\n').join('')} }`;
}

function prettyprintStatement(ast : Ast.Rule|Ast.Command, prefix = '  ', suffix = ';\n') {
    if (ast instanceof Ast.Rule)
        return `${prefix}${prettyprintStream(ast.stream)} => ${prettyprintActionList(ast.actions)}${suffix}`;
    else if (ast.table === null)
        return `${prefix}now => ${prettyprintActionList(ast.actions)}${suffix}`;
    else
        return `${prefix}now => ${prettyprintTable(ast.table)} => ${prettyprintActionList(ast.actions)}${suffix}`;
}

function prettyprintVarRef(ast : Ast.VarRefTable|Ast.VarRefStream|Ast.VarRefAction) {
    return `${ast.name}(${ast.in_params.map(prettyprintInputParam).join(', ')})`;
}

function prettyprintTable(table : Ast.Table) : string {
    if (table instanceof Ast.VarRefTable)
        return prettyprintVarRef(table);
    else if (table instanceof Ast.InvocationTable)
        return prettyprintInvocation(table.invocation);
    else if (table instanceof Ast.FilteredTable)
        return `(${prettyprintTable(table.table)}), ${prettyprintFilterExpression(table.filter)}`;
    else if (table instanceof Ast.ProjectionTable)
        return `[${table.args.join(', ')}] of (${prettyprintTable(table.table)})`;
    else if (table instanceof Ast.AliasTable)
        return `(${prettyprintTable(table.table)}) as ${table.name}`;
    else if (table instanceof Ast.ComputeTable)
        return `compute (${prettyprintValue(table.expression)}) ${table.alias !== null ? `as ${table.alias} ` : ''}of (${prettyprintTable(table.table)})`; //` <- GtkSourceView bug
    else if (table instanceof Ast.AggregationTable && table.operator === 'count' && table.field === '*')
        return `aggregate count ${table.alias !== null ? `as ${table.alias} ` : ''}of (${prettyprintTable(table.table)})`; //` <- GtkSourceView bug
    else if (table instanceof Ast.AggregationTable)
        return `aggregate ${table.operator} ${table.field} ${table.alias !== null ? `as ${table.alias} ` : ''}of (${prettyprintTable(table.table)})`; //` <- GtkSourceView bug
    else if (table instanceof Ast.SortedTable)
        return `sort ${table.field} ${table.direction} of (${prettyprintTable(table.table)})`;
    else if (table instanceof Ast.IndexTable)
        return `(${prettyprintTable(table.table)})[${table.indices.map(prettyprintValue).join(', ')}]`;
    else if (table instanceof Ast.SlicedTable)
        return `(${prettyprintTable(table.table)})[${prettyprintValue(table.base)} : ${prettyprintValue(table.limit)}]`;
    else if (table instanceof Ast.JoinTable && table.in_params.length > 0)
        return `(${prettyprintTable(table.lhs)} join ${prettyprintTable(table.rhs)} on (${table.in_params.map(prettyprintInputParam).join(', ')}))`;
    else if (table instanceof Ast.JoinTable)
        return `(${prettyprintTable(table.lhs)} join ${prettyprintTable(table.rhs)})`;
    else
        throw new TypeError();
}

function prettyprintTimer(stream : Ast.TimerStream) {
    if (stream.frequency === null)
        return `timer(base=${prettyprintValue(stream.base)}, interval=${prettyprintValue(stream.interval)})`;
    else
        return `timer(base=${prettyprintValue(stream.base)}, interval=${prettyprintValue(stream.interval)}, frequency=${prettyprintValue(stream.frequency)})`;
}

function prettyprintAtTimer(stream : Ast.AtTimerStream) {
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

function prettyprintStream(stream : Ast.Stream) : string {
    if (stream instanceof Ast.VarRefStream)
        return prettyprintVarRef(stream);
    else if (stream instanceof Ast.TimerStream)
        return prettyprintTimer(stream);
    else if (stream instanceof Ast.AtTimerStream)
        return prettyprintAtTimer(stream);
    else if (stream instanceof Ast.MonitorStream)
        return `monitor (${prettyprintTable(stream.table)})` + ((stream.args && stream.args.length) ? ` on new [${stream.args.join(', ')}]` : '');
    else if (stream instanceof Ast.EdgeNewStream)
        return `edge (${prettyprintStream(stream.stream)}) on new`;
    else if (stream instanceof Ast.EdgeFilterStream)
        return `edge (${prettyprintStream(stream.stream)}) on ${prettyprintFilterExpression(stream.filter)}`;
    else if (stream instanceof Ast.FilteredStream)
        return `${prettyprintStream(stream.stream)}, ${prettyprintFilterExpression(stream.filter)}`;
    else if (stream instanceof Ast.ProjectionStream)
        return `[${stream.args.join(', ')}] of (${prettyprintStream(stream.stream)})`;
    else if (stream instanceof Ast.ComputeStream)
        return `compute (${prettyprintValue(stream.expression)}) ${stream.alias !== null ? `as ${stream.alias} ` : ''}of (${prettyprintStream(stream.stream)})`; //` <- GtkSourceView bug
    else if (stream instanceof Ast.AliasStream)
        return `(${prettyprintStream(stream.stream)}) as ${stream.name}`;
    else if (stream instanceof Ast.JoinStream && stream.in_params.length > 0)
        return `(${prettyprintStream(stream.stream)} => ${prettyprintTable(stream.table)} on (${stream.in_params.map(prettyprintInputParam).join(', ')}))`;
    else if (stream instanceof Ast.JoinStream)
        return `(${prettyprintStream(stream.stream)} => ${prettyprintTable(stream.table)})`;
    else
        throw new TypeError();
}

function prettyprintDeclaration(decl : Ast.FunctionDeclaration, prefix = '', extra_scope_args : string[] = []) {
    const args = Object.keys(decl.args);
    const scope_args = extra_scope_args.concat(args);
    const types = args.map((a) => decl.args[a]);

    const arg_decl = args.length > 0 ? `(${args.map((a, i) => a + ' :' + prettyprintType(types[i])).join(', ')})` : '';

    const annotations = ' ' + prettyprintAnnotations(decl, prefix + '  ').trim();
    const innerprefix = prefix + '  ';
    let buffer = '{\n';
    for (const innerdecl of decl.declarations)
        buffer += prettyprintDeclaration(innerdecl, innerprefix, scope_args);
    for (const rule of decl.statements) {
        if (rule instanceof Ast.Assignment)
            buffer += prettyprintAssignment(rule, innerprefix);
        else if (rule instanceof Ast.ReturnStatement)
            throw new UnserializableError(`return statement`);
        else
            buffer += prettyprintStatement(rule.toLegacy(scope_args), innerprefix);
    }
    buffer += '}';

    return `${prefix}let procedure ${decl.name}${arg_decl} := ${buffer}${annotations};\n`;
}

function prettyprintAssignment(ast : Ast.Assignment, prefix = '  ') {
    const legacy = ast.value.toLegacy();
    if (legacy instanceof Ast.Table)
        return `${prefix}let result ${ast.name} := ${prettyprintTable(legacy)};\n`;
    else
        return `${prefix}let result ${ast.name} := ${prettyprintAction(legacy as Ast.Action)};\n`;
}

function prettyprintImportStmt(ast : Ast.MixinImportStmt) {
    return `  import ${ast.facets.join(', ')} from @${ast.module}(${ast.in_params.map(prettyprintInputParam).join(', ')});`;
}

function prettyprintJson(value : unknown, prefix='', linebreak=false) : string {
    if (Array.isArray(value))
        return '[' + value.map((v) => prettyprintJson(v, prefix)).join(', ') + ']';
    if (typeof value === 'object') {
        if (value === null)
            return 'null';
        let start, end, linebreakPrefix;
        if (linebreak) {
            start = `{\n${prefix}  `;
            end = `\n${prefix}}`;
            linebreakPrefix = `\n${prefix}  `;
        } else {
            start = '{';
            end = '}';
            linebreakPrefix = ' ';
        }
        return start + Object.entries(value).map(([key, value]) =>
            `${key}=${prettyprintJson(value, prefix)}`
        ).join(`,${linebreakPrefix}`) + end;
    }
    if (typeof value === 'string')
        return stringEscape(value);
    return String(value);
}

interface NodeWithAnnotations extends Ast.Node {
    nl_annotations : Ast.NLAnnotationMap;
    impl_annotations : Ast.AnnotationMap;
}

function prettyprintAnnotations(ast : NodeWithAnnotations, prefix = '  ', linebreak = true) {
    let annotations = '';
    const linebreakPrefix = linebreak ? '\n' + prefix : prefix;
    Object.entries(ast.nl_annotations).forEach(([name, value]) => {
        if (typeof value === 'object' && Object.keys(value).length > 0 || value && value.length > 0)
            annotations += `${linebreakPrefix}#_[${name}=${prettyprintJson(value, prefix, true)}]`;
    });
    Object.entries(ast.impl_annotations).forEach(([name, value]) => {
        if (Array.isArray(value))
            annotations += `${linebreakPrefix}#[${name}=[${(value.map((v) => prettyprintValue(v))).join(', ')}]]`;
        else
            annotations += `${linebreakPrefix}#[${name}=${prettyprintValue(value)}]`;
    });
    return annotations;
}

function prettyprintEntityDef(ast : Ast.EntityDef, prefix = '  ') {
    return `${prefix}entity ${ast.name}${prettyprintAnnotations(ast, prefix + '  ')};`; //`
}

function fixNewFunctionDef(code : string) : string {
    // HACK: do some "light touches" to the new function def syntax so Thingpedia
    // devices mostly load on legacy clients
    return code.replace(/\$location/g, '$context.location')
        .replace(/\$time/g, '$context.time');
}

function prettyprintClassDef(ast : Ast.ClassDef, prefix = '  ') {
    const imports = ast.imports.map((i) => prefix + prettyprintImportStmt(i) + '\n').join('');
    const entities = ast.entities.map((i) => prefix + prettyprintEntityDef(i) + '\n').join('');
    const queries = Object.keys(ast.queries).map((q) => fixNewFunctionDef(ast.queries[q].toString()) + '\n').join('\n');
    const actions = Object.keys(ast.actions).map((q) => fixNewFunctionDef(ast.actions[q].toString()) + '\n').join('\n');
    const annotations = prettyprintAnnotations(ast, prefix);

    const class_members : string[] = [];
    [imports, entities, queries, actions].forEach((member) => {
        if (member.length > 0)
            class_members.push(member);
    });

    const _extends = ast.extends ? ast.extends.map((e) => '@' + e).join(', ') : null;
    return `${prefix}${ast.is_abstract ? 'abstract ' : ''}class @${ast.kind}${_extends ? ' extends ' + _extends: ''}${annotations} {\n${class_members.join('\n')}${prefix}}\n`;
}

function prettyprintProgram(ast : Ast.Program, short = true, prefix = '') {
    let buffer = '';
    if (ast.principal !== null) {
        buffer = 'executor = ' + prettyprintValue(ast.principal) + ' : ';
        short = false;
    }

    prefix += short ? '' : '  ';

    if (!short)
        buffer += '{\n';
    for (const _class of ast.classes)
        buffer += prettyprintClassDef(_class, prefix);
    for (const decl of ast.declarations)
        buffer += prettyprintDeclaration(decl, prefix);

    for (const rule of ast.statements) {
        if (rule instanceof Ast.Assignment)
            buffer += prettyprintAssignment(rule, prefix);
        else
            buffer += prettyprintStatement(rule.toLegacy(), prefix);
    }

    if (!short)
        buffer += '}';
    return buffer.trim();
}

function prettyprintExample(ex : Ast.Example, prefix = '') {
    const args = Object.keys(ex.args);
    const types = args.map((a) => ex.args[a]);

    const arg_decl = args.length > 0 ? `(${args.map((a, i) => a + ' :' + prettyprintType(types[i])).join(', ')}) ` : '';

    let value;
    switch (ex.type) {
    case 'stream':
        value = prettyprintStream(ex.value.toLegacy([], args) as Ast.Stream);
        break;
    case 'query':
        value = prettyprintTable(ex.value.toLegacy([], args) as Ast.Table);
        break;
    case 'action':
        value = prettyprintAction(ex.value.toLegacy([], args) as Ast.Action);
        break;
    case 'program':
        value = `{ ${prettyprintStatement(new Ast.ExpressionStatement(null, ex.value).toLegacy(args))} }`;
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
    for (const key in ex.annotations)
        annotations += `\n${prefix}#[${key}=${prettyprintValue(ex.annotations[key])}]`;

    return `${prefix}${ex.type} ${arg_decl}:= ${value}${annotations};\n`;
}

function prettyprintDataset(ast : Ast.Dataset, prefix = '') {
    const examples = ast.examples.map((ex) => prettyprintExample(ex, prefix + '  '));
    const language = ast.language ? `language "${ast.language}"` : '';
    return `dataset @${ast.name} ${language} {\n${examples.join('\n')}}\n`;
}

function prettyprintMeta(ast : Ast.Library) {
    let meta = '';
    for (const klass of ast.classes)
        meta += prettyprintClassDef(klass, '');
    for (const dataset of ast.datasets)
        meta += prettyprintDataset(dataset);
    return meta;
}

function prettyprintBookkeepingIntent(intent : Ast.ControlIntent) {
    if (intent instanceof Ast.SpecialControlIntent)
        return intent.type;
    else if (intent instanceof Ast.ChoiceControlIntent)
        return `choice(${intent.value})`;
    else if (intent instanceof Ast.AnswerControlIntent)
        return `answer(${prettyprintValue(intent.value)})`;
    else
        throw new TypeError(`Unrecognized bookkeeping intent ${intent}`);
}

function prettyprintHistoryResult(ast : Ast.DialogueHistoryResultItem, last : boolean, prefix = '') {
    const entries = Object.entries(ast.value);
    const innerString = entries.map(([key, value], idx) => `${key}=${prettyprintValue(value)}`).join(', ');

    return `${prefix}{ ${innerString} }${last ? '' : ','}\n`;
}

function prettyprintHistoryResultList(ast : Ast.DialogueHistoryResultList, prefix = '') {
    let buffer = prefix + '#[results=[\n';
    for (let i = 0; i < ast.results.length; i++) {
        const result = ast.results[i];
        buffer += prettyprintHistoryResult(result, i === ast.results.length-1, prefix + '  ');
    }
    buffer += prefix + ']]';
    if (!(ast.count instanceof Ast.NumberValue) || ast.count.value > ast.results.length)
        buffer += `\n${prefix}#[count=${prettyprintValue(ast.count)}]`;
    if (ast.more)
        buffer += `\n${prefix}#[more=true]`;
    if (ast.error)
        buffer += `\n${prefix}#[error=${prettyprintValue(ast.error)}]`;
    return buffer;
}

function prettyprintHistoryItem(ast : Ast.DialogueHistoryItem, prefix = '') {
    let buffer = prettyprintStatement(ast.stmt.toLegacy(), prefix, (ast.confirm !== 'accepted' || ast.results !== null) ? '\n' : ';\n');
    if (ast.results !== null)
        buffer += prettyprintHistoryResultList(ast.results, prefix) + ';\n';
    else if (ast.confirm !== 'accepted')
        buffer += prefix + `#[confirm=enum(${ast.confirm})];\n`;
    return buffer;
}

function prettyprintDialogueState(ast : Ast.DialogueState) {
    let buffer;
    if (ast.dialogueActParam)
        buffer = `$dialogue @${ast.policy}.${ast.dialogueAct}(${ast.dialogueActParam.join(', ')});\n`;
    else
        buffer = `$dialogue @${ast.policy}.${ast.dialogueAct};\n`;
    for (const item of ast.history)
        buffer += prettyprintHistoryItem(item, '');

    return buffer.trim();
}

function prettyprintPermissionFunction(fn : Ast.PermissionFunction) {
    if (fn === Ast.PermissionFunction.Star)
        return '*';
    if (fn instanceof Ast.PermissionFunction.ClassStar)
        return `@${fn.kind}.*`;

    assert(fn instanceof Ast.PermissionFunction.Specified);

    if (fn.filter.isTrue)
        return `@${fn.kind}.${fn.channel}`;
    else
        return `@${fn.kind}.${fn.channel}, ${prettyprintFilterExpression(fn.filter)}`;
}

function prettyprintPermissionRule(allowed : Ast.PermissionRule) {
    return `${prettyprintFilterExpression(allowed.principal)} : ${allowed.query.isBuiltin ? 'now' : prettyprintPermissionFunction(allowed.query)} => ${allowed.action.isBuiltin ? 'notify' : prettyprintPermissionFunction(allowed.action)};`;
}

export function prettyprint(ast : Ast.Input, short = true) {
    if (ast instanceof Ast.ControlCommand)
        return `bookkeeping(${prettyprintBookkeepingIntent(ast.intent)});`;

    if (ast instanceof Ast.Program)
        return prettyprintProgram(ast, short);
    else if (ast instanceof Ast.PermissionRule)
        return prettyprintPermissionRule(ast);
    else if (ast instanceof Ast.Library)
        return prettyprintMeta(ast);
    else if (ast instanceof Ast.DialogueState)
        return prettyprintDialogueState(ast);
    else
        throw new Error('Invalid input type');
}
