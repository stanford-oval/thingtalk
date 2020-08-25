// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingTalk
//
// Copyright 2018-2019 The Board of Trustees of the Leland Stanford Junior University
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//    http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
"use strict";

process.on('unhandledRejection', (up) => { throw up; });

const fs = require('fs');
const path = require('path');

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
};

async function main() {
    const output = process.argv[2];
    const input = process.argv[3];

    const grammar = {};
    let firstFile;
    try {
        firstFile = await processFile(path.resolve(input), grammar, true);
    } catch(e) {
        if (e.location) {
            console.error(`Syntax error at line ${e.location.start.line} column ${e.location.start.column}: ${e.message}`);
            process.exit(1);
        } else {
            throw e;
        }
    }

    const generator = new SLRParserGenerator(grammar, 'input');
    await TARGET_LANGUAGE['javascript'](firstFile.preamble, generator, fs.createWriteStream(output), output);
}
main();
