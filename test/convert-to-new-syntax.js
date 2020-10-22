// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingTalk
//
// Copyright 2020 The Board of Trustees of the Leland Stanford Junior University
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

import { promises as pfs } from 'fs';
import * as Grammar from '../lib/syntax_api';

async function main() {
    const data = await pfs.readFile('./test/sample.apps', 'utf8');

    const programs = data.split('====');
    const converted = [];

    for (const code of programs) {
        // capture all whitespace and comments before the beginning of the code
        // (this is used to document the test case and mark that certain programs
        // are expected not to typecheck)
        // the regex matches a sequence of
        // - whitespace
        // - a line comment (// followed by everything up to a newline
        // - a block comment (/* followed by (not-* or * not followed by /) followed by */)
        const comment = /^(?:[ \t\v\f\n]|\/\/[^\n]*\n|\/\*(?:[^*]|\*[^/])*\*\/)*/.exec(code);
        let out = '';
        if (comment)
            out += comment[0];
        const parsed = Grammar.parse(code, Grammar.SyntaxType.Legacy);
        out += parsed.prettyprint();
        out += '\n';

        converted.push(out);
    }

    await pfs.writeFile('./test/test_syntax.tt', converted.join('===='), {
        encoding: 'utf8',
        flag: 'a'
    });
}
main();
