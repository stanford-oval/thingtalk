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

import { TokenStream } from '../new-syntax/tokenstream';
import List from '../utils/list';

export enum SyntaxPriority {
    // priority of table-like expressions
    Chain = 0,
    Join = 1,
    Projection = 2,
    Filter = 3,
    Alias = 4,
    Index = 5,

    // low-priority scalar expression
    ArrayField = 6,

    // priority of boolean expressions
    Or = 7,
    And = 8,
    Comp = 9,
    Not = 10,

    // priority of scalar expression
    Add = 11,
    Mul = 12,
    Exp = 13,

    Primary = 14,
}

export function addParenthesis(p1 : SyntaxPriority, p2 : SyntaxPriority, syntax : TokenStream) : TokenStream {
    if (p1 > p2)
        return List.concat('(', syntax, ')');
    else
        return List.concat(syntax);
}
