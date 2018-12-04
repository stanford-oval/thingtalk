#!/usr/bin/env node
// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingEngine
//
// Copyright 2017 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

process.on('unhandledRejection', (up) => { throw up; });

const fs = require('fs');
const stream = require('stream');
const seedrandom = require('seedrandom');
const argparse = require('argparse');

const SentenceGenerator = require('../lib/sentence-generator');
const _tpClient = require('./mock_schema_delegate');

function main() {
    const parser = new argparse.ArgumentParser({
        addHelp: true,
        description: 'Update Thingpedia Dataset'
    });
    parser.addArgument(['-o', '--output'], {
        required: true,
        type: fs.createWriteStream
    });
    parser.addArgument('--maxdepth', {
        type: Number,
        defaultValue: 6,
        help: 'Maximum depth of synthetic sentence generation',
    });
    parser.addArgument('--turking', {
        nargs: 0,
        action: 'storeTrue',
        help: 'Restrict grammar rules to MTurk-friendly ones.',
        defaultValue: false
    });

    const args = parser.parseArgs();
    const options = {
        rng: seedrandom.alea('almond is awesome'),
        language: 'en',
        targetLanguage: 'thingtalk',
        thingpediaClient: _tpClient,
        turkingMode: args.turking,
        maxDepth: args.maxdepth,
        debug: true
    };

    const generator = new SentenceGenerator(options);
    const transform = new stream.Transform({
        writableObjectMode: true,

        transform(ex, encoding, callback) {
            callback(null, ex.id + '\t' + ex.utterance + '\t' + ex.target_code + '\n');
        },

        flush(callback) {
            process.nextTick(callback);
        }
    });
    generator.pipe(transform).pipe(args.output);

    args.output.on('finish', () => process.exit());
}
return main();
