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
    var { optimizeFilter } = require('./optimize');

    var Program = Ast.Program;
    var ClassDef = Ast.ClassDef;
    var FunctionDef = Ast.FunctionDef;
    var Rule = Ast.Rule;
    var Selector = Ast.Selector;
    var Value = Ast.Value;
    var Location = Ast.Location;
    var RulePart = Ast.RulePart;
    var Filter = Ast.Filter;
    var InputParam = Ast.InputParam;
    var OutputParam = Ast.OutputParam;
    var BooleanExpression = Ast.BooleanExpression;

    function take(array, idx) {
        return array.map(function(v) { return v[idx]; });
    }
}

// global grammar

program = _ principal:((entity_value / 'self') _ ':' _)? _ name:ident _ params:decl_param_list _ '{' _ classes:(class_def _)* _ rules:(rule _)+ '}' _ {
    return new Program(name, params, take(classes, 0), take(rules, 0), principal !== null && principal[0] !== 'self' ? principal[0] : null);
} / _ principal:((entity_value / 'self') _ ':' _)? _ rules:(rule _)+ {
    return new Program('Main', [], [], take(rules, 0), principal !== null && principal[0] !== 'self' ? principal[0] : null);
}

permission_function = kind:class_name _ '.' _ '*' {
    return new Ast.PermissionFunction.ClassStar(kind);
} / fn:short_function_name _ filter:(',' _ or_expr _)? _ out_params:output_param_list {
    let [selector, channel] = fn;
    let kind = selector.kind;
    if (filter === null)
        filter = Ast.BooleanExpression.True;
    else
        filter = filter[2];
    return new Ast.PermissionFunction.Specified(kind, channel, optimizeFilter(filter), out_params, null);
} / '*' { return Ast.PermissionFunction.Star }

permission_rule = _ principal:(entity_value _ ':' _)? first:(permission_function / 'now') _ '=>' _ second:(permission_function / 'notify') _ third:('=>' _ (permission_function / 'notify') )? _ {
    if (first === 'now')
        first = Ast.PermissionFunction.Builtin;
    if (third === null) {
        third = second;
        second = Ast.PermissionFunction.Builtin;
    } else {
        if (second === 'notify') {
            throw new TypeError('notify is not a query');
        }
        third = third[2];
    }
    if (third === 'notify')
        third = Ast.PermissionFunction.Builtin;
    return Ast.PermissionRule(principal !== null ? principal[0] : null, first, second, third);
}

decl_param_list = '(' _ ')' { return []; } /
    '(' _ first:decl_param _ rest:(',' _ decl_param _)* ')' {
        return [first].concat(take(rest, 2));
    }
decl_param = name:ident _ ':' _ type:type_ref {
    return { name: name, type: type };
}

full_class_name = '@' first_name:classident _ rest_names:('.' _ classident _ !(_ ('(' / ',' / ')' / '=>')))* {
    return first_name + (rest_names.length > 0 ? ('.' + take(rest_names, 2).join('.')) : '');
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

function_name = full_function_name / short_function_name

class_name = '@' first_name:classident _ rest_names:('.' _ classident _)* {
    return first_name + (rest_names.length > 0 ? ('.' + take(rest_names, 2).join('.')) : '');
}

class_def = 'class' _ name:class_name _ 'extends' _ extends_:full_class_name '{' _ members:class_member* _ '}' {
    var _class = ClassDef(name, extends_, {}, {}, {});
    for (var [type, name, ast] of members) {
        switch (type) {
        case 'trigger':
            _class.triggers[name] = ast;
            break;
        case 'query':
            _class.queries[name] = ast;
            break;
        case 'action':
            _class.actions[name] = ast;
            break;
        }
    }
    return _class;
}

class_member = type: ('trigger' / 'query' / 'action') __ name:ident _ params:function_param_decl_list _ ';' _ {
    var fn = new FunctionDef('other', [], [], {}, {}, {}, {}, '', '','',[], []);
    for (var i = 0; i < params.length; i++) {
        var [direction, argname, argtype] = params[i];
        fn.args.push(argname);
        fn.types.push(argtype);
        fn.index[argname] = i;
        fn[direction][argname] = argtype;
    }
    return [type, name, fn];
}
function_param_decl_list = '(' _ ')' { return []; } /
    '(' _ first:function_param_decl _ rest:(',' _ function_param_decl _)* ')' {
    return [first].concat(take(rest, 2));
}
function_param_decl = direction:param_direction __ name:ident _ ':' _ type:type_ref {
    return [direction, name, type];
}
param_direction = 'in' __ 'req' { return 'inReq'; } / 'in' __ 'opt' { return 'inOpt'; } /
    'out' { return 'out'; }

rule = once:'once'? _ trigger:trigger _ queries:('=>' _ query _)* _ '=>' _ actions:action_list {
    return Rule(trigger, take(queries, 2), actions, once !== null);
}

trigger = 'now' { return null; } / trigger_or_query
query = q:trigger_or_query &(_ '=>') { return q; }

trigger_or_query = fn:function_name _
    in_params:input_param_list _ filters:filter_list out_params:output_param_list {
    let [selector, function_name] = fn;
    return RulePart(selector, function_name, in_params, filters, out_params, null);
}

action_list = single:action _ ';' { return [single]; } /
    '{' list:(_ action _ ';')+ _ '}' _ ';'? { return take(list, 1); }

notify_action = ('notify' / ('@$notify' _ '(' _ ')')) {
    return new RulePart(Selector.Builtin, 'notify', [], BooleanExpression.True, [], null);
}
return_action = 'return' {
    return new RulePart(Selector.Builtin, 'return', [], BooleanExpression.True, [], null);
}
other_action = fn:function_name _ in_params:input_param_list {
    let [selector, function_name] = fn;
    return RulePart(selector, function_name, in_params, BooleanExpression.True, [], null);
}
action = notify_action / return_action / other_action

device_selector = type:class_name _ '(' _ values:attribute_list _ ')' {
    var id;
    if (values.id !== undefined)
        id = values.id;
    else
        id = null;
    if (id !== null) {
        if (!id.isString)
            return error("device id must be a string");
        id = id.toJS();
    }
    var principal;
    if (values.principal !== undefined)
        principal = values.principal;
    else
        principal = null;
    if (principal !== null) {
        if (principal.isString) // for compat and ease of use, a raw string is a contact name
            principal = Value.Entity(principal.value, 'tt:contact_name', null);
        if (!principal.isEntity ||
            (principal.type !== 'tt:contact' && principal.type !== 'tt:contact_name'))
            return error("principal must be a contact or a contact name");
    }
    return Selector.Device(type, id, principal);
}
attribute_list = first:attribute _ rest:(',' _ attribute _)* {
    var obj = {};
    obj[first[0]] = first[1];
    for (var [name, value] of rest) {
        if (obj[name] !== undefined) return error('Duplicate attribute ' + name);
        obj[name] = value;
    }
    return obj;
}
attribute = name:('id'/'principal') _ '=' _ value:(entity_value / string_value) {
    return [name, value];
}

input_param_list = '(' _ ')' { return [] } /
    '(' _ first:input_param _ rest:(',' _ input_param _)* ')' {
    return [first].concat(take(rest, 2));
}
input_param = name:ident _ '=' _ value:value {
    return InputParam(name, value);
}

filter_list = filters:(',' _ or_expr _)* {
    return optimizeFilter(BooleanExpression.And(take(filters, 2)));
}

filter = fn:ident _ '(' _ name:ident _ ',' _ value:value _ ')' {
    if (name === 'substr')
        name = '=~';
    return BooleanExpression.Atom(Filter(name, fn, value));
} / name:ident _ op:operator _ value:value {
    return BooleanExpression.Atom(Filter(name, op, value));
} / fn:function_name _ in_params:input_param_list _ '{' _ filter:or_expr _ '}' {
    let [selector, function_name] = fn;
    return new BooleanExpression.External(selector, function_name, in_params, filter, null);
}
or_expr = first:and_expr rest:(_ '||' _ and_expr _)* {
    if (rest.length === 0)
        return first;
    return BooleanExpression.Or([first].concat(take(rest, 3)));
}
and_expr = first:bool_expr rest:(_ '&&' _ bool_expr)* {
    if (rest.length === 0)
        return first;
    return BooleanExpression.And([first].concat(take(rest, 3)));
}
bool_expr = '(' _ or:or_expr _ ')' { return or; } /
    v:literal_bool { return v ? BooleanExpression.True : BooleanExpression.False; } /
    '!' _ '(' _ or:or_expr _ ')' { return BooleanExpression.Not(or); } /
    f:filter { return f; }

output_param_list = outputs:(',' _ output_param _)* { return take(outputs, 2); }
output_param = name:ident _ ':=' _ param:ident {
    return OutputParam(name, param);
}

operator = '>=' / '<=' / '>' / '<' / '=~' / '~=' / ('=' !'>') { return '='; } / '!='

value =
        bool_value /
        undefined_value /
        event_value /
        measure_value /
        number_value /
        long_date_value /
        short_date_value /
        unix_date_value /
        time_value /
        location_value /
        enum_value /
        entity_value /
        var_ref_value /
        string_value

var_ref_value = name:ident { return Value.VarRef(name); }
undefined_value = '$undefined' remote:('.' _ 'remote')? {
    return Value.Undefined(remote === null);
}
measure_value = num:literal_number unit:ident { return Value.Measure(num, unit); }
number_value = v:literal_number { return Value.Number(v); }
long_date_value = 'makeDate' _ '(' year:literal_number _ ',' _ month:literal_number _ ',' _ day:literal_number _ ',' _ hours:literal_number _ ',' _ minutes:literal_number _ ',' _ seconds:literal_number _ ')' {
    var d = new Date;
    d.setFullYear(year);
    d.setMonth(month-1);
    d.setDate(day);
    d.setHours(hours);
    d.setMinutes(minutes);
    d.setSeconds(seconds);
    return Value.Date(d);
}
short_date_value = 'makeDate' _ '(' year:literal_number _ ',' _ month:literal_number _ ',' _ day:literal_number _ ')' {
    var d = new Date;
    d.setFullYear(year);
    d.setMonth(month-1);
    d.setDate(day);
    d.setHours(0);
    d.setMinutes(0);
    d.setSeconds(0);
    return Value.Date(d);
}
unix_date_value = 'makeDate' _ '(' unix:literal_number _ ')' {
    var d = new Date;
    d.setTime(unix);
    return Value.Date(d);
}
time_value = 'makeTime' _ '(' hour:literal_number _ ',' _ minute:literal_number _ second:(',' _ literal_number _)? ')' {
    return Value.Time(hour, minute, second !== null ? second[2] : 0);
}
bool_value = v:literal_bool { return Value.Boolean(v); }
location_value = 'makeLocation' _ '(' _ lat:literal_number _ ',' _ lon:literal_number _ display:(',' _ literal_string _)?')' {
    return Value.Location(Location.Absolute(lat, lon, display !== null ? display[2] : null));
} / '$context' _ '.' _ 'location' _ '.' _ ctx:('home' / 'work' / 'current_location') {
    return Value.Location(Location.Relative(ctx));
}

enum_value = 'enum' _ '(' _ v:ident _ ')' { return Value.Enum(v); }
string_value = v:literal_string { return Value.String(v);
}
event_value = '$event' _ evt:('.' _ ('title' / 'body' / 'type'))? {
    return Value.Event(evt !== null ? evt[2] : null);
}
entity_value = v:literal_string _ '^^' _ prefix:$(ident ':')? entity:ident _ display:('(' _ literal_string _')' _)? {
    return Value.Entity(v, (prefix || 'tt:') + entity, display !== null ? display[2] : null);
}

type_ref = 'Measure' _ '(' _ unit:ident? _ ')' { return Type.Measure(unit); } /
    'Array' _ '(' _ type:type_ref _ ')' { return Type.Array(type); } /
    'Enum' _ '(' _ first:ident _ rest:(',' _ ident _)* _ ')' { return Type.Enum([first].concat(take(rest, 2))); } /
    'Entity' _ '(' _ prefix:($(ident ':'))? type:ident _ ')' { return Type.Entity((prefix !== null ? prefix : 'tt:') + type); } /
    'Any' { return Type.Any; } /
    'Boolean' { return Type.Boolean; } /
    'String' { return Type.String; } /
    'Number' { return Type.Number; } /
    'Location' { return Type.Location; } /
    'Date' { return Type.Date; } /
    'Time' { return Type.Time; } /
    '(' first:type_ref _ rest:(',' _ type_ref _)* ')' { return Type.Tuple([first].concat(take(rest, 2))); } /
    // for compat with Thingpedia
    'EmailAddress' { return Type.Entity('tt:email_address'); } /
    'PhoneNumber' { return Type.Entity('tt:phone_number'); } /
    'Picture' { return Type.Entity('tt:picture'); } /
    'Resource' { return Type.Entity('tt:rdf_resource'); } /
    'URL' { return Type.Entity('tt:url'); } /
    'Username' { return Type.Entity('tt:username'); } /
    'Hashtag' { return Type.Entity('tt:hashtag'); } /
    invalid:ident { throw new TypeError("Invalid type " + invalid); }

literal_bool = 'true' { return true; } / 'false' { return false; }

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
ident "ident" = $(identstart identchar*)
classidentchar = [A-Za-z0-9_-]
classident "classident" = $(identstart classidentchar*)

_ = (whitespace / comment)*
__ = whitespace _
whitespace "whitespace" = [ \r\n\t\v]
comment "comment" = '/*' ([^*] / '*'[^/])* '*/' / '//' [^\n]* '\n'
