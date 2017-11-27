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
    var Aggregation = Ast.Aggregation;

    function take(array, idx) {
        return array.map(function(v) { return v[idx]; });
    }
}

// global grammar

program = _ principal:(('executor' _ '=' _)? (entity_value / string_value / 'self') _ ':' _)? _ name:ident _ params:decl_param_list _ '{' _ classes:(class_def _)* _ rules:(rule _)+ '}' _ {
    if (principal !== null) {
        principal = principal[1];
        if (principal === 'self')
            principal = null;
        else if (principal.isString) // for compat and ease of use, a raw string is a contact name
            principal = Value.Entity(principal.value, 'tt:contact_name', null);
    }

    return new Program(name, params, take(classes, 0), take(rules, 0), principal);
} / _ principal:(('executor' _ '=' _)? (entity_value / string_value / 'self') _ ':' _)? _ rules:(rule _)+ {
    if (principal !== null) {
        principal = principal[1];
        if (principal === 'self')
            principal = null;
        else if (principal.isString) // for compat and ease of use, a raw string is a contact name
            principal = Value.Entity(principal.value, 'tt:contact_name', null);
    }

    return new Program('Main', [], [], take(rules, 0), principal);
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

permission_rule = _ principal:(('source' _ '=' _)? (entity_value / '_') _ ':' _)? first:(permission_function / 'now') _ '=>' _ second:(permission_function / 'notify') _ third:('=>' _ (permission_function / 'notify') )? _ {
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
    return Ast.PermissionRule(principal !== null && principal[1] !== '_' ? principal[1] : null, first, second, third);
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
log_function_name = 'get_record' / 'new_record'

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

rule = tblname:('table' _ '=' _ (string_value / entity_value) _ ':')? _ once:'once'? _ trigger:trigger _ queries:('=>' _ query _)* _ '=>' _ actions:action_list {
    return new Rule(trigger, take(queries, 2), actions, once !== null, tblname !== null ? tblname[4].value : null, null);
}

trigger = 'now' { return null; } / trigger_or_query / log_trigger_or_query
query = q:trigger_or_query &(_ '=>') { return q; } / q:log_trigger_or_query &(_ '=>') { return q; }

trigger_or_query = fn:function_name _
    in_params:input_param_list _ filters:filter_list out_params:output_param_list {
    let [selector, function_name] = fn;
    return RulePart(selector, function_name, in_params, filters, out_params, null, null);
}

log_trigger_or_query = log_aggregation / log
log =
    fn:log_function_name _ in_params:input_param_list _ filters:filter_list out_params:output_param_list {
    return RulePart(Selector.Builtin, fn, in_params, filters, out_params, null, null);
}
log_aggregation =
    fn:log_function_name _ in_params:input_param_list _ filters:filter_list _ ',' _ agg:(agg_param / argm_param) {
    let {out_params, aggregation} = agg;
    return RulePart(Selector.Builtin, fn, in_params, filters, out_params, null, aggregation);
}

action_list = single:action _ ';' { return [single]; } /
    '{' list:(_ action _ ';')+ _ '}' _ ';'? { return take(list, 1); }

notify_action = 'notify' {
    return new RulePart(Selector.Builtin, 'notify', [], BooleanExpression.True, [], null, null);
}
return_action = 'return' {
    return new RulePart(Selector.Builtin, 'return', [], BooleanExpression.True, [], null, null);
}
save_action = 'save' {
    return new RulePart(Selector.Builtin, 'save', [], BooleanExpression.True, [], null, null);
}
other_action = fn:function_name _ in_params:input_param_list {
    let [selector, function_name] = fn;
    return RulePart(selector, function_name, in_params, BooleanExpression.True, [], null, null);
}
action = notify_action / return_action / save_action / other_action

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
attribute = name:('id'/'principal') _ '=' _ value:(entity_value / string_value / array_value) {
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

get_predicate = fn:function_name _ in_params:input_param_list _ '{' _ filter:or_expr _ '}' {
    let [selector, function_name] = fn;
    return new BooleanExpression.External(selector, function_name, in_params, filter, null);
}
subquery = fn:log_function_name _ in_params:input_param_list _ '{' _ filters:or_expr _ '}' {
    return new BooleanExpression.External(Selector.Builtin, fn, in_params, filters, null);
}
function_style_filter = fn:ident _ '(' _ name:ident _ ',' _ value:value _ ')' {
    if (name === 'substr')
        name = '=~';
    return BooleanExpression.Atom(Filter(name, fn, value));
}
infix_filter = name:ident _ op:operator _ value:value {
    return BooleanExpression.Atom(Filter(name, op, value));
}
filter = get_predicate / subquery / function_style_filter / infix_filter

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

star_outputs = ',' _ '*' { return [OutputParam('*', '*')]; }
output_param_list = star_outputs / outputs:(',' _ output_param _)* { return take(outputs, 2); }
output_param = name:ident _ ':=' _ param:ident {
    return OutputParam(name, param);
}
argm_param = l:argm_lhs _ ':=' _ r:argm_rhs {
    let out_params = [];
    for (let i = 0; i < l.length; i++)
        out_params.push(OutputParam(l[i], r.cols[i]));
    return {out_params:out_params, aggregation:r};
}
argm_lhs = '[' _ first:ident rest:(', ' _ ident _)* _ ']' {return [first].concat(take(rest, 2));}
argm_rhs = type:argm _ '(' _ field:ident _ ', ' count:(_ literal_number _ ', ')? _ cols:argm_lhs _ ')' {
    return Aggregation(type, field, cols, count? count[1] : null);
}
agg_param = name:ident _ ':=' _ type:aggregation _ '(' _ field:(ident / '*') _ ')' {
    let out_params = [OutputParam(name, field)];
    return {out_params: out_params, aggregation:Aggregation(type, field, null, null)};
}

operator = '>=' / '<=' / '>' / '<' / '=~' / '~=' / ('=' !'>') { return '='; } / '!='

value =
        relative_date_value /
        bool_value /
        undefined_value /
        event_value /
        measure_value /
        number_value /
        long_date_value /
        short_date_value /
        unix_date_value /
        edge_date_value /
        now /
        time_value /
        location_value /
        enum_value /
        entity_value /
        var_ref_value /
        string_value /
        array_value

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
edge_date_value = edge:('start_of' / 'end_of') _ '(' unit:('year' / 'month' / 'day' / 'hour' / 'minute') _ ')' {
    var d = new Date;
    var units = ['year', 'month', 'day', 'hour', 'minute', 'second'];
    var setZero = ['', 'd.setMonth(0)', 'd.setDate(0)', 'd.setHours(0)', 'd.setMinutes(0)', 'd.setSeconds(0)'];
    var addOne = ['d.setFullYear(d.getFullYear()+1)', 'd.setMonth(d.getMonth()+1)', 'd.setDate(d.getDate()+1)', 'd.setHours(d.getHours()+1)', 'd.setMinutes(d.getMinutes()+1)'];
    setZero.slice(units.indexOf(unit) + 1).forEach(function(f) {
        eval(f);
    });
    if (edge === 'end_of')
        eval(addOne[units.indexOf(unit)]);
    return Value.Date(d);
}
now = 'makeDate' _ '()' {
    return Value.Date(new Date);
}
relative_date_value = date:(long_date_value / short_date_value / unix_date_value / edge_date_value / now) _ op:('+' / '-') _ 'delta' _ '('
    years:('years' _ '=' _ literal_number _ ','? _)?
    months:('months' _ '=' _ literal_number _ ','? _)?
    weeks:('weeks' _ '=' _ literal_number _ ','? _)?
    days:('days' _ '=' _ literal_number _ ','? _)?
    hours:('hours' _ '=' _ literal_number _ ','? _)?
    minutes:('minutes' _ '=' _ literal_number _ ','? _)?
    seconds:('seconds' _ '=' _ literal_number _)?
')'{
    var operator = op === '+' ? function(a, b) {return a + b;} : function(a, b) {return a - b};
    var d = date.value;
    if (years)  d.setFullYear(operator(d.getFullYear(), years[4]));
    if (months) d.setMonth(operator(d.getMonth(), months[4]));
    if (weeks) d.setDate(operator(d.getDate(), weeks[4] * 7));
    if (days) d.setDate(operator(d.getDate(), days[4]));
    if (hours) d.setHours(operator(d.getHours(), hours[4]));
    if (minutes) d.setMinutes(operator(d.getMinutes(), minutes[4]));
    if (seconds) d.setSeconds(operator(d.getSeconds(), seconds[4]));
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
event_value = '$event' _ evt:('.' _ ('title' / 'body' / 'type' / 'program_id'))? {
    return Value.Event(evt !== null ? evt[2] : null);
}
entity_value = v:literal_string _ '^^' _ prefix:$(ident ':')? entity:ident _ display:('(' _ literal_string _')' _)? {
    return Value.Entity(v, (prefix || 'tt:') + entity, display !== null ? display[2] : null);
}
array_value = '[' _ values:array_value_list? _ ']' {
    return Value.Array(values || []);
}
array_value_list = first:value _ rest:(',' _ value _)* {
    return [first].concat(take(rest, 2));
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

aggregation = 'max' / 'min' / 'sum' / 'avg' / 'count'
argm = 'argmax' / 'argmin'

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
