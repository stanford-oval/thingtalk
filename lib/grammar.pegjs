// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingTalk
//
// Copyright 2015-2018 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details

{
    var Ast = require('./ast');
    var Type = require('./type');
    var Units = require('./units');
    var { optimizeFilter, optimizeProgram } = require('./optimize');

    function take(array, idx) {
        return array.map(function(v) { return v[idx]; });
    }
}

input = program / permission_rule / meta

meta = _ classes:(class_def _)* datasets:(dataset _)* {
    return Ast.Input.Meta(take(classes, 0), take(datasets, 0));
}

program_principal = 'executor' _ '=' _ value:('self' / var_ref_value / entity_value / string_value) _ ':' {
    if (value === 'self')
        return null;
    else if (value.isString) // for compat and ease of use, a raw string is a contact name
        return Ast.Value.Entity(value.value, 'tt:username', null);
    else
        return value;
}

program = _ principal:program_principal? _ '{' _ classes:(class_def _)* _ declarations:(declaration _)* rules:(rule _)* '}' _ {
    return optimizeProgram(new Ast.Program(take(classes, 0), take(declarations, 0), take(rules, 0), principal));
} / _ principal:program_principal? _ rule:(declaration / rule) _ {
  if (rule.isDeclaration)
    return optimizeProgram(new Ast.Program([], [rule], [], principal));
  else
    return optimizeProgram(new Ast.Program([], [], [rule], principal));
}

permission_function = kind:class_name _ '.' _ '*' {
    return new Ast.PermissionFunction.ClassStar(kind);
} / fn:short_function_name _ filter:(',' _ or_expr _)? {
    let [selector, channel] = fn;
    let kind = selector.kind;
    if (filter === null)
        filter = Ast.BooleanExpression.True;
    else
        filter = filter[2];
    return new Ast.PermissionFunction.Specified(kind, channel, optimizeFilter(filter), null);
} / '*' { return Ast.PermissionFunction.Star }

permission_rule = _ principal:or_expr _ ':' _ first:(permission_function / 'now') _ '=>' _ second:(permission_function / 'notify') _  ';'? {
    if (first === 'now')
        first = Ast.PermissionFunction.Builtin;
    if (second === 'notify')
        second = Ast.PermissionFunction.Builtin;
    if (first === Ast.PermissionFunction.Builtin && second === Ast.PermissionFunction.Builtin)
        throw new Error('Permission function specifies no access');
    return new Ast.PermissionRule(optimizeFilter(principal), first, second);
}


// Class declarations
full_class_name = '@' first_name:classident _ rest_names:('.' _ classident _ !(_ ('(' / ',' / ')' / '=>')))* {
    return first_name + (rest_names.length > 0 ? ('.' + take(rest_names, 2).join('.')) : '');
}

class_name = '@' first_name:classident _ rest_names:('.' _ classident _)* {
    return first_name + (rest_names.length > 0 ? ('.' + take(rest_names, 2).join('.')) : '');
}

class_def = 'class' _ name:class_name _ extends_:('extends' __ full_class_name)? '{' _ members:class_member* _ '}' {
    const queries = {};
    const actions = {};
    const imports = [];

    for (var ast of members) {
        if (ast instanceof Ast.FunctionDef) {
          switch (ast.functionType) {
          case 'query':
              queries[ast.name] = ast;
              break;
          case 'action':
              actions[ast.name] = ast;
              break;
          }
        } else if (ast instanceof Ast.ImportStmt) {
          imports.push(ast);
        }
    }
    return new Ast.ClassDef(name, extends_ !== null ? extends_[2] : null, queries, actions, imports);
}

query_modifiers = 'monitorable' __ 'list' !identchar {
  return [true, true];
} / 'list' __ 'monitorable' !identchar {
  return [true, true];
} / 'list' !identchar {
  return [false, true];
} / 'monitorable' !identchar {
  return [true, false];
}

class_member = v:(function_def / import_class_stmt / import_mixin_stmt) _ { return v; }

import_class_stmt = 'import' __ 'class' __ name:class_name _ alias:('as' __ ident)? _ ';' {
  return new Ast.ImportStmt.Class(name, alias !== null ? alias[2] : null);
}
import_mixin_stmt = 'import' __ first:ident _ rest:(',' _ ident _)* 'from' __ name:class_name _ in_params:input_param_list _ ';' {
  return new Ast.ImportStmt.Mixin([first].concat(take(rest, 2)), name, in_params);
}

function_def = modifiers:query_modifiers? _ type:('query' / 'action') __ name:ident _ args:function_param_decl_list _ annotations: ( _ annotation _)* ';' _ {
    let [is_monitorable, is_list] = modifiers || [false, false];
    let [nl_annotations, impl_annotations] = [{}, {}];
    if (annotations) {
        take(annotations, 1).forEach((a) => {
            if (a.type === 'nl')
                nl_annotations[a.name] = a.value;
            if (a.type === 'impl')
                impl_annotations[a.name] = a.value
        });
    }
    return new Ast.FunctionDef(type, name, args, is_list, is_monitorable, nl_annotations, impl_annotations);
}
function_param_decl_list = '(' _ ')' { return []; } /
    '(' _ first:function_param_decl _ rest:(',' _ function_param_decl _)* ')' {
    return [first].concat(take(rest, 2));
}
function_param_decl = direction:param_direction __ name:ident _ ':' _ type:type_ref annotations:( _ annotation _)* {
    let [nl_annotations, impl_annotations] = [{}, {}];
    if (annotations) {
        take(annotations, 1).forEach((a) => {
            if (a.type === 'nl')
                nl_annotations[a.name] = a.value;
            if (a.type === 'impl')
                impl_annotations[a.name] = a.value
        });
    }
    return new Ast.ArgumentDef(direction, name, type, nl_annotations, impl_annotations);
}
param_direction = 'in' __ 'req' { return 'in req'; } / 'in' __ 'opt' { return 'in opt'; } /
    'out' { return 'out'; }


// Dataset & Thingpedia Definition
dataset_name = ident / name:class_name { return '@' + name; }

dataset = _ 'dataset' _ name:dataset_name _ lan:('language' _ literal_string _)? '{' _ examples:(_ example _)* _ '}' {
    return new Ast.Dataset(name, lan? lan[2] : 'en' , take(examples, 1));
}
example = 'stream'  _ params:(lambda_param_decl_list)? _ ':=' _ stream:stream _ annotation:nl_annotation _ ';' {
    if (annotation.name !== 'utterances') throw new Error('Only "utterances" annotation is allowed for examples');
    return new Ast.Example('stream', params ? params : [], stream, annotation.value.value);
} / 'query'  _ params:(lambda_param_decl_list)? _ ':=' _ query:table _ annotation:nl_annotation _ ';' {
    if (annotation.name !== 'utterances') throw new Error('Only "utterances" annotation is allowed for examples');
    return new Ast.Example('query', params ? params : [], query, annotation.value.value);
} / 'action'  _ params:(lambda_param_decl_list)? _ ':=' _ action:action _ annotation:nl_annotation _ ';' {
    if (annotation.name !== 'utterances') throw new Error('Only "utterances" annotation is allowed for examples');
    return new Ast.Example('action', params ? params : [], action, annotation.value.value);
} / 'program'  _ params:(lambda_param_decl_list)? _ ':=' _ program:program _ annotation:nl_annotation _ ';' {
    if (annotation.name !== 'utterances') throw new Error('Only "utterances" annotation is allowed for examples');
    return new Ast.Example('program', params ? params : [], program, annotation.value.value);
}

// Function Calls

device_selector = type:class_name _ '(' _ values:device_attribute_list _ ')' {
    var id;
    if (values.id !== undefined)
        id = values.id;
    else
        id = null;
    if (id !== null)
        id = id.toJS();
    return new Ast.Selector.Device(type, id, null);
}
device_attribute_list = first:device_attribute _ rest:(',' _ device_attribute _)* {
    var obj = {};
    obj[first[0]] = first[1];
    for (var [name, value] of rest) {
        if (obj[name] !== undefined) return error('Duplicate device attribute ' + name);
        obj[name] = value;
    }
    return obj;
}
device_attribute = device_id
device_id = 'id' _ '=' _ value:string_value {
    return ['id', value];
}

short_function_name = '@' first_name:classident _ rest_names:('.' _ classident _)+ {
    let channel = rest_names[rest_names.length-1];
    rest_names.pop();

    let kind = first_name + (rest_names.length > 0 ? ('.' + take(rest_names, 2).join('.')) : '');
    return [Ast.Selector.Device(kind, null, null), channel[2]];
}
full_function_name = sel:device_selector _ '.' _ name:ident {
    return [sel, name];
}

input_param = name:ident _ '=' _ value:value {
    return new Ast.InputParam(name, value);
}
input_param_list = '(' _ ')' { return [] } / '(' _ first:input_param _ rest:(',' _ input_param _)* ')' {
    return [first].concat(take(rest, 2));
}

thingpedia_function_name = full_function_name / short_function_name
thingpedia_function_call = fn:thingpedia_function_name _ in_params:input_param_list {
    let [selector, function_name] = fn;
    return new Ast.Invocation(selector, function_name, in_params, null);
}

// Tables and Streams

table_ref = name:ident _ in_params:input_param_list? {
  return new Ast.Table.VarRef(name, in_params || [], null);
}
primary_table =
  call:thingpedia_function_call { return new Ast.Table.Invocation(call, null); }
  / '(' _ table:table _ ')' { return table; }
  / table_projection / window_expression / history_expression
  / argmin_max_expression / aggregate_expression / computed_table / table_ref

table_projection = '[' _ first:ident _ rest:(',' _ ident _)* _ ']' _ 'of' __ table:alias_table {
  return new Ast.Table.Projection(table, [first].concat(take(rest, 2)), null);
}
computed_table = 'compute' __ expr:primary_scalar_expression _ alias:('as' __ ident)? _ 'of' __ table:alias_table
{
    return new Ast.Table.Compute(table, expr, alias !== null ? alias[2] : null, null);
}

window_expression = what:('window' / 'timeseries') __ base:value _ ',' _ delta:value _ 'of' __ stream:alias_stream {
  if (what === 'window')
    return new Ast.Table.Window(base, delta, stream, null);
  else
    return new Ast.Table.TimeSeries(base, delta, stream, null);
}
history_expression = what:('sequence' / 'history') __ base:value _ ',' _ delta:value _ 'of' __ table:alias_table {
  if (what === 'sequence')
    return new Ast.Table.Sequence(base, delta, table, null);
  else
    return new Ast.Table.History(base, delta, table, null);
}

argmin_max_expression = 'aggregate' __ op:('argmin' / 'argmax') _ base:value _ ',' _ limit:value _ field:ident _ 'of' __ table:alias_table {
  return new Ast.Table.ArgMinMax(table, field, op, base, limit, null);
}

aggregate_expression = 'aggregate' __ 'count' __ alias:('as' _ ident _)? 'of' __ table:alias_table {
  return new Ast.Table.Aggregation(table, '*', 'count', alias !== null ? alias[2] : null, null);
} / 'aggregate' __ op:ident __ field:ident _ alias:('as' _ ident _)? 'of' __ table:alias_table {
  return new Ast.Table.Aggregation(table, field, op, alias !== null ? alias[2] : null, null);
}
alias_table = table:primary_table _ alias:('as' __ ident)? {
  if (alias !== null)
    return new Ast.Table.Alias(table, alias[2], null);
  else
    return table;
}

filtered_table = table:alias_table filter:(_ ',' _ or_expr)? {
  if (filter !== null)
    return new Ast.Table.Filter(table, optimizeFilter(filter[3]), null);
  else
    return table;
}

table = first:filtered_table _ rest:('join' __ filtered_table _ ('on' _ input_param_list _ )?)* {
  return rest.reduce(((x, y) =>
      new Ast.Table.Join(x, y[2], y[4] ? y[4][2]:[], null)), first);
}

stream_ref = name:ident _ in_params:input_param_list? {
  return new Ast.Stream.VarRef(name, in_params || [], null);
}
primary_stream = timer / attimer / '(' _ stream:stream _ ')' { return stream; } / edge_trigger / monitor_stream / stream_projection / computed_stream / stream_ref

timer = 'timer' _ '(' _ 'base' _ '=' _ base:(undefined_value / date_value) _ ',' _ 'interval' _ '=' _ interval:(undefined_value / compound_measure_value) _ ')' {
  return new Ast.Stream.Timer(base, interval, null);
}
attimer = 'attimer' _ '(' _ 'time' _ '=' _ time:(undefined_value / time_value) _ ')' {
  return new Ast.Stream.AtTimer(time, null);
}
edge_trigger = 'edge' __ stream:alias_stream _ 'on' __ edge:('new' !identchar / or_expr) {
  if (edge instanceof Ast.BooleanExpression)
    return new Ast.Stream.EdgeFilter(stream, edge, null);
  else
    return new Ast.Stream.EdgeNew(stream, null);
}

out_param_list = '[' _ first:ident _ rest:(',' _ ident _)* _ ']' {
  return [first].concat(take(rest, 2));
}

monitor_stream = 'monitor' __ table:alias_table _ params:('on' __ 'new' _ out_param_list)? {
  return new Ast.Stream.Monitor(table, params !== null ? params[4] : null, null);
}

stream_projection = params:out_param_list _ 'of' __ stream:alias_stream {
  return new Ast.Stream.Projection(stream, params, null);
}
computed_stream = 'compute' __ expr:primary_scalar_expression _ alias:('as' __ ident)? _ 'of' __ stream:alias_stream
{
    return new Ast.Stream.Compute(stream, expr, alias !== null ? alias[2] : null, null);
}

alias_stream = stream:primary_stream _ alias:('as' __ ident)? {
  if (alias !== null)
    return new Ast.Stream.Alias(stream, alias[2], null);
  else
    return stream;
}

filtered_stream = stream:alias_stream filter:(_ ',' _ or_expr)? {
  if (filter !== null)
    return new Ast.Stream.Filter(stream, optimizeFilter(filter[3]), null);
  else
    return stream;
}

stream = first:filtered_stream _ rest:('join' __ filtered_table _ ('on' _ input_param_list _ )?)* {
  return rest.reduce(((x, y) => new Ast.Stream.Join(x, y[2], y[4] ? y[4][2] : [], null)), first);
}

// Statements

lambda_param_decl_list = '(' _ ')' { return []; } /
    '(' _ first:lambda_param_decl _ rest:(',' _ lambda_param_decl _)* ')' {
    let ret = {};
    for (let [name, type] of [first, ...take(rest, 2)]) {
      ret[name] = type;
    }
    return ret;
}
lambda_param_decl = name:ident _ ':' _ type:type_ref {
    return [name, type];
}

declaration = 'let' __ 'stream' __ name:ident _ ':=' _ lambda:('\\' _ lambda_param_decl_list _ '->' _)? stream:stream _ ';' {
  return new Ast.Statement.Declaration(name, 'stream', lambda !== null ? lambda[2] : {}, stream);
} / 'let' __ ('table'/'query') __ name:ident _ ':=' _ lambda:('\\' _ lambda_param_decl_list _ '->' _)?  table:table _ ';' {
  return new Ast.Statement.Declaration(name, 'query', lambda !== null ? lambda[2] : {}, table);
} / 'let' __ 'action' __ name:ident _ ':=' _ lambda:('\\' _ lambda_param_decl_list _ '->' _)?  action:thingpedia_function_call _ ';' {
  return new Ast.Statement.Declaration(name, 'action', lambda !== null ? lambda[2] : {}, action);
}

action = thingpedia_function_call / builtin:('notify' / 'return') {
  return new Ast.Invocation(Ast.Selector.Builtin, builtin, [], null);
}

action_list = single:action { return [single]; }
  / '{' _ actions:(action _ ';' _)+ '}' {
  return take(actions, 0);
}
rule = 'now' __ '=>' _ table:table _ '=>' _ actions:action_list _ ';' {
  return new Ast.Statement.Command(table, actions);
} / 'now' __ '=>' _ actions:action_list _ ';' {
  return new Ast.Statement.Command(null, actions);
} / stream:stream _ '=>' _ actions:action_list _ ';' {
  return new Ast.Statement.Rule(stream, actions);
}

// Boolean Expressions

get_predicate = fn:thingpedia_function_name _ in_params:input_param_list _ '{' _ filter:or_expr _ '}' {
    let [selector, function_name] = fn;
    return new Ast.BooleanExpression.External(selector, function_name, in_params, filter, null);
 }

function_style_predicate = fn:ident _ '(' _ lhs:ident _ ',' _ rhs:value _ ')' {
    if (fn === 'substr')
        fn = '=~';
    return new Ast.BooleanExpression.Atom(lhs, fn, rhs);
}

infix_predicate = lhs:ident _ op:comparison_operator _ rhs:value {
    return new Ast.BooleanExpression.Atom(lhs, op, rhs);
}

or_expr = first:and_expr rest:(_ '||' _ and_expr _)* {
    if (rest.length === 0)
        return first;
    return new Ast.BooleanExpression.Or([first].concat(take(rest, 3)));
}
and_expr = first:comp_expr rest:(_ '&&' _ comp_expr)* {
    if (rest.length === 0)
        return first;
    return new Ast.BooleanExpression.And([first].concat(take(rest, 3)));
}
comp_expr = infix_predicate / primary_bool_expr

primary_bool_expr = '(' _ or:or_expr _ ')' { return or; } /
    v:literal_bool { return v ? Ast.BooleanExpression.True : Ast.BooleanExpression.False; } /
    '!' _ bool:primary_bool_expr { return new Ast.BooleanExpression.Not(bool); } /
    get_predicate / function_style_predicate

// Scalar Expressions

scalar_function_args = '(' _ ')' { return []; } /
  '(' _ first:scalar_expression _ rest:(',' _ scalar_expression)* _ ')' {
  return [first].concat(take(rest, 2));
}

scalar_function = name:ident _ args:scalar_function_args {
  return new Ast.ScalarExpression.Derived(name, args);
}

primary_scalar_expression = v:value {
  return new Ast.ScalarExpression.Primary(v);
} / scalar_function / '(' _ expr:scalar_expression _ ')' {
  return expr;
}

add_expr = first:mul_expr _ rest:(('+' / '-') _ mul_expr _)* {
  return rest.reduce(((x, y) => new Ast.ScalarExpression.Derived(y[0], [x, y[2]])), first);
}
mul_expr = first:exp_expr _ rest:(('*' / '/' / '%') _ exp_expr _)* {
  return rest.reduce(((x, y) => new Ast.ScalarExpression.Derived(y[0], [x, y[2]])), first);
}
exp_expr = first:primary_scalar_expression _ rest:('**' _ primary_scalar_expression _)* {
  return rest.reduce(((x, y) => new Ast.ScalarExpression.Derived(y[0], [x, y[2]])), first);
}

scalar_expression = add_expr

// Values (Primary Expressions)
date_value = relative_date_value / absolute_date_value / edge_date_value / now

value =
        undefined_value /
        date_value /
        bool_value /
        event_value /
        compound_measure_value /
        number_value /
        currency_value /
        time_value /
        location_value /
        enum_value /
        entity_value /
        var_ref_value /
        string_value /
        array_value /
        arg_map_value

qualified_name = first:ident _ rest:('.' _ ident _)* {
  if (rest.length === 0)
    return first;
  else
    return first + '.' + take(rest, 2).join('.');
}
qualified_class_name = first:classident _ rest:('.' _ classident _)* {
  if (rest.length === 0)
    return first;
  else
    return first + '.' + take(rest, 2).join('.');
}

var_ref_value = name:qualified_name _ !'(' {
  return Ast.Value.VarRef(name);
}
undefined_value = '$undefined' remote:('.' _ 'remote')? {
    return Ast.Value.Undefined(remote === null);
}
compound_measure_value = single:measure_value / '(' _ first:measure_value _ rest:('+' _ measure_value _)+ _ ')' {
  return Ast.Value.CompoundMeasure([first].concat(take(rest, 2)));
}

measure_value = num:literal_number unit:ident { return Ast.Value.Measure(num, unit); }
number_value = v:literal_number { return Ast.Value.Number(v); }
currency_value = 'makeCurrency' _ '(' _ num:literal_number _ ',' _ code:ident _ ')' {
    return new Ast.Value.Currency(num, code);
}

long_date_value = 'makeDate' _ '(' year:literal_number _ ',' _ month:literal_number _ ',' _ day:literal_number _ ',' _ hours:literal_number _ ',' _ minutes:literal_number _ ',' _ seconds:literal_number _ ')' {
    var d = new Date;
    d.setFullYear(year);
    d.setMonth(month-1);
    d.setDate(day);
    d.setHours(hours);
    d.setMinutes(minutes);
    d.setSeconds(seconds);
    return new Ast.Value.Date(d, '+', null);
}
short_date_value = 'makeDate' _ '(' year:literal_number _ ',' _ month:literal_number _ ',' _ day:literal_number _ ')' {
    var d = new Date;
    d.setFullYear(year);
    d.setMonth(month-1);
    d.setDate(day);
    d.setHours(0);
    d.setMinutes(0);
    d.setSeconds(0);
    return new Ast.Value.Date(d, '+', null);
}
unix_date_value = 'makeDate' _ '(' unix:literal_number _ ')' {
    var d = new Date;
    d.setTime(unix);
    return new Ast.Value.Date(d, '+', null);
}
absolute_date_value = long_date_value / short_date_value / unix_date_value

relative_date_value = base:(absolute_date_value / now / edge_date_value) _ op:('+' / '-') _ offset:compound_measure_value {
    return new Ast.Value.Date(base.value, op, offset);
}

time_unit = unit:ident {
    if (Units.UnitsToBaseUnit[unit] !== 'ms')
        error('Invalid time unit ' + unit);
    return unit;
}

edge_date_value = edge:('start_of' / 'end_of') _ '(' unit:time_unit _ ')' {
    if (unit === 'ms' || unit === 's')
        error(`${edge}(${unit}) is not allowed (not enough resolution)`);
    return new Ast.Value.Date(Ast.DateEdge(edge, unit), '+', null);
}
now = 'makeDate' _ '(' _ ')' {
    return Ast.Value.Date(null, '+', null);
}
time_value = 'makeTime' _ '(' hour:literal_number _ ',' _ minute:literal_number _ second:(',' _ literal_number _)? ')' {
    return Ast.Value.Time(hour, minute, second !== null ? second[2] : 0);
}
bool_value = v:literal_bool { return Ast.Value.Boolean(v); }
location_value = 'makeLocation' _ '(' _ lat:literal_number _ ',' _ lon:literal_number _ display:(',' _ literal_string _)?')' {
    return Ast.Value.Location(Ast.Location.Absolute(lat, lon, display !== null ? display[2] : null));
} / '$context' _ '.' _ 'location' _ '.' _ ctx:('home' / 'work' / 'current_location') {
    return Ast.Value.Location(Ast.Location.Relative(ctx));
}

enum_value = 'enum' _ '(' _ v:ident _ ')' { return Ast.Value.Enum(v); }
string_value = v:literal_string { return Ast.Value.String(v);
}
event_value = '$event' _ evt:('.' _ ('type' / 'program_id'))? {
    return Ast.Value.Event(evt !== null ? evt[2] : null);
}

entity_type = '^^' _ prefix:qualified_class_name _ ':' _ entity:ident {
    return prefix + ':' + entity;
}

entity_value1 = v:literal_string _ type:entity_type _ display:('(' _ literal_string _')' _)? {
    return Ast.Value.Entity(v, type, display !== null ? display[2] : null);
}
entity_value2 = 'null' _ type:entity_type _ '(' _ display:literal_string _')' {
    return Ast.Value.Entity(null, type, display);
}
entity_value = entity_value1 / entity_value2

array_value = '[' _ values:array_value_list? _ ']' {
    return Ast.Value.Array(values || []);
}
array_value_list = first:value _ rest:(',' _ value _)* {
    return [first].concat(take(rest, 2));
}

arg_map_value = 'makeArgMap' _ '(' _ first:( ident _ ':' _ type_ref ) _ rest:(',' _ ident _ ':' _ type_ref _ )* _ ')' {
    let map = {};
    map[first[0]] = first[4];
    if (rest.length)
        map[take(rest, 2)] = take(rest, 6);
    return Ast.Value.ArgMap(map);
}


annotation = nl_annotation / impl_annotation
nl_annotation = '#' '_' '[' name:ident _ '=' value:value ']' {
    return { type: 'nl', name: name, value: value };
}
impl_annotation = '#' '[' name:ident _ '=' value:value ']' {
    return { type: 'impl', name: name, value: value };
}

// Types

type_ref = 'Measure' _ '(' _ unit:ident? _ ')' { return Type.Measure(unit); } /
    'Enum' _ '(' _ first:ident _ rest:(',' _ ident _)* _ ')' { return Type.Enum([first].concat(take(rest, 2))); } /
    'Entity' _ '(' _ prefix:qualified_class_name _ ':' _ type:ident _ ')' { return Type.Entity(prefix + ':' + type); } /
    'Boolean' { return Type.Boolean; } /
    'String' { return Type.String; } /
    'Number' { return Type.Number; } /
    'Currency' { return Type.Currency; } /
    'Location' { return Type.Location; } /
    'Date' { return Type.Date; } /
    'Time' { return Type.Time; } /
    // for compat with Thingpedia
    'EmailAddress' { return Type.Entity('tt:email_address'); } /
    'PhoneNumber' { return Type.Entity('tt:phone_number'); } /
    'Picture' { return Type.Entity('tt:picture'); } /
    'Resource' { return Type.Entity('tt:rdf_resource'); } /
    'URL' { return Type.Entity('tt:url'); } /
    'Username' { return Type.Entity('tt:username'); } /
    'Hashtag' { return Type.Entity('tt:hashtag'); } /
    'Type' { return Type.Type; } /
    'Array' _ '(' _ type:type_ref _ ')' { return Type.Array(type); } /
    'Any' { return Type.Any; } /
    '(' first:type_ref _ rest:(',' _ type_ref _)* ')' { return Type.Tuple([first].concat(take(rest, 2))); } /
    'Table' { return Type.Table; } /
    'Stream' { return Type.Stream; } /
    'ArgMap' { return Type.ArgMap; } /
    invalid:ident { throw new TypeError("Invalid type " + invalid); }

// Tokens

comparison_operator "comparison operator" = '>=' / '<=' / '=~' / '~=' / '=='

literal_bool = 'true' !identchar { return true; } / 'false' !identchar { return false; }

// keywords which are not allowed as identifiers
keyword = literal_bool / ('let' / 'now' / 'new' / 'as' / 'of' / 'in' / 'out' / 'req' / 'opt' / 'notify' / 'return' / 'join' / 'edge' / 'monitor' / 'class' / 'extends' / 'mixin' / 'this' / 'import' / 'null' / 'enum' / 'aggregate' / 'dataset') !identchar

// dqstrchar = double quote string char
// sqstrchar = single quote string char
dqstrchar = [^\\\"] / "\\\"" { return '"'; } / "\\n" { return '\n'; } / "\\'" { return '\''; } / "\\\\" { return '\\'; }
sqstrchar = [^\\\'] / "\\\"" { return '"'; } / "\\n" { return '\n'; } / "\\'" { return '\''; } / "\\\\" { return '\\'; }
literal_string "string" = '"' chars:dqstrchar* '"' { return chars.join(''); }
    / "'" chars:sqstrchar* "'" { return chars.join(''); }
digit "digit" = [0-9]
literal_number "number" =
    num:$('-'? digit+ '.' digit* ('e' digit+)?) { return parseFloat(num); } /
    num:$('-'? '.' digit+ ('e' digit+)?) { return parseFloat(num); } /
    num:$('-'? digit+ ('e' digit+)?) { return parseFloat(num); }

identstart = [A-Za-z_]
identchar = [A-Za-z0-9_]
ident "identifier" = !keyword v:$(identstart identchar*) {
  // for debugging the prettyprinter
  if (v === 'undefined')
    throw new Error('Invalid undefined');
  return v;
}
classidentchar = [A-Za-z0-9_-]
classident "classidentifier" = !keyword v:$(identstart classidentchar*) { return v; }

// optional token separator
_ = (whitespace / comment)*
// required token separator (after keywords)
__ = (whitespace / comment)+ / !identchar

whitespace "whitespace" = [ \r\n\t\v]
comment "comment" = '/*' ([^*] / '*'[^/])* '*/' / '//' [^\n]* '\n'








