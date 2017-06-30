// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingTalk
//
// Copyright 2017 Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

function stringEscape(str) {
    return '"' + str.replace(/(["\\])/g, '\\$1').replace(/\n/g, '\\n') + '"';
    // the following comment fixes broken syntax highlighting in GtkSourceView
    //]/
}

class SExpr {
    constructor(...children) {
        this._children = children;
    }

    toString() {
        return '(' + this._children.join(' ') + ')';
    }
}

function SetLogic(logic) {
    return new SExpr('set-logic', logic);
}
function SetOption(opt, value = true) {
    return new SExpr('set-option', ':' + opt, value);
}
function DeclareDatatype(name, constructors) {
    return new SExpr('declare-datatypes', '()', new SExpr(new SExpr(name,
        ...constructors.map((c) => Array.isArray(c) ? new SExpr(...c) : new SExpr(c)))));
}
function DeclareSort(name) {
    return new SExpr('declare-sort', name, '0');
}
function DeclareFun(name, args, ret) {
    return new SExpr('declare-fun', name, new SExpr(...args), ret);
}
function DefineFun(name, args, ret, def) {
    return new SExpr('define-fun', name, new SExpr(...args), ret, def);
}
function Assert(assert) {
    return new SExpr('assert', assert);
}
function Predicate(pred, ...args) {
    if (args.length === 0)
        return pred;
    else
        return new SExpr(pred, ...args);
}
function Implies(lhs, rhs) {
    return new SExpr('=>', lhs, rhs);
}
function And(...args) {
    if (args.length === 1)
        return args[0];
    return new SExpr('and', ...args);
}
function Or(...args) {
    if (args.length === 1)
        return args[0];
    return new SExpr('or', ...args);
}
function Not(expr) {
    return new SExpr('not', expr);
}
function Eq(lhs, rhs) {
    return new SExpr('=', lhs, rhs);
}
function NEq(lhs, rhs) {
    return Not(Eq(lhs, rhs));
}
function LEq(lhs, rhs) {
    return new SExpr('<=', lhs, rhs);
}
function GEq(lhs, rhs) {
    return new SExpr('>=', lhs, rhs);
}
function LT(lhs, rhs) {
    return new SExpr('<', lhs, rhs);
}
function GT(lhs, rhs) {
    return new SExpr('>', lhs, rhs);
}
function SetType(elementType) {
    return new SExpr('Set', elementType);
}
function StringLiteral(str) {
    return stringEscape(str);
}
function Named(name, expr) {
    return new SExpr('!', expr, ':named', name);
}
function CheckSat(name) {
    return new SExpr('check-sat');
}

module.exports = {
    SExpr,
    SetLogic,
    SetOption,
    DeclareSort,
    DeclareDatatype,
    DeclareFun,
    DefineFun,
    Assert,
    Predicate,
    Implies,
    And,
    Or,
    Not,
    Eq,
    NEq,
    LEq,
    GEq,
    LT,
    GT,
    Named,
    SetType,
    StringLiteral,
    CheckSat
};
