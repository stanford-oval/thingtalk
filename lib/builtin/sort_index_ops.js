// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingTalk
//
// Copyright 2019 The Board of Trustees of the Leland Stanford Junior University
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
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>

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

export function sortasc(array, field) {
    return sortGeneric(array, field, false);
}
export function sortdesc(array, field) {
    return sortGeneric(array, field, true);
}

export function sliceArray(array, base, limit) {
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
}

export function indexArray(array, indices) {
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
}
