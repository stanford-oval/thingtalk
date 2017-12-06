// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingEngine
//
// Copyright 2015-2016 Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const Ast = require('./ast');
const Generate = require('./generate');

/**
 * Differences with the actual NN Grammar (as written in
 * almond-nnparser/grammar/thingtalk.py):
 *
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
 * - no projection
 * - no alias (in aggregate and as a table/stream operator)
 * - no compute
 * - no explicit undefined
 *
 * Differences with full TT:
 * - all filter operators are infix
 * - multiple parameter passings are prefixed with on in a join
 * - function names are prefixed with tt: and are one token
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

module.exports = {
    '$program':       [[['$rule',], (rule) => new Ast.Program([], [], [rule], null, null)],
                       [['$constant_Entity(tt:username)', ':', '$program'], (user, prog) => prog.set({ principal: new Ast.Value.Entity(user.value, 'tt:contact_name', null) })]],

    '$rule':          [[['$stream', '=>', '$action'], (stream, action) => new Ast.Statement.Rule(stream, [action])],
                       [['now', '=>', '$table', '=>', '$action'], (table, action) => new Ast.Statement.Command(table, action)],
                       [['$rule', 'on', '$param_passing'], (rule, _, pp) => {
                           rule.actions[0].in_params.push(pp);
                           return rule;
                       }]],

    '$table':         [[['$get',], (get) => Ast.Table.Invocation(get, null)],
                       [['(', '$table', ')', ',', '$filter'], (_1, table, _2, _3, filter) => new Ast.Table.Filter(table, filter, null)],
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

    '$table_join':    [[['(', '$table', ')', 'join', '(', '$table', ')'], (_1, t1, _2, _3, _4, t2, _5) => new Ast.Table.Join(t1, t2, null)],
                       [['$table_join', 'on', '$param_passing'], (join, _, pp) => {
                           join.param_passing.push(pp);
                           return join;
                       }]],

    '$stream':        [[['timer', 'base', '=', '$constant_Date', ',', 'interval', '=', '$constant_Measure(ms)'], (_1, _2, _3, base, _4, _5, _6, interval) => new Ast.Stream.Timer(base, interval, null)],
                       [['attimer', 'time', '=', '$constant_Time'], (_1, _2, _3, time) => new Ast.Stream.AtTimer(time, null)],
                       [['monitor', '(', '$table', ')'], (monitor, _1, table, _2) => new Ast.Stream.Monitor(table, null)],
                       [['edge', '(', '$stream', ')', 'on', 'new'], (_1, _2, stream, _3, _4, _5) => new Ast.Stream.EdgeNew(stream, null)],
                       [['edge', '(', '$stream', ')', 'on', '$filter'], (_1, _2, stream, _3, _4, filter) => new Ast.Stream.EdgeNew(stream, filter)],
                       [['(', '$stream', ')', ',', '$filter'], (_1, stream, _2, _3, filter) => new Ast.Stream.Filter(stream, filter, null)],
                       [['$stream_join'], identity]],

    '$stream_join':   [[['(', '$stream', ')', 'join', '(', '$table', ')'], (_1, s1, _2, _3, _4, t2, _5) => new Ast.Stream.Join(s1, t2, null)],
                       [['$stream_join', 'on', '$param_passing'], (join, _, pp) => {
                           join.param_passing.push(pp);
                           return join;
                       }]],

    '$action':        [[['notify'], () => Generate.notifyAction()],
                       [['$do'], identity]],

    '$get':           [[['FUNCTION'], (fn) => new Ast.Invocation(new Ast.Selector.Device(fn.value.kind, null, null), fn.value.channel, [], null)],
                       [['$get', '$const_param'], (inv, ip) => {
                           inv.in_params.push(ip);
                           return inv;
                       }]],
    '$do':            [[['FUNCTION'], (fn) => new Ast.Invocation(new Ast.Selector.Device(fn.value.kind, null, null), fn.value.channel, [], null)],
                       [['$do', '$const_param'], (inv, ip) => {
                           inv.in_params.push(ip);
                           return inv;
                       }]],

    '$param_passing': [[['PARAM_NAME', '=', '$out_param'], (pname, _1, out_param) => new Ast.InputParam(pname.value, out_param)],
                       [['PARAM_NAME', '=', 'event'], (pname, _1, _2) => new Ast.InputParam(pname.value, new Ast.Value.Event(null))]],

    '$const_param':   [[['PARAM_NAME', '=', '$constant'], (pname, _1, v) => new Ast.InputParam(pname.value, v)]],

    '$out_param':     [[['PARAM_NAME'], (pname) => new Ast.Value.VarRef(pname.value)]],

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
                       [['$or_filter', 'or', '$atom_filter'], (f1, _, f2) => new Ast.BooleanExpression.Or([f1, f2])]],

    '$atom_filter':   [[['PARAM_NAME', '$value_filter'], (pname, [op, v]) => new Ast.BooleanExpression.Atom(pname.value, op, v)]],

    // in almond-nnparser these are strongly typed constants, so only
    // numbers and measures can be compared for order, etc
    // we're a little looser here because otherwise it becomes unwieldly
    '$value_filter':  [[['==', '$constant'], (op, v) => [op, v]],
                       [['>=', '$constant'], (op, v) => [op, v]],
                       [['<=', '$constant'], (op, v) => [op, v]],
                       [['>', '$constant'], (op, v) => [op, v]],
                       [['<', '$constant'], (op, v) => [op, v]],
                       [['=~', '$constant_String'], (op, v) => [op, v]],
                       [['~=', '$constant_String'], (op, v) => [op, v]],
                       [['starts_with', '$constant_String'], (op, v) => [op, v]],
                       [['ends_with',  '$constant_String'], (op, v) => [op, v]],
                       [['prefix_of',  '$constant_String'], (op, v) => [op, v]],
                       [['suffix_of',  '$constant_String'], (op, v) => [op, v]],
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
                       [['$constant_Number'], identity],
                       [['$constant_Location'], identity],
                       [['$constant_Date'], identity],
                       [['$constant_Time'], identity],
                       [['$constant_Entity(unknown)'], identity],
                       [['$constant_Entity(tt:username)'], identity],
                       [['$constant_Entity(tt:hashtag)'], identity],
                       [['$constant_Entity(tt:phone_number)'], identity],
                       [['$constant_Entity(tt:email_address)'], identity],
                       [['$constant_Entity(tt:url)'], identity],
                       [['$constant_Enum'], identity]],

    // we cannot represent an empty array
    // I don't think that's useful anyway
    '$constant_Array': [[['[', '$constant_array_values', ']'], (_1, values, _2) => new Ast.Value.Array(values)]],

    '$constant_array_values': [[['$constant'], (v) => [v]],
                               [['$constant_array_values', ',', '$constant'], (array, v) => {
                                   array.push(v);
                                   return v;
                               }]],

    '$constant_Boolean': [[['true'], () => new Ast.Value.Boolean(true)],
                          [['false'], () => new Ast.Value.Boolean(false)]],

    '$constant_String': [[['QUOTED_STRING'], (str) => new Ast.Value.String(str.value)]],

    // play fast and loose with units here, because I don't want to write
    // everything by hand
    // almond-nnparser autogenerates this part
    '$constant_Measure': [[['NUMBER', 'UNIT'], (num, unit) => new Ast.Value.Measure(num.value, unit.value)],
                          [['$constant_Measure', 'NUMBER', 'UNIT'], (v1, num, unit) => {
                              if (v1.isCompoundMeasure) {
                                  v1.value.push(new Ast.Value.Measure(num.value, unit.value));
                                  return v1;
                              } else {
                                  return new Ast.Value.CompoundMeasure([v1, new Ast.Value.Measure(num.value, unit.value)]);
                              }
                          }]],
    '$constant_Measure(ms)': [[['$constant_Measure'], identity]],

    '$constant_Number': [[['NUMBER'], (num) => new Ast.Value.Number(num.value)]],

    '$constant_Location': [[['location:current_location'], (tag) => new Ast.Value.Location(new Ast.Location.Relative(tag.substr('location:'.length)))],
                           [['location:home'], (tag) => new Ast.Value.Location(new Ast.Location.Relative(tag.substr('location:'.length)))],
                           [['location:work'], (tag) => new Ast.Value.Location(new Ast.Location.Relative(tag.substr('location:'.length)))],
                           [['LOCATION'], (loc) => new Ast.Value.Location(loc.value)]],

    // start_of/end_of with less than 1h are not supported
    // (they don't make sense)
    '$constant_Date': [[['now'], (loc) => new Ast.Value.Date(null, null)],
                       [['start_of', 'h'], (edge, unit) => new Ast.Value.Date(new Ast.DateEdge(edge, unit), null)],
                       [['start_of', 'day'], (edge, unit) => new Ast.Value.Date(new Ast.DateEdge(edge, unit), null)],
                       [['start_of', 'week'], (edge, unit) => new Ast.Value.Date(new Ast.DateEdge(edge, unit), null)],
                       [['start_of', 'month'], (edge, unit) => new Ast.Value.Date(new Ast.DateEdge(edge, unit), null)],
                       [['start_of', 'year'], (edge, unit) => new Ast.Value.Date(new Ast.DateEdge(edge, unit), null)],
                       [['end_of', 'h'], (edge, unit) => new Ast.Value.Date(new Ast.DateEdge(edge, unit), null)],
                       [['end_of', 'day'], (edge, unit) => new Ast.Value.Date(new Ast.DateEdge(edge, unit), null)],
                       [['end_of', 'week'], (edge, unit) => new Ast.Value.Date(new Ast.DateEdge(edge, unit), null)],
                       [['end_of', 'month'], (edge, unit) => new Ast.Value.Date(new Ast.DateEdge(edge, unit), null)],
                       [['end_of', 'year'], (edge, unit) => new Ast.Value.Date(new Ast.DateEdge(edge, unit), null)],
                       [['DATE'], (abs) => new Ast.Value.Date(abs.value, null)],
                       [['$constant_Date', '+', '$constant_Measure(ms)'], (date, _, offset) => new Ast.Value.Date(date.value, offset)]],

    '$constant_Time': [[['TIME'], (time) => new Ast.Value.Time(time.value.hour, time.value.minute, time.value.second)]],

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
};

const TERMINAL_IDS = {"(":0,")":1,"+":2,",":3,":":4,"<":5,"<<EOF>>":6,"<=":7,"=":8,"==":9,"=>":10,"=~":11,">":12,">=":13,"DATE":14,"EMAIL_ADDRESS":15,"ENUM":16,"FUNCTION":17,"GENERIC_ENTITY":18,"HASHTAG":19,"LOCATION":20,"NUMBER":21,"PARAM_NAME":22,"PHONE_NUMBER":23,"QUOTED_STRING":24,"TIME":25,"UNIT":26,"URL":27,"USERNAME":28,"[":29,"]":30,"aggregate":31,"and":32,"argmax":33,"argmin":34,"attimer":35,"avg":36,"base":37,"contains":38,"count":39,"day":40,"edge":41,"end_of":42,"ends_with":43,"event":44,"false":45,"h":46,"history":47,"in_array":48,"interval":49,"join":50,"location:current_location":51,"location:home":52,"location:work":53,"max":54,"min":55,"monitor":56,"month":57,"new":58,"notify":59,"now":60,"of":61,"on":62,"or":63,"prefix_of":64,"sequence":65,"start_of":66,"starts_with":67,"suffix_of":68,"sum":69,"time":70,"timer":71,"timeseries":72,"true":73,"week":74,"window":75,"year":76,"~=":77};
const RULE_NON_TERMINALS = [28,28,29,29,29,32,32,32,32,32,32,32,32,32,32,32,32,32,32,33,33,30,30,30,30,30,30,30,31,31,1,1,24,24,22,22,27,27,3,26,23,23,25,25,2,34,34,34,34,34,34,34,34,34,34,34,34,34,34,34,34,34,34,34,34,34,34,34,34,34,34,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,5,21,21,6,6,19,16,16,17,18,15,15,15,15,7,7,7,7,7,7,7,7,7,7,7,7,7,20,14,13,12,9,11,10,8,0];
const ARITY = [1,3,3,5,3,1,5,7,7,7,7,6,10,10,1,8,8,8,8,7,3,8,4,4,6,6,5,1,7,3,1,1,1,2,1,2,3,3,3,1,1,3,1,3,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,3,1,3,1,1,1,2,3,1,1,1,1,1,1,1,2,2,2,2,2,2,2,2,2,2,1,3,1,1,1,1,1,1,1,1,2];
const GOTO = [{"12":3,"28":2,"29":7,"30":5,"31":12},{},{},{},{},{},{},{},{},{},{},{"30":21,"31":12},{},{},{"12":3,"28":24,"29":7,"30":5,"31":12},{"1":25,"22":27},{"24":32,"32":30,"33":33},{"27":39},{},{"24":32,"32":42,"33":33},{"30":43,"31":12},{},{"27":45},{"20":46},{},{},{},{"3":48},{},{},{},{"24":32,"32":58,"33":33},{"3":59},{},{"18":61},{"7":64},{"18":68},{"7":69},{},{},{},{"7":71},{},{},{},{},{},{},{},{},{"26":77},{"26":79},{"26":80},{"26":81},{"26":82},{},{"26":84},{"1":85,"22":27},{},{},{"27":87},{},{},{},{},{},{},{},{},{},{"26":103},{},{},{},{"2":109,"23":107,"25":108},{},{"4":112,"5":133,"6":113,"7":118,"8":124,"9":122,"10":123,"11":125,"12":121,"13":120,"14":126,"15":117,"16":115,"18":116,"19":114,"20":119},{"18":143},{},{},{},{},{},{},{"18":149},{},{},{},{"18":152},{},{},{},{},{},{"16":154,"17":153},{"16":154,"17":156},{},{},{},{},{},{"18":157},{"16":154,"17":158},{},{},{},{"2":109,"23":161,"25":108},{},{},{},{"34":165},{"24":32,"32":178,"33":33},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{"4":182,"5":133,"6":113,"7":118,"8":124,"9":122,"10":123,"11":125,"12":121,"13":120,"14":126,"15":117,"16":115,"18":116,"19":114,"20":119,"21":181},{},{},{},{},{},{"24":32,"32":188,"33":33},{},{"2":109,"23":190,"25":108},{},{},{},{},{},{},{},{},{},{},{},{"2":109,"25":197},{"2":198},{"5":199,"26":200},{},{"4":201,"5":133,"6":113,"7":118,"8":124,"9":122,"10":123,"11":125,"12":121,"13":120,"14":126,"15":117,"16":115,"18":116,"19":114,"20":119,"26":202},{"4":203,"5":133,"6":113,"7":118,"8":124,"9":122,"10":123,"11":125,"12":121,"13":120,"14":126,"15":117,"16":115,"18":116,"19":114,"20":119,"26":204},{"4":205,"5":133,"6":113,"7":118,"8":124,"9":122,"10":123,"11":125,"12":121,"13":120,"14":126,"15":117,"16":115,"18":116,"19":114,"20":119,"26":206},{"4":207,"5":133,"6":113,"7":118,"8":124,"9":122,"10":123,"11":125,"12":121,"13":120,"14":126,"15":117,"16":115,"18":116,"19":114,"20":119,"26":208},{"19":209,"26":210},{"19":211,"26":212},{"19":213,"26":214},{"19":215,"26":216},{"19":217,"26":218},{"19":219,"26":220},{"4":221,"5":133,"6":113,"7":118,"8":124,"9":122,"10":123,"11":125,"12":121,"13":120,"14":126,"15":117,"16":115,"18":116,"19":114,"20":119,"26":222},{"4":223,"5":133,"6":113,"7":118,"8":124,"9":122,"10":123,"11":125,"12":121,"13":120,"14":126,"15":117,"16":115,"18":116,"19":114,"20":119,"26":224},{},{},{},{},{},{"18":229},{"24":32,"32":230,"33":33},{"24":32,"32":231,"33":33},{"24":32,"32":232,"33":33},{"24":32,"32":233,"33":33},{},{"18":235},{},{"24":32,"32":236,"33":33},{},{},{},{},{"16":154,"17":241},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{"4":242,"5":133,"6":113,"7":118,"8":124,"9":122,"10":123,"11":125,"12":121,"13":120,"14":126,"15":117,"16":115,"18":116,"19":114,"20":119},{},{},{},{},{},{},{},{},{"30":250,"31":12},{"30":251,"31":12},{"24":32,"32":252,"33":33},{"24":32,"32":253,"33":33},{},{},{},{},{},{},{},{},{},{},{},{},{},{"24":32,"32":260,"33":33},{"24":32,"32":261,"33":33},{},{},{},{},{},{},{},{}];
const PARSER_ACTION = [{"0":[1,11],"28":[1,4],"35":[1,1],"41":[1,10],"56":[1,9],"60":[1,6],"71":[1,8]},{"70":[1,13]},{"6":[0]},{"4":[1,14]},{"1":[2,116],"3":[2,116],"4":[2,116],"6":[2,116],"10":[2,116],"22":[2,116],"30":[2,116],"32":[2,116],"62":[2,116],"63":[2,116]},{"10":[1,15]},{"10":[1,16]},{"6":[2,0],"62":[1,17]},{"37":[1,18]},{"0":[1,19]},{"0":[1,20]},{"0":[1,11],"35":[1,1],"41":[1,10],"56":[1,9],"71":[1,8]},{"1":[2,27],"10":[2,27],"62":[1,22]},{"8":[1,23]},{"0":[1,11],"28":[1,4],"35":[1,1],"41":[1,10],"56":[1,9],"60":[1,6],"71":[1,8]},{"17":[1,28],"59":[1,26]},{"0":[1,31],"17":[1,38],"31":[1,29],"47":[1,37],"65":[1,36],"72":[1,35],"75":[1,34]},{"22":[1,40]},{"8":[1,41]},{"0":[1,31],"17":[1,38],"31":[1,29],"47":[1,37],"65":[1,36],"72":[1,35],"75":[1,34]},{"0":[1,11],"35":[1,1],"41":[1,10],"56":[1,9],"71":[1,8]},{"1":[1,44]},{"22":[1,40]},{"25":[1,47]},{"6":[2,1]},{"6":[2,2],"62":[2,2]},{"6":[2,30],"62":[2,30]},{"6":[2,31],"22":[1,49],"62":[2,31]},{"6":[2,34],"22":[2,34],"62":[2,34]},{"33":[1,50],"34":[1,56],"36":[1,54],"39":[1,55],"54":[1,52],"55":[1,51],"69":[1,53]},{"10":[1,57]},{"0":[1,31],"17":[1,38],"31":[1,29],"47":[1,37],"65":[1,36],"72":[1,35],"75":[1,34]},{"1":[2,5],"10":[2,5],"22":[1,49]},{"1":[2,14],"10":[2,14],"62":[1,60]},{"21":[1,62]},{"14":[1,67],"42":[1,63],"60":[1,66],"66":[1,65]},{"21":[1,62]},{"14":[1,67],"42":[1,63],"60":[1,66],"66":[1,65]},{"1":[2,32],"10":[2,32],"22":[2,32]},{"6":[2,4],"62":[2,4]},{"8":[1,70]},{"14":[1,67],"42":[1,63],"60":[1,66],"66":[1,65]},{"1":[1,72]},{"1":[1,73]},{"3":[1,74],"50":[1,75]},{"1":[2,29],"10":[2,29],"62":[2,29]},{"1":[2,22],"10":[2,22]},{"1":[2,113],"3":[2,113],"6":[2,113],"10":[2,113],"22":[2,113],"30":[2,113],"32":[2,113],"62":[2,113],"63":[2,113]},{"6":[2,35],"22":[2,35],"62":[2,35]},{"8":[1,76]},{"22":[1,78]},{"22":[1,78]},{"22":[1,78]},{"22":[1,78]},{"22":[1,78]},{"61":[1,83]},{"22":[1,78]},{"17":[1,28],"59":[1,26]},{"1":[1,86]},{"1":[2,33],"10":[2,33],"22":[2,33]},{"22":[1,40]},{"3":[1,88]},{"1":[2,95],"3":[2,95],"6":[2,95],"10":[2,95],"22":[2,95],"30":[2,95],"32":[2,95],"61":[2,95],"62":[2,95],"63":[2,95]},{"40":[1,90],"46":[1,89],"57":[1,92],"74":[1,91],"76":[1,93]},{"2":[1,95],"3":[1,94]},{"40":[1,97],"46":[1,96],"57":[1,99],"74":[1,98],"76":[1,100]},{"1":[2,100],"2":[2,100],"3":[2,100],"6":[2,100],"10":[2,100],"22":[2,100],"30":[2,100],"32":[2,100],"62":[2,100],"63":[2,100]},{"1":[2,111],"2":[2,111],"3":[2,111],"6":[2,111],"10":[2,111],"22":[2,111],"30":[2,111],"32":[2,111],"62":[2,111],"63":[2,111]},{"3":[1,101]},{"2":[1,95],"3":[1,102]},{"22":[1,78],"44":[1,104]},{"2":[1,95],"3":[1,105]},{"1":[2,23],"10":[2,23]},{"62":[1,106]},{"22":[1,110]},{"0":[1,111]},{"14":[1,67],"15":[1,129],"16":[1,127],"18":[1,132],"19":[1,131],"20":[1,137],"21":[1,138],"23":[1,130],"24":[1,139],"25":[1,47],"27":[1,128],"28":[1,4],"29":[1,142],"42":[1,63],"45":[1,141],"51":[1,134],"52":[1,135],"53":[1,136],"60":[1,66],"66":[1,65],"73":[1,140]},{"21":[1,62]},{"1":[2,39],"6":[2,39],"10":[2,39],"21":[2,39],"32":[2,39],"61":[2,39],"62":[2,39],"63":[2,39]},{"61":[1,144]},{"61":[1,145]},{"61":[1,146]},{"61":[1,147]},{"0":[1,148]},{"21":[1,62]},{"6":[2,3],"62":[2,3]},{"3":[1,150],"50":[1,151]},{"1":[2,20],"10":[2,20],"62":[2,20]},{"21":[1,62]},{"1":[2,106],"2":[2,106],"3":[2,106],"6":[2,106],"10":[2,106],"22":[2,106],"30":[2,106],"32":[2,106],"62":[2,106],"63":[2,106]},{"1":[2,107],"2":[2,107],"3":[2,107],"6":[2,107],"10":[2,107],"22":[2,107],"30":[2,107],"32":[2,107],"62":[2,107],"63":[2,107]},{"1":[2,108],"2":[2,108],"3":[2,108],"6":[2,108],"10":[2,108],"22":[2,108],"30":[2,108],"32":[2,108],"62":[2,108],"63":[2,108]},{"1":[2,109],"2":[2,109],"3":[2,109],"6":[2,109],"10":[2,109],"22":[2,109],"30":[2,109],"32":[2,109],"62":[2,109],"63":[2,109]},{"1":[2,110],"2":[2,110],"3":[2,110],"6":[2,110],"10":[2,110],"22":[2,110],"30":[2,110],"32":[2,110],"62":[2,110],"63":[2,110]},{"21":[1,155]},{"21":[1,155]},{"1":[2,101],"2":[2,101],"3":[2,101],"6":[2,101],"10":[2,101],"22":[2,101],"30":[2,101],"32":[2,101],"62":[2,101],"63":[2,101]},{"1":[2,102],"2":[2,102],"3":[2,102],"6":[2,102],"10":[2,102],"22":[2,102],"30":[2,102],"32":[2,102],"62":[2,102],"63":[2,102]},{"1":[2,103],"2":[2,103],"3":[2,103],"6":[2,103],"10":[2,103],"22":[2,103],"30":[2,103],"32":[2,103],"62":[2,103],"63":[2,103]},{"1":[2,104],"2":[2,104],"3":[2,104],"6":[2,104],"10":[2,104],"22":[2,104],"30":[2,104],"32":[2,104],"62":[2,104],"63":[2,104]},{"1":[2,105],"2":[2,105],"3":[2,105],"6":[2,105],"10":[2,105],"22":[2,105],"30":[2,105],"32":[2,105],"62":[2,105],"63":[2,105]},{"21":[1,62]},{"21":[1,155]},{"1":[2,36],"6":[2,36],"10":[2,36],"62":[2,36]},{"1":[2,37],"6":[2,37],"10":[2,37],"62":[2,37]},{"49":[1,159]},{"22":[1,110],"58":[1,160]},{"1":[2,26],"10":[2,26],"32":[1,162]},{"1":[2,40],"10":[2,40],"32":[2,40],"63":[1,163]},{"1":[2,42],"10":[2,42],"32":[2,42],"63":[2,42]},{"5":[1,169],"7":[1,167],"9":[1,177],"11":[1,170],"12":[1,168],"13":[1,166],"38":[1,176],"43":[1,173],"48":[1,164],"64":[1,174],"67":[1,172],"68":[1,175],"77":[1,171]},{"0":[1,31],"17":[1,38],"31":[1,29],"47":[1,37],"65":[1,36],"72":[1,35],"75":[1,34]},{"1":[2,38],"6":[2,38],"10":[2,38],"22":[2,38],"62":[2,38]},{"1":[2,72],"3":[2,72],"6":[2,72],"10":[2,72],"22":[2,72],"30":[2,72],"32":[2,72],"62":[2,72],"63":[2,72]},{"1":[2,73],"3":[2,73],"6":[2,73],"10":[2,73],"22":[2,73],"30":[2,73],"32":[2,73],"62":[2,73],"63":[2,73]},{"1":[2,74],"3":[2,74],"6":[2,74],"10":[2,74],"21":[1,179],"22":[2,74],"30":[2,74],"32":[2,74],"62":[2,74],"63":[2,74]},{"1":[2,75],"3":[2,75],"6":[2,75],"10":[2,75],"22":[2,75],"30":[2,75],"32":[2,75],"62":[2,75],"63":[2,75]},{"1":[2,76],"3":[2,76],"6":[2,76],"10":[2,76],"22":[2,76],"30":[2,76],"32":[2,76],"62":[2,76],"63":[2,76]},{"1":[2,77],"2":[1,95],"3":[2,77],"6":[2,77],"10":[2,77],"22":[2,77],"30":[2,77],"32":[2,77],"62":[2,77],"63":[2,77]},{"1":[2,78],"3":[2,78],"6":[2,78],"10":[2,78],"22":[2,78],"30":[2,78],"32":[2,78],"62":[2,78],"63":[2,78]},{"1":[2,79],"3":[2,79],"6":[2,79],"10":[2,79],"22":[2,79],"30":[2,79],"32":[2,79],"62":[2,79],"63":[2,79]},{"1":[2,80],"3":[2,80],"6":[2,80],"10":[2,80],"22":[2,80],"30":[2,80],"32":[2,80],"62":[2,80],"63":[2,80]},{"1":[2,81],"3":[2,81],"6":[2,81],"10":[2,81],"22":[2,81],"30":[2,81],"32":[2,81],"62":[2,81],"63":[2,81]},{"1":[2,82],"3":[2,82],"6":[2,82],"10":[2,82],"22":[2,82],"30":[2,82],"32":[2,82],"62":[2,82],"63":[2,82]},{"1":[2,83],"3":[2,83],"6":[2,83],"10":[2,83],"22":[2,83],"30":[2,83],"32":[2,83],"62":[2,83],"63":[2,83]},{"1":[2,84],"3":[2,84],"6":[2,84],"10":[2,84],"22":[2,84],"30":[2,84],"32":[2,84],"62":[2,84],"63":[2,84]},{"1":[2,85],"3":[2,85],"6":[2,85],"10":[2,85],"22":[2,85],"30":[2,85],"32":[2,85],"62":[2,85],"63":[2,85]},{"1":[2,114],"3":[2,114],"6":[2,114],"10":[2,114],"22":[2,114],"30":[2,114],"32":[2,114],"62":[2,114],"63":[2,114]},{"1":[2,118],"3":[2,118],"6":[2,118],"10":[2,118],"22":[2,118],"30":[2,118],"32":[2,118],"62":[2,118],"63":[2,118]},{"1":[2,120],"3":[2,120],"6":[2,120],"10":[2,120],"22":[2,120],"30":[2,120],"32":[2,120],"62":[2,120],"63":[2,120]},{"1":[2,119],"3":[2,119],"6":[2,119],"10":[2,119],"22":[2,119],"30":[2,119],"32":[2,119],"62":[2,119],"63":[2,119]},{"1":[2,117],"3":[2,117],"6":[2,117],"10":[2,117],"22":[2,117],"30":[2,117],"32":[2,117],"62":[2,117],"63":[2,117]},{"1":[2,115],"3":[2,115],"6":[2,115],"10":[2,115],"22":[2,115],"30":[2,115],"32":[2,115],"62":[2,115],"63":[2,115]},{"1":[2,71],"3":[2,71],"6":[2,71],"10":[2,71],"22":[2,71],"30":[2,71],"32":[2,71],"62":[2,71],"63":[2,71]},{"1":[2,96],"3":[2,96],"6":[2,96],"10":[2,96],"22":[2,96],"30":[2,96],"32":[2,96],"62":[2,96],"63":[2,96]},{"1":[2,97],"3":[2,97],"6":[2,97],"10":[2,97],"22":[2,97],"30":[2,97],"32":[2,97],"62":[2,97],"63":[2,97]},{"1":[2,98],"3":[2,98],"6":[2,98],"10":[2,98],"22":[2,98],"30":[2,98],"32":[2,98],"62":[2,98],"63":[2,98]},{"1":[2,99],"3":[2,99],"6":[2,99],"10":[2,99],"22":[2,99],"30":[2,99],"32":[2,99],"62":[2,99],"63":[2,99]},{"1":[2,95],"3":[2,95],"6":[2,95],"10":[2,95],"22":[2,95],"26":[1,180],"30":[2,95],"32":[2,95],"61":[2,95],"62":[2,95],"63":[2,95]},{"1":[2,91],"3":[2,91],"6":[2,91],"10":[2,91],"22":[2,91],"30":[2,91],"32":[2,91],"62":[2,91],"63":[2,91]},{"1":[2,89],"3":[2,89],"6":[2,89],"10":[2,89],"22":[2,89],"30":[2,89],"32":[2,89],"62":[2,89],"63":[2,89]},{"1":[2,90],"3":[2,90],"6":[2,90],"10":[2,90],"22":[2,90],"30":[2,90],"32":[2,90],"62":[2,90],"63":[2,90]},{"14":[1,67],"15":[1,129],"16":[1,127],"18":[1,132],"19":[1,131],"20":[1,137],"21":[1,138],"23":[1,130],"24":[1,139],"25":[1,47],"27":[1,128],"28":[1,4],"29":[1,142],"42":[1,63],"45":[1,141],"51":[1,134],"52":[1,135],"53":[1,136],"60":[1,66],"66":[1,65],"73":[1,140]},{"3":[1,183]},{"0":[1,184]},{"0":[1,185]},{"0":[1,186]},{"0":[1,187]},{"0":[1,31],"17":[1,38],"31":[1,29],"47":[1,37],"65":[1,36],"72":[1,35],"75":[1,34]},{"3":[1,189]},{"22":[1,110]},{"0":[1,191]},{"61":[1,192]},{"61":[1,193]},{"1":[2,94],"2":[2,94],"3":[2,94],"6":[2,94],"10":[2,94],"21":[1,179],"22":[2,94],"30":[2,94],"32":[2,94],"61":[2,94],"62":[2,94],"63":[2,94]},{"26":[1,180]},{"1":[2,112],"2":[2,112],"3":[2,112],"6":[2,112],"10":[2,112],"22":[2,112],"30":[2,112],"32":[2,112],"62":[2,112],"63":[2,112]},{"61":[1,194]},{"61":[1,195]},{"8":[1,196]},{"1":[2,24],"10":[2,24]},{"1":[2,25],"10":[2,25],"32":[1,162]},{"22":[1,110]},{"22":[1,110]},{"22":[1,78],"29":[1,142]},{"1":[2,44],"10":[2,44],"32":[2,44],"63":[2,44]},{"14":[1,67],"15":[1,129],"16":[1,127],"18":[1,132],"19":[1,131],"20":[1,137],"21":[1,138],"22":[1,78],"23":[1,130],"24":[1,139],"25":[1,47],"27":[1,128],"28":[1,4],"29":[1,142],"42":[1,63],"45":[1,141],"51":[1,134],"52":[1,135],"53":[1,136],"60":[1,66],"66":[1,65],"73":[1,140]},{"14":[1,67],"15":[1,129],"16":[1,127],"18":[1,132],"19":[1,131],"20":[1,137],"21":[1,138],"22":[1,78],"23":[1,130],"24":[1,139],"25":[1,47],"27":[1,128],"28":[1,4],"29":[1,142],"42":[1,63],"45":[1,141],"51":[1,134],"52":[1,135],"53":[1,136],"60":[1,66],"66":[1,65],"73":[1,140]},{"14":[1,67],"15":[1,129],"16":[1,127],"18":[1,132],"19":[1,131],"20":[1,137],"21":[1,138],"22":[1,78],"23":[1,130],"24":[1,139],"25":[1,47],"27":[1,128],"28":[1,4],"29":[1,142],"42":[1,63],"45":[1,141],"51":[1,134],"52":[1,135],"53":[1,136],"60":[1,66],"66":[1,65],"73":[1,140]},{"14":[1,67],"15":[1,129],"16":[1,127],"18":[1,132],"19":[1,131],"20":[1,137],"21":[1,138],"22":[1,78],"23":[1,130],"24":[1,139],"25":[1,47],"27":[1,128],"28":[1,4],"29":[1,142],"42":[1,63],"45":[1,141],"51":[1,134],"52":[1,135],"53":[1,136],"60":[1,66],"66":[1,65],"73":[1,140]},{"22":[1,78],"24":[1,139]},{"22":[1,78],"24":[1,139]},{"22":[1,78],"24":[1,139]},{"22":[1,78],"24":[1,139]},{"22":[1,78],"24":[1,139]},{"22":[1,78],"24":[1,139]},{"14":[1,67],"15":[1,129],"16":[1,127],"18":[1,132],"19":[1,131],"20":[1,137],"21":[1,138],"22":[1,78],"23":[1,130],"24":[1,139],"25":[1,47],"27":[1,128],"28":[1,4],"29":[1,142],"42":[1,63],"45":[1,141],"51":[1,134],"52":[1,135],"53":[1,136],"60":[1,66],"66":[1,65],"73":[1,140]},{"14":[1,67],"15":[1,129],"16":[1,127],"18":[1,132],"19":[1,131],"20":[1,137],"21":[1,138],"22":[1,78],"23":[1,130],"24":[1,139],"25":[1,47],"27":[1,128],"28":[1,4],"29":[1,142],"42":[1,63],"45":[1,141],"51":[1,134],"52":[1,135],"53":[1,136],"60":[1,66],"66":[1,65],"73":[1,140]},{"1":[1,225]},{"26":[1,226]},{"1":[2,92],"2":[2,92],"3":[2,92],"6":[2,92],"10":[2,92],"21":[2,92],"22":[2,92],"30":[2,92],"32":[2,92],"61":[2,92],"62":[2,92],"63":[2,92]},{"3":[1,228],"30":[1,227]},{"3":[2,87],"30":[2,87]},{"21":[1,62]},{"0":[1,31],"17":[1,38],"31":[1,29],"47":[1,37],"65":[1,36],"72":[1,35],"75":[1,34]},{"0":[1,31],"17":[1,38],"31":[1,29],"47":[1,37],"65":[1,36],"72":[1,35],"75":[1,34]},{"0":[1,31],"17":[1,38],"31":[1,29],"47":[1,37],"65":[1,36],"72":[1,35],"75":[1,34]},{"0":[1,31],"17":[1,38],"31":[1,29],"47":[1,37],"65":[1,36],"72":[1,35],"75":[1,34]},{"1":[1,234]},{"21":[1,62]},{"1":[2,6],"10":[2,6],"32":[1,162]},{"0":[1,31],"17":[1,38],"31":[1,29],"47":[1,37],"65":[1,36],"72":[1,35],"75":[1,34]},{"0":[1,237]},{"0":[1,238]},{"0":[1,239]},{"0":[1,240]},{"21":[1,155]},{"1":[2,41],"10":[2,41],"32":[2,41],"63":[1,163]},{"1":[2,43],"10":[2,43],"32":[2,43],"63":[2,43]},{"1":[2,57],"10":[2,57],"32":[2,57],"63":[2,57]},{"1":[2,70],"10":[2,70],"32":[2,70],"63":[2,70]},{"1":[2,46],"10":[2,46],"32":[2,46],"63":[2,46]},{"1":[2,59],"10":[2,59],"32":[2,59],"63":[2,59]},{"1":[2,47],"10":[2,47],"32":[2,47],"63":[2,47]},{"1":[2,60],"10":[2,60],"32":[2,60],"63":[2,60]},{"1":[2,48],"10":[2,48],"32":[2,48],"63":[2,48]},{"1":[2,61],"10":[2,61],"32":[2,61],"63":[2,61]},{"1":[2,49],"10":[2,49],"32":[2,49],"63":[2,49]},{"1":[2,62],"10":[2,62],"32":[2,62],"63":[2,62]},{"1":[2,50],"10":[2,50],"32":[2,50],"63":[2,50]},{"1":[2,63],"10":[2,63],"32":[2,63],"63":[2,63]},{"1":[2,51],"10":[2,51],"32":[2,51],"63":[2,51]},{"1":[2,64],"10":[2,64],"32":[2,64],"63":[2,64]},{"1":[2,52],"10":[2,52],"32":[2,52],"63":[2,52]},{"1":[2,65],"10":[2,65],"32":[2,65],"63":[2,65]},{"1":[2,53],"10":[2,53],"32":[2,53],"63":[2,53]},{"1":[2,66],"10":[2,66],"32":[2,66],"63":[2,66]},{"1":[2,54],"10":[2,54],"32":[2,54],"63":[2,54]},{"1":[2,67],"10":[2,67],"32":[2,67],"63":[2,67]},{"1":[2,55],"10":[2,55],"32":[2,55],"63":[2,55]},{"1":[2,68],"10":[2,68],"32":[2,68],"63":[2,68]},{"1":[2,56],"10":[2,56],"32":[2,56],"63":[2,56]},{"1":[2,69],"10":[2,69],"32":[2,69],"63":[2,69]},{"1":[2,45],"10":[2,45],"32":[2,45],"63":[2,45]},{"1":[2,58],"10":[2,58],"32":[2,58],"63":[2,58]},{"1":[2,28],"10":[2,28],"62":[2,28]},{"1":[2,93],"2":[2,93],"3":[2,93],"6":[2,93],"10":[2,93],"21":[2,93],"22":[2,93],"30":[2,93],"32":[2,93],"61":[2,93],"62":[2,93],"63":[2,93]},{"1":[2,86],"3":[2,86],"6":[2,86],"10":[2,86],"22":[2,86],"30":[2,86],"32":[2,86],"62":[2,86],"63":[2,86]},{"14":[1,67],"15":[1,129],"16":[1,127],"18":[1,132],"19":[1,131],"20":[1,137],"21":[1,138],"23":[1,130],"24":[1,139],"25":[1,47],"27":[1,128],"28":[1,4],"29":[1,142],"42":[1,63],"45":[1,141],"51":[1,134],"52":[1,135],"53":[1,136],"60":[1,66],"66":[1,65],"73":[1,140]},{"61":[1,243]},{"1":[1,244]},{"1":[1,245]},{"1":[1,246]},{"1":[1,247]},{"1":[2,11],"10":[2,11]},{"61":[1,248]},{"1":[1,249]},{"0":[1,11],"35":[1,1],"41":[1,10],"56":[1,9],"71":[1,8]},{"0":[1,11],"35":[1,1],"41":[1,10],"56":[1,9],"71":[1,8]},{"0":[1,31],"17":[1,38],"31":[1,29],"47":[1,37],"65":[1,36],"72":[1,35],"75":[1,34]},{"0":[1,31],"17":[1,38],"31":[1,29],"47":[1,37],"65":[1,36],"72":[1,35],"75":[1,34]},{"1":[2,21],"10":[2,21]},{"3":[2,88],"30":[2,88]},{"0":[1,254]},{"1":[2,7],"10":[2,7]},{"1":[2,8],"10":[2,8]},{"1":[2,9],"10":[2,9]},{"1":[2,10],"10":[2,10]},{"0":[1,255]},{"1":[2,19],"10":[2,19],"62":[2,19]},{"1":[1,256]},{"1":[1,257]},{"1":[1,258]},{"1":[1,259]},{"0":[1,31],"17":[1,38],"31":[1,29],"47":[1,37],"65":[1,36],"72":[1,35],"75":[1,34]},{"0":[1,31],"17":[1,38],"31":[1,29],"47":[1,37],"65":[1,36],"72":[1,35],"75":[1,34]},{"1":[2,15],"10":[2,15]},{"1":[2,16],"10":[2,16]},{"1":[2,17],"10":[2,17]},{"1":[2,18],"10":[2,18]},{"1":[1,262]},{"1":[1,263]},{"1":[2,13],"10":[2,13]},{"1":[2,12],"10":[2,12]}];
const SEMANTIC_ACTION = [
((rule) => new Ast.Program([], [], [rule], null, null)),
((user, prog) => prog.set({ principal: new Ast.Value.Entity(user.value, 'tt:contact_name', null) })),
((stream, action) => new Ast.Statement.Rule(stream, [action])),
((table, action) => new Ast.Statement.Command(table, action)),
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
((_1, t1, _2, _3, _4, t2, _5) => new Ast.Table.Join(t1, t2, null)),
((join, _, pp) => {
                           join.param_passing.push(pp);
                           return join;
                       }),
((_1, _2, _3, base, _4, _5, _6, interval) => new Ast.Stream.Timer(base, interval, null)),
((_1, _2, _3, time) => new Ast.Stream.AtTimer(time, null)),
((monitor, _1, table, _2) => new Ast.Stream.Monitor(table, null)),
((_1, _2, stream, _3, _4, _5) => new Ast.Stream.EdgeNew(stream, null)),
((_1, _2, stream, _3, _4, filter) => new Ast.Stream.EdgeNew(stream, filter)),
((_1, stream, _2, _3, filter) => new Ast.Stream.Filter(stream, filter, null)),
((x) => x),
((_1, s1, _2, _3, _4, t2, _5) => new Ast.Stream.Join(s1, t2, null)),
((join, _, pp) => {
                           join.param_passing.push(pp);
                           return join;
                       }),
(() => Generate.notifyAction()),
((x) => x),
((fn) => new Ast.Invocation(new Ast.Selector.Device(fn.value.kind, null, null), fn.value.channel, [], null)),
((inv, ip) => {
                           inv.in_params.push(ip);
                           return inv;
                       }),
((fn) => new Ast.Invocation(new Ast.Selector.Device(fn.value.kind, null, null), fn.value.channel, [], null)),
((inv, ip) => {
                           inv.in_params.push(ip);
                           return inv;
                       }),
((pname, _1, out_param) => new Ast.InputParam(pname.value, out_param)),
((pname, _1, _2) => new Ast.InputParam(pname.value, new Ast.Value.Event(null))),
((pname, _1, v) => new Ast.InputParam(pname.value, v)),
((pname) => new Ast.Value.VarRef(pname.value)),
((x) => x),
((f1, _, f2) => new Ast.BooleanExpression.And([f1, f2])),
((x) => x),
((f1, _, f2) => new Ast.BooleanExpression.Or([f1, f2])),
((pname, [op, v]) => new Ast.BooleanExpression.Atom(pname.value, op, v)),
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
((_1, values, _2) => new Ast.Value.Array(values)),
((v) => [v]),
((array, v) => {
                                   array.push(v);
                                   return v;
                               }),
(() => new Ast.Value.Boolean(true)),
(() => new Ast.Value.Boolean(false)),
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
((num) => new Ast.Value.Number(num.value)),
((tag) => new Ast.Value.Location(new Ast.Location.Relative(tag.substr('location:'.length)))),
((tag) => new Ast.Value.Location(new Ast.Location.Relative(tag.substr('location:'.length)))),
((tag) => new Ast.Value.Location(new Ast.Location.Relative(tag.substr('location:'.length)))),
((loc) => new Ast.Value.Location(loc.value)),
((loc) => new Ast.Value.Date(null, null)),
((edge, unit) => new Ast.Value.Date(new Ast.DateEdge(edge, unit), null)),
((edge, unit) => new Ast.Value.Date(new Ast.DateEdge(edge, unit), null)),
((edge, unit) => new Ast.Value.Date(new Ast.DateEdge(edge, unit), null)),
((edge, unit) => new Ast.Value.Date(new Ast.DateEdge(edge, unit), null)),
((edge, unit) => new Ast.Value.Date(new Ast.DateEdge(edge, unit), null)),
((edge, unit) => new Ast.Value.Date(new Ast.DateEdge(edge, unit), null)),
((edge, unit) => new Ast.Value.Date(new Ast.DateEdge(edge, unit), null)),
((edge, unit) => new Ast.Value.Date(new Ast.DateEdge(edge, unit), null)),
((edge, unit) => new Ast.Value.Date(new Ast.DateEdge(edge, unit), null)),
((edge, unit) => new Ast.Value.Date(new Ast.DateEdge(edge, unit), null)),
((abs) => new Ast.Value.Date(abs.value, null)),
((date, _, offset) => new Ast.Value.Date(date.value, offset)),
((time) => new Ast.Value.Time(time.value.hour, time.value.minute, time.value.second)),
((venum) => new Ast.Value.Enum(venum.value)),
((entity) => new Ast.Value.Entity(entity.value.value, entity.value.type, entity.value.display)),
((entity) => new Ast.Value.Entity(entity.value, 'tt:username', null)),
((entity) => new Ast.Value.Entity(entity.value, 'tt:hashtag', null)),
((entity) => new Ast.Value.Entity(entity.value, 'tt:url', null)),
((entity) => new Ast.Value.Entity(entity.value, 'tt:phone_number', null)),
((entity) => new Ast.Value.Entity(entity.value, 'tt:email_address', null)),
((x) => x),
];
module.exports = require('./sr_parser')(TERMINAL_IDS, RULE_NON_TERMINALS, ARITY, GOTO, PARSER_ACTION, SEMANTIC_ACTION);
