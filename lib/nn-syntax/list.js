// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingTalk
//
// Copyright 2017-2018 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
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
