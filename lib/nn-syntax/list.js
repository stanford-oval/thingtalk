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
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
"use strict";

const adt = require('adt');

// A lazy functional list with O(1) concatenation
const List = adt.data(function() {
    return {
        Nil: null,
        Cons: {
            head: adt.any,
            tail: adt.only(this)
        },
        Snoc: {
            head: adt.only(this),
            tail: adt.any
        },
        Concat: {
            first: adt.only(this),
            second: adt.only(this)
        }
    };
});
List.prototype.flatten = function(into) {
    if (this.isNil)
        return into;
    if (this.isCons) {
        into.push(this.head);
        return this.tail.flatten(into);
    } else if (this.isSnoc) {
        this.head.flatten(into);
        into.push(this.tail);
        return into;
    } else if (this.isConcat) {
        this.first.flatten(into);
        return this.second.flatten(into);
    } else {
        throw new TypeError();
    }
};
List.prototype.getFirst = function() {
    if (this.isNil)
        return null;
    if (this.isCons)
        return this.head;
    if (this.isSnoc)
        return this.head.getFirst();
    if (this.isConcat)
        return this.first.getFirst();
    throw new TypeError();
};
List.concat = function(...lists) {
    let result = List.Nil;
    for (let i = lists.length-1; i >= 0; i--) {
        if (lists[i] instanceof List && result === List.Nil)
            result = lists[i];
        else if (lists[i] instanceof List)
            result = List.Concat(lists[i], result);
        else
            result = List.Cons(lists[i], result);
    }
    return result;
};
List.singleton = function(el) {
    return List.Cons(el, List.Nil);
};

module.exports = List;
