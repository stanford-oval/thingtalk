// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingTalk
//
// Copyright 2018 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const slr = require('./slr_generator');

class Grammar {
    constructor(comment, initialCode, statements) {
        this.comment = comment;
        this.initialCode = initialCode;
        this.statements = statements;
    }

    get preamble() {
        return this.comment + '"use strict";\n' + this.initialCode;
    }
}
exports.Grammar = Grammar;

class Statement {}
exports.Statement = Statement;

class NonTerminalStmt extends Statement {
    constructor(name, rules) {
        super();

        this.isNonTerminal = true;
        this.name = name;
        this.rules = rules;
    }
}
Statement.NonTerminal = NonTerminalStmt;

class Import extends Statement {
    constructor(what) {
        super();

        this.isImport = true;
        this.what = what;
    }
}
Statement.Import = Import;

class Rule {
    constructor(head, body) {
        this.head = head;
        this.bodyCode = body;
    }
}
exports.Rule = Rule;

class RuleHeadPart {}
exports.RuleHeadPart = RuleHeadPart;

class NonTerminalRuleHead extends RuleHeadPart {
    constructor(name, category) {
        super();

        this.isNonTerminal = true;
        this.name = name;
        this.category = category;
    }

    getGeneratorInput() {
        return new slr.NonTerminal(this.category);
    }
}
RuleHeadPart.NonTerminal = NonTerminalRuleHead;

class TerminalRuleHead extends RuleHeadPart {
    constructor(name, category) {
        super();

        this.isTerminal = true;
        this.name = name;
        this.category = category;
    }

    getGeneratorInput() {
        return new slr.Terminal(this.category);
    }
}
RuleHeadPart.Terminal = TerminalRuleHead;

class StringLiteralRuleHead extends RuleHeadPart {
    constructor(value) {
        super();

        this.isStringLiteral = true;
        this.value = value;
    }

    get name() {
        return null;
    }

    getGeneratorInput() {
        return new slr.Terminal(this.value);
    }
}
RuleHeadPart.StringLiteral = StringLiteralRuleHead;
