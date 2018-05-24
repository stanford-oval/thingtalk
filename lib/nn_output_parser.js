// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingTalk
//
// Copyright 2017 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const Ast = require('./ast');
const Generate = require('./generate');
const { parseDate } = require('./date_utils');

/**
 * Differences with the actual NN Grammar (as written in
 * almond-nnparser/grammar/thingtalk.py):
 *
 * - almond-nnparser's grammar distinguishes $get and $do, while
 *   while this one uses just $call
 *   almond-nnparser can do that because it knows the full list of
 *   gets and dos (and knows that they don't interset), whereas here
 *   we have a single FUNCTION token
 * - almond-nnparser's grammar is typed around parameter types and
 *   constants, this one is not because otherwise it would be too unwieldly
 *   to write
 * - almond-nnparser uses different terminals for <entity>_i because
 *   it autogenerates the grammar; this grammar uses a single terminal
 *   <entity> plus a lexical analysis step because I was too lazy to write
 *   down all cases by hand
 *
 * Missing features, compared with full TT:
 * - single statement
 * - no complex selectors
 * - no remote primitives (yet)
 * - no declarations
 * - no multi-field projection
 * - no alias (in aggregate and as a table/stream operator)
 * - no compute
 *
 * Differences with full TT:
 * - all filter operators are infix
 * - multiple parameter passings are prefixed with on in a join
 * - function names are one token
 * - parameter names are prefixed with param:
 * - enum choices are prefixed with enum:
 * - units are prefixed with unit:
 * - relative locations are prefixed with location:
 *
 * What to keep in mind when writing the grammar:
 * - shifts are cheap, reduces are expensive
 * - adding more symbols to a rule only increases the number of shifts
 * - adding more non-terminals to the grammar increases the number of
 *   reduces
 * - splitting a rule into multiple non-terminals increases the number of
 *   reduces
 * - the breadth of reduces matters too
 * - the overall number of rules affects the breadth of reduces
 */

const identity = (x) => x;

// ignore the whole exports for coverage; coverage will occur of the copies
// of the functions that appear later
/* istanbul ignore next */
module.exports = {
    '$input':         [[['$program',], identity],
                       [['answer', '$constant'], (_, constant) => constant],
                       [['filter', '$filter'], (_, filter) => filter],
                       [['policy', '$policy'], (_, policy) => policy]],

    '$program':       [[['$rule',], (rule) => new Ast.Program([], [], [rule], null)],
                       [['executor', '=', '$constant_Entity(tt:username)', ':', '$rule'], (_1, _2, user, _3, rule) => new Ast.Program([], [], [rule], new Ast.Value.Entity(user.value, 'tt:username', null))]],

    '$policy':        [[['true', ':', '$policy_body'], (_1, _2, policy) => policy],
                       [['$filter', ':', '$policy_body'], (user, _, policy) => policy.set({ principal: user })]],

    '$policy_body':   [[['now', '=>', '$policy_fn'], (_1, _2, action) => new Ast.PermissionRule(Ast.BooleanExpression.True, Ast.PermissionFunction.Builtin, action)],
                       [['$policy_fn', '=>', 'notify'], (query, _1, _2) => new Ast.PermissionRule(Ast.BooleanExpression.True, query, Ast.PermissionFunction.Builtin)],
                       [['$policy_fn', '=>', '$policy_fn'], (query, _1, action) => new Ast.PermissionRule(Ast.BooleanExpression.True, query, action)]],

    '$policy_fn':     [[['*'], (_) => Ast.PermissionFunction.Star],
                       [['CLASS_STAR'], (klass) => new Ast.PermissionFunction.ClassStar(klass.value)],
                       [['FUNCTION'], (fn) => new Ast.PermissionFunction.Specified(fn.value.kind, fn.value.channel, Ast.BooleanExpression.True, null)],
                       [['FUNCTION', 'filter', '$filter'], (fn, _, filter) => new Ast.PermissionFunction.Specified(fn.value.kind, fn.value.channel, filter, null)]],

    '$rule':          [[['$stream', '=>', '$action'], (stream, _, action) => new Ast.Statement.Rule(stream, [action])],
                       [['now', '=>', '$table', '=>', '$action'], (_1, _2, table, _3, action) => new Ast.Statement.Command(table, [action])],
                       [['now', '=>', '$action'], (_1, _2, action) => new Ast.Statement.Command(null, [action])],
                       [['$rule', 'on', '$param_passing'], (rule, _, pp) => {
                           rule.actions[0].in_params.push(pp);
                           return rule;
                       }]],

    '$table':         [[['$call',], (get) => Ast.Table.Invocation(get, null)],
                       [['(', '$table', ')', 'filter', '$filter'], (_1, table, _2, _3, filter) => new Ast.Table.Filter(table, filter, null)],
                       [['aggregate', 'min', '$out_param', 'of', '(', '$table', ')'], (_1, op, field, _2, _3, table, _4) => new Ast.Table.Aggregation(table, field.name, op, null, null)],
                       [['aggregate', 'max', '$out_param', 'of', '(', '$table', ')'], (_1, op, field, _2, _3, table, _4) => new Ast.Table.Aggregation(table, field.name, op, null, null)],
                       [['aggregate', 'sum', '$out_param', 'of', '(', '$table', ')'], (_1, op, field, _2, _3, table, _4) => new Ast.Table.Aggregation(table, field.name, op, null, null)],
                       [['aggregate', 'avg', '$out_param', 'of', '(', '$table', ')'], (_1, op, field, _2, _3, table, _4) => new Ast.Table.Aggregation(table, field.name, op, null, null)],
                       [['aggregate', 'count', 'of', '(', '$table', ')'], (_1, op, _2, _3, table, _4) => new Ast.Table.Aggregation(table, '*', op, null, null)],
                       [['aggregate', 'argmin', '$out_param', '$constant_Number', ',', '$constant_Number', 'of', '(', '$table', ')'], (_1, op, field, base, _2, limit, _3, _4, table, _5) => new Ast.Table.ArgMinMax(table, field.name, op, null, null)],
                       [['aggregate', 'argmax', '$out_param', '$constant_Number', ',', '$constant_Number', 'of', '(', '$table', ')'], (_1, op, field, base, _2, limit, _3, _4, table, _5) => new Ast.Table.ArgMinMax(table, field.name, op, null, null)],
                       [['$table_join'], identity],
                       [['window', '$constant_Number', ',', '$constant_Number', 'of', '(', '$stream', ')'], (_1, base, _2, delta, _3, _4, stream, _5) => new Ast.Table.Window(base, delta, stream, null)],
                       [['timeseries', '$constant_Date', ',', '$constant_Measure(ms)', 'of', '(', '$stream', ')'], (_1, base, _2, delta, _3, _4, stream, _5) => new Ast.Table.TimeSeries(base, delta, stream, null)],
                       [['sequence', '$constant_Number', ',', '$constant_Number', 'of', '(', '$table', ')'], (_1, base, _2, delta, _3, _4, table, _5) => new Ast.Table.Sequence(base, delta, table, null)],
                       [['history', '$constant_Date', ',', '$constant_Measure(ms)', 'of', '(', '$table', ')'], (_1, base, _2, delta, _3, _4, table, _5) => new Ast.Table.History(base, delta, table, null)]],

    '$table_join':    [[['(', '$table', ')', 'join', '(', '$table', ')'], (_1, t1, _2, _3, _4, t2, _5) => new Ast.Table.Join(t1, t2, [], null)],
                       [['$table_join', 'on', '$param_passing'], (join, _, pp) => {
                           join.in_params.push(pp);
                           return join;
                       }]],

    '$stream':        [[['timer', 'base', '=', '$constant_Date', ',', 'interval', '=', '$constant_Measure(ms)'], (_1, _2, _3, base, _4, _5, _6, interval) => new Ast.Stream.Timer(base, interval, null)],
                       [['attimer', 'time', '=', '$constant_Time'], (_1, _2, _3, time) => new Ast.Stream.AtTimer(time, null)],
                       [['monitor', '(', '$table', ')'], (monitor, _1, table, _2) => new Ast.Stream.Monitor(table, null, null)],
                       [['monitor', '(', '$table', ')', 'on', 'new', '$out_param'], (monitor, _1, table, _2, _3, _4, pname) => new Ast.Stream.Monitor(table, [pname.name], null)],
                       [['monitor', '(', '$table', ')', 'on', 'new', '[', '$out_param_list', ']'], (monitor, _1, table, _2, _3, _4, _5, pnames, _6) => new Ast.Stream.Monitor(table, pnames.map((p) => p.name), null)],
                       [['edge', '(', '$stream', ')', 'on', '$filter'], (_1, _2, stream, _3, _4, filter) => new Ast.Stream.EdgeFilter(stream, filter, null)],
                       // edge on true is the equivalent of "only once"
                       [['edge', '(', '$stream', ')', 'on', 'true'], (_1, _2, stream, _3, _4, filter) => new Ast.Stream.EdgeFilter(stream, Ast.BooleanExpression.True, null)],
                       [['$stream_join'], identity]],

    '$stream_join':   [[['(', '$stream', ')', 'join', '(', '$table', ')'], (_1, s1, _2, _3, _4, t2, _5) => new Ast.Stream.Join(s1, t2, [], null)],
                       [['$stream_join', 'on', '$param_passing'], (join, _, pp) => {
                           join.in_params.push(pp);
                           return join;
                       }]],

    '$action':        [[['notify'], () => Generate.notifyAction()],
                       [['return'], () => Generate.notifyAction('return')],
                       [['$call'], identity]],

    '$call':          [[['FUNCTION'], (fn) => new Ast.Invocation(new Ast.Selector.Device(fn.value.kind, null, null), fn.value.channel, [], null)],
                       [['$call', '$const_param'], (inv, ip) => {
                           inv.in_params.push(ip);
                           return inv;
                       }]],

    '$param_passing': [[['PARAM_NAME', '=', '$out_param'], (pname, _1, out_param) => new Ast.InputParam(pname.value, out_param)],
                       [['PARAM_NAME', '=', 'event'], (pname, _1, _2) => new Ast.InputParam(pname.value, new Ast.Value.Event(null))]],

    '$const_param':   [[['PARAM_NAME', '=', '$constant'], (pname, _1, v) => new Ast.InputParam(pname.value, v)]],

    '$out_param':     [[['PARAM_NAME'], (pname) => new Ast.Value.VarRef(pname.value)]],

    '$out_param_list':[[['$out_param'], (pname) => [pname]],
                       [['$out_param_list', ',', '$out_param'], (list, _, pname) => list.concat(pname)]],

    // note that $filter is not recursive!
    // it must be in CNF form
    // also note that and takes priority over or
    // this is the opposite of regular TT (which copies JS in that respect)
    // because most filters are just a list of
    // "condition and this or that and foo or bar"
    // to be read as
    // "condition and (this or that) and (foo or bar)"
    '$filter':        [[['$or_filter'], identity],
                       [['$filter', 'and', '$or_filter'], (f1, _, f2) => new Ast.BooleanExpression.And([f1, f2])]],

    '$or_filter':     [[['$atom_filter'], identity],
                       [['not', '$atom_filter'], (_, f) => new Ast.BooleanExpression.Not(f)],
                       [['$or_filter', 'or', '$atom_filter'], (f1, _, f2) => new Ast.BooleanExpression.Or([f1, f2])]],

    '$atom_filter':   [[['PARAM_NAME', '$value_filter'], (pname, [op, v]) => new Ast.BooleanExpression.Atom(pname.value, op, v)],
                       [['$call', '{', '$filter', '}'], (fn, _1, filter, _3) => new Ast.BooleanExpression.External(fn.selector, fn.channel, fn.in_params, filter, fn.schema)]],

    // in almond-nnparser these are strongly typed constants, so only
    // numbers and measures can be compared for order, etc
    // we're a little looser here because otherwise it becomes unwieldly
    '$value_filter':  [[['==', '$constant'], (op, v) => [op, v]],
                       [['>=', '$constant'], (op, v) => [op, v]],
                       [['<=', '$constant'], (op, v) => [op, v]],
                       [['>', '$constant'], (op, v) => [op, v]],
                       [['<', '$constant'], (op, v) => [op, v]],
                       [['=~', '$constant'], (op, v) => [op, v]],
                       [['~=', '$constant'], (op, v) => [op, v]],
                       [['starts_with', '$constant'], (op, v) => [op, v]],
                       [['ends_with',  '$constant'], (op, v) => [op, v]],
                       [['prefix_of',  '$constant'], (op, v) => [op, v]],
                       [['suffix_of',  '$constant'], (op, v) => [op, v]],
                       [['contains',  '$constant'], (op, v) => [op, v]],
                       [['in_array',  '$constant_Array'], (op, v) => [op, v]],

                       [['==', '$out_param'], (op, v) => [op, v]],
                       [['>=', '$out_param'], (op, v) => [op, v]],
                       [['<=', '$out_param'], (op, v) => [op, v]],
                       [['>', '$out_param'], (op, v) => [op, v]],
                       [['<', '$out_param'], (op, v) => [op, v]],
                       [['=~', '$out_param'], (op, v) => [op, v]],
                       [['~=', '$out_param'], (op, v) => [op, v]],
                       [['starts_with', '$out_param'], (op, v) => [op, v]],
                       [['ends_with',  '$out_param'], (op, v) => [op, v]],
                       [['prefix_of',  '$out_param'], (op, v) => [op, v]],
                       [['suffix_of',  '$out_param'], (op, v) => [op, v]],
                       [['contains',  '$out_param'], (op, v) => [op, v]],
                       [['in_array',  '$out_param'], (op, v) => [op, v]]],

    // this non-terminal exists only for convenience
    // the almond nn-parser grammar does not have it
    '$constant':      [[['$constant_Array'], identity],
                       [['$constant_Boolean'], identity],
                       [['$constant_String'], identity],
                       [['$constant_Measure'], identity],
                       [['DURATION'], (tok) => new Ast.Value.Measure(tok.value.value, tok.value.unit)],
                       [['$constant_Number'], identity],
                       [['$constant_Currency'], identity],
                       [['$constant_Location'], identity],
                       [['$constant_Date'], identity],
                       [['$constant_Time'], identity],
                       [['$constant_Entity(unknown)'], identity],
                       [['$constant_Entity(tt:username)'], identity],
                       [['$constant_Entity(tt:hashtag)'], identity],
                       [['$constant_Entity(tt:phone_number)'], identity],
                       [['$constant_Entity(tt:email_address)'], identity],
                       [['$constant_Entity(tt:path_name)'], identity],
                       [['$constant_Entity(tt:url)'], identity],
                       [['$constant_Entity(tt:device)'], identity],
                       [['$constant_Entity(tt:function)'], identity],
                       [['$constant_Entity(tt:picture)'], identity],
                       [['$constant_Enum'], identity],
                       [['SLOT'], (slot) => slot.value === undefined ? Ast.Value.Undefined(true) : slot.value]],

    // we cannot represent an empty array
    // I don't think that's useful anyway
    '$constant_Array': [[['[', '$constant_array_values', ']'], (_1, values, _2) => new Ast.Value.Array(values)]],

    '$constant_array_values': [[['$constant'], (v) => [v]],
                               [['$constant_array_values', ',', '$constant'], (array, _, v) => {
                                   array.push(v);
                                   return array;
                               }]],

    '$constant_Boolean': [[['true'], () => new Ast.Value.Boolean(true)],
                          [['false'], () => new Ast.Value.Boolean(false)]],

    '$constant_String': [[['""'], (str) => new Ast.Value.String('')],
                         [['QUOTED_STRING'], (str) => new Ast.Value.String(str.value)]],

    // play fast and loose with units here, because I don't want to write
    // everything by hand
    // almond-nnparser autogenerates this part
    '$constant_Measure': [[['$constant_Number', 'UNIT'], (num, unit) => new Ast.Value.Measure(num.value, unit.value)],
                          [['$constant_Measure', '$constant_Number', 'UNIT'], (v1, num, unit) => {
                              if (v1.isCompoundMeasure) {
                                  v1.value.push(new Ast.Value.Measure(num.value, unit.value));
                                  return v1;
                              } else {
                                  return new Ast.Value.CompoundMeasure([v1, new Ast.Value.Measure(num.value, unit.value)]);
                              }
                          }]],
    '$constant_Measure(ms)': [[['$constant_Measure'], identity],
                              [['DURATION'], (tok) => new Ast.Value.Measure(tok.value.value, tok.value.unit)]],

    '$constant_Number': [[['NUMBER'], (num) => new Ast.Value.Number(num.value)],
                         [['1'], () => new Ast.Value.Number(1)],
                         [['0'], () => new Ast.Value.Number(0)]],

    '$constant_Currency': [[['CURRENCY'], (tok) => new Ast.Value.Currency(tok.value.value, tok.value.unit)]],

    '$constant_Location': [[['location:current_location'], (tag) => new Ast.Value.Location(new Ast.Location.Relative(tag.substr('location:'.length)))],
                           [['location:home'], (tag) => new Ast.Value.Location(new Ast.Location.Relative(tag.substr('location:'.length)))],
                           [['location:work'], (tag) => new Ast.Value.Location(new Ast.Location.Relative(tag.substr('location:'.length)))],
                           [['LOCATION'], (loc) => new Ast.Value.Location(new Ast.Location.Absolute(loc.value.latitude, loc.value.longitude, loc.value.display||null))]],

    // start_of/end_of with less than 1h are not supported
    // (they don't make sense)
    '$constant_Date': [[['now'], (loc) => new Ast.Value.Date(null, '+', null)],
                       [['start_of', 'UNIT'], (edge, unit) => new Ast.Value.Date(new Ast.DateEdge(edge, unit.value), '+', null)],
                       [['end_of', 'UNIT'], (edge, unit) => new Ast.Value.Date(new Ast.DateEdge(edge, unit.value), '+', null)],
                       [['DATE'], (abs) => new Ast.Value.Date(parseDate(abs.value), '+', null)],
                       [['$constant_Date', '+', '$constant_Measure(ms)'], (date, op, offset) => new Ast.Value.Date(date.value, op, offset)],
                       [['$constant_Date', '-', '$constant_Measure(ms)'], (date, op, offset) => new Ast.Value.Date(date.value, op, offset)]],

    '$constant_Time': [[['TIME'], (time) => new Ast.Value.Time(time.value.hour, time.value.minute, time.value.second||0)]],

    // almond-nnparser expands this into the various enums in the right
    // place for a parameter (as the meaning of an enum changes according
    // to the parameter anyway)
    '$constant_Enum': [[['ENUM'], (venum) => new Ast.Value.Enum(venum.value)]],

    '$constant_Entity(unknown)': [[['GENERIC_ENTITY'], (entity) => new Ast.Value.Entity(entity.value.value, entity.value.type, entity.value.display)]],

    '$constant_Entity(tt:username)': [[['USERNAME'], (entity) => new Ast.Value.Entity(entity.value, 'tt:username', null)]],

    '$constant_Entity(tt:hashtag)': [[['HASHTAG'], (entity) => new Ast.Value.Entity(entity.value, 'tt:hashtag', null)]],

    '$constant_Entity(tt:url)': [[['URL'], (entity) => new Ast.Value.Entity(entity.value, 'tt:url', null)]],

    '$constant_Entity(tt:phone_number)': [[['PHONE_NUMBER'], (entity) => new Ast.Value.Entity(entity.value, 'tt:phone_number', null)]],

    '$constant_Entity(tt:email_address)': [[['EMAIL_ADDRESS'], (entity) => new Ast.Value.Entity(entity.value, 'tt:email_address', null)]],

    '$constant_Entity(tt:path_name)': [[['PATH_NAME'], (entity) => new Ast.Value.Entity(entity.value, 'tt:path_name', null)]],

    '$constant_Entity(tt:device)': [[['DEVICE'], (entity) => new Ast.Value.Entity(entity.value, 'tt:device', null)]],

    '$constant_Entity(tt:function)': [[['FUNCTION'], (entity) => new Ast.Value.Entity(entity.kind + ':' + entity.device, 'tt:function', null)]],

    '$constant_Entity(tt:picture)': [[['PICTURE'], (entity) => new Ast.Value.Entity(entity.value, 'tt:picture', null)]],
};

const TERMINAL_IDS = {"0":7,"1":8,"\"\"":0,"(":1,")":2,"*":3,"+":4,",":5,"-":6,":":9,"<":10,"<<EOF>>":11,"<=":12,"=":13,"==":14,"=>":15,"=~":16,">":17,">=":18,"CLASS_STAR":19,"CURRENCY":20,"DATE":21,"DEVICE":22,"DURATION":23,"EMAIL_ADDRESS":24,"ENUM":25,"FUNCTION":26,"GENERIC_ENTITY":27,"HASHTAG":28,"LOCATION":29,"NUMBER":30,"PARAM_NAME":31,"PATH_NAME":32,"PHONE_NUMBER":33,"PICTURE":34,"QUOTED_STRING":35,"SLOT":36,"TIME":37,"UNIT":38,"URL":39,"USERNAME":40,"[":41,"]":42,"aggregate":43,"and":44,"answer":45,"argmax":46,"argmin":47,"attimer":48,"avg":49,"base":50,"contains":51,"count":52,"edge":53,"end_of":54,"ends_with":55,"event":56,"executor":57,"false":58,"filter":59,"history":60,"in_array":61,"interval":62,"join":63,"location:current_location":64,"location:home":65,"location:work":66,"max":67,"min":68,"monitor":69,"new":70,"not":71,"notify":72,"now":73,"of":74,"on":75,"or":76,"policy":77,"prefix_of":78,"return":79,"sequence":80,"start_of":81,"starts_with":82,"suffix_of":83,"sum":84,"time":85,"timer":86,"timeseries":87,"true":88,"window":89,"{":90,"}":91,"~=":92};
const RULE_NON_TERMINALS = [29,29,29,29,37,37,34,34,35,35,35,36,36,36,36,38,38,38,38,41,41,41,41,41,41,41,41,41,41,41,41,41,41,42,42,39,39,39,39,39,39,39,39,40,40,1,1,1,3,3,33,33,4,31,32,32,28,28,30,30,30,2,2,43,43,43,43,43,43,43,43,43,43,43,43,43,43,43,43,43,43,43,43,43,43,43,43,43,43,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,6,27,27,7,7,25,25,22,22,23,23,24,24,24,8,21,21,21,21,9,9,9,9,9,9,26,20,19,18,13,17,15,11,14,10,12,16,0];
const ARITY = [1,2,2,2,1,5,3,3,3,3,3,1,1,1,3,3,5,3,3,1,5,7,7,7,7,6,10,10,1,8,8,8,8,7,3,8,4,4,7,9,6,6,1,7,3,1,1,1,1,2,3,3,3,1,1,3,1,3,1,2,3,2,4,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,3,1,3,1,1,1,1,2,3,1,1,1,1,1,1,1,1,1,1,1,2,2,1,3,3,1,1,1,1,1,1,1,1,1,1,1,1,2];
const GOTO = [{"29":2,"37":9,"38":1,"39":7,"40":14},{},{},{"5":18,"6":45,"7":19,"8":24,"9":26,"10":35,"11":32,"12":36,"13":30,"14":33,"15":31,"16":37,"17":34,"18":29,"19":28,"20":38,"21":25,"22":21,"24":23,"25":20,"26":27},{"2":71,"3":74,"28":69,"30":70},{"2":71,"3":74,"28":77,"30":70,"34":76},{},{},{},{},{},{},{},{},{},{"39":88,"40":14},{"33":89},{},{},{},{},{"24":91},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{"5":98,"6":45,"7":19,"8":24,"9":26,"10":35,"11":32,"12":36,"13":30,"14":33,"15":31,"16":37,"17":34,"18":29,"19":28,"20":38,"21":25,"22":21,"24":23,"25":20,"26":27,"27":97},{},{},{},{"2":101,"3":74},{"43":103},{"4":117},{},{},{},{},{"18":121},{"1":122,"3":125},{"1":130,"3":128,"41":127,"42":131},{},{},{"3":140,"41":139,"42":131},{"39":141,"40":14},{"33":142},{},{},{},{},{},{},{"22":148,"23":147,"24":150},{"22":148,"23":151,"24":150},{},{},{},{},{"2":71,"3":74,"30":154},{"2":155,"3":74},{},{"6":156,"31":157},{},{"5":159,"6":45,"7":19,"8":24,"9":26,"10":35,"11":32,"12":36,"13":30,"14":33,"15":31,"16":37,"17":34,"18":29,"19":28,"20":38,"21":25,"22":21,"24":23,"25":20,"26":27,"31":160},{"5":161,"6":45,"7":19,"8":24,"9":26,"10":35,"11":32,"12":36,"13":30,"14":33,"15":31,"16":37,"17":34,"18":29,"19":28,"20":38,"21":25,"22":21,"24":23,"25":20,"26":27,"31":162},{"5":163,"6":45,"7":19,"8":24,"9":26,"10":35,"11":32,"12":36,"13":30,"14":33,"15":31,"16":37,"17":34,"18":29,"19":28,"20":38,"21":25,"22":21,"24":23,"25":20,"26":27,"31":164},{"5":165,"6":45,"7":19,"8":24,"9":26,"10":35,"11":32,"12":36,"13":30,"14":33,"15":31,"16":37,"17":34,"18":29,"19":28,"20":38,"21":25,"22":21,"24":23,"25":20,"26":27,"31":166},{"5":167,"6":45,"7":19,"8":24,"9":26,"10":35,"11":32,"12":36,"13":30,"14":33,"15":31,"16":37,"17":34,"18":29,"19":28,"20":38,"21":25,"22":21,"24":23,"25":20,"26":27,"31":168},{"5":169,"6":45,"7":19,"8":24,"9":26,"10":35,"11":32,"12":36,"13":30,"14":33,"15":31,"16":37,"17":34,"18":29,"19":28,"20":38,"21":25,"22":21,"24":23,"25":20,"26":27,"31":170},{"5":171,"6":45,"7":19,"8":24,"9":26,"10":35,"11":32,"12":36,"13":30,"14":33,"15":31,"16":37,"17":34,"18":29,"19":28,"20":38,"21":25,"22":21,"24":23,"25":20,"26":27,"31":172},{"5":173,"6":45,"7":19,"8":24,"9":26,"10":35,"11":32,"12":36,"13":30,"14":33,"15":31,"16":37,"17":34,"18":29,"19":28,"20":38,"21":25,"22":21,"24":23,"25":20,"26":27,"31":174},{"5":175,"6":45,"7":19,"8":24,"9":26,"10":35,"11":32,"12":36,"13":30,"14":33,"15":31,"16":37,"17":34,"18":29,"19":28,"20":38,"21":25,"22":21,"24":23,"25":20,"26":27,"31":176},{"5":177,"6":45,"7":19,"8":24,"9":26,"10":35,"11":32,"12":36,"13":30,"14":33,"15":31,"16":37,"17":34,"18":29,"19":28,"20":38,"21":25,"22":21,"24":23,"25":20,"26":27,"31":178},{"5":179,"6":45,"7":19,"8":24,"9":26,"10":35,"11":32,"12":36,"13":30,"14":33,"15":31,"16":37,"17":34,"18":29,"19":28,"20":38,"21":25,"22":21,"24":23,"25":20,"26":27,"31":180},{"5":181,"6":45,"7":19,"8":24,"9":26,"10":35,"11":32,"12":36,"13":30,"14":33,"15":31,"16":37,"17":34,"18":29,"19":28,"20":38,"21":25,"22":21,"24":23,"25":20,"26":27,"31":182},{"2":71,"3":74,"28":183,"30":70},{},{},{"35":185,"36":187},{"35":191,"36":187},{},{},{},{},{"4":117},{},{},{"4":117},{"3":140,"41":202,"42":131},{},{},{"24":204},{"9":205},{"24":206},{"9":207},{"9":208},{"26":209},{},{},{"4":117},{},{},{"3":140,"41":212,"42":131},{},{"31":214},{},{},{"24":91},{},{},{},{},{"5":216,"6":45,"7":19,"8":24,"9":26,"10":35,"11":32,"12":36,"13":30,"14":33,"15":31,"16":37,"17":34,"18":29,"19":28,"20":38,"21":25,"22":21,"24":23,"25":20,"26":27},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{"5":218,"6":45,"7":19,"8":24,"9":26,"10":35,"11":32,"12":36,"13":30,"14":33,"15":31,"16":37,"17":34,"18":29,"19":28,"20":38,"21":25,"22":21,"24":23,"25":20,"26":27},{},{},{},{},{},{},{},{"38":222,"39":7,"40":14},{"31":223},{"31":224},{"31":225},{"31":226},{},{"31":228},{"31":229},{"1":230,"3":125},{},{},{"33":232},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{"36":242},{"36":244},{"2":71,"3":74,"28":245,"30":70},{},{},{},{},{},{},{"24":251},{"24":252},{},{},{},{"24":255},{"22":148,"23":256,"24":150},{"24":257},{"22":148,"23":258,"24":150},{},{},{"2":71,"3":74,"28":261,"30":70},{},{"3":140,"41":263,"42":131},{},{},{},{},{},{},{},{},{"3":140,"41":268,"42":131},{},{},{"2":71,"3":74,"28":271,"30":70},{},{},{},{},{},{},{"31":279},{},{},{},{"3":140,"41":281,"42":131},{"3":140,"41":282,"42":131},{"3":140,"41":283,"42":131},{"3":140,"41":284,"42":131},{},{"24":286},{"24":287},{},{"3":140,"41":288,"42":131},{},{},{},{},{"22":148,"23":293,"24":150},{"31":295,"32":294},{},{},{},{},{},{},{},{},{},{},{"39":303,"40":14},{"39":304,"40":14},{"3":140,"41":305,"42":131},{"3":140,"41":306,"42":131},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{"31":315},{"3":140,"41":316,"42":131},{"3":140,"41":317,"42":131},{},{},{},{},{},{},{},{},{}];
const PARSER_ACTION = [{"1":[1,15],"45":[1,3],"48":[1,11],"53":[1,13],"57":[1,6],"59":[1,4],"69":[1,12],"73":[1,8],"77":[1,5],"86":[1,10]},{"11":[2,4],"75":[1,16]},{"11":[0]},{"0":[1,64],"7":[1,63],"8":[1,62],"20":[1,60],"21":[1,55],"22":[1,43],"23":[1,22],"24":[1,46],"25":[1,40],"26":[1,42],"27":[1,50],"28":[1,48],"29":[1,59],"30":[1,61],"32":[1,17],"33":[1,47],"34":[1,41],"35":[1,65],"36":[1,39],"37":[1,51],"39":[1,44],"40":[1,49],"41":[1,68],"54":[1,54],"58":[1,67],"64":[1,56],"65":[1,57],"66":[1,58],"73":[1,52],"81":[1,53],"88":[1,66]},{"26":[1,75],"31":[1,73],"71":[1,72]},{"26":[1,75],"31":[1,73],"71":[1,72],"88":[1,78]},{"13":[1,79]},{"15":[1,80]},{"15":[1,81]},{"11":[2,0]},{"50":[1,82]},{"85":[1,83]},{"1":[1,84]},{"1":[1,85]},{"2":[2,42],"15":[2,42],"75":[1,86]},{"1":[1,15],"48":[1,11],"53":[1,13],"69":[1,87],"86":[1,10]},{"31":[1,90]},{"2":[2,144],"5":[2,144],"9":[2,144],"11":[2,144],"15":[2,144],"31":[2,144],"42":[2,144],"44":[2,144],"75":[2,144],"76":[2,144],"90":[2,144],"91":[2,144]},{"11":[2,1]},{"2":[2,90],"5":[2,90],"9":[2,90],"11":[2,90],"15":[2,90],"31":[2,90],"42":[2,90],"44":[2,90],"75":[2,90],"76":[2,90],"90":[2,90],"91":[2,90]},{"2":[2,91],"5":[2,91],"9":[2,91],"11":[2,91],"15":[2,91],"31":[2,91],"42":[2,91],"44":[2,91],"75":[2,91],"76":[2,91],"90":[2,91],"91":[2,91]},{"2":[2,92],"5":[2,92],"7":[1,63],"8":[1,62],"9":[2,92],"11":[2,92],"15":[2,92],"30":[1,61],"31":[2,92],"42":[2,92],"44":[2,92],"75":[2,92],"76":[2,92],"90":[2,92],"91":[2,92]},{"2":[2,93],"5":[2,93],"9":[2,93],"11":[2,93],"15":[2,93],"31":[2,93],"42":[2,93],"44":[2,93],"75":[2,93],"76":[2,93],"90":[2,93],"91":[2,93]},{"2":[2,94],"5":[2,94],"9":[2,94],"11":[2,94],"15":[2,94],"31":[2,94],"38":[1,92],"42":[2,94],"44":[2,94],"75":[2,94],"76":[2,94],"90":[2,94],"91":[2,94]},{"2":[2,95],"5":[2,95],"9":[2,95],"11":[2,95],"15":[2,95],"31":[2,95],"42":[2,95],"44":[2,95],"75":[2,95],"76":[2,95],"90":[2,95],"91":[2,95]},{"2":[2,96],"5":[2,96],"9":[2,96],"11":[2,96],"15":[2,96],"31":[2,96],"42":[2,96],"44":[2,96],"75":[2,96],"76":[2,96],"90":[2,96],"91":[2,96]},{"2":[2,97],"4":[1,93],"5":[2,97],"6":[1,94],"9":[2,97],"11":[2,97],"15":[2,97],"31":[2,97],"42":[2,97],"44":[2,97],"75":[2,97],"76":[2,97],"90":[2,97],"91":[2,97]},{"2":[2,98],"5":[2,98],"9":[2,98],"11":[2,98],"15":[2,98],"31":[2,98],"42":[2,98],"44":[2,98],"75":[2,98],"76":[2,98],"90":[2,98],"91":[2,98]},{"2":[2,99],"5":[2,99],"9":[2,99],"11":[2,99],"15":[2,99],"31":[2,99],"42":[2,99],"44":[2,99],"75":[2,99],"76":[2,99],"90":[2,99],"91":[2,99]},{"2":[2,100],"5":[2,100],"9":[2,100],"11":[2,100],"15":[2,100],"31":[2,100],"42":[2,100],"44":[2,100],"75":[2,100],"76":[2,100],"90":[2,100],"91":[2,100]},{"2":[2,101],"5":[2,101],"9":[2,101],"11":[2,101],"15":[2,101],"31":[2,101],"42":[2,101],"44":[2,101],"75":[2,101],"76":[2,101],"90":[2,101],"91":[2,101]},{"2":[2,102],"5":[2,102],"9":[2,102],"11":[2,102],"15":[2,102],"31":[2,102],"42":[2,102],"44":[2,102],"75":[2,102],"76":[2,102],"90":[2,102],"91":[2,102]},{"2":[2,103],"5":[2,103],"9":[2,103],"11":[2,103],"15":[2,103],"31":[2,103],"42":[2,103],"44":[2,103],"75":[2,103],"76":[2,103],"90":[2,103],"91":[2,103]},{"2":[2,104],"5":[2,104],"9":[2,104],"11":[2,104],"15":[2,104],"31":[2,104],"42":[2,104],"44":[2,104],"75":[2,104],"76":[2,104],"90":[2,104],"91":[2,104]},{"2":[2,105],"5":[2,105],"9":[2,105],"11":[2,105],"15":[2,105],"31":[2,105],"42":[2,105],"44":[2,105],"75":[2,105],"76":[2,105],"90":[2,105],"91":[2,105]},{"2":[2,106],"5":[2,106],"9":[2,106],"11":[2,106],"15":[2,106],"31":[2,106],"42":[2,106],"44":[2,106],"75":[2,106],"76":[2,106],"90":[2,106],"91":[2,106]},{"2":[2,107],"5":[2,107],"9":[2,107],"11":[2,107],"15":[2,107],"31":[2,107],"42":[2,107],"44":[2,107],"75":[2,107],"76":[2,107],"90":[2,107],"91":[2,107]},{"2":[2,108],"5":[2,108],"9":[2,108],"11":[2,108],"15":[2,108],"31":[2,108],"42":[2,108],"44":[2,108],"75":[2,108],"76":[2,108],"90":[2,108],"91":[2,108]},{"2":[2,109],"5":[2,109],"9":[2,109],"11":[2,109],"15":[2,109],"31":[2,109],"42":[2,109],"44":[2,109],"75":[2,109],"76":[2,109],"90":[2,109],"91":[2,109]},{"2":[2,110],"5":[2,110],"9":[2,110],"11":[2,110],"15":[2,110],"31":[2,110],"42":[2,110],"44":[2,110],"75":[2,110],"76":[2,110],"90":[2,110],"91":[2,110]},{"2":[2,137],"5":[2,137],"9":[2,137],"11":[2,137],"15":[2,137],"31":[2,137],"42":[2,137],"44":[2,137],"75":[2,137],"76":[2,137],"90":[2,137],"91":[2,137]},{"2":[2,147],"5":[2,147],"9":[2,147],"11":[2,147],"15":[2,147],"31":[2,147],"42":[2,147],"44":[2,147],"75":[2,147],"76":[2,147],"90":[2,147],"91":[2,147]},{"2":[2,146],"5":[2,146],"9":[2,146],"11":[2,146],"15":[2,146],"31":[2,146],"42":[2,146],"44":[2,146],"75":[2,146],"76":[2,146],"90":[2,146],"91":[2,146]},{"2":[2,145],"5":[2,145],"9":[2,145],"11":[2,145],"15":[2,145],"31":[2,145],"42":[2,145],"44":[2,145],"75":[2,145],"76":[2,145],"90":[2,145],"91":[2,145]},{"2":[2,141],"5":[2,141],"9":[2,141],"11":[2,141],"15":[2,141],"31":[2,141],"42":[2,141],"44":[2,141],"75":[2,141],"76":[2,141],"90":[2,141],"91":[2,141]},{"2":[2,89],"5":[2,89],"9":[2,89],"11":[2,89],"15":[2,89],"31":[2,89],"42":[2,89],"44":[2,89],"75":[2,89],"76":[2,89],"90":[2,89],"91":[2,89]},{"2":[2,143],"5":[2,143],"9":[2,143],"11":[2,143],"15":[2,143],"31":[2,143],"42":[2,143],"44":[2,143],"75":[2,143],"76":[2,143],"90":[2,143],"91":[2,143]},{"2":[2,142],"5":[2,142],"9":[2,142],"11":[2,142],"15":[2,142],"31":[2,142],"42":[2,142],"44":[2,142],"75":[2,142],"76":[2,142],"90":[2,142],"91":[2,142]},{"2":[2,140],"5":[2,140],"9":[2,140],"11":[2,140],"15":[2,140],"31":[2,140],"42":[2,140],"44":[2,140],"75":[2,140],"76":[2,140],"90":[2,140],"91":[2,140]},{"2":[2,139],"5":[2,139],"9":[2,139],"11":[2,139],"15":[2,139],"31":[2,139],"42":[2,139],"44":[2,139],"75":[2,139],"76":[2,139],"90":[2,139],"91":[2,139]},{"2":[2,138],"5":[2,138],"9":[2,138],"11":[2,138],"15":[2,138],"31":[2,138],"42":[2,138],"44":[2,138],"75":[2,138],"76":[2,138],"90":[2,138],"91":[2,138]},{"2":[2,136],"5":[2,136],"9":[2,136],"11":[2,136],"15":[2,136],"31":[2,136],"42":[2,136],"44":[2,136],"75":[2,136],"76":[2,136],"90":[2,136],"91":[2,136]},{"2":[2,130],"4":[2,130],"5":[2,130],"6":[2,130],"9":[2,130],"11":[2,130],"15":[2,130],"31":[2,130],"42":[2,130],"44":[2,130],"75":[2,130],"76":[2,130],"90":[2,130],"91":[2,130]},{"38":[1,95]},{"38":[1,96]},{"2":[2,133],"4":[2,133],"5":[2,133],"6":[2,133],"9":[2,133],"11":[2,133],"15":[2,133],"31":[2,133],"42":[2,133],"44":[2,133],"75":[2,133],"76":[2,133],"90":[2,133],"91":[2,133]},{"2":[2,126],"5":[2,126],"9":[2,126],"11":[2,126],"15":[2,126],"31":[2,126],"42":[2,126],"44":[2,126],"75":[2,126],"76":[2,126],"90":[2,126],"91":[2,126]},{"2":[2,127],"5":[2,127],"9":[2,127],"11":[2,127],"15":[2,127],"31":[2,127],"42":[2,127],"44":[2,127],"75":[2,127],"76":[2,127],"90":[2,127],"91":[2,127]},{"2":[2,128],"5":[2,128],"9":[2,128],"11":[2,128],"15":[2,128],"31":[2,128],"42":[2,128],"44":[2,128],"75":[2,128],"76":[2,128],"90":[2,128],"91":[2,128]},{"2":[2,129],"5":[2,129],"9":[2,129],"11":[2,129],"15":[2,129],"31":[2,129],"42":[2,129],"44":[2,129],"75":[2,129],"76":[2,129],"90":[2,129],"91":[2,129]},{"2":[2,125],"5":[2,125],"9":[2,125],"11":[2,125],"15":[2,125],"31":[2,125],"42":[2,125],"44":[2,125],"75":[2,125],"76":[2,125],"90":[2,125],"91":[2,125]},{"2":[2,122],"5":[2,122],"9":[2,122],"11":[2,122],"15":[2,122],"31":[2,122],"38":[2,122],"42":[2,122],"44":[2,122],"74":[2,122],"75":[2,122],"76":[2,122],"90":[2,122],"91":[2,122]},{"2":[2,123],"5":[2,123],"9":[2,123],"11":[2,123],"15":[2,123],"31":[2,123],"38":[2,123],"42":[2,123],"44":[2,123],"74":[2,123],"75":[2,123],"76":[2,123],"90":[2,123],"91":[2,123]},{"2":[2,124],"5":[2,124],"9":[2,124],"11":[2,124],"15":[2,124],"31":[2,124],"38":[2,124],"42":[2,124],"44":[2,124],"74":[2,124],"75":[2,124],"76":[2,124],"90":[2,124],"91":[2,124]},{"2":[2,116],"5":[2,116],"9":[2,116],"11":[2,116],"15":[2,116],"31":[2,116],"42":[2,116],"44":[2,116],"75":[2,116],"76":[2,116],"90":[2,116],"91":[2,116]},{"2":[2,117],"5":[2,117],"9":[2,117],"11":[2,117],"15":[2,117],"31":[2,117],"42":[2,117],"44":[2,117],"75":[2,117],"76":[2,117],"90":[2,117],"91":[2,117]},{"2":[2,114],"5":[2,114],"9":[2,114],"11":[2,114],"15":[2,114],"31":[2,114],"42":[2,114],"44":[2,114],"75":[2,114],"76":[2,114],"90":[2,114],"91":[2,114]},{"2":[2,115],"5":[2,115],"9":[2,115],"11":[2,115],"15":[2,115],"31":[2,115],"42":[2,115],"44":[2,115],"75":[2,115],"76":[2,115],"90":[2,115],"91":[2,115]},{"0":[1,64],"7":[1,63],"8":[1,62],"20":[1,60],"21":[1,55],"22":[1,43],"23":[1,22],"24":[1,46],"25":[1,40],"26":[1,42],"27":[1,50],"28":[1,48],"29":[1,59],"30":[1,61],"32":[1,17],"33":[1,47],"34":[1,41],"35":[1,65],"36":[1,39],"37":[1,51],"39":[1,44],"40":[1,49],"41":[1,68],"54":[1,54],"58":[1,67],"64":[1,56],"65":[1,57],"66":[1,58],"73":[1,52],"81":[1,53],"88":[1,66]},{"11":[2,2],"44":[1,99]},{"2":[2,56],"9":[2,56],"11":[2,56],"15":[2,56],"44":[2,56],"76":[1,100],"91":[2,56]},{"2":[2,58],"9":[2,58],"11":[2,58],"15":[2,58],"44":[2,58],"76":[2,58],"91":[2,58]},{"26":[1,75],"31":[1,73]},{"10":[1,107],"12":[1,105],"14":[1,115],"16":[1,108],"17":[1,106],"18":[1,104],"51":[1,114],"55":[1,111],"61":[1,102],"78":[1,112],"82":[1,110],"83":[1,113],"92":[1,109]},{"31":[1,118],"90":[1,116]},{"2":[2,48],"11":[2,48],"15":[2,48],"31":[2,48],"75":[2,48],"90":[2,48]},{"11":[2,3]},{"9":[1,119],"44":[1,99]},{"9":[1,120]},{"40":[1,49]},{"26":[1,75],"72":[1,123],"79":[1,124]},{"1":[1,129],"26":[1,75],"43":[1,126],"60":[1,135],"72":[1,123],"79":[1,124],"80":[1,134],"87":[1,133],"89":[1,132]},{"13":[1,136]},{"13":[1,137]},{"1":[1,129],"26":[1,75],"43":[1,138],"60":[1,135],"80":[1,134],"87":[1,133],"89":[1,132]},{"1":[1,15],"48":[1,11],"53":[1,13],"69":[1,87],"86":[1,10]},{"31":[1,90]},{"1":[1,143]},{"2":[1,144]},{"11":[2,18],"75":[2,18]},{"13":[1,145]},{"38":[1,146]},{"2":[2,118],"4":[2,118],"5":[2,118],"6":[2,118],"7":[2,118],"8":[2,118],"9":[2,118],"11":[2,118],"15":[2,118],"30":[2,118],"31":[2,118],"42":[2,118],"44":[2,118],"74":[2,118],"75":[2,118],"76":[2,118],"90":[2,118],"91":[2,118]},{"7":[1,63],"8":[1,62],"23":[1,149],"30":[1,61]},{"7":[1,63],"8":[1,62],"23":[1,149],"30":[1,61]},{"2":[2,131],"4":[2,131],"5":[2,131],"6":[2,131],"9":[2,131],"11":[2,131],"15":[2,131],"31":[2,131],"42":[2,131],"44":[2,131],"75":[2,131],"76":[2,131],"90":[2,131],"91":[2,131]},{"2":[2,132],"4":[2,132],"5":[2,132],"6":[2,132],"9":[2,132],"11":[2,132],"15":[2,132],"31":[2,132],"42":[2,132],"44":[2,132],"75":[2,132],"76":[2,132],"90":[2,132],"91":[2,132]},{"5":[1,153],"42":[1,152]},{"5":[2,112],"42":[2,112]},{"26":[1,75],"31":[1,73],"71":[1,72]},{"26":[1,75],"31":[1,73]},{"2":[2,59],"9":[2,59],"11":[2,59],"15":[2,59],"44":[2,59],"76":[2,59],"91":[2,59]},{"31":[1,158],"41":[1,68]},{"2":[2,61],"9":[2,61],"11":[2,61],"15":[2,61],"44":[2,61],"76":[2,61],"91":[2,61]},{"0":[1,64],"7":[1,63],"8":[1,62],"20":[1,60],"21":[1,55],"22":[1,43],"23":[1,22],"24":[1,46],"25":[1,40],"26":[1,42],"27":[1,50],"28":[1,48],"29":[1,59],"30":[1,61],"31":[1,158],"32":[1,17],"33":[1,47],"34":[1,41],"35":[1,65],"36":[1,39],"37":[1,51],"39":[1,44],"40":[1,49],"41":[1,68],"54":[1,54],"58":[1,67],"64":[1,56],"65":[1,57],"66":[1,58],"73":[1,52],"81":[1,53],"88":[1,66]},{"0":[1,64],"7":[1,63],"8":[1,62],"20":[1,60],"21":[1,55],"22":[1,43],"23":[1,22],"24":[1,46],"25":[1,40],"26":[1,42],"27":[1,50],"28":[1,48],"29":[1,59],"30":[1,61],"31":[1,158],"32":[1,17],"33":[1,47],"34":[1,41],"35":[1,65],"36":[1,39],"37":[1,51],"39":[1,44],"40":[1,49],"41":[1,68],"54":[1,54],"58":[1,67],"64":[1,56],"65":[1,57],"66":[1,58],"73":[1,52],"81":[1,53],"88":[1,66]},{"0":[1,64],"7":[1,63],"8":[1,62],"20":[1,60],"21":[1,55],"22":[1,43],"23":[1,22],"24":[1,46],"25":[1,40],"26":[1,42],"27":[1,50],"28":[1,48],"29":[1,59],"30":[1,61],"31":[1,158],"32":[1,17],"33":[1,47],"34":[1,41],"35":[1,65],"36":[1,39],"37":[1,51],"39":[1,44],"40":[1,49],"41":[1,68],"54":[1,54],"58":[1,67],"64":[1,56],"65":[1,57],"66":[1,58],"73":[1,52],"81":[1,53],"88":[1,66]},{"0":[1,64],"7":[1,63],"8":[1,62],"20":[1,60],"21":[1,55],"22":[1,43],"23":[1,22],"24":[1,46],"25":[1,40],"26":[1,42],"27":[1,50],"28":[1,48],"29":[1,59],"30":[1,61],"31":[1,158],"32":[1,17],"33":[1,47],"34":[1,41],"35":[1,65],"36":[1,39],"37":[1,51],"39":[1,44],"40":[1,49],"41":[1,68],"54":[1,54],"58":[1,67],"64":[1,56],"65":[1,57],"66":[1,58],"73":[1,52],"81":[1,53],"88":[1,66]},{"0":[1,64],"7":[1,63],"8":[1,62],"20":[1,60],"21":[1,55],"22":[1,43],"23":[1,22],"24":[1,46],"25":[1,40],"26":[1,42],"27":[1,50],"28":[1,48],"29":[1,59],"30":[1,61],"31":[1,158],"32":[1,17],"33":[1,47],"34":[1,41],"35":[1,65],"36":[1,39],"37":[1,51],"39":[1,44],"40":[1,49],"41":[1,68],"54":[1,54],"58":[1,67],"64":[1,56],"65":[1,57],"66":[1,58],"73":[1,52],"81":[1,53],"88":[1,66]},{"0":[1,64],"7":[1,63],"8":[1,62],"20":[1,60],"21":[1,55],"22":[1,43],"23":[1,22],"24":[1,46],"25":[1,40],"26":[1,42],"27":[1,50],"28":[1,48],"29":[1,59],"30":[1,61],"31":[1,158],"32":[1,17],"33":[1,47],"34":[1,41],"35":[1,65],"36":[1,39],"37":[1,51],"39":[1,44],"40":[1,49],"41":[1,68],"54":[1,54],"58":[1,67],"64":[1,56],"65":[1,57],"66":[1,58],"73":[1,52],"81":[1,53],"88":[1,66]},{"0":[1,64],"7":[1,63],"8":[1,62],"20":[1,60],"21":[1,55],"22":[1,43],"23":[1,22],"24":[1,46],"25":[1,40],"26":[1,42],"27":[1,50],"28":[1,48],"29":[1,59],"30":[1,61],"31":[1,158],"32":[1,17],"33":[1,47],"34":[1,41],"35":[1,65],"36":[1,39],"37":[1,51],"39":[1,44],"40":[1,49],"41":[1,68],"54":[1,54],"58":[1,67],"64":[1,56],"65":[1,57],"66":[1,58],"73":[1,52],"81":[1,53],"88":[1,66]},{"0":[1,64],"7":[1,63],"8":[1,62],"20":[1,60],"21":[1,55],"22":[1,43],"23":[1,22],"24":[1,46],"25":[1,40],"26":[1,42],"27":[1,50],"28":[1,48],"29":[1,59],"30":[1,61],"31":[1,158],"32":[1,17],"33":[1,47],"34":[1,41],"35":[1,65],"36":[1,39],"37":[1,51],"39":[1,44],"40":[1,49],"41":[1,68],"54":[1,54],"58":[1,67],"64":[1,56],"65":[1,57],"66":[1,58],"73":[1,52],"81":[1,53],"88":[1,66]},{"0":[1,64],"7":[1,63],"8":[1,62],"20":[1,60],"21":[1,55],"22":[1,43],"23":[1,22],"24":[1,46],"25":[1,40],"26":[1,42],"27":[1,50],"28":[1,48],"29":[1,59],"30":[1,61],"31":[1,158],"32":[1,17],"33":[1,47],"34":[1,41],"35":[1,65],"36":[1,39],"37":[1,51],"39":[1,44],"40":[1,49],"41":[1,68],"54":[1,54],"58":[1,67],"64":[1,56],"65":[1,57],"66":[1,58],"73":[1,52],"81":[1,53],"88":[1,66]},{"0":[1,64],"7":[1,63],"8":[1,62],"20":[1,60],"21":[1,55],"22":[1,43],"23":[1,22],"24":[1,46],"25":[1,40],"26":[1,42],"27":[1,50],"28":[1,48],"29":[1,59],"30":[1,61],"31":[1,158],"32":[1,17],"33":[1,47],"34":[1,41],"35":[1,65],"36":[1,39],"37":[1,51],"39":[1,44],"40":[1,49],"41":[1,68],"54":[1,54],"58":[1,67],"64":[1,56],"65":[1,57],"66":[1,58],"73":[1,52],"81":[1,53],"88":[1,66]},{"0":[1,64],"7":[1,63],"8":[1,62],"20":[1,60],"21":[1,55],"22":[1,43],"23":[1,22],"24":[1,46],"25":[1,40],"26":[1,42],"27":[1,50],"28":[1,48],"29":[1,59],"30":[1,61],"31":[1,158],"32":[1,17],"33":[1,47],"34":[1,41],"35":[1,65],"36":[1,39],"37":[1,51],"39":[1,44],"40":[1,49],"41":[1,68],"54":[1,54],"58":[1,67],"64":[1,56],"65":[1,57],"66":[1,58],"73":[1,52],"81":[1,53],"88":[1,66]},{"0":[1,64],"7":[1,63],"8":[1,62],"20":[1,60],"21":[1,55],"22":[1,43],"23":[1,22],"24":[1,46],"25":[1,40],"26":[1,42],"27":[1,50],"28":[1,48],"29":[1,59],"30":[1,61],"31":[1,158],"32":[1,17],"33":[1,47],"34":[1,41],"35":[1,65],"36":[1,39],"37":[1,51],"39":[1,44],"40":[1,49],"41":[1,68],"54":[1,54],"58":[1,67],"64":[1,56],"65":[1,57],"66":[1,58],"73":[1,52],"81":[1,53],"88":[1,66]},{"26":[1,75],"31":[1,73],"71":[1,72]},{"2":[2,49],"11":[2,49],"15":[2,49],"31":[2,49],"75":[2,49],"90":[2,49]},{"13":[1,184]},{"3":[1,188],"19":[1,189],"26":[1,190],"73":[1,186]},{"3":[1,188],"19":[1,189],"26":[1,190],"73":[1,186]},{"9":[1,192]},{"11":[2,15],"75":[2,15]},{"11":[2,45],"75":[2,45]},{"11":[2,46],"75":[2,46]},{"11":[2,47],"31":[1,118],"75":[2,47]},{"46":[1,199],"47":[1,198],"49":[1,196],"52":[1,197],"67":[1,195],"68":[1,194],"84":[1,193]},{"15":[1,200]},{"2":[2,19],"11":[2,47],"15":[2,19],"31":[1,118],"75":[2,47]},{"1":[1,129],"26":[1,75],"43":[1,201],"60":[1,135],"80":[1,134],"87":[1,133],"89":[1,132]},{"11":[2,17],"75":[2,17]},{"2":[2,28],"15":[2,28],"75":[1,203]},{"7":[1,63],"8":[1,62],"30":[1,61]},{"21":[1,55],"54":[1,54],"73":[1,52],"81":[1,53]},{"7":[1,63],"8":[1,62],"30":[1,61]},{"21":[1,55],"54":[1,54],"73":[1,52],"81":[1,53]},{"21":[1,55],"54":[1,54],"73":[1,52],"81":[1,53]},{"37":[1,51]},{"46":[1,199],"47":[1,198],"49":[1,196],"52":[1,197],"67":[1,195],"68":[1,194],"84":[1,193]},{"2":[1,210]},{"2":[2,19],"15":[2,19],"31":[1,118]},{"2":[1,211]},{"2":[2,44],"15":[2,44],"75":[2,44]},{"1":[1,129],"26":[1,75],"43":[1,138],"60":[1,135],"80":[1,134],"87":[1,133],"89":[1,132]},{"63":[1,213]},{"31":[1,158],"56":[1,215]},{"2":[2,119],"4":[2,119],"5":[2,119],"6":[2,119],"7":[2,119],"8":[2,119],"9":[2,119],"11":[2,119],"15":[2,119],"30":[2,119],"31":[2,119],"42":[2,119],"44":[2,119],"74":[2,119],"75":[2,119],"76":[2,119],"90":[2,119],"91":[2,119]},{"2":[2,134],"4":[2,134],"5":[2,134],"6":[2,134],"9":[2,134],"11":[2,134],"15":[2,134],"31":[2,134],"42":[2,134],"44":[2,134],"75":[2,134],"76":[2,134],"90":[2,134],"91":[2,134]},{"2":[2,120],"4":[2,120],"5":[2,120],"6":[2,120],"7":[1,63],"8":[1,62],"9":[2,120],"11":[2,120],"15":[2,120],"30":[1,61],"31":[2,120],"42":[2,120],"44":[2,120],"74":[2,120],"75":[2,120],"76":[2,120],"90":[2,120],"91":[2,120]},{"2":[2,121],"4":[2,121],"5":[2,121],"6":[2,121],"9":[2,121],"11":[2,121],"15":[2,121],"31":[2,121],"42":[2,121],"44":[2,121],"74":[2,121],"75":[2,121],"76":[2,121],"90":[2,121],"91":[2,121]},{"38":[1,92]},{"2":[2,135],"4":[2,135],"5":[2,135],"6":[2,135],"9":[2,135],"11":[2,135],"15":[2,135],"31":[2,135],"42":[2,135],"44":[2,135],"75":[2,135],"76":[2,135],"90":[2,135],"91":[2,135]},{"2":[2,111],"5":[2,111],"9":[2,111],"11":[2,111],"15":[2,111],"31":[2,111],"42":[2,111],"44":[2,111],"75":[2,111],"76":[2,111],"90":[2,111],"91":[2,111]},{"0":[1,64],"7":[1,63],"8":[1,62],"20":[1,60],"21":[1,55],"22":[1,43],"23":[1,22],"24":[1,46],"25":[1,40],"26":[1,42],"27":[1,50],"28":[1,48],"29":[1,59],"30":[1,61],"32":[1,17],"33":[1,47],"34":[1,41],"35":[1,65],"36":[1,39],"37":[1,51],"39":[1,44],"40":[1,49],"41":[1,68],"54":[1,54],"58":[1,67],"64":[1,56],"65":[1,57],"66":[1,58],"73":[1,52],"81":[1,53],"88":[1,66]},{"2":[2,57],"9":[2,57],"11":[2,57],"15":[2,57],"44":[2,57],"76":[1,100],"91":[2,57]},{"2":[2,60],"9":[2,60],"11":[2,60],"15":[2,60],"44":[2,60],"76":[2,60],"91":[2,60]},{"2":[2,75],"9":[2,75],"11":[2,75],"15":[2,75],"44":[2,75],"76":[2,75],"91":[2,75]},{"2":[2,88],"9":[2,88],"11":[2,88],"15":[2,88],"44":[2,88],"76":[2,88],"91":[2,88]},{"2":[2,53],"5":[2,53],"7":[2,53],"8":[2,53],"9":[2,53],"11":[2,53],"15":[2,53],"30":[2,53],"42":[2,53],"44":[2,53],"74":[2,53],"75":[2,53],"76":[2,53],"91":[2,53]},{"2":[2,64],"9":[2,64],"11":[2,64],"15":[2,64],"44":[2,64],"76":[2,64],"91":[2,64]},{"2":[2,77],"9":[2,77],"11":[2,77],"15":[2,77],"44":[2,77],"76":[2,77],"91":[2,77]},{"2":[2,65],"9":[2,65],"11":[2,65],"15":[2,65],"44":[2,65],"76":[2,65],"91":[2,65]},{"2":[2,78],"9":[2,78],"11":[2,78],"15":[2,78],"44":[2,78],"76":[2,78],"91":[2,78]},{"2":[2,66],"9":[2,66],"11":[2,66],"15":[2,66],"44":[2,66],"76":[2,66],"91":[2,66]},{"2":[2,79],"9":[2,79],"11":[2,79],"15":[2,79],"44":[2,79],"76":[2,79],"91":[2,79]},{"2":[2,67],"9":[2,67],"11":[2,67],"15":[2,67],"44":[2,67],"76":[2,67],"91":[2,67]},{"2":[2,80],"9":[2,80],"11":[2,80],"15":[2,80],"44":[2,80],"76":[2,80],"91":[2,80]},{"2":[2,68],"9":[2,68],"11":[2,68],"15":[2,68],"44":[2,68],"76":[2,68],"91":[2,68]},{"2":[2,81],"9":[2,81],"11":[2,81],"15":[2,81],"44":[2,81],"76":[2,81],"91":[2,81]},{"2":[2,69],"9":[2,69],"11":[2,69],"15":[2,69],"44":[2,69],"76":[2,69],"91":[2,69]},{"2":[2,82],"9":[2,82],"11":[2,82],"15":[2,82],"44":[2,82],"76":[2,82],"91":[2,82]},{"2":[2,70],"9":[2,70],"11":[2,70],"15":[2,70],"44":[2,70],"76":[2,70],"91":[2,70]},{"2":[2,83],"9":[2,83],"11":[2,83],"15":[2,83],"44":[2,83],"76":[2,83],"91":[2,83]},{"2":[2,71],"9":[2,71],"11":[2,71],"15":[2,71],"44":[2,71],"76":[2,71],"91":[2,71]},{"2":[2,84],"9":[2,84],"11":[2,84],"15":[2,84],"44":[2,84],"76":[2,84],"91":[2,84]},{"2":[2,72],"9":[2,72],"11":[2,72],"15":[2,72],"44":[2,72],"76":[2,72],"91":[2,72]},{"2":[2,85],"9":[2,85],"11":[2,85],"15":[2,85],"44":[2,85],"76":[2,85],"91":[2,85]},{"2":[2,73],"9":[2,73],"11":[2,73],"15":[2,73],"44":[2,73],"76":[2,73],"91":[2,73]},{"2":[2,86],"9":[2,86],"11":[2,86],"15":[2,86],"44":[2,86],"76":[2,86],"91":[2,86]},{"2":[2,74],"9":[2,74],"11":[2,74],"15":[2,74],"44":[2,74],"76":[2,74],"91":[2,74]},{"2":[2,87],"9":[2,87],"11":[2,87],"15":[2,87],"44":[2,87],"76":[2,87],"91":[2,87]},{"2":[2,63],"9":[2,63],"11":[2,63],"15":[2,63],"44":[2,63],"76":[2,63],"91":[2,63]},{"2":[2,76],"9":[2,76],"11":[2,76],"15":[2,76],"44":[2,76],"76":[2,76],"91":[2,76]},{"44":[1,99],"91":[1,217]},{"0":[1,64],"7":[1,63],"8":[1,62],"20":[1,60],"21":[1,55],"22":[1,43],"23":[1,22],"24":[1,46],"25":[1,40],"26":[1,42],"27":[1,50],"28":[1,48],"29":[1,59],"30":[1,61],"32":[1,17],"33":[1,47],"34":[1,41],"35":[1,65],"36":[1,39],"37":[1,51],"39":[1,44],"40":[1,49],"41":[1,68],"54":[1,54],"58":[1,67],"64":[1,56],"65":[1,57],"66":[1,58],"73":[1,52],"81":[1,53],"88":[1,66]},{"11":[2,7]},{"15":[1,219]},{"15":[1,220]},{"11":[2,11],"15":[2,11]},{"11":[2,12],"15":[2,12]},{"11":[2,13],"15":[2,13],"59":[1,221]},{"11":[2,6]},{"1":[1,15],"48":[1,11],"53":[1,13],"69":[1,12],"73":[1,8],"86":[1,10]},{"31":[1,158]},{"31":[1,158]},{"31":[1,158]},{"31":[1,158]},{"74":[1,227]},{"31":[1,158]},{"31":[1,158]},{"26":[1,75],"72":[1,123],"79":[1,124]},{"46":[1,199],"47":[1,198],"49":[1,196],"52":[1,197],"67":[1,195],"68":[1,194],"84":[1,193]},{"2":[1,231]},{"31":[1,90]},{"5":[1,233]},{"4":[1,93],"5":[1,234],"6":[1,94]},{"5":[1,235]},{"4":[1,93],"5":[1,236],"6":[1,94]},{"4":[1,93],"5":[1,237],"6":[1,94]},{"2":[2,36],"15":[2,36]},{"2":[2,37],"15":[2,37],"75":[1,238]},{"75":[1,239]},{"2":[1,240]},{"1":[1,241]},{"2":[2,50],"11":[2,50],"15":[2,50],"75":[2,50]},{"2":[2,51],"11":[2,51],"15":[2,51],"75":[2,51]},{"5":[2,113],"42":[2,113]},{"2":[2,62],"9":[2,62],"11":[2,62],"15":[2,62],"44":[2,62],"76":[2,62],"91":[2,62]},{"2":[2,52],"11":[2,52],"15":[2,52],"31":[2,52],"75":[2,52],"90":[2,52]},{"3":[1,188],"19":[1,189],"26":[1,190]},{"3":[1,188],"19":[1,189],"26":[1,190],"72":[1,243]},{"26":[1,75],"31":[1,73],"71":[1,72]},{"11":[2,5],"75":[1,16]},{"74":[1,246]},{"74":[1,247]},{"74":[1,248]},{"74":[1,249]},{"1":[1,250]},{"7":[1,63],"8":[1,62],"30":[1,61]},{"7":[1,63],"8":[1,62],"30":[1,61]},{"11":[2,16],"75":[2,16]},{"59":[1,253],"63":[1,254]},{"2":[2,34],"15":[2,34],"75":[2,34]},{"7":[1,63],"8":[1,62],"30":[1,61]},{"7":[1,63],"8":[1,62],"23":[1,149],"30":[1,61]},{"7":[1,63],"8":[1,62],"30":[1,61]},{"7":[1,63],"8":[1,62],"23":[1,149],"30":[1,61]},{"62":[1,259]},{"70":[1,260]},{"26":[1,75],"31":[1,73],"71":[1,72],"88":[1,262]},{"2":[2,37],"15":[2,37],"75":[1,238]},{"1":[1,129],"26":[1,75],"43":[1,201],"60":[1,135],"80":[1,134],"87":[1,133],"89":[1,132]},{"11":[2,8]},{"11":[2,9]},{"11":[2,10]},{"11":[2,14],"15":[2,14],"44":[1,99]},{"1":[1,264]},{"1":[1,265]},{"1":[1,266]},{"1":[1,267]},{"1":[1,129],"26":[1,75],"43":[1,201],"60":[1,135],"80":[1,134],"87":[1,133],"89":[1,132]},{"5":[1,269]},{"5":[1,270]},{"26":[1,75],"31":[1,73],"71":[1,72]},{"1":[1,272]},{"74":[1,273]},{"74":[1,274]},{"74":[1,275]},{"74":[1,276]},{"13":[1,277]},{"31":[1,158],"41":[1,278]},{"2":[2,40],"15":[2,40],"44":[1,99]},{"2":[2,41],"15":[2,41]},{"2":[1,280]},{"1":[1,129],"26":[1,75],"43":[1,201],"60":[1,135],"80":[1,134],"87":[1,133],"89":[1,132]},{"1":[1,129],"26":[1,75],"43":[1,201],"60":[1,135],"80":[1,134],"87":[1,133],"89":[1,132]},{"1":[1,129],"26":[1,75],"43":[1,201],"60":[1,135],"80":[1,134],"87":[1,133],"89":[1,132]},{"1":[1,129],"26":[1,75],"43":[1,201],"60":[1,135],"80":[1,134],"87":[1,133],"89":[1,132]},{"2":[1,285]},{"7":[1,63],"8":[1,62],"30":[1,61]},{"7":[1,63],"8":[1,62],"30":[1,61]},{"2":[2,20],"15":[2,20],"44":[1,99]},{"1":[1,129],"26":[1,75],"43":[1,201],"60":[1,135],"80":[1,134],"87":[1,133],"89":[1,132]},{"1":[1,289]},{"1":[1,290]},{"1":[1,291]},{"1":[1,292]},{"7":[1,63],"8":[1,62],"23":[1,149],"30":[1,61]},{"31":[1,158]},{"2":[2,38],"15":[2,38]},{"2":[2,43],"15":[2,43],"75":[2,43]},{"2":[1,296]},{"2":[1,297]},{"2":[1,298]},{"2":[1,299]},{"2":[2,25],"15":[2,25]},{"74":[1,300]},{"74":[1,301]},{"2":[1,302]},{"1":[1,15],"48":[1,11],"53":[1,13],"69":[1,87],"86":[1,10]},{"1":[1,15],"48":[1,11],"53":[1,13],"69":[1,87],"86":[1,10]},{"1":[1,129],"26":[1,75],"43":[1,201],"60":[1,135],"80":[1,134],"87":[1,133],"89":[1,132]},{"1":[1,129],"26":[1,75],"43":[1,201],"60":[1,135],"80":[1,134],"87":[1,133],"89":[1,132]},{"2":[2,35],"15":[2,35]},{"5":[1,308],"42":[1,307]},{"5":[2,54],"42":[2,54]},{"2":[2,23],"15":[2,23]},{"2":[2,21],"15":[2,21]},{"2":[2,22],"15":[2,22]},{"2":[2,24],"15":[2,24]},{"1":[1,309]},{"1":[1,310]},{"2":[2,33],"15":[2,33],"75":[2,33]},{"2":[1,311]},{"2":[1,312]},{"2":[1,313]},{"2":[1,314]},{"2":[2,39],"15":[2,39]},{"31":[1,158]},{"1":[1,129],"26":[1,75],"43":[1,201],"60":[1,135],"80":[1,134],"87":[1,133],"89":[1,132]},{"1":[1,129],"26":[1,75],"43":[1,201],"60":[1,135],"80":[1,134],"87":[1,133],"89":[1,132]},{"2":[2,29],"15":[2,29]},{"2":[2,30],"15":[2,30]},{"2":[2,31],"15":[2,31]},{"2":[2,32],"15":[2,32]},{"5":[2,55],"42":[2,55]},{"2":[1,318]},{"2":[1,319]},{"2":[2,26],"15":[2,26]},{"2":[2,27],"15":[2,27]}];
const SEMANTIC_ACTION = [
((x) => x),
((_, constant) => constant),
((_, filter) => filter),
((_, policy) => policy),
((rule) => new Ast.Program([], [], [rule], null)),
((_1, _2, user, _3, rule) => new Ast.Program([], [], [rule], new Ast.Value.Entity(user.value, 'tt:username', null))),
((_1, _2, policy) => policy),
((user, _, policy) => policy.set({ principal: user })),
((_1, _2, action) => new Ast.PermissionRule(Ast.BooleanExpression.True, Ast.PermissionFunction.Builtin, action)),
((query, _1, _2) => new Ast.PermissionRule(Ast.BooleanExpression.True, query, Ast.PermissionFunction.Builtin)),
((query, _1, action) => new Ast.PermissionRule(Ast.BooleanExpression.True, query, action)),
((_) => Ast.PermissionFunction.Star),
((klass) => new Ast.PermissionFunction.ClassStar(klass.value)),
((fn) => new Ast.PermissionFunction.Specified(fn.value.kind, fn.value.channel, Ast.BooleanExpression.True, null)),
((fn, _, filter) => new Ast.PermissionFunction.Specified(fn.value.kind, fn.value.channel, filter, null)),
((stream, _, action) => new Ast.Statement.Rule(stream, [action])),
((_1, _2, table, _3, action) => new Ast.Statement.Command(table, [action])),
((_1, _2, action) => new Ast.Statement.Command(null, [action])),
((rule, _, pp) => {
                           rule.actions[0].in_params.push(pp);
                           return rule;
                       }),
((get) => Ast.Table.Invocation(get, null)),
((_1, table, _2, _3, filter) => new Ast.Table.Filter(table, filter, null)),
((_1, op, field, _2, _3, table, _4) => new Ast.Table.Aggregation(table, field.name, op, null, null)),
((_1, op, field, _2, _3, table, _4) => new Ast.Table.Aggregation(table, field.name, op, null, null)),
((_1, op, field, _2, _3, table, _4) => new Ast.Table.Aggregation(table, field.name, op, null, null)),
((_1, op, field, _2, _3, table, _4) => new Ast.Table.Aggregation(table, field.name, op, null, null)),
((_1, op, _2, _3, table, _4) => new Ast.Table.Aggregation(table, '*', op, null, null)),
((_1, op, field, base, _2, limit, _3, _4, table, _5) => new Ast.Table.ArgMinMax(table, field.name, op, null, null)),
((_1, op, field, base, _2, limit, _3, _4, table, _5) => new Ast.Table.ArgMinMax(table, field.name, op, null, null)),
((x) => x),
((_1, base, _2, delta, _3, _4, stream, _5) => new Ast.Table.Window(base, delta, stream, null)),
((_1, base, _2, delta, _3, _4, stream, _5) => new Ast.Table.TimeSeries(base, delta, stream, null)),
((_1, base, _2, delta, _3, _4, table, _5) => new Ast.Table.Sequence(base, delta, table, null)),
((_1, base, _2, delta, _3, _4, table, _5) => new Ast.Table.History(base, delta, table, null)),
((_1, t1, _2, _3, _4, t2, _5) => new Ast.Table.Join(t1, t2, [], null)),
((join, _, pp) => {
                           join.in_params.push(pp);
                           return join;
                       }),
((_1, _2, _3, base, _4, _5, _6, interval) => new Ast.Stream.Timer(base, interval, null)),
((_1, _2, _3, time) => new Ast.Stream.AtTimer(time, null)),
((monitor, _1, table, _2) => new Ast.Stream.Monitor(table, null, null)),
((monitor, _1, table, _2, _3, _4, pname) => new Ast.Stream.Monitor(table, [pname.name], null)),
((monitor, _1, table, _2, _3, _4, _5, pnames, _6) => new Ast.Stream.Monitor(table, pnames.map((p) => p.name), null)),
((_1, _2, stream, _3, _4, filter) => new Ast.Stream.EdgeFilter(stream, filter, null)),
((_1, _2, stream, _3, _4, filter) => new Ast.Stream.EdgeFilter(stream, Ast.BooleanExpression.True, null)),
((x) => x),
((_1, s1, _2, _3, _4, t2, _5) => new Ast.Stream.Join(s1, t2, [], null)),
((join, _, pp) => {
                           join.in_params.push(pp);
                           return join;
                       }),
(() => Generate.notifyAction()),
(() => Generate.notifyAction('return')),
((x) => x),
((fn) => new Ast.Invocation(new Ast.Selector.Device(fn.value.kind, null, null), fn.value.channel, [], null)),
((inv, ip) => {
                           inv.in_params.push(ip);
                           return inv;
                       }),
((pname, _1, out_param) => new Ast.InputParam(pname.value, out_param)),
((pname, _1, _2) => new Ast.InputParam(pname.value, new Ast.Value.Event(null))),
((pname, _1, v) => new Ast.InputParam(pname.value, v)),
((pname) => new Ast.Value.VarRef(pname.value)),
((pname) => [pname]),
((list, _, pname) => list.concat(pname)),
((x) => x),
((f1, _, f2) => new Ast.BooleanExpression.And([f1, f2])),
((x) => x),
((_, f) => new Ast.BooleanExpression.Not(f)),
((f1, _, f2) => new Ast.BooleanExpression.Or([f1, f2])),
((pname, [op, v]) => new Ast.BooleanExpression.Atom(pname.value, op, v)),
((fn, _1, filter, _3) => new Ast.BooleanExpression.External(fn.selector, fn.channel, fn.in_params, filter, fn.schema)),
((op, v) => [op, v]),
((op, v) => [op, v]),
((op, v) => [op, v]),
((op, v) => [op, v]),
((op, v) => [op, v]),
((op, v) => [op, v]),
((op, v) => [op, v]),
((op, v) => [op, v]),
((op, v) => [op, v]),
((op, v) => [op, v]),
((op, v) => [op, v]),
((op, v) => [op, v]),
((op, v) => [op, v]),
((op, v) => [op, v]),
((op, v) => [op, v]),
((op, v) => [op, v]),
((op, v) => [op, v]),
((op, v) => [op, v]),
((op, v) => [op, v]),
((op, v) => [op, v]),
((op, v) => [op, v]),
((op, v) => [op, v]),
((op, v) => [op, v]),
((op, v) => [op, v]),
((op, v) => [op, v]),
((op, v) => [op, v]),
((x) => x),
((x) => x),
((x) => x),
((x) => x),
((tok) => new Ast.Value.Measure(tok.value.value, tok.value.unit)),
((x) => x),
((x) => x),
((x) => x),
((x) => x),
((x) => x),
((x) => x),
((x) => x),
((x) => x),
((x) => x),
((x) => x),
((x) => x),
((x) => x),
((x) => x),
((x) => x),
((x) => x),
((x) => x),
((slot) => slot.value === undefined ? Ast.Value.Undefined(true) : slot.value),
((_1, values, _2) => new Ast.Value.Array(values)),
((v) => [v]),
((array, _, v) => {
                                   array.push(v);
                                   return array;
                               }),
(() => new Ast.Value.Boolean(true)),
(() => new Ast.Value.Boolean(false)),
((str) => new Ast.Value.String('')),
((str) => new Ast.Value.String(str.value)),
((num, unit) => new Ast.Value.Measure(num.value, unit.value)),
((v1, num, unit) => {
                              if (v1.isCompoundMeasure) {
                                  v1.value.push(new Ast.Value.Measure(num.value, unit.value));
                                  return v1;
                              } else {
                                  return new Ast.Value.CompoundMeasure([v1, new Ast.Value.Measure(num.value, unit.value)]);
                              }
                          }),
((x) => x),
((tok) => new Ast.Value.Measure(tok.value.value, tok.value.unit)),
((num) => new Ast.Value.Number(num.value)),
(() => new Ast.Value.Number(1)),
(() => new Ast.Value.Number(0)),
((tok) => new Ast.Value.Currency(tok.value.value, tok.value.unit)),
((tag) => new Ast.Value.Location(new Ast.Location.Relative(tag.substr('location:'.length)))),
((tag) => new Ast.Value.Location(new Ast.Location.Relative(tag.substr('location:'.length)))),
((tag) => new Ast.Value.Location(new Ast.Location.Relative(tag.substr('location:'.length)))),
((loc) => new Ast.Value.Location(new Ast.Location.Absolute(loc.value.latitude, loc.value.longitude, loc.value.display||null))),
((loc) => new Ast.Value.Date(null, '+', null)),
((edge, unit) => new Ast.Value.Date(new Ast.DateEdge(edge, unit.value), '+', null)),
((edge, unit) => new Ast.Value.Date(new Ast.DateEdge(edge, unit.value), '+', null)),
((abs) => new Ast.Value.Date(parseDate(abs.value), '+', null)),
((date, op, offset) => new Ast.Value.Date(date.value, op, offset)),
((date, op, offset) => new Ast.Value.Date(date.value, op, offset)),
((time) => new Ast.Value.Time(time.value.hour, time.value.minute, time.value.second||0)),
((venum) => new Ast.Value.Enum(venum.value)),
((entity) => new Ast.Value.Entity(entity.value.value, entity.value.type, entity.value.display)),
((entity) => new Ast.Value.Entity(entity.value, 'tt:username', null)),
((entity) => new Ast.Value.Entity(entity.value, 'tt:hashtag', null)),
((entity) => new Ast.Value.Entity(entity.value, 'tt:url', null)),
((entity) => new Ast.Value.Entity(entity.value, 'tt:phone_number', null)),
((entity) => new Ast.Value.Entity(entity.value, 'tt:email_address', null)),
((entity) => new Ast.Value.Entity(entity.value, 'tt:path_name', null)),
((entity) => new Ast.Value.Entity(entity.value, 'tt:device', null)),
((entity) => new Ast.Value.Entity(entity.kind + ':' + entity.device, 'tt:function', null)),
((entity) => new Ast.Value.Entity(entity.value, 'tt:picture', null)),
((x, _) => x),
];
module.exports = require('./sr_parser')(TERMINAL_IDS, RULE_NON_TERMINALS, ARITY, GOTO, PARSER_ACTION, SEMANTIC_ACTION);
