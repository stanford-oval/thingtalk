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
 */
export interface SourceLocation {
    /**
     * The character position in the stream (0-based).
     */
    offset : number;

    /**
     * The line number (1-based).
     */
    line : number;

    /**
     * The column number (1-based).
     */
    column : number;

    /**
     * The token index (0-based).
     */
    token ?: number;
}

/**
 * The interval in the source code covered by a single
 * token or source code span.
 */
export interface SourceRange {
    /**
     * The beginning of the range (index of the first character).
     */
    start : SourceLocation;

    /**
     * The end of the range, immediately after the last character.
     */
    end : SourceLocation;
}
