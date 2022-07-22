// -*- mode: typescript; indent-tabs-mode: nil; js-basic-offArray: 4 -*-
//
// This file is part of ThingTalk
//
// Copyright 2022 The Board of Trustees of the Leland Stanford Junior University
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
// Author: Shicheng Liu <shicheng@cs.stanford.edu>

import * as Grammar from '../lib/syntax_api';
// import SchemaRetriever from '../lib/schema';

import _mockSchemaDelegate from './mock_schema_delegate';
import { applyLevenshtein } from '../lib/ast';
// const schemaRetriever = new SchemaRetriever(_mockSchemaDelegate, null, true);

const TEST_CASES = [
    // basics: adding an operation
    ["@com.twitter.post();",
     "$cont @com.twitter.post() filter name == 'Chinese';",
     "@com.twitter.post() filter name == 'Chinese';"
    ],
    ["@com.twitter.post();",
     "$cont [name] of @com.twitter.post();",
     "[name] of @com.twitter.post();"
    ],
    ["@com.twitter.post();",
     "$cont sort (stars asc of @com.twitter.post());",
     "sort (stars asc of @com.twitter.post());"
    ],
    ["@com.twitter.post();",
     "$cont [address] of sort (stars asc of (@com.twitter.post() filter name == 'Chinese'));",
     "[address] of sort (stars asc of (@com.twitter.post() filter name == 'Chinese'));"
    ],

    // modifying filters
    ["@com.twitter.post() filter name == 'Japanese';",
     "$cont @com.twitter.post() filter name == 'Chinese';",
     "@com.twitter.post() filter name == 'Chinese';"
    ],
    ["(count(@com.twitter.post() filter name == 'Japanese')) filter place == 'Palo Alto';",
    "$cont @com.twitter.post() filter name == 'Chinese';",
    "(count(@com.twitter.post() filter name == 'Chinese')) filter place == 'Palo Alto';"
    ],
    ["count(@com.twitter.post() filter name == 'Japanese');",
    "$cont @com.twitter.post() filter name == 'Chinese';",
     "count(@com.twitter.post() filter name == 'Chinese');"
    ],
    ["@com.twitter.post() filter name == 'Japanese';",
    "$cont [post_name] of @com.twitter.post();",
    "[post_name] of @com.twitter.post() filter name == 'Japanese';"
    ],
    ["[address] of sort (stars asc of (@com.twitter.post() filter name == 'Chinese'));",
    "$cont @com.twitter.post() filter name == 'Japanese';",
    "[address] of sort (stars asc of (@com.twitter.post() filter name == 'Japanese'));"
    ],

    // modifying projections
    ["[author] of @com.twitter.post();",
    "$cont [name] of @com.twitter.post();",
    "[name] of @com.twitter.post();"
    ],
    ["[author] of @com.twitter.post();",
    "$cont [name] of (@com.twitter.post() filter location == 'Palo Alto');",
    "[name] of (@com.twitter.post() filter location == 'Palo Alto');"
    ],
    ["[author] of (@com.twitter.post() filter location == 'Mountain View');",
    "$cont [name] of (@com.twitter.post() filter location == 'Palo Alto');",
    "[name] of (@com.twitter.post() filter location == 'Palo Alto');"
    ],
    ["[author] of (sort (stars asc of @com.twitter.post() filter location == 'Mountain View'));",
    "$cont [name] of (@com.twitter.post() filter location == 'Palo Alto');",
    "[name] of (@com.twitter.post() filter location == 'Palo Alto');"
    ],

    // joins
    ["@com.theater() filter location == 'Palo Alto';",
    "$cont [actor.name, theater.name] of (@com.theater() join @com.actors());",
    "[actor.name, theater.name] of (@com.theater() join @com.actors()) filter location == 'Palo Alto';"
    ],
    ["avg(reviews of sort(stars desc of (@com.theater() filter location == 'Palo Alto'))[1:5]);",
    "$cont [actor.name, theater.name] of (@com.theater() join @com.actors());",
    "[actor.name, theater.name] of sort(stars desc of ((@com.theater() join @com.actors()) filter location == 'Palo Alto'))[1:5];"
    ],

    // This currently cannot pass because filters are optimized
    ["(@com.twitter.post() filter name == 'Japanese') filter place == 'Palo Alto';",
    "$cont @com.twitter.post() filter name == 'Chinese';",
    "@com.twitter.post() filter name == 'Chinese';"
    ],
];

function test(i) {
    console.log('Test Case #' + (i+1));
    let [before, levenshtein, expected] = TEST_CASES[i];

    // return Grammar.parse(before).typecheck(schemaRetriever, true).then((prog) => {
    //     let program = prog.declarations[0].toProgram();
    //     console.log(program.prettyprint(true));
    // });
    let beforeChainExpression = Grammar.parse(before).statements[0].expression;
    let levenshteinProgram = Grammar.parse(levenshtein).statements[0];

    let expectedOutput = Grammar.parse(expected).statements[0].expression.prettyprint();
    let actualOutput = applyLevenshtein(beforeChainExpression, levenshteinProgram).prettyprint();
    
    if (expectedOutput !== actualOutput) {
        console.log("====\n");
        console.error('Test Case #' + (i+1) + ': does not match what expected');
        console.error('Before: ' + before);
        console.error('Incoming: ' + levenshtein);
        console.error('Expected: ' + expectedOutput);
        console.error('Generated: ' + actualOutput);
        // console.log(applyLevenshtein(beforeChainExpression, levenshteinProgram));
        if (process.env.TEST_MODE)
            throw new Error(`testLevenshtein ${i+1} FAILED`);
    }
}

export default async function main() {
    for (let i = 0; i < TEST_CASES.length; i++)
        test(i);
}
if (!module.parent)
    main();
