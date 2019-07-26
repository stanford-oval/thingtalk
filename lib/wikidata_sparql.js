"use strict";

const Units = require("./units");

const QUERY_LIMIT = 10;

module.exports = {
    toSparql(input) {
        if (input.rules.length > 0 && input.rules[0].table !== undefined)
            return this.program_to_sparql(input.optimize());
        else throw new Error("Invalid Input");
    },

    generateQuery(sparql_triplets, sort_code) {
        let q = `
      SELECT distinct ?v1Label ?v2Label ?v3Label WHERE{

      ${sparql_triplets}

      SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }

      }

      ${sort_code}

      limit ${QUERY_LIMIT}
      `;
        return q;
    },

    //checks for joins, slices, filters, projections and sorts
    //outputs sparql query, a start and end for the slice, and if there is a projection
    program_to_sparql(program) {
        let table = program.rules[0].table;

        let table_params = this.parse_table(table);
        let isProjection = table_params[0];
        let slice = table_params[1];
        let projection_triplet = table_params[2];
        let sort_triplet = table_params[3];
        let sort_code = table_params[4];
        table = table_params[5];

        //if there is a join
        if (table.table.isJoin) {
            let join_triplets = [];
            let counter = 1;
            let current_table = table;
            table = table.table;
            let rhs_params = [];
            //if there is an additional projection within the join
            while (table !== undefined && table.isJoin) {
                current_table = table;
                if (table.rhs.isProjection && table.rhs.length > 1) {
                    projection_triplet = `?v1 wdt:${table.rhs.args[0]} ?v3.\n`;

                    isProjection = true;
                }

                let rhs_param = table.rhs.args[table.rhs.args.length - 1];
                rhs_params.push(rhs_param);

                table = table.lhs;

                counter += 1;
            }

            //reverse the order of the join triplets
            for (var i = rhs_params.length - 1; i >= 0; i--) {
                join_triplets.push(
                    `?v${rhs_params.length - i + 1} wdt:${
                        rhs_params[i]
                    } ?v${rhs_params.length - i}.\n`
                );
            }

            table = current_table;
            //if there is a sort
            if (table.rhs.isSort) {
                let field = table.table.field;
                let direction = table.table.direction;

                //create a sparql query without sorting to identify output variable
                //the form of the output variable is v${num}
                //num depends on joins and projections

                let temp_query = this.table_to_sparql(
                    table.lhs.table,
                    join_triplets,
                    projection_triplet.replace(
                        `v${counter}`,
                        `v${counter + 1}`
                    ),
                    "",
                    ""
                );

                let output_var = this.identify_output_variable(
                    temp_query,
                    isProjection
                );

                sort_triplet = `?v${output_var} wdt:${field} ?counter.\n`;
                sort_code = `ORDER BY ${direction}(?counter)`;
            }

            if (table.rhs.isSlice) {
                let base = table.table.base.toJS();
                let limit = table.table.limit.toJS();
                if (base >= 0 && limit >= 0) {
                    slice[0] = base;
                    slice[1] = limit;
                } else {
                    throw new Error("Invalid Input");
                }
            }

            //once the output variable is identified the sort can be added to the query
            let sparql_query = this.table_to_sparql(
                table.lhs.table,
                join_triplets,
                projection_triplet.replace(`v${counter - 1}`, `v${counter}`),
                sort_triplet,
                sort_code
            );

            return [sparql_query, slice, isProjection];
        }

        let sparql_query = this.table_to_sparql(
            table,
            "",
            projection_triplet,
            sort_triplet,
            sort_code
        );
        return [sparql_query, slice, isProjection];
    },

    parse_table(table) {
        let isProjection = false;
        let slice = [0, QUERY_LIMIT];
        let projection_triplet = "";
        let sort_triplet = "";
        let sort_code = "";

        if (table.isProjection) {
            let projection = table.args[0];
            projection_triplet = `?v1 wdt:${projection} ?v3.\n`;
            table = table.table;
            isProjection = true;
        }

        //check if a slice was declared
        if (table.table.isSlice) {
            let base = table.table.base.toJS();
            let limit = table.table.limit.toJS();
            if (base >= 0 && limit >= 0) {
                slice[0] = base;
                slice[1] = limit;
            } else {
                throw new Error("Invalid Input");
            }
        }

        if (table.table.isSort) {
            let field = table.table.field;
            let direction = table.table.direction;
            let temp_query = this.table_to_sparql(
                table,
                "",
                projection_triplet,
                "",
                ""
            );
            let output_var = this.identify_output_variable(
                temp_query,
                isProjection
            );

            sort_triplet = `?v${output_var} wdt:${field} ?counter.\n`;

            sort_code = `ORDER BY ${direction}(?counter)`;
        }

        return [
            isProjection,
            slice,
            projection_triplet,
            sort_triplet,
            sort_code,
            table,
        ];
    },

    identify_output_variable(sparqlQuery, isProjection) {
        let split = sparqlQuery.split("\n");
        let lines = [];
        for (var i = 0; i < split.length; i++)
            if (split[i] !== "") lines.push(split[i]);

        let target_sequence = "";
        for (var j = lines.length - 1; j >= 0; j--) {
            if (lines[j].includes("?v")) {
                target_sequence = lines[j];
                break;
            }
        }

        if (target_sequence !== "") {
            target_sequence = target_sequence.trim();
            if (isProjection)
                return target_sequence[target_sequence.length - 2];
            else return target_sequence[2];
        } else {
            return 0;
        }
    },

    //recursively check filters for various properties
    map_filters(filters, schema, counter, isNested) {
        let filter_triplets = "";
        let get_label_triplets = [];
        let get_paramater_triplets = [];
        let needsBreak = false;
        let nestedAndStatement = "";

        let filter_list = filters.operands;

        //reorder filters so that and statements are done before or statements
        let ordered_filters = [];
        filter_list.map((filter) => {
            if (filter.operands === undefined) {
                if (filter.isNot) {
                    //restructure filter to have not be a comparitive instead of logical operator
                    filter.expr.operator = "!=";
                    filter = filter.expr;
                }
                ordered_filters.push(filter);
            }
        });

        filter_list.map((filter) => {
            if (filter.operands !== undefined) ordered_filters.push(filter);
        });

        for (var i = 0; i < ordered_filters.length; i++) {
            let filter = ordered_filters[i];

            if (filter.operands !== undefined) {
                let result = this.map_filters(filter, schema, counter, true);
                nestedAndStatement = result[2];

                filter_triplets += result[0];
                counter = result[1];

                needsBreak = true;
            }
            if (needsBreak) break;

            let parameter = filter.name;

            let type = schema.getArgType(parameter);

            //special case if the filter is an array
            if (type.isArray) {
                let value = filter.value.toJS();
                if (value === undefined) throw new Error("Invalid Input");

                //converts array into wikidata triplet
                let triplets = this.array_to_triplets(
                    value,
                    parameter,
                    counter,
                    type
                );

                get_label_triplets.push(triplets[0]);
                get_paramater_triplets.push(triplets[1]);

                counter = triplets[2];
            } else {
                //converts each filter into wikidata triplet

                let triplets = this.filter_to_triplet(
                    filter,
                    schema,
                    counter,
                    filters
                );

                //counter is the index for the label retrieving triplets
                //?item${counter} ?label 'foo'@en.
                counter = triplets[2];

                get_label_triplets.push(triplets[0]);
                get_paramater_triplets.push(triplets[1]);
            }
        }

        for (var label_triplet of get_label_triplets)
            filter_triplets += label_triplet;

        if (isNested) {
            return [filter_triplets, counter, get_paramater_triplets];
        } else {
            if (filters.isOr) {
                if (nestedAndStatement !== "") {
                    get_paramater_triplets[1] = "";
                    for (var statement of nestedAndStatement)
                        get_paramater_triplets[1] += statement;
                }
                let union_statement = `{${get_paramater_triplets[0]}}\n UNION
              {${get_paramater_triplets[1]}}\n`;

                filter_triplets += union_statement;
            } else {
                for (var parameter_triplet of get_paramater_triplets)
                    filter_triplets += parameter_triplet;
            }
        }

        return [filter_triplets, counter];
    },

    table_to_sparql(
        table,
        join_triplets_array,
        projection_triplet,
        sort_triplet,
        sort_code
    ) {
        const filters = table.filter;
        //filters.isAnd;

        const schema = table.schema;
        let join_triplets = "";
        for (var i = 0; i < join_triplets_array.length; i++)
            join_triplets += join_triplets_array[i];

        //if there are multiple filters
        if (filters.operands !== undefined) {
            let core_triplets = "";
            let counter = 1;

            let results = this.map_filters(filters, schema, counter);
            core_triplets += results[0];
            counter = results[1];

            let sparql_triplets =
                core_triplets +
                join_triplets +
                projection_triplet +
                sort_triplet;

            let query = this.generateQuery(sparql_triplets, sort_code);

            return query;
        } else {
            let parameter = filters.name;
            let type = schema.getArgType(parameter);
            if (type.isArray) {
                let value = filters.value.toJS();
                if (value === undefined) throw new Error("Invalid Input");
                let core_triplets = this.array_to_triplets(
                    value,
                    parameter,
                    1,
                    type
                );

                let sparql_triplets =
                    core_triplets[0] +
                    core_triplets[1] +
                    join_triplets +
                    projection_triplet +
                    sort_triplet;

                let query = this.generateQuery(sparql_triplets, sort_code);

                return query;
            } else {
                let triplets = this.filter_to_triplet(filters, schema, 1);

                let sparql_triplets =
                    triplets[0] +
                    triplets[1] +
                    join_triplets +
                    projection_triplet +
                    sort_triplet;

                let query = this.generateQuery(sparql_triplets, sort_code);

                return query;
            }
        }
    },

    //converts filter to sparql triplet
    filter_to_triplet(filter_input, schema_input, index) {
        const parameter = filter_input.name;
        const type = schema_input.getArgType(parameter);

        let value = filter_input.value.toJS();
        if (value === undefined) throw new Error("Invalid Input");

        let operator = filter_input.operator;

        let unit = filter_input.value.unit;

        const isUnique = schema_input.getArgument(parameter).unique;

        let get_label_triplet = "";

        if (type.isNumber || type.isMeasure) {
            if (unit !== undefined)
                //converts value to the correct units
                value = value / Units.UnitsTransformToBaseUnit[unit];

            value = `"${value}"^^xsd:decimal`;
        }

        //reformat date
        if (type.isDate) value = this.reformat_date(value);
        if (type.isString) {
            if (!isUnique) {
                get_label_triplet = `?item${index} ?label '${value}'@en.\n`;
                value = `?item${index}`;
            } else {
                value = "wd:" + value;
            }
            index += 1;
        }
        if (type.isEntity) value = "wd:" + value;

        if (operator === "==") {
            return [
                get_label_triplet,
                `?v1 wdt:${parameter} ${value}.\n`,
                index,
            ];
        } else {
            return [
                get_label_triplet,
                `?v1 wdt:${parameter} ?compValue.
                FILTER(?compValue ${operator} ${value}).\n`,
                index,
            ];
        }
    },

    //converts array to triplet
    //makes assumption that arrays are always either Strings or Entities
    array_to_triplets(input_array, parameter, index, type) {
        let get_label_triplets = "";
        let get_parameter_triplets = "";
        for (var i = 0; i < input_array.length; i++) {
            let value = input_array[i].value;

            if (type.elem.isEntity) {
                get_parameter_triplets += `?v1 wdt:${parameter} wd:${value}.\n`;
            } else {
                get_label_triplets += `?item${index +
                    1} ?label '${value}'@en.\n`;
                get_parameter_triplets += `?v1 wdt:${parameter} ?item${index +
                    1}.\n`;
                index += 1;
            }
        }
        return [get_label_triplets, get_parameter_triplets, index];
    },

    //reformat date
    reformat_date(date) {
        let year = date.getFullYear();
        //ensures that the month and date are two digit values
        let month = ("0" + (date.getMonth() + 1)).slice(-2);
        let day = ("0" + date.getDate()).slice(-2);
        const formatted_date = `"${year}-${month}-${day}"^^xsd:dateTime`;
        return formatted_date;
    },
};
