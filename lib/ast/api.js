// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingTalk
//
// Copyright 2015-2018 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const assert = require('assert');

const Ast = require('.');

const DeclarationProto = Ast.Statement.Declaration.prototype;
const ExampleProto = Ast.Example.prototype;


// utilities

/**
 * Utility function to create a `notify` or `return` action.
 *
 * @param {string} [what] - what action to create
 * @return {Ast.Action} the action node
 * @alias Ast.notifyAction
 * @deprecated Use {@link Ast.Action.notifyAction} instead.
 */
module.exports.notifyAction = function notifyAction(what) {
    return Ast.Action.notifyAction(what);
};

/**
 * Convert a manifest to a ThingTalk library.
 *
 * @param {string} kind - the class identifier
 * @param {Object} manifest - the manifest to convert
 * @return {Ast.Library} the converted library
 * @deprecated Manifests are deprecated and should not be used. Use .tt files instead.
 * @alias Ast.fromManifest
 */
function fromManifest(kind, manifest) {
    return new Ast.Library(null, [Ast.ClassDef.fromManifest(kind, manifest)], []);
}
module.exports.fromManifest = fromManifest;

/**
 * Convert a ThingTalk library to a manifest.
 *
 * @param {Ast.Library} meta - the library to convert
 * @return {Object} the manifest
 * @deprecated Manifests are deprecated and should not be used. Use .tt files instead.
 * @alias Ast.toManifest
 */
function toManifest(meta) {
    assert(meta instanceof Ast.Library);
    return meta.classes[0].toManifest();
}
module.exports.toManifest = toManifest;

function declarationLikeToProgram() {
    const nametoslot = {};

    let i = 0;
    for (let name in this.args)
        nametoslot[name] = i++;

    let program;
    if (this.type === 'action') {
        program = new Ast.Program(null, [], [],
            [new Ast.Statement.Command(null, null, [this.value.clone()])], null);
    } else if (this.type === 'query') {
        program = new Ast.Program(null, [], [],
            [new Ast.Statement.Command(null, this.value.clone(), [Ast.Action.notifyAction()])], null);
    } else if (this.type === 'stream') {
        program = new Ast.Program(null, [], [],
            [new Ast.Statement.Rule(null, this.value.clone(), [Ast.Action.notifyAction()])], null);
    } else {
        program = this.value.clone();
    }

    function recursiveHandleSlot(value) {
        if (value.isVarRef && value.name in nametoslot) {
            value.name = '__const_SLOT_' + nametoslot[value.name];
        } else if (value.isArray) {
            for (let v of value.value)
                recursiveHandleSlot(v);
        }
    }

    for (let slot of program.iterateSlots2()) {
        if (slot instanceof Ast.Selector)
            continue;
        recursiveHandleSlot(slot.get());
    }

    return program;
}

/**
 * Convert a declaration to a program.
 *
 * This will create a program that invokes the same code as the declaration value,
 * and will replace all parameters with slots.
 *
 * @return {Ast.Program} the new program
 * @alias Ast.Statement.Declaration#toProgram
 */
DeclarationProto.toProgram = declarationLikeToProgram;

/**
 * Convert a dataset example to a program.
 *
 * This will create a program that invokes the same code as the example value,
 * and will replace all parameters with slots.
 *
 * @return {Ast.Program} the new program
 * @alias Ast.Example#toProgram
 */
ExampleProto.toProgram = declarationLikeToProgram;
