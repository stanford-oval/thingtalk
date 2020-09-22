// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingTalk
//
// Copyright 2018-2020 The Board of Trustees of the Leland Stanford Junior University
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

import assert from 'assert';

import { Selector } from './expression';
import { Action } from './primitive';
import { ClassDef } from './class_def';
import { Statement, Program, Library, Example } from './program';

const DeclarationProto = Statement.Declaration.prototype;
const ExampleProto = Example.prototype;


// utilities

/**
 * Utility function to create a `notify` or `return` action.
 *
 * @param {string} [what] - what action to create
 * @return {Ast.Action} the action node
 * @alias Ast.notifyAction
 * @deprecated Use {@link Ast.Action.notifyAction} instead.
 */
export function notifyAction(what) {
    return Action.notifyAction(what);
}

/**
 * Convert a manifest to a ThingTalk library.
 *
 * @param {string} kind - the class identifier
 * @param {Object} manifest - the manifest to convert
 * @return {Ast.Library} the converted library
 * @deprecated Manifests are deprecated and should not be used. Use .tt files instead.
 * @alias Ast.fromManifest
 */
export function fromManifest(kind, manifest) {
    return new Library(null, [ClassDef.fromManifest(kind, manifest)], []);
}

/**
 * Convert a ThingTalk library to a manifest.
 *
 * @param {Ast.Library} meta - the library to convert
 * @return {Object} the manifest
 * @deprecated Manifests are deprecated and should not be used. Use .tt files instead.
 * @alias Ast.toManifest
 */
export function toManifest(meta) {
    assert(meta instanceof Library);
    return meta.classes[0].toManifest();
}

function declarationLikeToProgram() {
    /* eslint no-invalid-this: off */

    const nametoslot = {};

    let i = 0;
    for (let name in this.args)
        nametoslot[name] = i++;

    let program;
    if (this.type === 'action') {
        program = new Program(null, [], [],
            [new Statement.Command(null, null, [this.value.clone()])], null);
    } else if (this.type === 'query') {
        program = new Program(null, [], [],
            [new Statement.Command(null, this.value.clone(), [Action.notifyAction()])], null);
    } else if (this.type === 'stream') {
        program = new Program(null, [], [],
            [new Statement.Rule(null, this.value.clone(), [Action.notifyAction()])], null);
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
        if (slot instanceof Selector)
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
