// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingEngine
//
// Copyright 2015-2016 Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details

{
    var Ast = require('./ast');
    var Type = require('./type');

    var Program = Ast.Program;
    var Rule = Ast.Rule;
    var Selector = Ast.Selector;
    var Value = Ast.Value;
    var Location = Ast.Location;
    var RulePart = Ast.RulePart;
    var Filter = Ast.Filter;
    var InputParam = Ast.InputParam;
    var OutputParam = Ast.OutputParam;

    function take(array, idx) {
        return array.map(function(v) { return v[idx]; });
    }
}

// global grammar

program = _ name:ident _ params:decl_param_list _ '{' _ rules:(rule _)+ '}' _ {
    return Program(name, params, take(rules, 0));
} / _ rules:(rule _)+ {
    return Program('Main', [], take(rules, 0));
}

decl_param_list = '(' _ ')' { return []; } /
    '(' _ first:decl_param _ rest:(',' _ decl_param _)* ')' {
        return [first].concat(take(rest, 2));
    }
decl_param = name:ident _ ':' _ type:type_ref {
    return { name: name, type: type };
}

rule = once:'once'? _ trigger:trigger _ queries:('=>' _ query _)* _ '=>' _ actions:action_list {
    return Rule(trigger, take(queries, 2), actions, once !== null);
}

trigger = 'now' { return null; } / trigger_or_query
query = q:trigger_or_query &(_ '=>') { return q; }

trigger_or_query = selector:device_selector _ '.' _ function_name:ident _
    in_params:input_param_list _ filters:filter_list out_params:output_param_list {
    return RulePart(selector, function_name, in_params, filters, out_params);
}

action_list = single:action _ ';' { return [single]; } /
    '{' list:(_ action _ ';') _ '}' _ ';'? { return take(list, 1); }

action = ('notify' / ('@$notify' _ '(' _ ')')) { return RulePart(Selector.Builtin, 'notify', [], [], []); }
    / selector:device_selector _ '.' _ function_name:ident _ in_params:input_param_list {
    return RulePart(selector, function_name, in_params, [], []);
}

device_selector = '@' first_name:classident _ rest_names:('.' _ classident _ !(_ '('))* _ values:('(' _ attribute_list _ ')')? {
    var type = first_name + (rest_names.length > 0 ? ('.' + take(rest_names, 2).join('.')) : '');
    if (values !== null)
        values = values[2];
    else
        values = {};
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

filter_list = filters:(',' _ filter _)* { return take(filters, 2); }
filter = fn:function_filter _ '(' _ name:ident _ ',' _ value:value _ ')' {
    return Filter(name, fn, value);
} / name:ident _ op:operator _ value:value {
    return Filter(name, op, value);
}

output_param_list = outputs:(',' _ output_param _)* { return take(outputs, 2); }
output_param = name:ident _ ':=' _ param:ident {
    return OutputParam(name, param);
}

function_filter = 'contains'
operator = '>=' / '<=' / '>' / '<' / '=~' / ('=' !'>') { return '='; } / '!='

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
time_value = 'makeTime' _ '(' hour:literal_number _ ',' _ minute:literal_number _ ')' {
    return Value.Time(hour, minute);
}
bool_value = v:literal_bool { return Value.Boolean(v); }
location_value = 'makeLocation' _ '(' _ lat:literal_number _ ',' _ lon:literal_number _ display:(',' _ literal_string _)?')' {
    return Value.Location(Location.Absolute(lon, lat, display !== null ? display[2] : null));
} / '$context' _ '.' _ 'location' _ '.' _ ctx:('home' / 'work' / 'current_location') {
    return Value.Location(Location.Relative(ctx));
}

enum_value = 'enum' _ '(' _ v:ident _ ')' { return Value.Enum(v); }
string_value = v:literal_string { return Value.String(v);
}
event_value = '$event' _ evt:('.' _ ('title' / 'body'))? {
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
