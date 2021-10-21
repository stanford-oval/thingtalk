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

import List from '../utils/list';

import {
    EntityType,
    StringLikeEntityType,
    MeasureEntity,
    LocationEntity,
    TimeEntity,
} from '../entities';

export class ConstantToken<K extends EntityType, V> {
    name : K;
    value : V;

    constructor(name : K, value : V) {
        this.name = name;
        this.value = value;
    }

    toString() : string {
        return this.name;
    }
}

// this differs from regular generic entity because it has a type
export interface GenericEntityToken {
    type : string;
    value : string|null;
    display ?: string|null;
}

export type AnyConstantToken =
      ConstantToken<StringLikeEntityType, string>
    | ConstantToken<'NUMBER', number>
    | ConstantToken<'MEASURE'|'CURRENCY', MeasureEntity>
    | ConstantToken<'LOCATION', LocationEntity>
    | ConstantToken<'DATE', Date>
    | ConstantToken<'TIME', TimeEntity>
    | ConstantToken<'GENERIC_ENTITY', GenericEntityToken>;

export type TokenStream = List<string | AnyConstantToken>;
