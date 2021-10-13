// -*- mode: typescript; indent-tabs-mode: nil; js-basic-offset: 4 -*-
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

process.on('unhandledRejection', (up) => {
    throw up; 
});

import assert from 'assert';
import * as fs from 'fs';
import { promises as pfs } from 'fs';
import * as path from 'path';

import * as Grammar from './grammar';
import * as Ast from './meta_ast';
import {
    SLRParserGenerator,
    ProcessedRule,
    ProcessedGrammar,
} from './slr_generator';
import writeout from './javascript';

type TypeMap = { [key : string] : string };

function handleRule(rule : Ast.Rule,
                    typeMap : TypeMap) : ProcessedRule {
    const head = rule.head.map((h) => h.getGeneratorInput());

    const bodyArgs = [`$ : $runtime.ParserInterface<${typeMap.$options ?? 'any'}>`];
    let i = 0;
    for (const headPart of rule.head) {
        if (headPart instanceof Ast.RuleHeadPart.Terminal) {
            if (typeMap[headPart.category])
                headPart.type = typeMap[headPart.category];
            else
                console.log(`WARNING: undeclared terminal ${headPart.category}`);
        }
        if (headPart instanceof Ast.RuleHeadPart.NonTerminal
            && typeMap[headPart.category])
            headPart.type = typeMap[headPart.category];

        if (headPart.name)
            bodyArgs.push(headPart.name + ' : ' + headPart.type);
        else
            bodyArgs.push(`$${i++} : ` + headPart.type);
    }

    const action = `(${bodyArgs.join(', ')}) : ${rule.type} => ${rule.bodyCode}`;
    return [head, action];
}

async function processFile(filename : string,
                           grammar : ProcessedGrammar) : Promise<[Ast.Grammar, TypeMap]> {
    const input = await pfs.readFile(filename, { encoding: 'utf8' });
    const parsed = Grammar.parse(input);
    assert(parsed instanceof Ast.Grammar);

    const typeMap : TypeMap = {};
    for (const statement of parsed.statements) {
        if (statement.type !== undefined) {
            if (typeMap[statement.name] !== undefined &&
                typeMap[statement.name] !== statement.type)
                throw new Error(`Conflicting type declaration for ${statement.name}`);
            typeMap[statement.name] = statement.type;
        }
    }

    for (const statement of parsed.statements) {
        if (statement instanceof Ast.NonTerminalStmt) {
            if (!grammar[statement.name])
                grammar[statement.name] = [];

            for (const rule of statement.rules) {
                rule.type = typeMap[statement.name] || 'any';
                grammar[statement.name].push(handleRule(rule, typeMap));
            }
        }
    }

    return [parsed, typeMap];
}

function wsnDump(grammar : ProcessedGrammar) {
    for (const nonTerm in grammar) {
        let first = true;
        const prefix = ' '.repeat(nonTerm.length);
        for (const [rule,] of grammar[nonTerm]) {
            const ruleOut = rule.map((r) => r.toWSN()).join(' ');

            if (first) {
                console.log(`${nonTerm} = ${ruleOut}`);
                first = false;
            } else {
                console.log(`${prefix} | ${ruleOut}`);
            }
        }
        console.log(`${prefix} .`);
    }
}

async function main() {
    const output = process.argv[2];
    const input = process.argv[3];

    const grammar : ProcessedGrammar = {};
    let firstFile, typeMap : TypeMap;
    try {
        [firstFile, typeMap] = await processFile(path.resolve(input), grammar);
    } catch(e) {
        if (e.location) {
            console.error(`Syntax error at line ${e.location.start.line} column ${e.location.start.column}: ${e.message}`);
            process.exit(1);
        } else {
            throw e;
        }
    }

    if (output === '--wsn') {
        wsnDump(grammar);
    } else {
        const generator = new SLRParserGenerator(grammar, 'input', typeMap['input'] || 'any', typeMap['$options'] || 'any');
        await writeout(firstFile.preamble, generator, fs.createWriteStream(output), output, typeMap['input'] || 'any',
            typeMap['$options'] || 'any');
    }
}
main();
