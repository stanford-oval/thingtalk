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

const { stringEscape } = require('../../lib/escaping');

class Grammar {
    constructor(comment, initialCode, statements) {
        this.comment = comment;
        this.initialCode = initialCode;
        this.statements = statements;
    }

    codegen(stream, runtimepath) {
        stream.write(this.comment);
        stream.write('"use strict";\n');
        stream.write(this.initialCode);
        stream.write(`
const $runtime = require(${stringEscape(runtimepath)});

module.exports = function($options, $grammar = new $runtime.Grammar()) {\n`);
        for (let stmt of this.statements)
            stmt.codegen(stream, '    ');
        stream.write('    return $grammar;\n');
        stream.write('};');
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

    codegen(stream, prefix = '') {
        stream.write(`${prefix}$grammar.declareSymbol(${stringEscape(this.name)});\n`);
        for (let rule of this.rules)
            rule.codegen(stream, this.name, prefix);
    }
}
Statement.NonTerminal = NonTerminalStmt;

class ForLoop extends Statement {
    constructor(head, statements) {
        super();

        this.isForLoop = true;
        this.head = head;
        this.statements = statements;
    }
}
Statement.ForLoop = ForLoop;

class Import extends Statement {
    constructor(what) {
        super();

        this.what = what;
    }

    codegen(stream, prefix = '') {
        stream.write(`${prefix}$grammar = require(${stringEscape(this.what)})($options, $grammar);\n`);
    }
}
Statement.Import = Import;

class Rule {}
exports.Rule = Rule;

class Constants extends Rule {
    constructor(token, typeCode) {
        super();

        this.isConstants = true;
        this.token = token;
        this.typeCode = typeCode;
    }

    codegen(stream, nonTerminal, prefix = '') {
        stream.write(`${prefix}$grammar.addConstants(${stringEscape(nonTerminal)}, ${stringEscape(this.token)}, ${this.typeCode});\n`);
    }
}
Rule.Constants = Constants;

class Expansion extends Rule {
    constructor(head, body, condition) {
        super();

        this.isExpansion = true;
        this.head = head;
        this.bodyCode = body;
        this.conditionCode = condition;
    }

    codegen(stream, nonTerminal, prefix = '') {
        const expanderArgs = [];
        let i = 0;
        for (let headPart of this.head) {
            if (!headPart.isNonTerminal)
                continue;
            if (headPart.name)
                expanderArgs.push(headPart.name);
            else
                expanderArgs.push(`$${i++}`);
        }

        const expanderCode = `(${expanderArgs.join(', ')}) => ${this.bodyCode}`;

        stream.write(`${prefix}$grammar.addRule(${stringEscape(nonTerminal)}, [${this.head.map((h) => h.codegen()).join(', ')}], $runtime.simpleCombine((${expanderCode}), ${this.conditionCode ? stringEscape(this.conditionCode) : 'null'}));\n`);
    }
}
Rule.Expansion = Expansion;

class Condition extends Rule {
    constructor(flag, rules) {
        super();

        this.isCondition = true;
        this.flag = flag;
        this.rules = rules;
    }

    codegen(stream, nonTerminal, prefix = '') {
        let flag = this.flag.startsWith('?') ?
            `$options.flags.${this.flag.substring(1)}` :
            `!$options.flags.${this.flag.substring(1)}`;

        stream.write(`${prefix}if (${flag}) {\n`);
        for (let rule of this.rules)
            rule.codegen(stream, nonTerminal, prefix + '    ');
        stream.write(`${prefix}}\n`);
    }
}
Rule.Condition = Condition;

class RuleHeadPart {}
exports.RuleHeadPart = RuleHeadPart;

class NonTerminalRuleHead extends RuleHeadPart {
    constructor(name, category) {
        super();

        this.isNonTerminal = true;
        this.name = name;
        this.category = category;
    }

    codegen() {
        return `new $runtime.NonTerminal(${stringEscape(this.category)})`;
    }
}
RuleHeadPart.NonTerminal = NonTerminalRuleHead;

class StringLiteralRuleHead extends RuleHeadPart {
    constructor(value) {
        super();

        this.isStringLiteral = true;
        this.value = value;
    }

    codegen() {
        return stringEscape(this.value);
    }
}
RuleHeadPart.StringLiteral = StringLiteralRuleHead;

class ChoiceRuleHead extends RuleHeadPart {
    constructor(values) {
        super();

        this.isChoice = true;
        this.values = values;
    }

    codegen() {
        return `new $runtime.Choice([${this.values.map(stringEscape).join(', ')}])`;
    }
}
RuleHeadPart.Choice = ChoiceRuleHead;
