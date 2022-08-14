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
import { applyLevenshteinWrapper, toChainExpression, determineSameExpressionLevenshtein } from '../lib/ast';
// const schemaRetriever = new SchemaRetriever(_mockSchemaDelegate, null, true);

const TEST_CASES = [
    ['sort(review_count desc of @com.yelp.restaurant() filter contains(cuisines, "str:ENTITY_com.yelp:restaurant_cuisine::14:"^^com.yelp:restaurant_cuisine("str:ENTITY_com.yelp:restaurant_cuisine::14:")) || contains(cuisines, "str:ENTITY_com.yelp:restaurant_cuisine::9:"^^com.yelp:restaurant_cuisine("str:ENTITY_com.yelp:restaurant_cuisine::9:")))[1];',
     '$continue @com.yelp.restaurant() filter review_count == 13;',
     'sort(review_count desc of @com.yelp.restaurant() filter (contains(cuisines, "str:ENTITY_com.yelp:restaurant_cuisine::14:"^^com.yelp:restaurant_cuisine("str:ENTITY_com.yelp:restaurant_cuisine::14:")) || contains(cuisines, "str:ENTITY_com.yelp:restaurant_cuisine::9:"^^com.yelp:restaurant_cuisine("str:ENTITY_com.yelp:restaurant_cuisine::9:"))) && review_count == 13)[1];',
     true
    ],
    ['[cuisines, opening_hours, phone] of @com.yelp.restaurant() filter review_count >= 16;',
     '$continue @com.yelp.restaurant() filter contains(cuisines, "str:ENTITY_com.yelp:restaurant_cuisine::7:"^^com.yelp:restaurant_cuisine("str:ENTITY_com.yelp:restaurant_cuisine::7:")) && contains(cuisines, "str:ENTITY_com.yelp:restaurant_cuisine::8:"^^com.yelp:restaurant_cuisine("str:ENTITY_com.yelp:restaurant_cuisine::8:"));',
     '[opening_hours, phone] of @com.yelp.restaurant() filter contains(cuisines, "str:ENTITY_com.yelp:restaurant_cuisine::7:"^^com.yelp:restaurant_cuisine("str:ENTITY_com.yelp:restaurant_cuisine::7:")) && contains(cuisines, "str:ENTITY_com.yelp:restaurant_cuisine::8:"^^com.yelp:restaurant_cuisine("str:ENTITY_com.yelp:restaurant_cuisine::8:")) && review_count >= 16;',
     true
    ],
    ['[cuisines, opening_hours, phone] of @com.yelp.restaurant() filter review_count >= 16;',
     '$continue @com.yelp.restaurant() filter contains(cuisines, "str:ENTITY_com.yelp:restaurant_cuisine::7:"^^com.yelp:restaurant_cuisine("str:ENTITY_com.yelp:restaurant_cuisine::7:")) && contains(cuisines, "str:ENTITY_com.yelp:restaurant_cuisine::8:"^^com.yelp:restaurant_cuisine("str:ENTITY_com.yelp:restaurant_cuisine::8:"));',
     '[opening_hours, phone, random_stuff] of @com.yelp.restaurant() filter contains(cuisines, "str:ENTITY_com.yelp:restaurant_cuisine::7:"^^com.yelp:restaurant_cuisine("str:ENTITY_com.yelp:restaurant_cuisine::7:")) && contains(cuisines, "str:ENTITY_com.yelp:restaurant_cuisine::8:"^^com.yelp:restaurant_cuisine("str:ENTITY_com.yelp:restaurant_cuisine::8:")) && review_count >= 16;',
     false
    ],
    ['[cuisines, opening_hours, phone] of @com.yelp.restaurant() filter review_count >= 16;',
     '$continue @com.yelp.restaurant() filter contains(cuisines, "str:ENTITY_com.yelp:restaurant_cuisine::7:"^^com.yelp:restaurant_cuisine("str:ENTITY_com.yelp:restaurant_cuisine::7:")) && contains(cuisines, "str:ENTITY_com.yelp:restaurant_cuisine::8:"^^com.yelp:restaurant_cuisine("str:ENTITY_com.yelp:restaurant_cuisine::8:"));',
     '[opening_hours] of @com.yelp.restaurant() filter contains(cuisines, "str:ENTITY_com.yelp:restaurant_cuisine::7:"^^com.yelp:restaurant_cuisine("str:ENTITY_com.yelp:restaurant_cuisine::7:")) && contains(cuisines, "str:ENTITY_com.yelp:restaurant_cuisine::8:"^^com.yelp:restaurant_cuisine("str:ENTITY_com.yelp:restaurant_cuisine::8:")) && review_count >= 16;',
     false
    ],
    ['[geo, image_url, opening_hours] of @com.yelp.restaurant() filter contains(opening_hours, set_time($now, new Time(2, 0)));',
     '$continue @com.yelp.restaurant() filter geo == $location.current_location;',
     '[image_url] of @com.yelp.restaurant() filter contains(opening_hours, set_time($now, new Time(2, 0))) && geo == $location.current_location;',
     true
    ],
    ['[opening_hours, review_count] of @com.yelp.restaurant();',
     '$continue @com.yelp.restaurant() filter review_count == 5;',
     '[opening_hours] of @com.yelp.restaurant() filter review_count == 5;',
     true
    ],
    ['[cuisines, opening_hours, phone] of @com.yelp.restaurant() filter review_count >= 16;',
     '$continue @com.yelp.restaurant() filter contains(cuisines, "str:ENTITY_com.yelp:restaurant_cuisine::11:"^^com.yelp:restaurant_cuisine("str:ENTITY_com.yelp:restaurant_cuisine::11:"));',
     '[opening_hours, phone] of @com.yelp.restaurant() filter contains(cuisines, "str:ENTITY_com.yelp:restaurant_cuisine::11:"^^com.yelp:restaurant_cuisine("str:ENTITY_com.yelp:restaurant_cuisine::11:")) && review_count >= 16;',
     true
    ],

    // this comes from `refineFilterForEmptySearch`
    ['@com.yelp.restaurant() filter contains(cuisines, "str:ENTITY_com.yelp:restaurant_cuisine::9:"^^com.yelp:restaurant_cuisine("str:ENTITY_com.yelp:restaurant_cuisine::9:"));',
     '$continue @com.yelp.restaurant() filter contains(cuisines, "str:ENTITY_com.yelp:restaurant_cuisine::2:"^^com.yelp:restaurant_cuisine("str:ENTITY_com.yelp:restaurant_cuisine::2:"));',
     '@com.yelp.restaurant() filter contains(cuisines, "str:ENTITY_com.yelp:restaurant_cuisine::2:"^^com.yelp:restaurant_cuisine("str:ENTITY_com.yelp:restaurant_cuisine::2:"));',
     true
    ],
    // this comes from `refineFilterToAnswerQuestionOrChangeFilter`
    ['@com.yelp.restaurant() filter contains(opening_hours, $start_of(day) - 1day + 22s);',
     '$continue @com.yelp.restaurant() filter contains(opening_hours, $end_of(week) + 22h);',
     '@com.yelp.restaurant() filter contains(opening_hours, $end_of(week) + 22h);',
     true
    ],
    // ID filer being neutralized. This also comes from `refineFilterToAnswerQuestionOrChangeFilter`
    ['[cuisines] of @com.yelp.restaurant() filter id == "str:ENTITY_com.yelp:restaurant::0:"^^com.yelp:restaurant;',
     '$continue @com.yelp.restaurant() filter geo == $location.current_location;',
     '[cuisines] of @com.yelp.restaurant() filter geo == $location.current_location;',
     true
    ],
    // gold standard has more than applied result
    ['[cuisines] of @com.yelp.restaurant() filter id == "str:ENTITY_com.yelp:restaurant::0:"^^com.yelp:restaurant;',
     '$continue @com.yelp.restaurant() filter geo == $location.current_location;',
     '[cuisines] of @com.yelp.restaurant() filter geo == $location.current_location && id == "jalkfjelafj";',
     false
    ],
    // gold standard has more than applied result
    ['[cuisines] of @com.yelp.restaurant() filter id == "str:ENTITY_com.yelp:restaurant::0:"^^com.yelp:restaurant;',
     '$continue @com.yelp.restaurant() filter geo == $location.current_location;',
     '[cuisines] of @com.yelp.restaurant() filter geo == $location.current_location && hfkaehfkahefkjaeh == "blablabla";',
     false
    ],
    // applied - gold has something not from old
    ['[cuisines] of @com.yelp.restaurant() filter id == "str:ENTITY_com.yelp:restaurant::0:"^^com.yelp:restaurant;',
     '$continue @com.yelp.restaurant() filter geo == $location.current_location && id == "hahahaha";',
     '[cuisines] of @com.yelp.restaurant() filter geo == $location.current_location;',
     false
    ],
    ['@com.yelp.restaurant() filter contains(opening_hours, $end_of(day)) && review_count == 3;',
     '$continue @com.yelp.restaurant() filter contains(opening_hours, new Time(3, 15));',
     '@com.yelp.restaurant() filter contains(opening_hours, new Time(3, 15)) && review_count == 3;',
     true
    ],
    ['@com.yelp.restaurant() filter contains(opening_hours, $end_of(day) - 2h) && rating <= 4;',
     '$continue @com.yelp.restaurant() filter contains(opening_hours, set_time($now, new Time(0, 30)));',
     '@com.yelp.restaurant() filter contains(opening_hours, set_time($now, new Time(0, 30))) && rating <= 4;',
     true
    ],
    ['[cuisines, price, review_count] of @com.yelp.restaurant() filter contains(opening_hours, new Date("2018-01-02T08:00:00.000Z")) && contains(opening_hours, set_time($start_of(day), new Time(12, 0))) && id == "str:ENTITY_com.yelp:restaurant::0:"^^com.yelp:restaurant;',
     '$continue @com.yelp.restaurant() filter contains(cuisines, "str:ENTITY_com.yelp:restaurant_cuisine::11:"^^com.yelp:restaurant_cuisine("str:ENTITY_com.yelp:restaurant_cuisine::11:"));',
     '[price, review_count] of @com.yelp.restaurant() filter contains(cuisines, "str:ENTITY_com.yelp:restaurant_cuisine::11:"^^com.yelp:restaurant_cuisine("str:ENTITY_com.yelp:restaurant_cuisine::11:")) && contains(opening_hours, new Date("2018-01-02T08:00:00.000Z")) && contains(opening_hours, set_time($start_of(day), new Time(12, 0)));',
     true
    ],
    ['@uk.ac.cam.multiwoz.Hotel.make_booking(book_people=3);',
     '$continue @uk.ac.cam.multiwoz.Hotel.make_booking(hotel="str:ENTITY_uk.ac.cam.multiwoz.Hotel:Hotel::1:"^^uk.ac.cam.multiwoz.Hotel:Hotel("str:ENTITY_uk.ac.cam.multiwoz.Hotel:Hotel::1:"));',
     '@uk.ac.cam.multiwoz.Hotel.make_booking(book_people=3, hotel="str:ENTITY_uk.ac.cam.multiwoz.Hotel:Hotel::1:"^^uk.ac.cam.multiwoz.Hotel:Hotel("str:ENTITY_uk.ac.cam.multiwoz.Hotel:Hotel::1:"));',
     true
    ]
];

function test(i) {
    console.log('Test Case #' + (i+1));
    let [before, levenshtein, expected, shouldpass] = TEST_CASES[i];

    let beforeProrgram = Grammar.parse(before);
    let levenshteinProgram = Grammar.parse(levenshtein);
    let expectedProgram = Grammar.parse(expected);
    let actualProgram = applyLevenshteinWrapper(beforeProrgram, levenshteinProgram);

    if ((shouldpass  && !determineSameExpressionLevenshtein(toChainExpression(actualProgram), toChainExpression(expectedProgram), [levenshteinProgram], toChainExpression(beforeProrgram))) ||
        (!shouldpass &&  determineSameExpressionLevenshtein(toChainExpression(actualProgram), toChainExpression(expectedProgram), [levenshteinProgram], toChainExpression(beforeProrgram)))) {
        console.log("====\n");
        console.error('Test Case #' + (i+1) + ': does not match what expected. pass set to ' + shouldpass);
        console.error('Before:    ' + beforeProrgram.prettyprint());
        console.error('Incoming:  ' + levenshteinProgram.prettyprint());
        console.error('Expected:  ' + expectedProgram.prettyprint());
        console.error('Generated: ' + actualProgram.prettyprint());
        if (process.env.TEST_MODE)
            throw new Error(`testLevenshteinSynthesisDebugging ${i+1} FAILED`);
    }
}


export default async function main() {
    for (let i = 0; i < TEST_CASES.length; i++)
        test(i);
}
if (!module.parent)
    main();
