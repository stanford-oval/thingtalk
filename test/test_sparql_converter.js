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


import assert from 'assert';

import * as AppGrammar from "../lib/syntax_api";
import SchemaRetriever from "../lib/schema";
import * as Helper from "../lib/helper";

import _mockSchemaDelegate from "./mock_schema_delegate";
import _mockMemoryClient from "./mock_memory_client";

const _schemaRetriever = new SchemaRetriever(
    _mockSchemaDelegate,
    _mockMemoryClient,
    true
);

const TEST_CASES = [
[
`now => @org.wikidata.city() => notify;`,
`SELECT DISTINCT (?table0 as ?id) (?table0Label as ?idLabel) 
WHERE {
  ?table0 p:P31/ps:P31/wdt:P279* wd:Q515.
  SERVICE wikibase:label {
    bd:serviceParam wikibase:language "en".
    ?table0 rdfs:label ?table0Label.
  }
}
LIMIT 5 OFFSET 0`
],

[
`// Test for handling filters, retrieving wikidata representations of strings and projections
now => [postal_code] of @org.wikidata.city(), id =~ "palo alto" => notify;`,
`SELECT DISTINCT (?p16 as ?postal_code) 
WHERE {
  ?table0 rdfs:label ?p23.
  FILTER CONTAINS(lcase(?p23), 'palo alto') .
  ?table0 wdt:P281 ?p16.
  ?table0 p:P31/ps:P31/wdt:P279* wd:Q515.
  SERVICE wikibase:label {
    bd:serviceParam wikibase:language "en".
    ?p16 rdfs:label ?p16Label.
  }
}
LIMIT 5 OFFSET 0`,
],

[
`
// Test for filtering on string
// since we don't know if the value is a string or an entity in wikidata, we need to try string match
// on both the value itself, and its label
now => @org.wikidata.city(),  postal_code =~ "94301" => notify;`,
`SELECT DISTINCT (?table0 as ?id) (?table0Label as ?idLabel) 
WHERE {
  ?table0 wdt:P281 ?p16.
  OPTIONAL {
    ?p16 rdfs:label ?p23 
  }
  FILTER (CONTAINS(lcase(?p23), '94301') || CONTAINS(lcase(?p16), '94301')) .
  ?table0 p:P31/ps:P31/wdt:P279* wd:Q515.
  SERVICE wikibase:label {
    bd:serviceParam wikibase:language "en".
    ?table0 rdfs:label ?table0Label.
  }
}
LIMIT 5 OFFSET 0`,
],

[
`// Test for handling dates within filters
now => @org.wikidata.city(), inception == new Date(1894, 1, 1) => notify;`,
`SELECT DISTINCT (?table0 as ?id) (?table0Label as ?idLabel) 
WHERE {
  ?table0 wdt:P571 ?p0.
  FILTER (?p0 = "1894-01-01"^^xsd:dateTime).
  ?table0 p:P31/ps:P31/wdt:P279* wd:Q515.
  SERVICE wikibase:label {
    bd:serviceParam wikibase:language "en".
    ?table0 rdfs:label ?table0Label.
  }
}
LIMIT 5 OFFSET 0`,
],

[
`// Test for handling measurements within filters and negating operators
now => @org.wikidata.city(), !(elevation_above_sea_level <= 4000m ) => notify;`,
`SELECT DISTINCT (?table0 as ?id) (?table0Label as ?idLabel) 
WHERE {
  ?table0 wdt:P2044 ?p11.
  FILTER (?p11 > "4000"^^xsd:decimal).
  ?table0 p:P31/ps:P31/wdt:P279* wd:Q515.
  SERVICE wikibase:label {
    bd:serviceParam wikibase:language "en".
    ?table0 rdfs:label ?table0Label.
  }
}
LIMIT 5 OFFSET 0`,
],

[
`// Test for handling entities within filters
now => @org.wikidata.city(), contains(twinned_administrative_body, null^^org.wikidata:city("palo alto")) => notify;`,
`SELECT DISTINCT (?table0 as ?id) (?table0Label as ?idLabel) 
WHERE {
  ?table0 wdt:P190 ?p13.
  ?p13 rdfs:label ?p23.
  FILTER CONTAINS(lcase(?p23), 'palo alto') .
  ?table0 p:P31/ps:P31/wdt:P279* wd:Q515.
  SERVICE wikibase:label {
    bd:serviceParam wikibase:language "en".
    ?table0 rdfs:label ?table0Label.
  }
}
LIMIT 5 OFFSET 0`,
],

[
`// Test for handling joins and aliases
// This causes a time out, so this is not tested if it can get a result or not
now => (((@org.wikidata.city() as lhs), postal_code =~ "94301") => (@org.wikidata.city())), contains(twinned_administrative_body, lhs.id) => notify;`,
`SELECT DISTINCT (?table1 as ?id) (?table1Label as ?idLabel) (?table0 as ?lhs__id) (?table0Label as ?lhs__idLabel) 
WHERE {
  ?table0 wdt:P281 ?p16.
  OPTIONAL {
    ?p16 rdfs:label ?p23 
  }
  FILTER (CONTAINS(lcase(?p23), '94301') || CONTAINS(lcase(?p16), '94301')) .
  ?table1 wdt:P190 ?p37.
  FILTER (?p37 = ?table0).
  ?table0 p:P31/ps:P31/wdt:P279* wd:Q515.
  ?table1 p:P31/ps:P31/wdt:P279* wd:Q515.
  SERVICE wikibase:label {
    bd:serviceParam wikibase:language "en".
    ?table1 rdfs:label ?table1Label.
    ?table0 rdfs:label ?table0Label.
  }
}
LIMIT 5 OFFSET 0`,
],
[
`// Test for sorts and indexing
now => sort(area desc of (@org.wikidata.city(), country == "Q30"^^org.wikidata:country))[1] => notify;`,
`SELECT DISTINCT (?table0 as ?id) (?table0Label as ?idLabel) 
WHERE {
  ?table0 wdt:P17 ?p3.
  FILTER (?p3 = wd:Q30).
  ?table0 wdt:P2046 ?p15.
  ?table0 p:P31/ps:P31/wdt:P279* wd:Q515.
  SERVICE wikibase:label {
    bd:serviceParam wikibase:language "en".
    ?table0 rdfs:label ?table0Label.
  }
}
ORDER BY desc(?p15) LIMIT 1 OFFSET 0`,
],
[
`// Test for slicing
now => sort(area desc of (@org.wikidata.city(), country == "Q30"^^org.wikidata:country))[2:4] => notify;`,
`SELECT DISTINCT (?table0 as ?id) (?table0Label as ?idLabel) 
WHERE {
  ?table0 wdt:P17 ?p3.
  FILTER (?p3 = wd:Q30).
  ?table0 wdt:P2046 ?p15.
  ?table0 p:P31/ps:P31/wdt:P279* wd:Q515.
  SERVICE wikibase:label {
    bd:serviceParam wikibase:language "en".
    ?table0 rdfs:label ?table0Label.
  }
}
ORDER BY desc(?p15) LIMIT 2 OFFSET 2`,
],
[
`// Test for handling and statements
now => @org.wikidata.city(), country == "Q30"^^org.wikidata:country && inception == new Date(1894, 1, 1) => notify;`,
`SELECT DISTINCT (?table0 as ?id) (?table0Label as ?idLabel) 
WHERE {
  ?table0 wdt:P17 ?p3.
  ?table0 wdt:P571 ?p0.
  FILTER (?p3 = wd:Q30).
  FILTER (?p0 = "1894-01-01"^^xsd:dateTime).
  ?table0 p:P31/ps:P31/wdt:P279* wd:Q515.
  SERVICE wikibase:label {
    bd:serviceParam wikibase:language "en".
    ?table0 rdfs:label ?table0Label.
  }
}
LIMIT 5 OFFSET 0`,
],

];

async function test(index) {
    let thingtalk = TEST_CASES[index][0];
    let expected = TEST_CASES[index][1];
    await AppGrammar.parse(thingtalk).typecheck(_schemaRetriever).then(
        (program) => {
            //convert from ast to sparql
            let generated = Helper.toSparql(program);
            assert.strictEqual(generated, expected);
        }
    );
}

export default async function main() {
    for (let i = 0; i < TEST_CASES.length; i++) {
        console.log("TEST CASE #" + (i + 1));
        await test(i);
    }
}
if (!module.parent) main();
