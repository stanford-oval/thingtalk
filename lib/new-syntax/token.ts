// -*- mode: typescript; indent-tabs-mode: nil; js-basic-offset: 4 -*-
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

import { SourceRange } from '../utils/source_locations';
import * as Ast from '../ast';
import Type from '../type';
import {
    AnyEntity,
    MeasureEntity,
    TimeEntity,
    LocationEntity,
    DateEntity,
} from '../entities';

interface GenericEntityToken {
    value : string|null;
    type : string;
    display ?: string|null;
}

type TokenValue = AnyEntity | GenericEntityToken;

interface TokenTypes {
    CLASS_OR_FUNCTION_REF : string;
    SLOT : Ast.Value|undefined;
    QUOTED_STRING : string;
    NUMBER : number;
    MEASURE : MeasureEntity;
    CURRENCY : MeasureEntity;
    DURATION : MeasureEntity;
    LOCATION : LocationEntity;
    DATE : Date|DateEntity;
    TIME : TimeEntity;
    GENERIC_ENTITY : GenericEntityToken;
    ENTITY_NAME : string;
    USERNAME : string;
    HASHTAG : string;
    URL : string;
    PHONE_NUMBER : string;
    EMAIL_ADDRESS : string;
    PATH_NAME : string;
    PICTURE : string;
    TYPE_ANNOT : Type;
    IDENTIFIER : string;
    DOLLARIDENTIFIER : string;
}

export type TypeOfToken<K extends keyof TokenTypes> = TokenTypes[K];

export class Token {
    private constructor(public token : string,
                        public location : SourceRange,
                        public value : TokenValue|null) {
    }

    static make<K extends string>(token : K,
                                  location : SourceRange,
                                  value : (K extends keyof TokenTypes ? TypeOfToken<K> : null)) {
        return new Token(token, location, value);
    }

    toString() : string {
        return this.token;
    }
}
