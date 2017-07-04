"use strict";

const Q = require('q');
const fs = require('fs');

const Ast = require('../lib/ast');
const Grammar = require('../lib/grammar_api');
const Compiler = require('../lib/compiler');
const SchemaRetriever = require('../lib/schema');
const Builtin = require('../lib/builtin');
const { genRandomRules, genRandomAllowed } = require('../lib/gen_random_rule');
const MultiMap = require('../lib/multimap');

const _mockSchemaDelegate = require('./mock_schema_delegate');
const ThingpediaClientHttp = require('./http_client');
const db = require('./db');

var schemaRetriever = new SchemaRetriever(new ThingpediaClientHttp(), true);

function uniformSubset(n, subsetOf) {
    if (n === 0)
        return [];
    if (n >= subsetOf.length)
        return subsetOf;

    let taken = [];
    function next() {
        let idx = Math.floor(Math.random()*(subsetOf.length - taken.length));
        for (let i = 0; i < subsetOf.length; i++) {
            if (taken[i])
                continue;
            if (idx === 0) {
                taken[i] = true;
                return subsetOf[i];
            }
            idx--;
        }
    }

    let res = [];
    while (n > 0) {
        res.push(next());
        n--;
    }
    return res;
}

function writeTestCase(file, prog, allowedset) {
    for (let allowed of allowedset)
        file.write(Ast.prettyprintPermissionRule(allowed) + '\n');
    file.write(';;\n');
    file.write(Ast.prettyprint(prog, false) + '\n');
    file.write('====\n');
}

function main() {
    let alloweds = fs.readFileSync('./smt/permissions.test').toString('utf8').trim().split('\n').map(Grammar.parsePermissionRule);
    let allowedmap = new MultiMap;

    alloweds.forEach((allowed) => {
        let key = '';
        if (allowed.trigger.isStar)
            key = 'star';
        else if (allowed.trigger.isBuiltin)
            key = 'null';
        else
            key = allowed.trigger.kind + ':' + allowed.trigger.channel;
        key += '+';
        if (allowed.query.isStar)
            key += 'star';
        else if (allowed.query.isBuiltin)
            key += 'null';
        else
            key += allowed.query.kind + ':' + allowed.query.channel;
        key += '+';
        if (allowed.action.isStar)
            key += 'star';
        else if (allowed.action.isBuiltin)
            key += 'null';
        else
            key += allowed.action.kind + ':' + allowed.action.channel;
        allowedmap.put(key, allowed);
    });

    let programs = fs.readFileSync('./smt/programs.test').toString('utf8').trim().split('\n').map(Grammar.parse);
    console.log('LOADED');

    let files = {};
    for (let n of [1, 5, 10, 50])
        files[n] = fs.createWriteStream('./smt/test.' + n);

    for (let prog of programs) {
        if (prog.rules.length !== 1)
            throw new Error('NOT IMPLEMENTED: cannot support more than one rule');
        let rule = prog.rules[0];
        let trigger, query, action;
        if (rule.trigger)
            trigger = rule.trigger;
        else
            trigger = null;
        if (rule.queries.length > 1)
            throw new Error('NOT IMPLEMENTED: cannot support more than one query');
        if (rule.queries.length === 1)
            query = rule.queries[0];
        else
            query = null;
        if (rule.actions.length > 1)
            throw new Error('NOT IMPLEMENTED: cannot support more than one action');
        if (rule.actions[0].selector.isBuiltin)
            action = null;
        else
            action = rule.actions[0];

        let keys = [];
        for (let t of [0, 1]) {
            let tkey;
            if (t === 0)
                tkey = 'star';
            else if (trigger === null)
                tkey = 'null';
            else
                tkey = trigger.selector.kind + ':' + trigger.channel;
            for (let q of [0, 1]) {
                let qkey;
                if (q === 0)
                    qkey = 'star';
                else if (query === null)
                    qkey = 'null';
                else
                    qkey = query.selector.kind + ':' + query.channel;
                for (let a of [0, 1]) {
                    let akey;
                    if (a === 0)
                        akey = 'star';
                    else if (action === null)
                        akey = 'null';
                    else
                        akey = action.selector.kind + ':' + action.channel;
                    keys.push(tkey + '+' + qkey + '+' + akey);
                }
            }
        }
        const relevantrules = [];
        for (let key of keys) {
            for (let value of allowedmap.get(key))
                relevantrules.push(value);
        }
        console.log(relevantrules.length);

        function tryMany(file, n) {
            let canDo = relevantrules.length >= n;
            if (!canDo)
                return;

            writeTestCase(file, prog, uniformSubset(n, relevantrules));
        }

        for (let n in files)
            tryMany(files[n], n);
    }
}
main();
