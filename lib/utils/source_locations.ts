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


/**
 * A single point in the source code input stream.
 *
 * @property {number|undefined} offset - the character position in the stream (0-based)
 * @property {number|undefined} line - the line number (1-based)
 * @property {number|undefined} column - the column number (1-based)
 * @property {number|undefined} token - the token index (0-based)
 */
export interface SourceLocation {
    offset : number;
    line : number;
    column : number;
    token ?: number;
}

/**
 * The interval in the source code covered by a single
 * token or source code span.
 *
 * @property {Ast~SourceLocation} start - the beginning of the range
 *           (index of the first character)
 * @property {Ast~SourceLocation} end - the end of the range, immediately
 *           after the end of the range
 */
export interface SourceRange {
    start : SourceLocation;
    end : SourceLocation;
}
