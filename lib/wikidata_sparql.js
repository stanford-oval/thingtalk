"use strict";

const Units = require("./units");

const QUERY_LIMIT = 10;

module.exports = {
    toSparql(input) {
        if (input.rules.length > 0 && input.rules[0].table !== undefined)
            return this.program_to_sparql(input.optimize());
        else throw new Error("Invalid Input");
    },

    program_to_sparql(program) {
        let table = program.rules[0].table;

        let queryCode = this.table_to_subquery(table);

        return this.build_query(
            queryCode[0],
            queryCode[1],
            queryCode[2],
            queryCode[3]
        );
    },

    table_to_subquery(
        table,
        queryBody = [],
        additionalSparql = [],
        outputVarIndex = 1,
        labelVarIndex = 1,
        projectionObject = {},
        varRefObj = {},
        tableCount = 1,
        fromJoin = false
    ) {
        if (fromJoin && !table.isJoin) tableCount += 1;

        if (table.isFilter) {
            let filters = this.map_filters(
                table.filter,
                table.schema,
                labelVarIndex,
                false,
                outputVarIndex,
                varRefObj,
                projectionObject
            );

            queryBody.push(filters[0]);
            labelVarIndex = filters[1];
            outputVarIndex = filters[2];
            varRefObj = filters[3];
            projectionObject = filters[4];
        } else if (table.isSort) {
            let sorts = this.sort_to_triplet(table, outputVarIndex);

            queryBody.push(sorts[0]);
            additionalSparql.push(sorts[1]);
        } else if (table.isJoin) {
            tableCount -= 1;
            let queryCode = this.table_to_subquery(
                table.lhs,
                queryBody,
                additionalSparql,
                outputVarIndex,
                labelVarIndex,
                projectionObject,
                varRefObj,
                tableCount,
                true
            );

            queryBody = queryCode[0];
            additionalSparql = queryCode[1];
            projectionObject = queryCode[2];
            outputVarIndex = queryCode[3];
            tableCount = queryCode[4];
            labelVarIndex = queryCode[5];

            queryCode = this.table_to_subquery(
                table.rhs,
                queryBody,
                additionalSparql,
                outputVarIndex,
                labelVarIndex,
                projectionObject,
                varRefObj,
                tableCount,
                true
            );

            queryBody = queryCode[0];
            additionalSparql = queryCode[1];
            projectionObject = queryCode[2];
            outputVarIndex = queryCode[3];
            tableCount = queryCode[4];
            labelVarIndex = queryCode[5];
        } else if (table.isProjection) {
            let projections = table.args;
            let sparql_subject = table.schema.getAnnotation("sparql_subject");
            for (let i = 0; i < projections.length; i++) {
                if (projections[i] === "id")
                    projections[i] = `id:${sparql_subject}`;
            }

            let tempIndex = tableCount;

            if (projectionObject[tempIndex] === undefined)
                projectionObject[tempIndex] = [projections];
            else projectionObject[tempIndex].push(projections);
        } else if (table.isAlias) {
            let sparql_subject = table.schema.getAnnotation("sparql_subject");

            if (Object.prototype.hasOwnProperty.call(varRefObj, table.name)) {
                let tempIndex = tableCount;

                let projection_property = [varRefObj[table.name][0]];

                let isId = varRefObj[table.name][1];

                if (projection_property[0] === "id")
                    projection_property[0] = `id:${sparql_subject}`;

                if (projectionObject[tempIndex] === undefined)
                    projectionObject[tempIndex] = [projection_property];
                else projectionObject[tempIndex].push(projection_property);

                //if the filter was for ID there is no change in output variable
                if (isId) tableCount -= 1;
            }
        }
        if (table.table !== undefined) {
            return this.table_to_subquery(
                table.table,
                queryBody,
                additionalSparql,
                outputVarIndex,
                labelVarIndex,
                projectionObject,
                varRefObj,
                tableCount
            );
        }

        return [
            queryBody,
            additionalSparql,
            projectionObject,
            outputVarIndex,
            tableCount,
            labelVarIndex,
        ];
    },

    sort_to_triplet(table, outputVarIndex) {
        let field = table.field;
        let direction = table.direction;

        let sort_triplet = `?v${outputVarIndex} wdt:${field} ?counter.\n`;
        let sort_code = `ORDER BY ${direction}(?counter)`;

        return [sort_triplet, sort_code];
    },

    projection_to_triplet(projectionArray, index) {
        projectionArray = [...new Set(projectionArray)];
        let id_triplet = "";
        let projection_triplet = "";

        let projectionId = projectionArray.find((a) => a.includes("id"));

        if (projectionId !== undefined) {
            let sparqlId = projectionId.split(":")[1];
            id_triplet = `?v${index} wdt:P31 wd:${sparqlId}.\n`;
            let id_index = projectionArray.indexOf(projectionId);
            if (id_index > -1) projectionArray.splice(id_index, 1);
        }

        let projections = "";
        if (projectionArray[0] !== undefined)
            projections = `wdt:${projectionArray[0]}`;

        for (let i = 1; i < projectionArray.length; i++)
            projections += `|wdt:${projectionArray[i]}`;

        if (projections !== "")
            projection_triplet = `?v${index + 1} ${projections} ?v${index}.\n`;

        return projection_triplet + id_triplet;
    },

    //recursively check filters for various properties
    map_filters(
        filters,
        schema,
        counter,
        isNested,
        outputVarIndex,
        varRefObj,
        projectionObject
    ) {
        let filter_triplets = "";
        let get_label_triplets = [];
        let get_paramater_triplets = [];
        let nestedAndStatement = "";

        let filter_list = filters.operands;

        //reorder filters so that and statements are done before or statements
        let ordered_filters = [];

        if (filter_list !== undefined) {
            for (var filter of filter_list) {
                if (filter.operands === undefined) {
                    if (filter.isNot) {
                        //restructure filter to have not be a comparitive instead of logical operator
                        filter.expr.operator = "!=";
                        filter = filter.expr;
                    }
                    ordered_filters.unshift(filter);
                } else {
                    ordered_filters.push(filter);
                }
            }
        } else {
            ordered_filters.push(filters);
        }

        for (var i = 0; i < ordered_filters.length; i++) {
            let filter = ordered_filters[i];

            if (filter.operands !== undefined) {
                let result = this.map_filters(
                    filter,
                    schema,
                    counter,
                    true,
                    outputVarIndex,
                    varRefObj,
                    projectionObject
                );

                filter_triplets += result[0];
                counter = result[1];
                outputVarIndex = result[2];
                varRefObj = result[3];
                projectionObject = result[4];

                nestedAndStatement = result[5];

                break;
            }

            let parameter = filter.name;

            let type = schema.getArgType(parameter);
            let isArray = type.isArray;
            if (filter.value !== undefined) {
                if (filter.value.isArray !== type.isArray)
                    isArray = filter.value.isArray;
            }

            //special case if the filter is an array
            if (isArray) {
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

                //counter is the index for the label retrieving triplets
                //?item${counter} ?label 'foo'@en.
                counter = triplets[2];
            } else {
                //converts each filter into wikidata triplet

                let triplets = this.filter_to_triplet(
                    filter,
                    schema,
                    counter,
                    outputVarIndex,
                    varRefObj,
                    projectionObject
                );

                get_label_triplets.push(triplets[0]);

                get_paramater_triplets.push(triplets[1]);

                counter = triplets[2];
                outputVarIndex = triplets[3];
                varRefObj = triplets[4];
                projectionObject = triplets[5];
            }
        }

        get_label_triplets = get_label_triplets.reverse();
        get_paramater_triplets = get_paramater_triplets.reverse();

        for (var label_triplet of get_label_triplets)
            filter_triplets += label_triplet;

        if (isNested) {
            return [
                filter_triplets,
                counter,
                outputVarIndex,
                varRefObj,
                projectionObject,
                get_paramater_triplets,
            ];
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
                let previousVariable = get_paramater_triplets[0][2];
                for (var parameter_triplet of get_paramater_triplets) {
                    let currentVariable = parameter_triplet[2];
                    if (currentVariable !== previousVariable)
                        filter_triplets += "---" + parameter_triplet;
                    else filter_triplets += parameter_triplet;
                }
            }
        }

        return [
            filter_triplets,
            counter,
            outputVarIndex,
            varRefObj,
            projectionObject,
        ];
    },

    //converts filter to sparql triplet
    filter_to_triplet(
        filter_input,
        schema_input,
        index,
        outputVarIndex = 1,
        varRefObj,
        projectionObject
    ) {
        const parameter = filter_input.name;

        let idValue = "";
        const sparql_subject = schema_input.getArgument("id").annotations
            .sparql_subject;
        if (sparql_subject !== undefined) idValue = sparql_subject.toJS();

        let value = filter_input.value;
        if (value === undefined) throw new Error("Invalid Input");

        let tempVarIndex = outputVarIndex;

        if (!value.isVarRef) {
            if (parameter === "id") {
                return [
                    "",
                    `?v${tempVarIndex} wdt:P31 wd:${idValue}.\n`,
                    index,
                    outputVarIndex,
                    varRefObj,
                    projectionObject,
                ];
            }
            value = value.toJS();
        } else {
            let split = value.name.split(".");
            let varRefName = "";
            if (split.length > 1) {
                varRefName = split[0];
                let varRefProp = split[1];

                varRefObj[varRefName] = [varRefProp];
            }

            if (parameter === "id") {
                varRefObj[varRefName].push(true);
                return [
                    "",
                    `?v${tempVarIndex} wdt:P31 wd:${idValue}.\n`,
                    index,
                    outputVarIndex,
                    varRefObj,
                    projectionObject,
                ];
            }
            outputVarIndex += 1;
            value = `?v${tempVarIndex + 1}`;
        }

        let raw_value = value;

        let type = filter_input.value;
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
                value = `wd:${value}`;
                index += 1;
            }
        }
        if (type.isEntity) value = `wd:${value}`;

        if (operator === "==") {
            return [
                get_label_triplet,
                `?v${tempVarIndex} wdt:${parameter} ${value}.\n`,
                index,
                outputVarIndex,
                varRefObj,
                projectionObject,
            ];
        } else if (operator === "contains") {
            return [
                "",
                `?v${tempVarIndex} wdt:${parameter} ?compValue.
                ?compValue rdfs:label ?label .
                FILTER CONTAINS(?label, '${raw_value}').
                `,
                index,
                outputVarIndex,
                varRefObj,
                projectionObject,
            ];
        } else {
            return [
                get_label_triplet,
                `?v${tempVarIndex} wdt:${parameter} ?compValue.
                FILTER(?compValue ${operator} ${value}).\n`,
                index,
                outputVarIndex,
                varRefObj,
                projectionObject,
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

    get_occurences(array, target) {
        let counter = 0;
        for (let value of array) if (value === target) counter += 1;

        return counter;
    },

    build_query(body, additionalSparql, projectionObject, outputVarIndex) {
        body = body.reverse();

        let queryBodyArray = [];
        for (let triplets of body) {
            let split = triplets.split("---");
            for (let triplet of split)
                if (triplet !== "") queryBodyArray.push(triplet);
        }

        let triplet_indexes = [];

        for (let triplet of queryBodyArray) {
            let pos = triplet.indexOf("?v");
            let triplet_index = parseInt(triplet[pos + 2]);
            triplet_indexes.push(triplet_index);
        }

        let keys = Object.keys(projectionObject);

        let reversed = {};
        for (let x = 0; x < keys.length; x++) {
            let reversedIndex = outputVarIndex - x;
            reversed[reversedIndex] = projectionObject[keys[x]];
        }

        projectionObject = reversed;

        keys = Object.keys(projectionObject);

        let variable_occurences = [];

        for (let key of keys) {
            variable_occurences.push(
                this.get_occurences(triplet_indexes, parseInt(key))
            );
        }

        //Combine projection arrays if necessary
        //All projection arrays should be combined unless their is a filter for id
        for (let i = 0; i < keys.length; i++) {
            let projectionArray = projectionObject[keys[i]];
            let difference = projectionArray.length - variable_occurences[i];
            let index = projectionArray.length - 1;
            for (let j = difference; j > 0; j--) {
                let combined_array = projectionArray[index].concat(
                    projectionArray[index - 1]
                );
                projectionArray[index - 1] = combined_array;
                projectionArray.pop();
            }
        }

        let queryBody = "";
        let additionalCode = "";

        let requiredShift = 0;
        for (let key in projectionObject) {
            let projectionArray = projectionObject[key];
            let projectionCount = 0;
            for (let projections of projectionArray) {
                projections = [...new Set(projections)];

                projectionCount += projections.length;
            }

            //if the projection is ID then there should be no shift for that projection

            if (
                (projectionArray[0] !== undefined &&
                    !projectionArray[0][0].includes("id")) ||
                projectionCount > 1
            )
                requiredShift += projectionArray.length;
        }

        for (let i = 0; i < queryBodyArray.length; i++) {
            let next_triplet = queryBodyArray[i];

            let triplet_index = triplet_indexes[i];

            if (
                projectionObject[triplet_index] !== undefined &&
                projectionObject[triplet_index][0] !== undefined
            ) {
                let find = `v${triplet_index + 1}`;

                let regex = new RegExp(find, "g");
                next_triplet = next_triplet.replace(
                    regex,
                    `v${triplet_index + 1 + requiredShift}`
                );

                find = `v${triplet_index}`;
                regex = new RegExp(find, "g");
                next_triplet = next_triplet.replace(
                    regex,
                    `v${triplet_index + requiredShift}`
                );

                let projectionCount = 0;
                for (let projections of projectionObject[triplet_index]) {
                    projections = [...new Set(projections)];
                    projectionCount += projections.length;
                }

                if (
                    !projectionObject[triplet_index][0][0].includes("id") ||
                    projectionCount > 1
                )
                    requiredShift -= 1;

                queryBody +=
                    next_triplet +
                    this.projection_to_triplet(
                        projectionObject[triplet_index][0],
                        triplet_index + requiredShift
                    );

                projectionObject[triplet_index].shift();
            } else {
                let find = `v${triplet_index + 1}`;
                let regex = new RegExp(find, "g");
                next_triplet = next_triplet.replace(
                    regex,
                    `v${triplet_index + 1 + requiredShift}`
                );

                find = `v${triplet_index}`;
                regex = new RegExp(find, "g");
                next_triplet = next_triplet.replace(
                    regex,
                    `v${triplet_index + requiredShift}`
                );

                queryBody += next_triplet;
            }
        }

        for (let j = 0; j < additionalSparql.length; j++)
            additionalCode += additionalSparql[j];

        return `
      SELECT distinct ?v1Label WHERE{
        ${queryBody}
      SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
      }
      ${additionalCode}
      limit ${QUERY_LIMIT}
      `;
    },
};
