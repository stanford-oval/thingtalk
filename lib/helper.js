"use strict";

const WikidataSparqlConverter = require("./wikidata_sparql");
const SparqlConverter = new WikidataSparqlConverter();

module.exports = {
    toSparql(input) {
        return SparqlConverter.convert(input);
    },
};
