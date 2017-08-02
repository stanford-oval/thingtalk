// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingTalk
//
// Copyright 2017 Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const Q = require('q');
const ThingpediaClientBrowser = require('./thingpediaclient');
// REPLACE WITH require('thingtalk') when moved out of the repository
const ThingTalk = require('../index');

// use jquery
const $ = global.$;

const THINGENGINE_URL = 'https://thingpedia.stanford.edu';

function error(msg) {
    let placeholder = $('#placeholder');
    placeholder.empty();
    placeholder.text("Error: " + msg);
    throw msg;
}

const schemaRetriever = new ThingTalk.SchemaRetriever(new ThingpediaClientBrowser());
$(() => {

    $('#demo-form').submit((event) => {
        event.preventDefault();
        let sentence = $('#demo-input').val();

        Q($.ajax({
            url: THINGENGINE_URL + '/me/api/parse?q=' + encodeURIComponent(sentence),
            xhrFields: {
                withCredentials: true
            }
        })).then((data) => {
            let top = data.candidates[0];
            if (!top)
                return error("No candidates");
            let code = top.code;
            return Q.all([top, ThingTalk.Grammar.parseAndTypecheck(code, schemaRetriever, true)]);
        }).then(([json, program]) => {
            let placeholder = $('#placeholder');
            placeholder.empty();

            let h2 = $('<h2>').text("Command: " + json.description);
            placeholder.append(h2);
            let toplist = $('<ul>');
            placeholder.append(toplist);

            program.rules.forEach((rule, i) => {
                let ruleitem = $('<li>').text(`Rule  ${i+1}`);
                let rulelist = $('<ul>');
                ruleitem.append(rulelist);
                toplist.append(ruleitem);

                function dovalue(value) {
                    if (value.isVarRef && value.name.startsWith('__slot_')) {
                        let slotnum = value.name.substr('__slot_'.length);
                        return `Slot ${slotnum} (${json.slots[slotnum].type})`;
                    } else if (value.isVarRef) {
                        return `Variable ${value.name}`;
                    } else if (value.isUndefined) {
                        // should never happen, because the server goes through the slots and assigns them
                        return `Unassigned Slot`;
                    } else if (value.isBoolean) {
                        return value.value ? 'True':'False';
                    } else if (value.isString) {
                        return `"${value.value}"`;
                    } else if (value.isMeasure) {
                        return `${value.value} ${value.unit}`;
                    } else if (value.isNumber) {
                        return value.value;
                    } else if (value.isLocation) {
                        let loc = value.value;
                        if (loc.isRelative)
                            return `Location ${loc.relativeTag}`;
                        else
                            return `Absolute Location [lat ${loc.lat.toFixed(3)}, lon ${loc.lon.toFixed(3)}] (${loc.display})`;
                    } else if (value.isDate) {
                        return value.value.toISOString();
                    } else if (value.isTime) {
                        return value.value.hour + ':' + value.value.minute;
                    } else if (value.isEntity) {
                        return `Entity ${value.type}: ${value.value} (${value.display})`;
                    } else if (value.isEnum) {
                        return `Enum ${value.value}`;
                    } else if (value.isEvent) {
                        return `Event ${value.name}`;
                    }
                }

                function doprimitive(primId, prim, prefix, scope) {
                    if (prim.selector.isBuiltin)
                        return;

                    let item = $('<li>').text(`${prefix} ${primId}: ${prim.selector.kind}.${prim.channel}`);
                    let primlist = $('<ul>');
                    item.append(primlist);
                    rulelist.append(item);

                    let inparams = $('<li>').text("Input Parameters");
                    let inparamlist = $('<ul>');
                    inparams.append(inparamlist);
                    primlist.append(inparams);
                    for (let in_param of prim.in_params) {
                        let type = prim.schema.inReq[in_param.name] || prim.schema.inOpt[in_param.name];
                        inparamlist.append($('<li>').text(`${in_param.name} : ${type} = ${dovalue(in_param.value)}`));
                    }
                    if (prefix === 'Action')
                        return;

                    let filteritem = $('<li>').text("Filter");
                    let filterlist = $('<ul>');
                    filteritem.append(filterlist);
                    primlist.append(filteritem);
                    function dofilter(expr, into) {
                        if (expr.isTrue || expr.isFalse) {
                            into.append($('<li>').text(expr.isTrue ? 'True' : 'False'));
                            return;
                        }
                        if (expr.isAnd || expr.isOr) {
                            let item = $('<li>').text(expr.isAnd ? 'And' : 'Or');
                            let sublist = $('<ul>');
                            item.append(sublist);
                            into.append(item);
                            expr.operands.forEach((sub) => dofilter(sub, sublist));
                            return;
                        }
                        if (expr.isNot) {
                            let item = $('<li>').text('Not');
                            let sublist = $('<ul>');
                            item.append(sublist);
                            into.append(item);
                            dofilter(expr.expr, sublist);
                            return;
                        }

                        let filter = expr.filter;
                        let type = prim.schema.inReq[filter.name] || prim.schema.inOpt[filter.name] || prim.schema.out[filter.name] || scope[filter.name];
                        into.append($('<li>').text(`${filter.name} : ${type} ${filter.operator} ${dovalue(filter.value)}`));
                    }
                    dofilter(prim.filter, filterlist);

                    let outparams = $('<li>').text("Output Parameters");
                    let outparamlist = $('<ul>');
                    outparams.append(outparamlist);
                    primlist.append(outparams);
                    for (let out_param of prim.out_params) {
                        let type = prim.schema.out[out_param.value];
                        outparamlist.append($('<li>').text(`${out_param.name} : ${type} := ${out_param.value}`));
                        scope[out_param.name] = type;
                    }
                }

                let scope = {};
                if (rule.trigger)
                    doprimitive(`r${i}_t`, rule.trigger, "Trigger", scope);
                rule.queries.forEach((query, j) => doprimitive(`r${i}_q${j}`, query, "Query", scope));
                rule.actions.forEach((action, j) => doprimitive(`r${i}_a${j}`, action, "Action", scope));
            });
        }).catch(error).done();
    });
});
