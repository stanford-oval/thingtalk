// -*- mode: typescript; indent-tabs-mode: nil; js-basic-offset: 4 -*-
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

import type * as Ast from '../ast';

import { Register } from './jsir';
import Type from '../type';
import type { CompiledStatement } from '../runtime/exec_environment';

export interface RegisterScopeEntry {
    type : 'scalar';
    register : Register;
    tt_type : Type|null;
    direction : 'input'|'output'|'special';
    isInVarScopeNames : boolean;
}
export interface DeclarationScopeEntry {
    type : 'declaration';
    register : Register|null;
    schema : Ast.FunctionDef;
    args : string[];
    code : string|CompiledStatement|null;
}
export interface ProcedureScopeEntry {
    type : 'procedure';
    register : Register|null;
    schema : Ast.FunctionDef;
    args : string[];
    code : string|CompiledStatement|null;
}
export interface AssignmentScopeEntry {
    type : 'assignment';
    register : Register;
    schema : Ast.FunctionDef;
    isPersistent : boolean;
}

export type ScopeEntry =
    RegisterScopeEntry |
    DeclarationScopeEntry |
    ProcedureScopeEntry |
    AssignmentScopeEntry;

export default class Scope {
    private _parent : Scope|null;
    private _names : { [key : string] : ScopeEntry };

    constructor(parent : Scope|null = null) {
        this._parent = parent;
        if (parent !== null && !(parent instanceof Scope))
            throw new TypeError(`wrong parent scope`);
        this._names = Object.create(null);
    }

    // catch refactoring bugs...
    get $outputType() : never {
        throw new TypeError('use get($outputType)');
    }
    get $output() : never {
        throw new TypeError('use get($output)');
    }

    get parent() : Scope|null {
        return this._parent;
    }

    get isTopLevel() : boolean {
        return this._parent === null;
    }

    hasOwnKey(name : string) : boolean {
        return name in this._names;
    }

    get(name : string) : ScopeEntry {
        // we don't need to check if the name is visible in some scope,
        // we know it is because the program typechecked
        if (name in this._names)
            return this._names[name];
        else
            return this._parent!.get(name);
    }

    set(name : string, value : ScopeEntry) : void {
        this._names[name] = value;
    }

    private *_doIterate(seen : Set<string>) : Generator<[string, ScopeEntry], void> {
        for (const name in this._names) {
            if (seen.has(name))
                continue;
            seen.add(name);
            yield [name, this._names[name]];
        }
        if (this._parent)
            yield* this._parent._doIterate(seen);
    }

    *[Symbol.iterator]() : Generator<[string, ScopeEntry], void> {
        const seen = new Set<string>();
        yield* this._doIterate(seen);
    }

    *ownKeys() : Generator<string, void> {
        for (const name in this._names)
            yield name;
    }
}
