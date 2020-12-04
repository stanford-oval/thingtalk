// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingTalk
//
// Copyright 2019 The Board of Trustees of the Leland Stanford Junior University
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

import * as semver from 'semver';

function deviceNames(result) {
    let newCode = [];
    let inString = false;
    for (let i = 0; i < result.length; i++) {
        const token = result[i];
        if (token === '"')
            inString = !inString;
        if (inString) {
            newCode.push(token);
            continue;
        }
        if (!token.startsWith('attribute:')) {
            newCode.push(token);
            continue;
        }
        // eat the attribute:
        i++;
        // eat the =
        i++;
        if (result[i] === '"') {
            i++;
            while (i < result.length && result[i] !== '"')
                i++;
            // the closing quote will be eaten at the end of the loop
        }
        // the next token will be eaten at the end of the loop
    }

    // in-place modify
    result.length = 0;
    result.push(...newCode);
}

function defaultTemperature(result) {
    for (let i = 0; i < result.length; i++) {
        if (result[i] === 'unit:defaultTemperature')
            result[i] = 'unit:F';
    }
}

function currencySyntax(result) {
    // convert new "NUMBER_0 unit:$usd" syntax to old "new Currency ( NUMBER_0 , unit:usd )"

    let newCode = [];
    let inString = false;
    for (let i = 0; i < result.length; i++) {
        const token = result[i];
        if (token === '"')
            inString = !inString;
        if (inString) {
            newCode.push(token);
            continue;
        }
        if (!token.startsWith('unit:$')) {
            newCode.push(token);
            continue;
        }

        const code = token.substring('unit:$'.length);
        // pop the number
        const number = newCode.pop();
        newCode.push('new', 'Currency', '(', number, ',', 'unit:' + code, ')');
    }

    // in-place modify
    result.length = 0;
    result.push(...newCode);
}

const COMPATIBILITY_FIXES = [
    ['<1.9.0-alpha.1', deviceNames],
    ['<1.9.3', defaultTemperature],
    ['<1.11.0-alpha.1', currencySyntax]
];

/**
 * Adjust ThingTalk for compatibility with an older ThingTalk client.
 *
 * This method can be used to modify NN-syntax code so that older
 * ThingTalk libraries can process the program without losing features.
 * Not all features have a compatibility conversion, some features might
 * be silently discarded.
 *
 * @param {Array<string>} program - program to convert
 * @param {string} thingtalk_version - the version of the ThingTalk library to target
 */
export default function applyCompatibility(program, thingtalk_version) {
    for (let [range, fix] of COMPATIBILITY_FIXES) {
        if (semver.satisfies(thingtalk_version, range))
            fix(program);
    }
}
