"use strict";

const WikidataSparqlConverter = require("./wikidata_sparql2");
const SparqlConverter = new WikidataSparqlConverter();

module.exports = {
    toSparql(input) {
        return SparqlConverter.convert(input);
    },
};
