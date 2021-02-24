// -*- mode: typescript; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingTalk
//
// Copyright 2018-2019 The Board of Trustees of the Leland Stanford Junior University
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

import { SourceRange } from './source_locations';

export class NotImplementedError extends Error {
    constructor(construct : string) {
        super('NOT IMPLEMENTED: ' + construct);
    }
}

export class NotCompilableError extends Error {
}

export class ThingTalkTypeError extends Error {
    location : SourceRange | null;

    constructor(message : string, location : SourceRange | null) {
        super(message);
        this.name = "TypeError";
        this.location = location || null;
    }
}

export class ThingTalkSyntaxError extends Error {
    location : SourceRange | null;

    constructor(message : string, location : SourceRange | null) {
        super(message);
        this.name = "SyntaxError";
        this.location = location || null;
    }
}

export class UnserializableError extends Error {
    constructor(what : string) {
        super(what + ' is not serializable');
    }
}
