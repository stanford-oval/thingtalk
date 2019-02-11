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

process.on('unhandledRejection', (up) => { throw up; });

const fs = require('fs');
const path = require('path');
const argparse = require('argparse');

const Grammar = require('./grammar');
const SLRParserGenerator = require('./slr_generator');

function readall(stream) {
    return new Promise((resolve, reject) => {
        const buffers = [];
        let total = 0;
        stream.on('data', (buf) => {
            buffers.push(buf);
            total += buf.length;
        });
        stream.on('end', () => {
            resolve(Buffer.concat(buffers, total));
        });
        stream.on('error', reject);
        stream.resume();
    });
}

function writeout(preamble, runtimepath, generator, output) {
    const TERMINAL_IDS = {};
    for (let i = 0; i < generator.terminals.length; i++)
        TERMINAL_IDS[generator.terminals[i]] = i;

    const NON_TERMINAL_IDS = {};
    for (let i = 0; i < generator.nonTerminals.length; i++)
        NON_TERMINAL_IDS[generator.nonTerminals[i]] = i;

    const RULE_NON_TERMINALS = [];
    for (let i = 0; i < generator.rules.length; i++) {
        let [lhs,,] = generator.rules[i];
        RULE_NON_TERMINALS[i] = NON_TERMINAL_IDS[lhs];
    }

    const GOTO_TABLE = [];
    for (let i = 0; i < generator.gotoTable.length; i++) {
        GOTO_TABLE[i] = {};
        for (let nonterm in generator.gotoTable[i]) {
            let nextState = generator.gotoTable[i][nonterm];
            GOTO_TABLE[i][NON_TERMINAL_IDS[nonterm]] = nextState;
        }
    }

    const ACTION_TABLE = [];
    let foundAccept = false;
    for (let i = 0; i < generator.actionTable.length; i++) {
        ACTION_TABLE[i] = {};
        for (let term in generator.actionTable[i]) {
            let [action, param] = generator.actionTable[i][term];
            if (action === 'accept')
                foundAccept = true;

            if (action === 'accept')
                ACTION_TABLE[i][TERMINAL_IDS[term]] = [0];
            else if (action === 'shift')
                ACTION_TABLE[i][TERMINAL_IDS[term]] = [1, param];
            else if (action === 'reduce')
                ACTION_TABLE[i][TERMINAL_IDS[term]] = [2, param];
        }
    }
    if (!foundAccept)
        throw new Error('Parser generator bug: no accept state generated');

    output.write(preamble);
    output.write('\n');
    output.write(`const TERMINAL_IDS = ${JSON.stringify(TERMINAL_IDS)};\n`);
    output.write(`const RULE_NON_TERMINALS = ${JSON.stringify(RULE_NON_TERMINALS)};\n`);
    output.write(`const ARITY = ${JSON.stringify(generator.rules.map(([,rhs,]) => rhs.length))};\n`);
    output.write(`const GOTO = ${JSON.stringify(GOTO_TABLE)};\n`);
    output.write(`const PARSER_ACTION = ${JSON.stringify(ACTION_TABLE)};\n`);
    output.write(`const SEMANTIC_ACTION = [\n`);
    for (let [,,action] of generator.rules)
        output.write(`(${action}),\n`);
    output.write(`];\n`);
    output.write(`module.exports = require('${runtimepath}')(TERMINAL_IDS, RULE_NON_TERMINALS, ARITY, GOTO, PARSER_ACTION, SEMANTIC_ACTION);\n`);
    output.end();

    return new Promise((resolve, reject) => {
        output.on('finish', resolve);
        output.on('error', reject);
    });
}

function handleRule(rule) {
    const head = rule.head.map((h) => h.getGeneratorInput());

    const bodyArgs = ['$'];
    let i = 0;
    for (let headPart of rule.head) {
        if (headPart.name)
            bodyArgs.push(headPart.name);
        else
            bodyArgs.push(`$${i++}`);
    }

    const action = `(${bodyArgs}) => ${rule.bodyCode}`;
    return [head, action];
}

async function processFile(filename, grammar, isTopLevel) {
    const fileStream = fs.createReadStream(filename);
    const input = (await readall(fileStream)).toString('utf8');
    const parsed = Grammar.parse(input);

    if (!isTopLevel && parsed.initialCode.trim())
        console.error(`warning: ignored initial code block in imported file`);

    for (let statement of parsed.statements) {
        if (statement.isImport) {
            await processFile(path.resolve(path.dirname(filename), statement.what), grammar, false);
        } else if (statement.isNonTerminal) {
            if (!grammar[statement.name])
                grammar[statement.name] = [];

            for (let rule of statement.rules)
                grammar[statement.name].push(handleRule(rule));
        }
    }

    return parsed;
}

async function main() {
    const parser = new argparse.ArgumentParser({
        addHelp: true,
        description: 'Compile a Genie grammar'
    });

    parser.addArgument('input', {
    });
    parser.addArgument(['-o', '--output'], {
        required: true,
    });
    parser.addArgument(['-s', '--start'], {
        required: false,
        defaultValue: 'input',
    });

    const args = parser.parseArgs();

    const runtime = require.resolve('../../lib/nn-syntax/sr_parser_runtime');
    const runtimedir = path.relative(path.dirname(args.output),
                                     path.dirname(runtime));
    const relativeruntimepath = './' + path.join(runtimedir, 'sr_parser');

    const grammar = {};
    let firstFile;
    try {
        firstFile = await processFile(path.resolve(args.input), grammar, true);
    } catch(e) {
        if (e.location) {
            console.error(`Syntax error at line ${e.location.start.line} column ${e.location.start.column}: ${e.message}`);
            process.exit(1);
        } else {
            throw e;
        }
    }

    const generator = new SLRParserGenerator(grammar, 'input');
    await writeout(firstFile.preamble, relativeruntimepath, generator, fs.createWriteStream(args.output));

}
main();
