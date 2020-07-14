// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingTalk
//
// Copyright 2019-2020 The Board of Trustees of the Leland Stanford Junior University
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
"use strict";

const AppGrammar = require("../lib/grammar_api");
const SchemaRetriever = require("../lib/schema");
const Helper = require("../lib/helper");

const _mockSchemaDelegate = require("./mock_schema_delegate");
const _mockMemoryClient = require("./mock_memory_client");
var assert = require("assert");

const _schemaRetriever = new SchemaRetriever(
    _mockSchemaDelegate,
    _mockMemoryClient,
    true
);

const TEST_CASES = [
    [
        `
    // Test for handling filters, retrieving wikidata representations of strings and projections
    // Filter for person who has last name Curry, plays Basketball, and project for Father
    now => [P22] of @org.wikidatasportsskill.athlete(), P734 == "Curry"
    && P641 == ["Q5372"^^org.wikidatasportsskill:sports] => notify;
        `,
        `
    SELECT (?table0 as ?id) (?table0Label as ?idLabel) (?p46 as ?P22) (?p46Label as ?P22Label) WHERE {
    ?string18 ?label18 'Curry'@en.
    ?table0 wdt:P734 ?p18.
    ?table0 wdt:P641 ?p71.
    FILTER (?p18 = ?string18).
    FILTER (?p71 = wd:Q5372).
    ?table0 wdt:P22 ?p46.
    ?table0 wdt:P31 wd:Q5
    SERVICE wikibase:label { bd:serviceParam wikibase:language "en". ?table0 rdfs:label ?table0Label. ?p46 rdfs:label ?p46Label. }}

    limit 1 offset 0
    `,
    ],
    [
        `
    // Test for handling dates within filters
    // filter for person who was born on August 3, 1977, and plays Football
    now => @org.wikidatasportsskill.athlete(), P569 == makeDate(1977, 8, 3)
    && P641 == ["Q41323"^^org.wikidatasportsskill:sports] => notify;
        `,
        `
    SELECT (?table0 as ?id) (?table0Label as ?idLabel) WHERE {

    ?table0 wdt:P569 ?p14.
    ?table0 wdt:P641 ?p71.
    FILTER (?p14 = "1977-08-03"^^xsd:dateTime).
    FILTER (?p71 = wd:Q41323).
    ?table0 wdt:P31 wd:Q5
    SERVICE wikibase:label { bd:serviceParam wikibase:language "en". ?table0 rdfs:label ?table0Label. }}

    limit 1 offset 0
        `,
    ],
    [
        `
    // Test for handling measurements within filters and negating operators
    // Filter for persons who are over 231 cm and play Basketball
    now => @org.wikidatasportsskill.athlete(), !(P2048 <= 231cm)
    && P641 == ["Q5372"^^org.wikidatasportsskill:sports] => notify;
        `,
        `
    SELECT (?table0 as ?id) (?table0Label as ?idLabel) WHERE {
    ?table0 wdt:P2048 ?p24.
    ?table0 wdt:P641 ?p71.
    FILTER (?p24 > "2.31"^^xsd:decimal).
    FILTER (?p71 = wd:Q5372).
    ?table0 wdt:P31 wd:Q5
    SERVICE wikibase:label { bd:serviceParam wikibase:language "en". ?table0 rdfs:label ?table0Label. }}
    limit 1 offset 0
        `,
    ],
    [
        `
    // Test for handling entities within filters
    // Filter for person who was drafted by the cavs and won the MVP award
    now => @org.wikidatasportsskill.athlete(),
    P647 == "Q162990"^^org.wikidatasportsskill:sports_teams("Cleveland Cavaliers")
    && P166 == ["Q222047"^^org.wikidatasportsskill:award_received("NBA Most Valuable Player Award")] => notify;
    `,
        `
    SELECT (?table0 as ?id) (?table0Label as ?idLabel) WHERE {
    ?table0 wdt:P647 ?p48.
    ?table0 wdt:P166 ?p71.
    FILTER (?p48 = wd:Q162990).
    FILTER (?p71 = wd:Q222047).
    ?table0 wdt:P31 wd:Q5
    SERVICE wikibase:label { bd:serviceParam wikibase:language "en". ?table0 rdfs:label ?table0Label. }}
    limit 1 offset 0
        `,
    ],
    [
        `
    // Test for handling arrays within filters
    // Filter for persons who have played for the Lakers and Warriors
    now => @org.wikidatasportsskill.athlete(),
    P54 == ["Q121783"^^org.wikidatasportsskill:sports_teams("Los Angeles Lakers"),
    "Q157376"^^org.wikidatasportsskill:sports_teams("Golden State Warriors")] => notify;
        `,
        `
    SELECT (?table0 as ?id) (?table0Label as ?idLabel) WHERE {
    ?table0 wdt:P54 ?p71.
    ?table0 wdt:P54 ?p72.
    FILTER (?p71 = wd:Q121783).
    FILTER (?p72 = wd:Q157376).
    ?table0 wdt:P31 wd:Q5
    SERVICE wikibase:label { bd:serviceParam wikibase:language "en". ?table0 rdfs:label ?table0Label. }}
    limit 1 offset 0
        `,
    ],
    [
        `
    // Test for handling joins and aliases
    // Join for team Steve Kerr coaches (Warriors) and players who were drafted by that team
    now => ((([id] of @org.wikidatasportsskill.sports_team() as lhs),
    P286 == "Q523630"^^org.wikidatasportsskill:athletes('Steve Kerr'))
    join (@org.wikidatasportsskill.athlete())), P647 == lhs.id => notify;
        `,
        `
    SELECT (?table1 as ?id) (?table1Label as ?idLabel) (?table0 as ?lhs__id) (?table0Label as ?lhs__idLabel) WHERE {
    ?table0 wdt:P286 ?p14.
    FILTER (?p14 = wd:Q523630).
    ?table1 wdt:P647 ?p63.
    FILTER (?p63 = ?table0).
    ?table1 wdt:P31 wd:Q5
    SERVICE wikibase:label { bd:serviceParam wikibase:language "en". ?table1 rdfs:label ?table1Label. ?table0 rdfs:label ?table0Label. }}
    limit 1 offset 0
        `,
    ],
    [
        `
    // Test for sorts and indexing
    // Filter for persons who were drafted by the warriors, sort for the youngest players, and get the second result
    now => sort P569 desc of @org.wikidatasportsskill.athlete()[1], P647 == "Q157376"^^org.wikidatasportsskill:sports_teams("Golden State Warriors") => notify;
        `,
        `
    SELECT (?table0 as ?id) (?table0Label as ?idLabel) WHERE {
    ?table0 wdt:P569 ?p14.
    ?table0 wdt:P647 ?p48.
    FILTER (?p48 = wd:Q157376).
    ?table0 wdt:P31 wd:Q5
    SERVICE wikibase:label { bd:serviceParam wikibase:language "en". ?table0 rdfs:label ?table0Label. }}
    ORDER BY desc(?p14)
    limit 1 offset 1
        `,
    ],
    [
        `
    // Test for nested joins and repetitive projections
    // Join for basketball team the players who were drafted by that team and the players which are head coaches
    now => ((((@org.wikidatasportsskill.sports_team(),
    P641 == "Q5372"^^org.wikidatasportsskill:sports('Basketball')) as lhs)
    join (([id, P647] of @org.wikidatasportsskill.athlete()) as rhs))
    join ([id] of @org.wikidatasportsskill.sports_team())), P647 == lhs.id && P286 == rhs.id => notify;
        `,
        `
    SELECT (?table2 as ?id) (?table2Label as ?idLabel) (?p63 as ?P647) (?p63Label as ?P647Label) (?table1 as ?rhs__id) (?table1Label as ?rhs__idLabel) (?p63 as ?rhs__P647) (?p63Label as ?rhs__P647Label) (?table0 as ?lhs__id) (?table0Label as ?lhs__idLabel) WHERE {
    ?table0 wdt:P641 ?p3.
    FILTER (?p3 = wd:Q5372).
    ?table1 wdt:P647 ?p63.
    ?table2 wdt:P286 ?p100.
    FILTER (?p63 = ?table0).
    FILTER (?p100 = ?table1).
    ?table1 wdt:P31 wd:Q5
    SERVICE wikibase:label { bd:serviceParam wikibase:language "en". ?table2 rdfs:label ?table2Label. ?p63 rdfs:label ?p63Label. ?table1 rdfs:label ?table1Label. ?p63 rdfs:label ?p63Label. ?table0 rdfs:label ?table0Label. }}

    limit 1 offset 0

        `,
    ],
    [
        `
    // Test for handling nested or/and statements
    // Union between Guards who have won All Star Game MVP and players who have won MVP
    now => @org.wikidatasportsskill.athlete(), P413 == ["Q212413"^^org.wikidatasportsskill:position_played_on_team('Guard')]
    && P166 == ["Q31391"^^org.wikidatasportsskill:award_received("NBA All-Star Game Most Valuable Player Award")]
    || P166 == ["Q222047"^^org.wikidatasportsskill:award_received("NBA Most Valuable Player Award")] => notify;
        `,
        `
    SELECT (?table0 as ?id) (?table0Label as ?idLabel) WHERE {
    {?table0 wdt:P166 ?p74
    FILTER (?p74 = wd:Q222047)}
    UNION
    {?table0 wdt:P413 ?p71.
    ?table0 wdt:P166 ?p72} .
    FILTER (?p71 = wd:Q212413).
    FILTER (?p72 = wd:Q31391).
    ?table0 wdt:P31 wd:Q5
    SERVICE wikibase:label { bd:serviceParam wikibase:language "en". ?table0 rdfs:label ?table0Label. }}
    limit 1 offset 0
    `,
    ],
    [
        `
    //Test for filtering id
    //Join between the owner of Microsoft and the father of that person
    now => (((@org.wikidata.person(), contains(P1830, 'Microsoft')) as lhs)
    join ([P735, P19] of @org.wikidata.person())), id==lhs.P22 => notify;
        `,
        `
    SELECT (?table1 as ?id) (?table1Label as ?idLabel) (?p67 as ?P735) (?p75 as ?P19) (?table0 as ?lhs__id) (?table0Label as ?lhs__idLabel) WHERE {
    ?string50 ?label50 'Microsoft'@en.
    ?table0 wdt:P1830 ?p50.
    FILTER (?p50 = ?string50).
    ?table0 wdt:P22 ?p15.
    FILTER (?p15 = ?table1).
    ?table1 wdt:P735 ?p67.
    ?table1 wdt:P19 ?p75.
    ?table0 wdt:P31 wd:Q5.
    ?table1 wdt:P31 wd:Q5
    SERVICE wikibase:label { bd:serviceParam wikibase:language "en". ?table1 rdfs:label ?table1Label. ?p67 rdfs:label ?p67Label. ?p75 rdfs:label ?p75Label. ?table0 rdfs:label ?table0Label. }}
    limit 1 offset 0
        `,
    ],
    [
        `
    //Test for substrings
    //filter for person who has last name Obama and first name containing "Bar"
    now => [id, P18] of (@org.wikidata.person(), P734 == "Obama" && P735 =~ 'Bar') => notify;
    `,

        `
    SELECT (?table0 as ?id) (?table0Label as ?idLabel) (?p13 as ?P18) (?p13Label as ?P18Label) WHERE {
    ?string1 ?label1 'Obama'@en.
    ?string0 ?label0 'Bar'@en.
    ?table0 wdt:P734 ?p1.
    ?table0 wdt:P735 ?p0.
    FILTER (?p1 = ?string1).
    ?p0 rdfs:label ?p67.
    FILTER CONTAINS(?p67, 'Bar') .
    ?table0 wdt:P18 ?p13.
    ?table0 wdt:P31 wd:Q5
    SERVICE wikibase:label { bd:serviceParam wikibase:language "en". ?table0 rdfs:label ?table0Label. ?p13 rdfs:label ?p13Label. }}
    limit 1 offset 0
        `,
    ],
];

async function test(index) {
    let thingtalk = TEST_CASES[index][0];
    let expected = TEST_CASES[index][1];
    await AppGrammar.parseAndTypecheck(thingtalk, _schemaRetriever).then(
        (program) => {
            //convert from ast to sparql
            let generated = Helper.toSparql(program);
            compare_sparqls(generated, expected);
        }
    );
}

function compare_sparqls(sqarqlQuery1, sqarqlQuery2) {
    //remove all whitespaces
    let lines1 = sqarqlQuery1.replace(/\s+/g, ' ').trim();
    let lines2 = sqarqlQuery2.replace(/\s+/g, ' ').trim();
    assert.strictEqual(lines1, lines2);
}

async function main() {
    for (var i = 0; i < TEST_CASES.length; i++) {
        console.log("TEST CASE #" + (i + 1));
        await test(i);
    }
}

module.exports = main;
if (!module.parent) main();
