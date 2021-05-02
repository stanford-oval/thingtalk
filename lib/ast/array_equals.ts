
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
// Author: Silei Xu <silei@cs.stanford.edu>

interface EqualsComparable {
    equals(x : unknown) : boolean;
}

export default function arrayEquals<T extends EqualsComparable>(a1 : T[], a2 : T[]) : boolean {
    if (a1 === a2)
        return true;
    if (a1.length !== a2.length)
        return false;
    for (let i = 0; i < a1.length; i++) {
        if (!a1[i].equals(a2[i]))
            return false;
    }
    return true;
}
