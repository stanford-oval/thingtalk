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

function parseDate(form) {
    if (form instanceof Date)
        return form;
    let now = new Date;
    let year = form.year;
    if (year < 0)
        year = now.getFullYear();
    let month = form.month;
    if (month < 0)
        month = now.getMonth() + 1;
    let day = form.day;
    if (day < 0)
        day = now.getDate();
    let hour = 0, minute = 0, second = 0;
    hour = form.hour;
    if (hour < 0)
        hour = now.getHours();
    minute = form.minute;
    if (minute < 0)
        minute = now.getMinutes();
    second = form.second;
    if (second < 0)
        second = now.getSeconds();

    return new Date(year, month-1, day, hour, minute, second);
}

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
                       [['FUNCTION', 'of', '$constant'], (fn, _, constant) => new Ast.Invocation(new Ast.Selector.Device(fn.value.kind, null, constant), fn.value.channel, [], null)],
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
