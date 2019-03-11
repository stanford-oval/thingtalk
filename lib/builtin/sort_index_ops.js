// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingTalk
//
// Copyright 2019 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

function sortGeneric(array, field, reverse) {
    array.sort(([a, aType], [b, bType]) => {
        let result = 0;
        if (a[field] < b[field])
            result = -1;
        else if (b[field] < a[field])
            result = 1;
        if (reverse)
            result = -result;
        return result;
    });
    return array;
}

module.exports.sortasc = function(array, field) {
    return sortGeneric(array, field, false);
};
module.exports.sortdesc = function(array, field) {
    return sortGeneric(array, field, true);
};

module.exports.sliceArray = function(array, base, limit) {
    if (base < -array.length || base > array.length)
        return [];
    if (base === 0) {
        base = 1;
        limit --;
    }
    if (limit <= 0)
        return [];

    if (base < 0)
        return array.slice(array.length+base-limit+1, array.length+base+1);
    else
        return array.slice(base-1, base-1+limit);
};

module.exports.indexArray = function(array, indices) {
    const newArray = [];

    for (let index of indices) {
        if (index === 0 || index > array.length || index < -array.length)
            continue;
        if (index < 0)
            newArray.push(array[array.length+index]);
        else
            newArray.push(array[index-1]);
    }

    return newArray;
};
