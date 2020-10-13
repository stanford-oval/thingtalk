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
                public statements : NonTerminalStmt[]) {
    }

    get preamble() {
        return this.comment + this.initialCode;
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
    static NonTerminal : typeof NonTerminalRuleHead;
    static Terminal : typeof TerminalRuleHead;
    static StringLiteral : typeof StringLiteralRuleHead;

    isNonTerminal = false;
    isTerminal = false;
    isStringLiteral = false;

    abstract name : string|null;
    abstract type : string;
    abstract getGeneratorInput() : slr.NonTerminal|slr.Terminal;
}

class NonTerminalRuleHead extends RuleHeadPart {
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
RuleHeadPart.NonTerminal = NonTerminalRuleHead;

class TerminalRuleHead extends RuleHeadPart {
    type = '$runtime.TokenWrapper<any>';

    constructor(public name : string,
                public category : string) {
        super();
        this.isTerminal = true;
    }

    getGeneratorInput() {
        return new slr.Terminal(this.category);
    }
}
RuleHeadPart.Terminal = TerminalRuleHead;

class StringLiteralRuleHead extends RuleHeadPart {
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
        return new slr.Terminal(this.value);
    }
}
RuleHeadPart.StringLiteral = StringLiteralRuleHead;
