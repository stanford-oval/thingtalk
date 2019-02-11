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

const TARGET_LANGUAGE = {
    'javascript': require('./javascript'),
    'python': require('./python'),
};

async function main() {
    const parser = new argparse.ArgumentParser({
        addHelp: true,
        description: 'Compile a Genie grammar'
    });

    parser.addArgument('input', {
    });
    parser.addArgument(['-o', '--output'], {
        required: true,
        help: "Where to write the specif"
    });
    parser.addArgument(['-s', '--start'], {
        required: false,
        defaultValue: 'input',
        help: "The start symbol of the grammar (defaults to `input`)"
    });
    parser.addArgument(['-l', '--runtime-language'], {
        required: false,
        defaultValue: 'javascript',
        choices: Object.keys(TARGET_LANGUAGE),
        help: "Generate a parser in the given programming language"
    });
    parser.addArgument(['--runtime-path'], {
        required: false,
        help: "Path to the parser runtime code"
    });

    const args = parser.parseArgs();

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
    await TARGET_LANGUAGE[args.runtime_language](firstFile.preamble, generator, fs.createWriteStream(args.output), args.runtime_path, args.output);
}
main();
