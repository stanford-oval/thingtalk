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
                       [['executor', '=', '$constant', ':', '$rule'], (_1, _2, user, _3, rule) => new Ast.Program([], [], [rule], new Ast.Value.Entity(user.value, 'tt:username', null))]],

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
                         [['QUOTED_STRING'], (str) => new Ast.Value.String(str.value)],
                         [['"', '$word_list', '"'], (_1, str, _2) => new Ast.Value.String(str)],
                         ],

    '$word_list': [[['WORD'], (word) => word.value],
                   [['$word_list', 'WORD'], (list, word) => list + word.value]],

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

    '$constant_Entity(unknown)': [[['GENERIC_ENTITY'], (entity) => new Ast.Value.Entity(entity.value.value, entity.value.type, entity.value.display)],
                                  [['"', '$word_list', '"', 'ENTITY_TYPE'], (_1, str, _2, type) => {
                                    if (type.value === 'tt:hashtag' || type.value === 'tt:username')
                                        return new Ast.Value.Entity(str, type.value, null);
                                    else
                                        return new Ast.Value.Entity(null, type.value, str);
                                    }]
                                  ],

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
const TERMINAL_IDS = {"0":8,"1":9,"\"":0,"\"\"":1,"(":2,")":3,"*":4,"+":5,",":6,"-":7,":":10,"<":11,"<<EOF>>":12,"<=":13,"=":14,"==":15,"=>":16,"=~":17,">":18,">=":19,"CLASS_STAR":20,"CURRENCY":21,"DATE":22,"DEVICE":23,"DURATION":24,"EMAIL_ADDRESS":25,"ENTITY_TYPE":26,"ENUM":27,"FUNCTION":28,"GENERIC_ENTITY":29,"HASHTAG":30,"LOCATION":31,"NUMBER":32,"PARAM_NAME":33,"PATH_NAME":34,"PHONE_NUMBER":35,"PICTURE":36,"QUOTED_STRING":37,"SLOT":38,"TIME":39,"UNIT":40,"URL":41,"USERNAME":42,"WORD":43,"[":44,"]":45,"aggregate":46,"and":47,"answer":48,"argmax":49,"argmin":50,"attimer":51,"avg":52,"base":53,"contains":54,"count":55,"edge":56,"end_of":57,"ends_with":58,"event":59,"executor":60,"false":61,"filter":62,"history":63,"in_array":64,"interval":65,"join":66,"location:current_location":67,"location:home":68,"location:work":69,"max":70,"min":71,"monitor":72,"new":73,"not":74,"notify":75,"now":76,"of":77,"on":78,"or":79,"policy":80,"prefix_of":81,"return":82,"sequence":83,"start_of":84,"starts_with":85,"suffix_of":86,"sum":87,"time":88,"timer":89,"timeseries":90,"true":91,"window":92,"{":93,"}":94,"~=":95};
const RULE_NON_TERMINALS = [29,29,29,29,37,37,34,34,35,35,35,36,36,36,36,38,38,38,38,41,41,41,41,41,41,41,41,41,41,41,41,41,41,42,42,39,39,39,39,39,39,39,39,40,40,1,1,1,3,3,33,33,4,31,32,32,28,28,30,30,30,2,2,43,43,43,43,43,43,43,43,43,43,43,43,43,43,43,43,43,43,43,43,43,43,43,43,43,43,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,6,27,27,7,7,25,25,25,44,44,22,22,23,23,24,24,24,8,21,21,21,21,9,9,9,9,9,9,26,20,19,19,18,13,17,15,11,14,10,12,16,0];
const ARITY = [1,2,2,2,1,5,3,3,3,3,3,1,1,1,3,3,5,3,3,1,5,7,7,7,7,6,10,10,1,8,8,8,8,7,3,8,4,4,7,9,6,6,1,7,3,1,1,1,1,2,3,3,3,1,1,3,1,3,1,2,3,2,4,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,3,1,3,1,1,1,1,3,1,2,2,3,1,1,1,1,1,1,1,1,1,1,1,2,2,1,3,3,1,1,1,4,1,1,1,1,1,1,1,1,1,2];
const GOTO = [{"29":2,"37":9,"38":1,"39":7,"40":14},{},{},{"5":18,"6":46,"7":19,"8":24,"9":26,"10":35,"11":32,"12":36,"13":30,"14":33,"15":31,"16":37,"17":34,"18":29,"19":28,"20":38,"21":25,"22":21,"24":23,"25":20,"26":27},{"2":72,"3":75,"28":70,"30":71},{"2":72,"3":75,"28":78,"30":71,"34":77},{},{},{},{},{},{},{},{},{},{"39":89,"40":14},{"33":90},{},{},{},{},{"24":92},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{"44":96},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{"5":101,"6":46,"7":19,"8":24,"9":26,"10":35,"11":32,"12":36,"13":30,"14":33,"15":31,"16":37,"17":34,"18":29,"19":28,"20":38,"21":25,"22":21,"24":23,"25":20,"26":27,"27":100},{},{},{},{"2":104,"3":75},{"43":106},{"4":120},{},{},{},{},{"5":124,"6":46,"7":19,"8":24,"9":26,"10":35,"11":32,"12":36,"13":30,"14":33,"15":31,"16":37,"17":34,"18":29,"19":28,"20":38,"21":25,"22":21,"24":23,"25":20,"26":27},{"1":125,"3":128},{"1":133,"3":131,"41":130,"42":134},{},{},{"3":143,"41":142,"42":134},{"39":144,"40":14},{"33":145},{},{},{},{},{},{},{"22":151,"23":150,"24":153},{"22":151,"23":154,"24":153},{},{},{},{},{},{},{"2":72,"3":75,"30":159},{"2":160,"3":75},{},{"6":161,"31":162},{},{"5":164,"6":46,"7":19,"8":24,"9":26,"10":35,"11":32,"12":36,"13":30,"14":33,"15":31,"16":37,"17":34,"18":29,"19":28,"20":38,"21":25,"22":21,"24":23,"25":20,"26":27,"31":165},{"5":166,"6":46,"7":19,"8":24,"9":26,"10":35,"11":32,"12":36,"13":30,"14":33,"15":31,"16":37,"17":34,"18":29,"19":28,"20":38,"21":25,"22":21,"24":23,"25":20,"26":27,"31":167},{"5":168,"6":46,"7":19,"8":24,"9":26,"10":35,"11":32,"12":36,"13":30,"14":33,"15":31,"16":37,"17":34,"18":29,"19":28,"20":38,"21":25,"22":21,"24":23,"25":20,"26":27,"31":169},{"5":170,"6":46,"7":19,"8":24,"9":26,"10":35,"11":32,"12":36,"13":30,"14":33,"15":31,"16":37,"17":34,"18":29,"19":28,"20":38,"21":25,"22":21,"24":23,"25":20,"26":27,"31":171},{"5":172,"6":46,"7":19,"8":24,"9":26,"10":35,"11":32,"12":36,"13":30,"14":33,"15":31,"16":37,"17":34,"18":29,"19":28,"20":38,"21":25,"22":21,"24":23,"25":20,"26":27,"31":173},{"5":174,"6":46,"7":19,"8":24,"9":26,"10":35,"11":32,"12":36,"13":30,"14":33,"15":31,"16":37,"17":34,"18":29,"19":28,"20":38,"21":25,"22":21,"24":23,"25":20,"26":27,"31":175},{"5":176,"6":46,"7":19,"8":24,"9":26,"10":35,"11":32,"12":36,"13":30,"14":33,"15":31,"16":37,"17":34,"18":29,"19":28,"20":38,"21":25,"22":21,"24":23,"25":20,"26":27,"31":177},{"5":178,"6":46,"7":19,"8":24,"9":26,"10":35,"11":32,"12":36,"13":30,"14":33,"15":31,"16":37,"17":34,"18":29,"19":28,"20":38,"21":25,"22":21,"24":23,"25":20,"26":27,"31":179},{"5":180,"6":46,"7":19,"8":24,"9":26,"10":35,"11":32,"12":36,"13":30,"14":33,"15":31,"16":37,"17":34,"18":29,"19":28,"20":38,"21":25,"22":21,"24":23,"25":20,"26":27,"31":181},{"5":182,"6":46,"7":19,"8":24,"9":26,"10":35,"11":32,"12":36,"13":30,"14":33,"15":31,"16":37,"17":34,"18":29,"19":28,"20":38,"21":25,"22":21,"24":23,"25":20,"26":27,"31":183},{"5":184,"6":46,"7":19,"8":24,"9":26,"10":35,"11":32,"12":36,"13":30,"14":33,"15":31,"16":37,"17":34,"18":29,"19":28,"20":38,"21":25,"22":21,"24":23,"25":20,"26":27,"31":185},{"5":186,"6":46,"7":19,"8":24,"9":26,"10":35,"11":32,"12":36,"13":30,"14":33,"15":31,"16":37,"17":34,"18":29,"19":28,"20":38,"21":25,"22":21,"24":23,"25":20,"26":27,"31":187},{"2":72,"3":75,"28":188,"30":71},{},{},{"35":190,"36":192},{"35":196,"36":192},{},{},{},{},{"4":120},{},{},{"4":120},{"3":143,"41":207,"42":134},{},{},{"24":209},{"9":210},{"24":211},{"9":212},{"9":213},{"26":214},{},{},{"4":120},{},{},{"3":143,"41":217,"42":134},{},{"31":219},{},{},{"24":92},{},{},{},{},{},{},{"5":222,"6":46,"7":19,"8":24,"9":26,"10":35,"11":32,"12":36,"13":30,"14":33,"15":31,"16":37,"17":34,"18":29,"19":28,"20":38,"21":25,"22":21,"24":23,"25":20,"26":27},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{"5":224,"6":46,"7":19,"8":24,"9":26,"10":35,"11":32,"12":36,"13":30,"14":33,"15":31,"16":37,"17":34,"18":29,"19":28,"20":38,"21":25,"22":21,"24":23,"25":20,"26":27},{},{},{},{},{},{},{},{"38":228,"39":7,"40":14},{"31":229},{"31":230},{"31":231},{"31":232},{},{"31":234},{"31":235},{"1":236,"3":128},{},{},{"33":238},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{"36":248},{"36":250},{"2":72,"3":75,"28":251,"30":71},{},{},{},{},{},{},{"24":257},{"24":258},{},{},{},{"24":261},{"22":151,"23":262,"24":153},{"24":263},{"22":151,"23":264,"24":153},{},{},{"2":72,"3":75,"28":267,"30":71},{},{"3":143,"41":269,"42":134},{},{},{},{},{},{},{},{},{"3":143,"41":274,"42":134},{},{},{"2":72,"3":75,"28":277,"30":71},{},{},{},{},{},{},{"31":285},{},{},{},{"3":143,"41":287,"42":134},{"3":143,"41":288,"42":134},{"3":143,"41":289,"42":134},{"3":143,"41":290,"42":134},{},{"24":292},{"24":293},{},{"3":143,"41":294,"42":134},{},{},{},{},{"22":151,"23":299,"24":153},{"31":301,"32":300},{},{},{},{},{},{},{},{},{},{},{"39":309,"40":14},{"39":310,"40":14},{"3":143,"41":311,"42":134},{"3":143,"41":312,"42":134},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{"31":321},{"3":143,"41":322,"42":134},{"3":143,"41":323,"42":134},{},{},{},{},{},{},{},{},{}];
const PARSER_ACTION = [{"2":[1,15],"48":[1,3],"51":[1,11],"56":[1,13],"60":[1,6],"62":[1,4],"72":[1,12],"76":[1,8],"80":[1,5],"89":[1,10]},{"12":[2,4],"78":[1,16]},{"12":[0]},{"0":[1,51],"1":[1,65],"8":[1,64],"9":[1,63],"21":[1,61],"22":[1,56],"23":[1,43],"24":[1,22],"25":[1,17],"27":[1,40],"28":[1,42],"29":[1,50],"30":[1,48],"31":[1,60],"32":[1,62],"34":[1,45],"35":[1,47],"36":[1,41],"37":[1,66],"38":[1,39],"39":[1,52],"41":[1,44],"42":[1,49],"44":[1,69],"57":[1,55],"61":[1,68],"67":[1,57],"68":[1,58],"69":[1,59],"76":[1,53],"84":[1,54],"91":[1,67]},{"28":[1,76],"33":[1,74],"74":[1,73]},{"28":[1,76],"33":[1,74],"74":[1,73],"91":[1,79]},{"14":[1,80]},{"16":[1,81]},{"16":[1,82]},{"12":[2,0]},{"53":[1,83]},{"88":[1,84]},{"2":[1,85]},{"2":[1,86]},{"3":[2,42],"16":[2,42],"78":[1,87]},{"2":[1,15],"51":[1,11],"56":[1,13],"72":[1,88],"89":[1,10]},{"33":[1,91]},{"3":[2,147],"6":[2,147],"10":[2,147],"12":[2,147],"16":[2,147],"33":[2,147],"45":[2,147],"47":[2,147],"78":[2,147],"79":[2,147],"93":[2,147],"94":[2,147]},{"12":[2,1]},{"3":[2,90],"6":[2,90],"10":[2,90],"12":[2,90],"16":[2,90],"33":[2,90],"45":[2,90],"47":[2,90],"78":[2,90],"79":[2,90],"93":[2,90],"94":[2,90]},{"3":[2,91],"6":[2,91],"10":[2,91],"12":[2,91],"16":[2,91],"33":[2,91],"45":[2,91],"47":[2,91],"78":[2,91],"79":[2,91],"93":[2,91],"94":[2,91]},{"3":[2,92],"6":[2,92],"8":[1,64],"9":[1,63],"10":[2,92],"12":[2,92],"16":[2,92],"32":[1,62],"33":[2,92],"45":[2,92],"47":[2,92],"78":[2,92],"79":[2,92],"93":[2,92],"94":[2,92]},{"3":[2,93],"6":[2,93],"10":[2,93],"12":[2,93],"16":[2,93],"33":[2,93],"45":[2,93],"47":[2,93],"78":[2,93],"79":[2,93],"93":[2,93],"94":[2,93]},{"3":[2,94],"6":[2,94],"10":[2,94],"12":[2,94],"16":[2,94],"33":[2,94],"40":[1,93],"45":[2,94],"47":[2,94],"78":[2,94],"79":[2,94],"93":[2,94],"94":[2,94]},{"3":[2,95],"6":[2,95],"10":[2,95],"12":[2,95],"16":[2,95],"33":[2,95],"45":[2,95],"47":[2,95],"78":[2,95],"79":[2,95],"93":[2,95],"94":[2,95]},{"3":[2,96],"6":[2,96],"10":[2,96],"12":[2,96],"16":[2,96],"33":[2,96],"45":[2,96],"47":[2,96],"78":[2,96],"79":[2,96],"93":[2,96],"94":[2,96]},{"3":[2,97],"5":[1,94],"6":[2,97],"7":[1,95],"10":[2,97],"12":[2,97],"16":[2,97],"33":[2,97],"45":[2,97],"47":[2,97],"78":[2,97],"79":[2,97],"93":[2,97],"94":[2,97]},{"3":[2,98],"6":[2,98],"10":[2,98],"12":[2,98],"16":[2,98],"33":[2,98],"45":[2,98],"47":[2,98],"78":[2,98],"79":[2,98],"93":[2,98],"94":[2,98]},{"3":[2,99],"6":[2,99],"10":[2,99],"12":[2,99],"16":[2,99],"33":[2,99],"45":[2,99],"47":[2,99],"78":[2,99],"79":[2,99],"93":[2,99],"94":[2,99]},{"3":[2,100],"6":[2,100],"10":[2,100],"12":[2,100],"16":[2,100],"33":[2,100],"45":[2,100],"47":[2,100],"78":[2,100],"79":[2,100],"93":[2,100],"94":[2,100]},{"3":[2,101],"6":[2,101],"10":[2,101],"12":[2,101],"16":[2,101],"33":[2,101],"45":[2,101],"47":[2,101],"78":[2,101],"79":[2,101],"93":[2,101],"94":[2,101]},{"3":[2,102],"6":[2,102],"10":[2,102],"12":[2,102],"16":[2,102],"33":[2,102],"45":[2,102],"47":[2,102],"78":[2,102],"79":[2,102],"93":[2,102],"94":[2,102]},{"3":[2,103],"6":[2,103],"10":[2,103],"12":[2,103],"16":[2,103],"33":[2,103],"45":[2,103],"47":[2,103],"78":[2,103],"79":[2,103],"93":[2,103],"94":[2,103]},{"3":[2,104],"6":[2,104],"10":[2,104],"12":[2,104],"16":[2,104],"33":[2,104],"45":[2,104],"47":[2,104],"78":[2,104],"79":[2,104],"93":[2,104],"94":[2,104]},{"3":[2,105],"6":[2,105],"10":[2,105],"12":[2,105],"16":[2,105],"33":[2,105],"45":[2,105],"47":[2,105],"78":[2,105],"79":[2,105],"93":[2,105],"94":[2,105]},{"3":[2,106],"6":[2,106],"10":[2,106],"12":[2,106],"16":[2,106],"33":[2,106],"45":[2,106],"47":[2,106],"78":[2,106],"79":[2,106],"93":[2,106],"94":[2,106]},{"3":[2,107],"6":[2,107],"10":[2,107],"12":[2,107],"16":[2,107],"33":[2,107],"45":[2,107],"47":[2,107],"78":[2,107],"79":[2,107],"93":[2,107],"94":[2,107]},{"3":[2,108],"6":[2,108],"10":[2,108],"12":[2,108],"16":[2,108],"33":[2,108],"45":[2,108],"47":[2,108],"78":[2,108],"79":[2,108],"93":[2,108],"94":[2,108]},{"3":[2,109],"6":[2,109],"10":[2,109],"12":[2,109],"16":[2,109],"33":[2,109],"45":[2,109],"47":[2,109],"78":[2,109],"79":[2,109],"93":[2,109],"94":[2,109]},{"3":[2,110],"6":[2,110],"10":[2,110],"12":[2,110],"16":[2,110],"33":[2,110],"45":[2,110],"47":[2,110],"78":[2,110],"79":[2,110],"93":[2,110],"94":[2,110]},{"3":[2,140],"6":[2,140],"10":[2,140],"12":[2,140],"16":[2,140],"33":[2,140],"45":[2,140],"47":[2,140],"78":[2,140],"79":[2,140],"93":[2,140],"94":[2,140]},{"3":[2,151],"6":[2,151],"10":[2,151],"12":[2,151],"16":[2,151],"33":[2,151],"45":[2,151],"47":[2,151],"78":[2,151],"79":[2,151],"93":[2,151],"94":[2,151]},{"3":[2,150],"6":[2,150],"10":[2,150],"12":[2,150],"16":[2,150],"33":[2,150],"45":[2,150],"47":[2,150],"78":[2,150],"79":[2,150],"93":[2,150],"94":[2,150]},{"3":[2,149],"6":[2,149],"10":[2,149],"12":[2,149],"16":[2,149],"33":[2,149],"45":[2,149],"47":[2,149],"78":[2,149],"79":[2,149],"93":[2,149],"94":[2,149]},{"3":[2,145],"6":[2,145],"10":[2,145],"12":[2,145],"16":[2,145],"33":[2,145],"45":[2,145],"47":[2,145],"78":[2,145],"79":[2,145],"93":[2,145],"94":[2,145]},{"3":[2,148],"6":[2,148],"10":[2,148],"12":[2,148],"16":[2,148],"33":[2,148],"45":[2,148],"47":[2,148],"78":[2,148],"79":[2,148],"93":[2,148],"94":[2,148]},{"3":[2,89],"6":[2,89],"10":[2,89],"12":[2,89],"16":[2,89],"33":[2,89],"45":[2,89],"47":[2,89],"78":[2,89],"79":[2,89],"93":[2,89],"94":[2,89]},{"3":[2,146],"6":[2,146],"10":[2,146],"12":[2,146],"16":[2,146],"33":[2,146],"45":[2,146],"47":[2,146],"78":[2,146],"79":[2,146],"93":[2,146],"94":[2,146]},{"3":[2,144],"6":[2,144],"10":[2,144],"12":[2,144],"16":[2,144],"33":[2,144],"45":[2,144],"47":[2,144],"78":[2,144],"79":[2,144],"93":[2,144],"94":[2,144]},{"3":[2,143],"6":[2,143],"10":[2,143],"12":[2,143],"16":[2,143],"33":[2,143],"45":[2,143],"47":[2,143],"78":[2,143],"79":[2,143],"93":[2,143],"94":[2,143]},{"3":[2,141],"6":[2,141],"10":[2,141],"12":[2,141],"16":[2,141],"33":[2,141],"45":[2,141],"47":[2,141],"78":[2,141],"79":[2,141],"93":[2,141],"94":[2,141]},{"43":[1,97]},{"3":[2,139],"6":[2,139],"10":[2,139],"12":[2,139],"16":[2,139],"33":[2,139],"45":[2,139],"47":[2,139],"78":[2,139],"79":[2,139],"93":[2,139],"94":[2,139]},{"3":[2,133],"5":[2,133],"6":[2,133],"7":[2,133],"10":[2,133],"12":[2,133],"16":[2,133],"33":[2,133],"45":[2,133],"47":[2,133],"78":[2,133],"79":[2,133],"93":[2,133],"94":[2,133]},{"40":[1,98]},{"40":[1,99]},{"3":[2,136],"5":[2,136],"6":[2,136],"7":[2,136],"10":[2,136],"12":[2,136],"16":[2,136],"33":[2,136],"45":[2,136],"47":[2,136],"78":[2,136],"79":[2,136],"93":[2,136],"94":[2,136]},{"3":[2,129],"6":[2,129],"10":[2,129],"12":[2,129],"16":[2,129],"33":[2,129],"45":[2,129],"47":[2,129],"78":[2,129],"79":[2,129],"93":[2,129],"94":[2,129]},{"3":[2,130],"6":[2,130],"10":[2,130],"12":[2,130],"16":[2,130],"33":[2,130],"45":[2,130],"47":[2,130],"78":[2,130],"79":[2,130],"93":[2,130],"94":[2,130]},{"3":[2,131],"6":[2,131],"10":[2,131],"12":[2,131],"16":[2,131],"33":[2,131],"45":[2,131],"47":[2,131],"78":[2,131],"79":[2,131],"93":[2,131],"94":[2,131]},{"3":[2,132],"6":[2,132],"10":[2,132],"12":[2,132],"16":[2,132],"33":[2,132],"45":[2,132],"47":[2,132],"78":[2,132],"79":[2,132],"93":[2,132],"94":[2,132]},{"3":[2,128],"6":[2,128],"10":[2,128],"12":[2,128],"16":[2,128],"33":[2,128],"45":[2,128],"47":[2,128],"78":[2,128],"79":[2,128],"93":[2,128],"94":[2,128]},{"3":[2,125],"6":[2,125],"10":[2,125],"12":[2,125],"16":[2,125],"33":[2,125],"40":[2,125],"45":[2,125],"47":[2,125],"77":[2,125],"78":[2,125],"79":[2,125],"93":[2,125],"94":[2,125]},{"3":[2,126],"6":[2,126],"10":[2,126],"12":[2,126],"16":[2,126],"33":[2,126],"40":[2,126],"45":[2,126],"47":[2,126],"77":[2,126],"78":[2,126],"79":[2,126],"93":[2,126],"94":[2,126]},{"3":[2,127],"6":[2,127],"10":[2,127],"12":[2,127],"16":[2,127],"33":[2,127],"40":[2,127],"45":[2,127],"47":[2,127],"77":[2,127],"78":[2,127],"79":[2,127],"93":[2,127],"94":[2,127]},{"3":[2,116],"6":[2,116],"10":[2,116],"12":[2,116],"16":[2,116],"33":[2,116],"45":[2,116],"47":[2,116],"78":[2,116],"79":[2,116],"93":[2,116],"94":[2,116]},{"3":[2,117],"6":[2,117],"10":[2,117],"12":[2,117],"16":[2,117],"33":[2,117],"45":[2,117],"47":[2,117],"78":[2,117],"79":[2,117],"93":[2,117],"94":[2,117]},{"3":[2,114],"6":[2,114],"10":[2,114],"12":[2,114],"16":[2,114],"33":[2,114],"45":[2,114],"47":[2,114],"78":[2,114],"79":[2,114],"93":[2,114],"94":[2,114]},{"3":[2,115],"6":[2,115],"10":[2,115],"12":[2,115],"16":[2,115],"33":[2,115],"45":[2,115],"47":[2,115],"78":[2,115],"79":[2,115],"93":[2,115],"94":[2,115]},{"0":[1,51],"1":[1,65],"8":[1,64],"9":[1,63],"21":[1,61],"22":[1,56],"23":[1,43],"24":[1,22],"25":[1,17],"27":[1,40],"28":[1,42],"29":[1,50],"30":[1,48],"31":[1,60],"32":[1,62],"34":[1,45],"35":[1,47],"36":[1,41],"37":[1,66],"38":[1,39],"39":[1,52],"41":[1,44],"42":[1,49],"44":[1,69],"57":[1,55],"61":[1,68],"67":[1,57],"68":[1,58],"69":[1,59],"76":[1,53],"84":[1,54],"91":[1,67]},{"12":[2,2],"47":[1,102]},{"3":[2,56],"10":[2,56],"12":[2,56],"16":[2,56],"47":[2,56],"79":[1,103],"94":[2,56]},{"3":[2,58],"10":[2,58],"12":[2,58],"16":[2,58],"47":[2,58],"79":[2,58],"94":[2,58]},{"28":[1,76],"33":[1,74]},{"11":[1,110],"13":[1,108],"15":[1,118],"17":[1,111],"18":[1,109],"19":[1,107],"54":[1,117],"58":[1,114],"64":[1,105],"81":[1,115],"85":[1,113],"86":[1,116],"95":[1,112]},{"33":[1,121],"93":[1,119]},{"3":[2,48],"12":[2,48],"16":[2,48],"33":[2,48],"78":[2,48],"93":[2,48]},{"12":[2,3]},{"10":[1,122],"47":[1,102]},{"10":[1,123]},{"0":[1,51],"1":[1,65],"8":[1,64],"9":[1,63],"21":[1,61],"22":[1,56],"23":[1,43],"24":[1,22],"25":[1,17],"27":[1,40],"28":[1,42],"29":[1,50],"30":[1,48],"31":[1,60],"32":[1,62],"34":[1,45],"35":[1,47],"36":[1,41],"37":[1,66],"38":[1,39],"39":[1,52],"41":[1,44],"42":[1,49],"44":[1,69],"57":[1,55],"61":[1,68],"67":[1,57],"68":[1,58],"69":[1,59],"76":[1,53],"84":[1,54],"91":[1,67]},{"28":[1,76],"75":[1,126],"82":[1,127]},{"2":[1,132],"28":[1,76],"46":[1,129],"63":[1,138],"75":[1,126],"82":[1,127],"83":[1,137],"90":[1,136],"92":[1,135]},{"14":[1,139]},{"14":[1,140]},{"2":[1,132],"28":[1,76],"46":[1,141],"63":[1,138],"83":[1,137],"90":[1,136],"92":[1,135]},{"2":[1,15],"51":[1,11],"56":[1,13],"72":[1,88],"89":[1,10]},{"33":[1,91]},{"2":[1,146]},{"3":[1,147]},{"12":[2,18],"78":[2,18]},{"14":[1,148]},{"40":[1,149]},{"3":[2,121],"5":[2,121],"6":[2,121],"7":[2,121],"8":[2,121],"9":[2,121],"10":[2,121],"12":[2,121],"16":[2,121],"32":[2,121],"33":[2,121],"45":[2,121],"47":[2,121],"77":[2,121],"78":[2,121],"79":[2,121],"93":[2,121],"94":[2,121]},{"8":[1,64],"9":[1,63],"24":[1,152],"32":[1,62]},{"8":[1,64],"9":[1,63],"24":[1,152],"32":[1,62]},{"0":[1,155],"43":[1,156]},{"0":[2,119],"43":[2,119]},{"3":[2,134],"5":[2,134],"6":[2,134],"7":[2,134],"10":[2,134],"12":[2,134],"16":[2,134],"33":[2,134],"45":[2,134],"47":[2,134],"78":[2,134],"79":[2,134],"93":[2,134],"94":[2,134]},{"3":[2,135],"5":[2,135],"6":[2,135],"7":[2,135],"10":[2,135],"12":[2,135],"16":[2,135],"33":[2,135],"45":[2,135],"47":[2,135],"78":[2,135],"79":[2,135],"93":[2,135],"94":[2,135]},{"6":[1,158],"45":[1,157]},{"6":[2,112],"45":[2,112]},{"28":[1,76],"33":[1,74],"74":[1,73]},{"28":[1,76],"33":[1,74]},{"3":[2,59],"10":[2,59],"12":[2,59],"16":[2,59],"47":[2,59],"79":[2,59],"94":[2,59]},{"33":[1,163],"44":[1,69]},{"3":[2,61],"10":[2,61],"12":[2,61],"16":[2,61],"47":[2,61],"79":[2,61],"94":[2,61]},{"0":[1,51],"1":[1,65],"8":[1,64],"9":[1,63],"21":[1,61],"22":[1,56],"23":[1,43],"24":[1,22],"25":[1,17],"27":[1,40],"28":[1,42],"29":[1,50],"30":[1,48],"31":[1,60],"32":[1,62],"33":[1,163],"34":[1,45],"35":[1,47],"36":[1,41],"37":[1,66],"38":[1,39],"39":[1,52],"41":[1,44],"42":[1,49],"44":[1,69],"57":[1,55],"61":[1,68],"67":[1,57],"68":[1,58],"69":[1,59],"76":[1,53],"84":[1,54],"91":[1,67]},{"0":[1,51],"1":[1,65],"8":[1,64],"9":[1,63],"21":[1,61],"22":[1,56],"23":[1,43],"24":[1,22],"25":[1,17],"27":[1,40],"28":[1,42],"29":[1,50],"30":[1,48],"31":[1,60],"32":[1,62],"33":[1,163],"34":[1,45],"35":[1,47],"36":[1,41],"37":[1,66],"38":[1,39],"39":[1,52],"41":[1,44],"42":[1,49],"44":[1,69],"57":[1,55],"61":[1,68],"67":[1,57],"68":[1,58],"69":[1,59],"76":[1,53],"84":[1,54],"91":[1,67]},{"0":[1,51],"1":[1,65],"8":[1,64],"9":[1,63],"21":[1,61],"22":[1,56],"23":[1,43],"24":[1,22],"25":[1,17],"27":[1,40],"28":[1,42],"29":[1,50],"30":[1,48],"31":[1,60],"32":[1,62],"33":[1,163],"34":[1,45],"35":[1,47],"36":[1,41],"37":[1,66],"38":[1,39],"39":[1,52],"41":[1,44],"42":[1,49],"44":[1,69],"57":[1,55],"61":[1,68],"67":[1,57],"68":[1,58],"69":[1,59],"76":[1,53],"84":[1,54],"91":[1,67]},{"0":[1,51],"1":[1,65],"8":[1,64],"9":[1,63],"21":[1,61],"22":[1,56],"23":[1,43],"24":[1,22],"25":[1,17],"27":[1,40],"28":[1,42],"29":[1,50],"30":[1,48],"31":[1,60],"32":[1,62],"33":[1,163],"34":[1,45],"35":[1,47],"36":[1,41],"37":[1,66],"38":[1,39],"39":[1,52],"41":[1,44],"42":[1,49],"44":[1,69],"57":[1,55],"61":[1,68],"67":[1,57],"68":[1,58],"69":[1,59],"76":[1,53],"84":[1,54],"91":[1,67]},{"0":[1,51],"1":[1,65],"8":[1,64],"9":[1,63],"21":[1,61],"22":[1,56],"23":[1,43],"24":[1,22],"25":[1,17],"27":[1,40],"28":[1,42],"29":[1,50],"30":[1,48],"31":[1,60],"32":[1,62],"33":[1,163],"34":[1,45],"35":[1,47],"36":[1,41],"37":[1,66],"38":[1,39],"39":[1,52],"41":[1,44],"42":[1,49],"44":[1,69],"57":[1,55],"61":[1,68],"67":[1,57],"68":[1,58],"69":[1,59],"76":[1,53],"84":[1,54],"91":[1,67]},{"0":[1,51],"1":[1,65],"8":[1,64],"9":[1,63],"21":[1,61],"22":[1,56],"23":[1,43],"24":[1,22],"25":[1,17],"27":[1,40],"28":[1,42],"29":[1,50],"30":[1,48],"31":[1,60],"32":[1,62],"33":[1,163],"34":[1,45],"35":[1,47],"36":[1,41],"37":[1,66],"38":[1,39],"39":[1,52],"41":[1,44],"42":[1,49],"44":[1,69],"57":[1,55],"61":[1,68],"67":[1,57],"68":[1,58],"69":[1,59],"76":[1,53],"84":[1,54],"91":[1,67]},{"0":[1,51],"1":[1,65],"8":[1,64],"9":[1,63],"21":[1,61],"22":[1,56],"23":[1,43],"24":[1,22],"25":[1,17],"27":[1,40],"28":[1,42],"29":[1,50],"30":[1,48],"31":[1,60],"32":[1,62],"33":[1,163],"34":[1,45],"35":[1,47],"36":[1,41],"37":[1,66],"38":[1,39],"39":[1,52],"41":[1,44],"42":[1,49],"44":[1,69],"57":[1,55],"61":[1,68],"67":[1,57],"68":[1,58],"69":[1,59],"76":[1,53],"84":[1,54],"91":[1,67]},{"0":[1,51],"1":[1,65],"8":[1,64],"9":[1,63],"21":[1,61],"22":[1,56],"23":[1,43],"24":[1,22],"25":[1,17],"27":[1,40],"28":[1,42],"29":[1,50],"30":[1,48],"31":[1,60],"32":[1,62],"33":[1,163],"34":[1,45],"35":[1,47],"36":[1,41],"37":[1,66],"38":[1,39],"39":[1,52],"41":[1,44],"42":[1,49],"44":[1,69],"57":[1,55],"61":[1,68],"67":[1,57],"68":[1,58],"69":[1,59],"76":[1,53],"84":[1,54],"91":[1,67]},{"0":[1,51],"1":[1,65],"8":[1,64],"9":[1,63],"21":[1,61],"22":[1,56],"23":[1,43],"24":[1,22],"25":[1,17],"27":[1,40],"28":[1,42],"29":[1,50],"30":[1,48],"31":[1,60],"32":[1,62],"33":[1,163],"34":[1,45],"35":[1,47],"36":[1,41],"37":[1,66],"38":[1,39],"39":[1,52],"41":[1,44],"42":[1,49],"44":[1,69],"57":[1,55],"61":[1,68],"67":[1,57],"68":[1,58],"69":[1,59],"76":[1,53],"84":[1,54],"91":[1,67]},{"0":[1,51],"1":[1,65],"8":[1,64],"9":[1,63],"21":[1,61],"22":[1,56],"23":[1,43],"24":[1,22],"25":[1,17],"27":[1,40],"28":[1,42],"29":[1,50],"30":[1,48],"31":[1,60],"32":[1,62],"33":[1,163],"34":[1,45],"35":[1,47],"36":[1,41],"37":[1,66],"38":[1,39],"39":[1,52],"41":[1,44],"42":[1,49],"44":[1,69],"57":[1,55],"61":[1,68],"67":[1,57],"68":[1,58],"69":[1,59],"76":[1,53],"84":[1,54],"91":[1,67]},{"0":[1,51],"1":[1,65],"8":[1,64],"9":[1,63],"21":[1,61],"22":[1,56],"23":[1,43],"24":[1,22],"25":[1,17],"27":[1,40],"28":[1,42],"29":[1,50],"30":[1,48],"31":[1,60],"32":[1,62],"33":[1,163],"34":[1,45],"35":[1,47],"36":[1,41],"37":[1,66],"38":[1,39],"39":[1,52],"41":[1,44],"42":[1,49],"44":[1,69],"57":[1,55],"61":[1,68],"67":[1,57],"68":[1,58],"69":[1,59],"76":[1,53],"84":[1,54],"91":[1,67]},{"0":[1,51],"1":[1,65],"8":[1,64],"9":[1,63],"21":[1,61],"22":[1,56],"23":[1,43],"24":[1,22],"25":[1,17],"27":[1,40],"28":[1,42],"29":[1,50],"30":[1,48],"31":[1,60],"32":[1,62],"33":[1,163],"34":[1,45],"35":[1,47],"36":[1,41],"37":[1,66],"38":[1,39],"39":[1,52],"41":[1,44],"42":[1,49],"44":[1,69],"57":[1,55],"61":[1,68],"67":[1,57],"68":[1,58],"69":[1,59],"76":[1,53],"84":[1,54],"91":[1,67]},{"28":[1,76],"33":[1,74],"74":[1,73]},{"3":[2,49],"12":[2,49],"16":[2,49],"33":[2,49],"78":[2,49],"93":[2,49]},{"14":[1,189]},{"4":[1,193],"20":[1,194],"28":[1,195],"76":[1,191]},{"4":[1,193],"20":[1,194],"28":[1,195],"76":[1,191]},{"10":[1,197]},{"12":[2,15],"78":[2,15]},{"12":[2,45],"78":[2,45]},{"12":[2,46],"78":[2,46]},{"12":[2,47],"33":[1,121],"78":[2,47]},{"49":[1,204],"50":[1,203],"52":[1,201],"55":[1,202],"70":[1,200],"71":[1,199],"87":[1,198]},{"16":[1,205]},{"3":[2,19],"12":[2,47],"16":[2,19],"33":[1,121],"78":[2,47]},{"2":[1,132],"28":[1,76],"46":[1,206],"63":[1,138],"83":[1,137],"90":[1,136],"92":[1,135]},{"12":[2,17],"78":[2,17]},{"3":[2,28],"16":[2,28],"78":[1,208]},{"8":[1,64],"9":[1,63],"32":[1,62]},{"22":[1,56],"57":[1,55],"76":[1,53],"84":[1,54]},{"8":[1,64],"9":[1,63],"32":[1,62]},{"22":[1,56],"57":[1,55],"76":[1,53],"84":[1,54]},{"22":[1,56],"57":[1,55],"76":[1,53],"84":[1,54]},{"39":[1,52]},{"49":[1,204],"50":[1,203],"52":[1,201],"55":[1,202],"70":[1,200],"71":[1,199],"87":[1,198]},{"3":[1,215]},{"3":[2,19],"16":[2,19],"33":[1,121]},{"3":[1,216]},{"3":[2,44],"16":[2,44],"78":[2,44]},{"2":[1,132],"28":[1,76],"46":[1,141],"63":[1,138],"83":[1,137],"90":[1,136],"92":[1,135]},{"66":[1,218]},{"33":[1,163],"59":[1,220]},{"3":[2,122],"5":[2,122],"6":[2,122],"7":[2,122],"8":[2,122],"9":[2,122],"10":[2,122],"12":[2,122],"16":[2,122],"32":[2,122],"33":[2,122],"45":[2,122],"47":[2,122],"77":[2,122],"78":[2,122],"79":[2,122],"93":[2,122],"94":[2,122]},{"3":[2,137],"5":[2,137],"6":[2,137],"7":[2,137],"10":[2,137],"12":[2,137],"16":[2,137],"33":[2,137],"45":[2,137],"47":[2,137],"78":[2,137],"79":[2,137],"93":[2,137],"94":[2,137]},{"3":[2,123],"5":[2,123],"6":[2,123],"7":[2,123],"8":[1,64],"9":[1,63],"10":[2,123],"12":[2,123],"16":[2,123],"32":[1,62],"33":[2,123],"45":[2,123],"47":[2,123],"77":[2,123],"78":[2,123],"79":[2,123],"93":[2,123],"94":[2,123]},{"3":[2,124],"5":[2,124],"6":[2,124],"7":[2,124],"10":[2,124],"12":[2,124],"16":[2,124],"33":[2,124],"45":[2,124],"47":[2,124],"77":[2,124],"78":[2,124],"79":[2,124],"93":[2,124],"94":[2,124]},{"40":[1,93]},{"3":[2,138],"5":[2,138],"6":[2,138],"7":[2,138],"10":[2,138],"12":[2,138],"16":[2,138],"33":[2,138],"45":[2,138],"47":[2,138],"78":[2,138],"79":[2,138],"93":[2,138],"94":[2,138]},{"3":[2,118],"6":[2,118],"10":[2,118],"12":[2,118],"16":[2,118],"26":[1,221],"33":[2,118],"45":[2,118],"47":[2,118],"78":[2,118],"79":[2,118],"93":[2,118],"94":[2,118]},{"0":[2,120],"43":[2,120]},{"3":[2,111],"6":[2,111],"10":[2,111],"12":[2,111],"16":[2,111],"33":[2,111],"45":[2,111],"47":[2,111],"78":[2,111],"79":[2,111],"93":[2,111],"94":[2,111]},{"0":[1,51],"1":[1,65],"8":[1,64],"9":[1,63],"21":[1,61],"22":[1,56],"23":[1,43],"24":[1,22],"25":[1,17],"27":[1,40],"28":[1,42],"29":[1,50],"30":[1,48],"31":[1,60],"32":[1,62],"34":[1,45],"35":[1,47],"36":[1,41],"37":[1,66],"38":[1,39],"39":[1,52],"41":[1,44],"42":[1,49],"44":[1,69],"57":[1,55],"61":[1,68],"67":[1,57],"68":[1,58],"69":[1,59],"76":[1,53],"84":[1,54],"91":[1,67]},{"3":[2,57],"10":[2,57],"12":[2,57],"16":[2,57],"47":[2,57],"79":[1,103],"94":[2,57]},{"3":[2,60],"10":[2,60],"12":[2,60],"16":[2,60],"47":[2,60],"79":[2,60],"94":[2,60]},{"3":[2,75],"10":[2,75],"12":[2,75],"16":[2,75],"47":[2,75],"79":[2,75],"94":[2,75]},{"3":[2,88],"10":[2,88],"12":[2,88],"16":[2,88],"47":[2,88],"79":[2,88],"94":[2,88]},{"3":[2,53],"6":[2,53],"8":[2,53],"9":[2,53],"10":[2,53],"12":[2,53],"16":[2,53],"32":[2,53],"45":[2,53],"47":[2,53],"77":[2,53],"78":[2,53],"79":[2,53],"94":[2,53]},{"3":[2,64],"10":[2,64],"12":[2,64],"16":[2,64],"47":[2,64],"79":[2,64],"94":[2,64]},{"3":[2,77],"10":[2,77],"12":[2,77],"16":[2,77],"47":[2,77],"79":[2,77],"94":[2,77]},{"3":[2,65],"10":[2,65],"12":[2,65],"16":[2,65],"47":[2,65],"79":[2,65],"94":[2,65]},{"3":[2,78],"10":[2,78],"12":[2,78],"16":[2,78],"47":[2,78],"79":[2,78],"94":[2,78]},{"3":[2,66],"10":[2,66],"12":[2,66],"16":[2,66],"47":[2,66],"79":[2,66],"94":[2,66]},{"3":[2,79],"10":[2,79],"12":[2,79],"16":[2,79],"47":[2,79],"79":[2,79],"94":[2,79]},{"3":[2,67],"10":[2,67],"12":[2,67],"16":[2,67],"47":[2,67],"79":[2,67],"94":[2,67]},{"3":[2,80],"10":[2,80],"12":[2,80],"16":[2,80],"47":[2,80],"79":[2,80],"94":[2,80]},{"3":[2,68],"10":[2,68],"12":[2,68],"16":[2,68],"47":[2,68],"79":[2,68],"94":[2,68]},{"3":[2,81],"10":[2,81],"12":[2,81],"16":[2,81],"47":[2,81],"79":[2,81],"94":[2,81]},{"3":[2,69],"10":[2,69],"12":[2,69],"16":[2,69],"47":[2,69],"79":[2,69],"94":[2,69]},{"3":[2,82],"10":[2,82],"12":[2,82],"16":[2,82],"47":[2,82],"79":[2,82],"94":[2,82]},{"3":[2,70],"10":[2,70],"12":[2,70],"16":[2,70],"47":[2,70],"79":[2,70],"94":[2,70]},{"3":[2,83],"10":[2,83],"12":[2,83],"16":[2,83],"47":[2,83],"79":[2,83],"94":[2,83]},{"3":[2,71],"10":[2,71],"12":[2,71],"16":[2,71],"47":[2,71],"79":[2,71],"94":[2,71]},{"3":[2,84],"10":[2,84],"12":[2,84],"16":[2,84],"47":[2,84],"79":[2,84],"94":[2,84]},{"3":[2,72],"10":[2,72],"12":[2,72],"16":[2,72],"47":[2,72],"79":[2,72],"94":[2,72]},{"3":[2,85],"10":[2,85],"12":[2,85],"16":[2,85],"47":[2,85],"79":[2,85],"94":[2,85]},{"3":[2,73],"10":[2,73],"12":[2,73],"16":[2,73],"47":[2,73],"79":[2,73],"94":[2,73]},{"3":[2,86],"10":[2,86],"12":[2,86],"16":[2,86],"47":[2,86],"79":[2,86],"94":[2,86]},{"3":[2,74],"10":[2,74],"12":[2,74],"16":[2,74],"47":[2,74],"79":[2,74],"94":[2,74]},{"3":[2,87],"10":[2,87],"12":[2,87],"16":[2,87],"47":[2,87],"79":[2,87],"94":[2,87]},{"3":[2,63],"10":[2,63],"12":[2,63],"16":[2,63],"47":[2,63],"79":[2,63],"94":[2,63]},{"3":[2,76],"10":[2,76],"12":[2,76],"16":[2,76],"47":[2,76],"79":[2,76],"94":[2,76]},{"47":[1,102],"94":[1,223]},{"0":[1,51],"1":[1,65],"8":[1,64],"9":[1,63],"21":[1,61],"22":[1,56],"23":[1,43],"24":[1,22],"25":[1,17],"27":[1,40],"28":[1,42],"29":[1,50],"30":[1,48],"31":[1,60],"32":[1,62],"34":[1,45],"35":[1,47],"36":[1,41],"37":[1,66],"38":[1,39],"39":[1,52],"41":[1,44],"42":[1,49],"44":[1,69],"57":[1,55],"61":[1,68],"67":[1,57],"68":[1,58],"69":[1,59],"76":[1,53],"84":[1,54],"91":[1,67]},{"12":[2,7]},{"16":[1,225]},{"16":[1,226]},{"12":[2,11],"16":[2,11]},{"12":[2,12],"16":[2,12]},{"12":[2,13],"16":[2,13],"62":[1,227]},{"12":[2,6]},{"2":[1,15],"51":[1,11],"56":[1,13],"72":[1,12],"76":[1,8],"89":[1,10]},{"33":[1,163]},{"33":[1,163]},{"33":[1,163]},{"33":[1,163]},{"77":[1,233]},{"33":[1,163]},{"33":[1,163]},{"28":[1,76],"75":[1,126],"82":[1,127]},{"49":[1,204],"50":[1,203],"52":[1,201],"55":[1,202],"70":[1,200],"71":[1,199],"87":[1,198]},{"3":[1,237]},{"33":[1,91]},{"6":[1,239]},{"5":[1,94],"6":[1,240],"7":[1,95]},{"6":[1,241]},{"5":[1,94],"6":[1,242],"7":[1,95]},{"5":[1,94],"6":[1,243],"7":[1,95]},{"3":[2,36],"16":[2,36]},{"3":[2,37],"16":[2,37],"78":[1,244]},{"78":[1,245]},{"3":[1,246]},{"2":[1,247]},{"3":[2,50],"12":[2,50],"16":[2,50],"78":[2,50]},{"3":[2,51],"12":[2,51],"16":[2,51],"78":[2,51]},{"3":[2,142],"6":[2,142],"10":[2,142],"12":[2,142],"16":[2,142],"33":[2,142],"45":[2,142],"47":[2,142],"78":[2,142],"79":[2,142],"93":[2,142],"94":[2,142]},{"6":[2,113],"45":[2,113]},{"3":[2,62],"10":[2,62],"12":[2,62],"16":[2,62],"47":[2,62],"79":[2,62],"94":[2,62]},{"3":[2,52],"12":[2,52],"16":[2,52],"33":[2,52],"78":[2,52],"93":[2,52]},{"4":[1,193],"20":[1,194],"28":[1,195]},{"4":[1,193],"20":[1,194],"28":[1,195],"75":[1,249]},{"28":[1,76],"33":[1,74],"74":[1,73]},{"12":[2,5],"78":[1,16]},{"77":[1,252]},{"77":[1,253]},{"77":[1,254]},{"77":[1,255]},{"2":[1,256]},{"8":[1,64],"9":[1,63],"32":[1,62]},{"8":[1,64],"9":[1,63],"32":[1,62]},{"12":[2,16],"78":[2,16]},{"62":[1,259],"66":[1,260]},{"3":[2,34],"16":[2,34],"78":[2,34]},{"8":[1,64],"9":[1,63],"32":[1,62]},{"8":[1,64],"9":[1,63],"24":[1,152],"32":[1,62]},{"8":[1,64],"9":[1,63],"32":[1,62]},{"8":[1,64],"9":[1,63],"24":[1,152],"32":[1,62]},{"65":[1,265]},{"73":[1,266]},{"28":[1,76],"33":[1,74],"74":[1,73],"91":[1,268]},{"3":[2,37],"16":[2,37],"78":[1,244]},{"2":[1,132],"28":[1,76],"46":[1,206],"63":[1,138],"83":[1,137],"90":[1,136],"92":[1,135]},{"12":[2,8]},{"12":[2,9]},{"12":[2,10]},{"12":[2,14],"16":[2,14],"47":[1,102]},{"2":[1,270]},{"2":[1,271]},{"2":[1,272]},{"2":[1,273]},{"2":[1,132],"28":[1,76],"46":[1,206],"63":[1,138],"83":[1,137],"90":[1,136],"92":[1,135]},{"6":[1,275]},{"6":[1,276]},{"28":[1,76],"33":[1,74],"74":[1,73]},{"2":[1,278]},{"77":[1,279]},{"77":[1,280]},{"77":[1,281]},{"77":[1,282]},{"14":[1,283]},{"33":[1,163],"44":[1,284]},{"3":[2,40],"16":[2,40],"47":[1,102]},{"3":[2,41],"16":[2,41]},{"3":[1,286]},{"2":[1,132],"28":[1,76],"46":[1,206],"63":[1,138],"83":[1,137],"90":[1,136],"92":[1,135]},{"2":[1,132],"28":[1,76],"46":[1,206],"63":[1,138],"83":[1,137],"90":[1,136],"92":[1,135]},{"2":[1,132],"28":[1,76],"46":[1,206],"63":[1,138],"83":[1,137],"90":[1,136],"92":[1,135]},{"2":[1,132],"28":[1,76],"46":[1,206],"63":[1,138],"83":[1,137],"90":[1,136],"92":[1,135]},{"3":[1,291]},{"8":[1,64],"9":[1,63],"32":[1,62]},{"8":[1,64],"9":[1,63],"32":[1,62]},{"3":[2,20],"16":[2,20],"47":[1,102]},{"2":[1,132],"28":[1,76],"46":[1,206],"63":[1,138],"83":[1,137],"90":[1,136],"92":[1,135]},{"2":[1,295]},{"2":[1,296]},{"2":[1,297]},{"2":[1,298]},{"8":[1,64],"9":[1,63],"24":[1,152],"32":[1,62]},{"33":[1,163]},{"3":[2,38],"16":[2,38]},{"3":[2,43],"16":[2,43],"78":[2,43]},{"3":[1,302]},{"3":[1,303]},{"3":[1,304]},{"3":[1,305]},{"3":[2,25],"16":[2,25]},{"77":[1,306]},{"77":[1,307]},{"3":[1,308]},{"2":[1,15],"51":[1,11],"56":[1,13],"72":[1,88],"89":[1,10]},{"2":[1,15],"51":[1,11],"56":[1,13],"72":[1,88],"89":[1,10]},{"2":[1,132],"28":[1,76],"46":[1,206],"63":[1,138],"83":[1,137],"90":[1,136],"92":[1,135]},{"2":[1,132],"28":[1,76],"46":[1,206],"63":[1,138],"83":[1,137],"90":[1,136],"92":[1,135]},{"3":[2,35],"16":[2,35]},{"6":[1,314],"45":[1,313]},{"6":[2,54],"45":[2,54]},{"3":[2,23],"16":[2,23]},{"3":[2,21],"16":[2,21]},{"3":[2,22],"16":[2,22]},{"3":[2,24],"16":[2,24]},{"2":[1,315]},{"2":[1,316]},{"3":[2,33],"16":[2,33],"78":[2,33]},{"3":[1,317]},{"3":[1,318]},{"3":[1,319]},{"3":[1,320]},{"3":[2,39],"16":[2,39]},{"33":[1,163]},{"2":[1,132],"28":[1,76],"46":[1,206],"63":[1,138],"83":[1,137],"90":[1,136],"92":[1,135]},{"2":[1,132],"28":[1,76],"46":[1,206],"63":[1,138],"83":[1,137],"90":[1,136],"92":[1,135]},{"3":[2,29],"16":[2,29]},{"3":[2,30],"16":[2,30]},{"3":[2,31],"16":[2,31]},{"3":[2,32],"16":[2,32]},{"6":[2,55],"45":[2,55]},{"3":[1,324]},{"3":[1,325]},{"3":[2,26],"16":[2,26]},{"3":[2,27],"16":[2,27]}];
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
((_1, str, _2) => new Ast.Value.String(str)),
((word) => word.value),
((list, word) => list + word.value),
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
((_1, str, _2, type) => {
                                    if (type.value === 'tt:hashtag' || type.value === 'tt:username')
                                        return new Ast.Value.Entity(str, type.value, null);
                                    else
                                        return new Ast.Value.Entity(null, type.value, str);
                                    }),
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
