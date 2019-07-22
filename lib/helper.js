"use strict";

const SparqlConverter = require("./sparql_converter");

module.exports = {
    program_to_sparql(program){
        return SparqlConverter.program_to_sparql(program);
    },
    table_to_sparql(table){
        return SparqlConverter.table_to_sparql(table);
    },
};
