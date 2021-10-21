// -*- mode: typescript; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingTalk
//
// Copyright 2020 The Board of Trustees of the Leland Stanford Junior University
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

import * as Ast from './ast';

export interface MeasureEntity {
    unit : string;
    value : number;
}
export interface LocationEntity {
    latitude : number;
    longitude : number;
    display ?: string|null;
}
export interface TimeEntity {
    hour : number;
    minute : number;
    second : number;
}
export interface GenericEntity {
    value : string|null;
    display ?: string|null;
}
export interface DateEntity {
    year : number;
    month : number;
    day : number;
    hour ?: number;
    minute ?: number;
    second ?: number;
}

export type AnyEntity =
    MeasureEntity |
    LocationEntity |
    TimeEntity |
    DateEntity |
    GenericEntity |
    Ast.Value |
    Date |
    string |
    number |
    undefined;

export type EntityMap = Record<string, AnyEntity>;
export type EntityResolver = (key : string, lastparam : string|null, lastfunction : string|null, unit : string|null) => AnyEntity;

export type EntityType =
    'QUOTED_STRING' | 'NUMBER' | 'MEASURE' | 'LOCATION' | 'DATE' | 'TIME' | 'CURRENCY'
    | 'PICTURE' | 'USERNAME' | 'HASHTAG' | 'URL' | 'PHONE_NUMBER' | 'EMAIL_ADDRESS' | 'PATH_NAME'
    | 'GENERIC_ENTITY' | 'SLOT'

export type StringLikeEntityType =
    'QUOTED_STRING' | 'PICTURE' | 'USERNAME' | 'HASHTAG' | 'URL' | 'PHONE_NUMBER' | 'EMAIL_ADDRESS' | 'PATH_NAME';

export type TypeOfEntity<K extends EntityType> =
    K extends StringLikeEntityType ? string :
    K extends 'NUMBER' ? number :
    K extends 'MEASURE'|'CURRENCY' ? MeasureEntity :
    K extends 'LOCATION' ? LocationEntity :
    K extends 'DATE' ? (Date|DateEntity) :
    K extends 'TIME' ? TimeEntity :
    K extends 'GENERIC_ENTITY' ? GenericEntity :
    K extends 'SLOT' ? (Ast.Value|undefined)
    : never;

