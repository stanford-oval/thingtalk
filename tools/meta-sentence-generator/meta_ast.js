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

    codegen(stream, prefix = '') {
        stream.write(`${prefix}for (${this.head}) {\n`);
        for (let stmt of this.statements)
            stmt.codegen(stream, prefix + '    ');
        stream.write(`${prefix}}\n`);
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

function makeBodyLambda(head, body) {
    const bodyArgs = [];
    let i = 0;
    for (let headPart of head) {
        if (!headPart.isNonTerminal && !headPart.isComputed)
            continue;
        if (headPart.name)
            bodyArgs.push(headPart.name);
        else
            bodyArgs.push(`$${i++}`);
    }

    return `(${bodyArgs.join(', ')}) => ${body}`;
}

class Expansion extends Rule {
    constructor(head, body, condition) {
        super();

        this.isExpansion = true;
        this.head = head;
        this.bodyCode = body;
        this.conditionCode = condition;
    }

    codegen(stream, nonTerminal, prefix = '') {
        const expanderCode = makeBodyLambda(this.head, this.bodyCode);

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

class Replacement extends Rule {
    constructor(head, placeholder, bodyCode) {
        super();

        this.isReplacement = true;
        this.head = head;
        this.placeholder = placeholder;
        this.bodyCode = bodyCode;
    }

    codegen(stream, nonTerminal, prefix = '') {
        const expanderCode = makeBodyLambda(this.head, this.bodyCode);

        stream.write(`${prefix}$grammar.addRule(${stringEscape(nonTerminal)}, [${this.head.map((h) => h.codegen()).join(', ')}], $runtime.combineReplacePlaceholder(${this.placeholder}, (${expanderCode}), {}));\n`);
    }
}
Rule.Replacement = Replacement;

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

class ComputedRuleHead extends RuleHeadPart {
    constructor(name, code) {
        super();

        this.isComputed = true;
        this.name = name;
        this.code = code;
    }

    codegen() {
        return `new $runtime.NonTerminal(${this.code})`;
    }
}
RuleHeadPart.Computed = ComputedRuleHead;
