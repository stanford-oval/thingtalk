// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingEngine
//
// Copyright 2015-2016 Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details

const adt = require('adt');
const Compiler = require('./compiler');
const Type = require('./type');

function adtNullable(o) {
    var only = adt.only(o);
    return function(v) {
        if (v === null)
            return v;
        else
            return only.apply(this, arguments);
    };
}

var Value = adt.data({
    Boolean: {
        value: adt.only(Boolean),
    },
    String: {
        value: adt.only(String)
    },
    Measure: {
        value: adt.only(Number),
        unit: adt.only(String)
    },
    Number: {
        value: adt.only(Number)
    },
    Location: {
        x: adt.only(Number),
        y: adt.only(Number),
    },
    Date: {
        value: adt.only(Date)
    },
    Object: {
        value: adt.only(Object)
    },
    Array: {
        value: adt.only(Array)
    },
    Feed: {
        value: adt.any
    },
});
module.exports.Value = Value;
var Attribute = adt.newtype('Attribute', {
    name: adt.only(String),
    value: adt.only(Value)
});
module.exports.Attribute = Attribute;
var Selector = adt.data({
    GlobalName: {
        name: adt.only(String),
    },
    Attributes: {
        attributes: adt.only(Array),
    },
    Builtin: {
        name: adt.only(String)
    },

    // for internal use only
    ComputeModule: {
        module: adt.only(String),
    },
    Id: {
        name: adt.only(String),
    },
    Any: null,
});
module.exports.Selector = Selector;
var Keyword = adt.newtype('Keyword', {
    name: adt.only(String),
    feedAccess: adt.only(Boolean)
});
module.exports.Keyword = Keyword;

var Expression = adt.data(function() {
    return ({
        Null: null,
        Constant: {
            value: adt.only(Value)
        },
        VarRef: {
            name: adt.only(String)
        },
        MemberRef: {
            object: adt.only(this),
            name: adt.only(String),
        },
        FunctionCall: {
            name: adt.only(String),
            args: adt.only(Array), // array of Expression
        },
        UnaryOp: {
            arg: adt.only(this),
            opcode: adt.only(String),
        },
        BinaryOp: {
            lhs: adt.only(this),
            rhs: adt.only(this),
            opcode: adt.only(String),
        },
        Tuple: {
            args: adt.only(Array),
        },
        Array: {
            args: adt.only(Array),
        },
    });
});
module.exports.Expression = Expression;
var RulePart = adt.data({
    Invocation: {
        selector: adt.only(Selector),
        name: adtNullable(String),
        params: adt.only(Array) // of Expression
    },
    Keyword: {
        keyword: adt.only(Keyword),
        owner: adtNullable(String),
        params: adt.only(Array), // of Expression
        negative: adt.only(Boolean)
    },
    Binding: {
        name: adt.only(String),
        expr: adt.only(Expression)
    },
    MemberBinding: {
        name: adt.only(String)
    },
    BuiltinPredicate: {
        expr: adt.only(Expression)
    },
    Condition: {
        expr: adt.only(Expression)
    },
});
module.exports.RulePart = RulePart;
var Statement = adt.data({
    ComputeModule: {
        name: adt.only(String),
        statements: adt.only(Array), // array of ComputeStatement
    },
    VarDecl: {
        name: adt.only(Keyword),
        type: adt.only(Type),
        extern: adt.only(Boolean),
        out: adt.only(Boolean),
    },
    Rule: {
        sequence: adt.only(Array),
    }
});
module.exports.Statement = Statement;
var ComputeStatement = adt.data({
    EventDecl: {
        name: adt.only(String),
        params: adt.only(Array),
    },
    FunctionDecl: {
        name: adt.only(String),
        params: adt.only(Array),
        code: adt.only(String)
    }
});
module.exports.ComputeStatement = ComputeStatement;
