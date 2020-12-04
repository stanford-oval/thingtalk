// -*- mode: typescript; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingTalk
//
// Copyright 2018 The Board of Trustees of the Leland Stanford Junior University
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

import * as slr from './slr_generator';
import { stringEscape } from '../../lib/utils/escaping';

export class Grammar {
    constructor(public comment : string,
                public initialCode : string,
                public statements : Statement[]) {
    }

    get preamble() {
        return this.comment + this.initialCode;
    }
}

type Statement = TerminalStmt | NonTerminalStmt;

export class TerminalStmt {
    constructor(public name : string,
                public type : string) {
    }
}

export class NonTerminalStmt {
    constructor(public name : string,
                public type : string|undefined,
                public rules : Rule[]) {
    }
}

export class Rule {
    type = 'any';

    constructor(public head : RuleHeadPart[],
                public bodyCode : string) {
    }
}

export abstract class RuleHeadPart {
    isNonTerminal = false;
    isTerminal = false;
    isStringLiteral = false;

    abstract name : string|null;
    abstract type : string;
    abstract getGeneratorInput() : slr.NonTerminal|slr.Terminal;
}

export namespace RuleHeadPart {
    export class NonTerminal extends RuleHeadPart {
        type = 'any';

        constructor(public name : string,
                    public category : string) {
            super();
            this.isNonTerminal = true;
        }

        getGeneratorInput() {
            return new slr.NonTerminal(this.category);
        }
    }

    export class Terminal extends RuleHeadPart {
        private _type = 'any';

        constructor(public name : string,
                    public category : string) {
            super();
            this.isTerminal = true;
        }

        get type() : string {
            return `$runtime.TokenWrapper<${this._type}>`;
        }

        set type(v : string) {
            this._type = v;
        }

        getGeneratorInput() {
            return new slr.Terminal(this.category, false);
        }
    }

    export class StringLiteral extends RuleHeadPart {
        type : string;

        constructor(public value : string) {
            super();
            this.isStringLiteral = true;
            this.type = stringEscape(value);
        }

        get name() {
            return null;
        }

        getGeneratorInput() {
            return new slr.Terminal(this.value, true);
        }
    }
}
