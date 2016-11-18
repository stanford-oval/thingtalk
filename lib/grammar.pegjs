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
    var Statement = Ast.Statement;
    var ComputeStatement = Ast.ComputeStatement;
    var Selector = Ast.Selector;
    var Value = Ast.Value;
    var Attribute = Ast.Attribute;
    var Expression = Ast.Expression;
    var RulePart = Ast.RulePart;
    var Keyword = Ast.Keyword;

    function take(array, idx) {
        return array.map(function(v) { return v[idx]; });
    }
}

// global grammar

program = _ name:keyword _ params:decl_param_list _ '{' _ statements:(statement _)+ '}' _ {
    return Program(name, params, take(statements, 0));
}

decl_param_list = '(' _ ')' { return []; } /
    '(' _ first:decl_param _ rest:(',' _ decl_param _)* ')' {
        return [first].concat(take(rest, 2));
    }
decl_param = name:ident _ ':' _ type:type_ref {
    return { name: name, type: type };
}

statement = keyword_decl / compute_module / command / rule

compute_module = 'module' __ name:ident _ '{' _ statements:(compute_stmt _)+ _ '}' _ {
    return Statement.ComputeModule(name, take(statements, 0));
}
compute_stmt = event_decl / function_decl
event_decl = 'event' __ name:ident _ params:decl_param_list _ ';' {
    return ComputeStatement.EventDecl(name, params);
}
function_decl = 'function' __ name:ident _ params:decl_param_list _ '{' code:$(js_code*) '}' {
    return ComputeStatement.FunctionDecl(name, params, code);
}
js_code = '{' js_code* '}' / '(' js_code* ')' / '[' js_code* ']' / literal_string / [^{}\(\)\[\]\"\']

keyword_decl = 'var' __ name:keyword _ ':' _ type:type_ref _ ';' {
    return Statement.VarDecl(name, type);
}
type_list = '(' _ first:type_ref _ rest:(',' _ type_ref _)* ')' {
    return [first].concat(take(rest, 2));
}

rule = inputs:rule_part_list _ outputs:('=>' _ outputs:rule_part_list _)+ ';' {
    return Statement.Rule([inputs].concat(take(outputs, 2)));
}
rule_part_list = first:rule_part _ rest:(',' _ rule_part _)* {
    return [first].concat(take(rest, 2));
}
rule_part = invocation / keyword_rule_part / binding /
    builtin_predicate / condition

command = '$now' _ outputs:('=>' _ outputs:rule_part_list _)+ ';' {
    return Statement.Command(take(outputs, 2));
}

invocation = channel_spec:(builtin_spec / device_channel_spec) _ params:channel_param_list {
    return RulePart.Invocation(channel_spec[0], channel_spec[1], params);
}
keyword_rule_part = negative_keyword / positive_keyword
negative_keyword = '!' _ keyword:positive_keyword {
    return RulePart.Keyword(keyword.keyword, keyword.params, true);
}
positive_keyword = keyword:keyword _ params:channel_param_list {
    return RulePart.Keyword(keyword, params, false);
}
binding = name:ident _ ':=' _ expr:expression {
    return RulePart.Binding(name, expr);
}
// only match a function call alone in a predicate as a builtin predicate
// otherwise things like $count(...) >= 3 would fail to parse
builtin_predicate = expr:function_call &(_ (','/'=>')) {
    return RulePart.BuiltinPredicate(expr);
}
condition = expr:expression {
    return RulePart.Condition(expr);
}

channel_param_list = '(' _ ')' { return []; } /
    '(' _ first:(null_expression / expression) _ rest:(',' _ (null_expression / expression) _)* ')' {
        return [first].concat(take(rest, 2));
    }

keyword = name:ident {
    return Keyword(name);
}

device_channel_spec = selector:device_selector _ name:('.' _ ident) {
    return [selector, name[2]];
}
builtin_spec = '@$' name:ident {
    return [Selector.Builtin(name), null];
}
device_selector = '@' name:ident { return Selector.GlobalName(name); } /
    '@(' _ values:attribute_list _ ')' { return Selector.Attributes(values); }
attribute_list = first:attribute _ rest:(',' _ attribute _)* {
    return [first].concat(take(rest, 2));
}
attribute = name:ident _ '=' _ value:(literal / var_value) {
    return Attribute(name, value);
}
var_value = name:ident {
    return Value.VarRef(name);
}

// expression language

null_expression = '_' !identchar { return Expression.Null; }
expression =
    lhs:and_expression _ rhs:('||' _ and_expression _)*
    { return rhs.reduce(function(lhs, rhs) { return Expression.BinaryOp(lhs, rhs[2], rhs[0]); }, lhs); }
and_expression =
    lhs:comp_expression _ rhs:('&&' _ comp_expression _)*
    { return rhs.reduce(function(lhs, rhs) { return Expression.BinaryOp(lhs, rhs[2], rhs[0]); }, lhs); }
comp_expression =
    lhs:add_expression _ rhs:(comparator _ add_expression _)*
    { return rhs.reduce(function(lhs, rhs) { return Expression.BinaryOp(lhs, rhs[2], rhs[0]); }, lhs); }
add_expression =
    lhs:mult_expression _ rhs:(('+'/'-') _ mult_expression _)*
    { return rhs.reduce(function(lhs, rhs) { return Expression.BinaryOp(lhs, rhs[2], rhs[0]); }, lhs); }
mult_expression =
    lhs:unary_expression _ rhs:(('*'/'/') _ unary_expression _)*
    { return rhs.reduce(function(lhs, rhs) { return Expression.BinaryOp(lhs, rhs[2], rhs[0]); }, lhs); }
unary_expression =
    op:('!'/'-') _ arg:unary_expression { return Expression.UnaryOp(arg, op); } /
    member_expression
member_expression =
    lhs:primary_expression member:(_ '.' _ ident)?
    { return member !== null ? Expression.MemberRef(lhs, member[3]) : lhs; }
primary_expression = literal_expression / function_call /
    array_literal /
    name:ident
    { return Expression.VarRef(name); } /
    '(' _ first:expression _ rest:(',' _ expression _)+ ')'
    { return Expression.Tuple([first].concat(take(rest, 2))); } /
    '(' _ subexp:expression _ comma:(',' _)? ')'
    { return comma !== null ? Expression.Tuple([subexp]) : subexp; }
function_call = '$' name:ident '(' _ args:expr_param_list? _ ')' {
    return Expression.FunctionCall(name, args === null ? [] : args);
}
expr_param_list = first:expression _ rest:(',' _ expression _)* {
    return [first].concat(take(rest, 2))
}
array_literal = '[' _ ']' { return Expression.Array([]); } /
    '[' _ first:expression _ rest:(',' _ expression _)* ']' { return Expression.Array([first].concat(take(rest, 2))); }
literal_expression = val:literal {
    return Expression.Constant(val);
}
literal "literal" = val:literal_bool { return Value.Boolean(val); } /
    val:literal_string { return Value.String(val); } /
    val:literal_number '%' { return Value.Number(val / 100); } /
    val:literal_number unit:ident { return Value.Measure(val, unit); } /
    val:literal_number { return Value.Number(val); }

type_ref = 'Measure' _ '(' _ unit:ident? _ ')' { return Type.Measure(unit); } /
    'Array' _ '(' _ type:type_ref _ ')' { return Type.Array(type); } /
    'Map' _ '(' _ key:type_ref _ ',' _ value:type_ref _ ')' { return Type.Map(key, value); } /
    'Enum' _ '(' _ first:ident _ rest:(',' _ ident _)* _ ')' { return Type.Enum([first].concat(take(rest, 2))); } /
    'EmailAddress' { return Type.EmailAddress } /
    'PhoneNumber' { return Type.PhoneNumber } /
    'Any' { return Type.Any; } /
    'Boolean' { return Type.Boolean; } /
    ('String' / 'Password') { return Type.String; } /
    'Number' { return Type.Number; } /
    'Location' { return Type.Location; } /
    'Date' { return Type.Date; } /
    'Time' { return Type.Time; } /
    'Picture' { return Type.Picture; } /
    'Resource' { return Type.Resource; } /
    'URL' { return Type.URL; } /
    'Username' { return Type.Username; } /
    'Hashtag' { return Type.Hashtag; } /
    'User' { return Type.User; } /
    '(' first:type_ref _ rest:(',' _ type_ref _)* ')' { return Type.Tuple([first].concat(take(rest, 2))); } /
    invalid:ident { throw new TypeError("Invalid type " + invalid); }

// tokens

comparator "comparator" = '>=' / '<=' / '>' / '<' / '=~' / ('=' !'>') { return '='; } / '!='

literal_bool = true_bool { return true; } / false_bool { return false; }
true_bool = 'on' / 'true'
false_bool = 'off' / 'false'

// dqstrchar = double quote string char
// sqstrchar = single quote string char
dqstrchar = [^\\\"] / "\\\"" { return '"'; } / "\\n" { return '\n'; } / "\\'" { return '\''; } / "\\\\" { return '\\'; }
sqstrchar = [^\\\'] / "\\\"" { return '"'; } / "\\n" { return '\n'; } / "\\'" { return '\''; } / "\\\\" { return '\\'; }
literal_string "string" = '"' chars:dqstrchar* '"' { return chars.join(''); }
    / "'" chars:sqstrchar* "'" { return chars.join(''); }
digit "digit" = [0-9]
literal_number "number" =
    num:$(digit+ '.' digit* ('e' digit+)?) { return parseFloat(num); } /
    num:$('.' digit+ ('e' digit+)?) { return parseFloat(num); } /
    num:$(digit+ ('e' digit+)?) { return parseFloat(num); }

identstart = [A-Za-z_]
identchar = [A-Za-z0-9_]
ident "ident" = $(identstart identchar*)

_ = (whitespace / comment)*
__ = whitespace _
whitespace "whitespace" = [ \r\n\t\v]
comment "comment" = '/*' ([^*] / '*'[^/])* '*/' / '//' [^\n]* '\n'
