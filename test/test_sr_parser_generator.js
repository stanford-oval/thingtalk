"use strict";

module.exports = {
    '$prog':    [[['$command',], (command) => command],
                 [['$rule',], (rule) => rule]],
    '$rule':    [[['$stream', '$action'], (stream, action) => `combine ${stream} with ${action}`]],
    '$command': [[['$table', 'notify'], (table, notify) => `${table} then notify`],
                 [['$table', '$action'], (table, action) => `combine ${table} with ${action}`]],
    '$table':   [[['$get',], (get) => get],
                 [['$table', '$ip'], (get, ip) => `apply ${get} ${ip}`],
                 [['$table', '$filter'], (table, filter) => `apply ${filter} to ${table}`]],
    '$stream':  [[['monitor', '$table'], (monitor, table) => `monitor ${table}`]],
    '$get':     [[['xkcd.get_comic',], () => `xkcd.get_comic`],
                 [['thermostat.get_temp',], () => `thermostat.get_temp`],
                 [['twitter.search',], () => `twitter.search`]],
    '$action':  [[['$action', '$ip'], (action, ip) => `apply ${action} ${ip}`],
                 [['twitter.post',], () => `twitter.post`]],
    '$ip':      [[['param:number', '$number'], (pname, num) => `number = ${num}`],
                 [['param:text', '$string'], (pname, str) => `string = ${str}`]],
    '$number':  [[['num0',], () => `num0`],
                 [['num1',], () => `num1`]],
    '$string':  [[['qs0',], () => `qs0`],
                 [['qs1',], () => `qs1`]],
    '$filter':  [[['param:number', '==', '$number'], (pname, op, num) => `number == ${num}`],
                 [['param:number', '>', '$number'], (pname, op, num) => `number > ${num}`],
                 [['param:number', '<', '$number'], (pname, op, num) => `number < ${num}`],
                 [['param:text', '==', '$string'], (pname, op, str) => `text == ${str}`],
                 [['param:text', '=~', '$string'], (pname, op, str) => `text =~ ${str}`]]
};
