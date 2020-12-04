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

import { SourceLocation, SourceRange } from '../utils/source_locations';
import { ThingTalkSyntaxError } from '../utils/errors';
import { CONTEXTUAL_KEYWORDS, DOLLAR_KEYWORDS, FORBIDDEN_KEYWORDS, KEYWORDS } from './keywords';
import { Token } from './token';

function unescape(string : string, sourceloc : SourceRange) {
    return string.replace(/(?:\\x([0-9a-fA-F]{2})|\\u([0-9a-fA-F]{2})|\\u\{([0-9a-fA-F]+)\}|\\(.))/g, (full, hex, unicode, codepoint, char) => {
        if (hex || unicode || codepoint) {
            return String.fromCharCode(parseInt(hex || unicode || codepoint, 16));
        } else {
            if (/[ux]|[1-9]/.test(char))
                throw new ThingTalkSyntaxError(`Invalid escape \\${char}`, sourceloc);

            switch (char) {
            case 'n':
                return '\n';
            case 't':
                return '\t';
            case 'b':
                return '\b';
            case 'f':
                return '\b';
            case 'r':
                return '\r';
            case 'v':
                return '\v';
            case '0':
                return '\0';
            default:
                return char;
            }
        }

    });
}

export function* surfaceLexer(input : string) : IterableIterator<Token> {
    let lineno = 0;
    let offset = 0;
    let column = 0;

    function makeLocation() : SourceLocation {
        // note: line and column numbers are 1-based (because that's what editors do)
        return {
            line: lineno + 1,
            column: column + 1,
            offset: offset + 1,
            token: 0,
        };
    }

    function done() {
        return offset >= input.length;
    }

    // This lexical grammar tries to follow ECMA 262 6.0, aka JavaScript
    // Link: https://www.ecma-international.org/ecma-262/6.0/#sec-ecmascript-language-lexical-grammar
    //
    // Intentional differences:
    // - Line continuations are not supported
    // - There is no automatic semicolon insertion
    // - $ is not a valid character in identifiers (but identifiers starting with $ are recognized as keywords)
    //
    // Differences with JavaScript as commonly implemented by browsers (incl. Appendix B Web Compat.)
    // - Old-school octal literals and octal escape sequences are not recognized (new style octals are ok)
    //
    // Thingtalk additions:
    // - =~ and ~= are valid operators (a single token)
    // - contains~, in_array~, ~contains and ~in_array are valid operators
    // - := is a valid operator (legacy assignment for dataset)
    // - $? is a valid operator
    // - @ introduces class names
    // - ^^ introduces entity names
    // - #[ introduces annotations
    // - #_[ introduces metadata (NL annotations)
    // - a numeric literal can be followed immediately by an identifier to form a measure token (and that identifier
    //   is treated as unit even if it would be otherwise a keyword, e.g. "in")
    // - a numeric literal can be followed immediately by a $ and an identifier to form a currency token
    //
    // Differences that could change in the future:
    // - Unicode white space (characters in Zs class) is not recognized as such
    // - Unicode in identifiers is not allowed
    // - Unicode escape sequences in identifiers are not allowed
    // - U+2028 LINE SEPARATOR and U+2029 PARAGRAPH SEPARATOR are not recognized as line terminators (but they can
    //   be used inside string literals)

    // NOTE: do not move this to block scope!
    // test() modifies the regexp object to set lastIndex and would be very confused if concurrent usage also
    // modified the regexps

    const SINGLE_LINE_BLOCK_COMMENT = /\/\*(?:[^\r\n*]|\*[^\r\n/])*\*\//y;
    const WHITESPACE =  /[ \t\v\f\u00a0\ufeff]+/y;
    const MULTILINE_BLOCK_COMMENT_BEGIN = /\/\*(?:[^\r\n*]|\*[^\r\n/])*(?:\r\n|[\n\r])/y;
    const MULTILINE_BLOCK_COMMENT_END = /(?:[^\r\n*]|\*[^\r\n/])*\*\//y;
    const LINE_COMMENT = /\/\/[^\r\n]*(?:\r\n|[\n\r]|$)/y;

    const NEWLINE = /(?:\r\n|[\n\r])/y;
    const NEXT_LINE = /[^\r\n]*(?:\r\n|[\n\r])/y;

    const DOLLAR_IDENT = /\$(?:[A-Za-z0-9_]+|\?)/y;
    const IDENTIFIER = /[A-Za-z_][A-Za-z0-9_]*/y;
    const CLASSNAME = /@[A-Za-z_][A-Za-z0-9_-]*(?:\.[A-Za-z_][A-Za-z0-9_-]*)*/y;
    const ENTITYNAME = /\^\^[A-Za-z_][A-Za-z0-9_-]*(?:\.[A-Za-z_][A-Za-z0-9_-]*)*:[A-Za-z_][A-Za-z0-9_]*/y;

    const TILDE_OPERATOR = /~[A-Za-z_][A-Za-z0-9_]*|[A-Za-z_][A-Za-z0-9_]*~/y;

    // HACK: for compatibility with Thingpedia, we need to recognize Entity(...) type references without
    // the ^^ marker
    const OLD_ENTITY_REFERENCE = /Entity\([A-Za-z_][A-Za-z0-9_-]*(?:\.[A-Za-z_][A-Za-z0-9_-]*)*:[A-Za-z_][A-Za-z0-9_]*\)/y;

    // note that line continuations are not handled, unlike in JS, because they are not very useful
    // and make the grammar very messy
    // also note that this regexp is loose wrt escape sequences, the actual escape handling is in unescape()
    const STRING_LITERAL = /(?:"(?:[^\\\n\r"]|\\.)*"|'(?:[^\\\n\r']|\\.)*')/y;

    const UNTERMINATED_STRING_LITERAL = /(?:"(?:[^\\\n\r"]|\\.)*(?:[\n\r]|$)|'(?:[^\\\n\r']|\\.)*(?:[\n\r]|$))/y;

    // NOTE: ALL operators from JavaScript are recognized, plus the ThingTalk specific ones
    // Of course, most operators will be rejected by the parser, but that's a different problem
    // NOTE 2: this regexp needs to be sorted so that greedy left-first matches are longer
    const PUNCTUATOR = /(?:>>>=|\.\.\.|===|!==|>>>|\*\*=|>>=|<<=|#_\[|#\[|[><+*/%~!&|^:-]=|=[~>]|==|\*\*|\+\+|--|<<|>>|&&|\|\||::|[{}()[\].;><*/+&|^!~?:=-])/y;

    const DECIMAL_LITERAL = /-?(?:(?:0|[1-9][0-9]*)\.[0-9]*(?:[eE][+-]?[0-9]+)?|\.[0-9]+(?:[eE][+-]?[0-9]+)?|(?:0|[1-9][0-9]*)(?:[eE][+-]?[0-9]+)?)/y;
    const BASE_INT_LITERAL = /-?(?:0[bB][01]+|0[xX][0-9A-Fa-f]+|0[oO][0-7]+)/y;

    function test(regexp : RegExp) : number {
        regexp.lastIndex = offset;
        const match = regexp.exec(input);
        if (match === null)
            return 0;
        else
            return match[0].length;
    }
    function skip(regexp : RegExp) : boolean {
        const eaten = test(regexp);
        if (eaten > 0) {
            offset += eaten;
            column += eaten;
            return true;
        } else {
            return false;
        }
    }
    function consume(regexp : RegExp) : string|null {
        const eaten = test(regexp);
        if (eaten > 0) {
            const v = input.substring(offset, offset + eaten);
            offset += eaten;
            column += eaten;
            return v;
        } else {
            return null;
        }
    }

    while (!done()) {
        if (skip(NEWLINE)) {
            lineno ++;
            column = 0;
            continue;
        }
        if (skip(MULTILINE_BLOCK_COMMENT_BEGIN)) {
            lineno ++;
            column = 0;
            let ended = test(MULTILINE_BLOCK_COMMENT_END);
            while (ended === 0) {
                skip(NEXT_LINE);
                lineno ++;
                column = 0;
                ended = test(MULTILINE_BLOCK_COMMENT_END);
            }
            offset += ended;
            column = ended;
            continue;
        }
        if (skip(LINE_COMMENT)) {
            lineno ++;
            column = 0;
            continue;
        }

        if (skip(WHITESPACE))
            continue;
        if (skip(SINGLE_LINE_BLOCK_COMMENT))
            continue;

        const start = makeLocation();

        if (skip(UNTERMINATED_STRING_LITERAL)) {
            column = 0;
            lineno += 1;
            const end = makeLocation();
            throw new ThingTalkSyntaxError(`Unterminated string literal`, { start, end });
        }

        const oldEntityName = consume(OLD_ENTITY_REFERENCE);
        if (oldEntityName) {
            const end = makeLocation();

            yield Token.make('Entity', { start, end }, null);
            yield Token.make( '(', { start, end }, null);
            yield Token.make('ENTITY_NAME', { start, end },
                oldEntityName.substring('Entity('.length, oldEntityName.length-1));
            yield Token.make(')', { start, end }, null);
            continue;
        }

        const tildeOp = consume(TILDE_OPERATOR);
        if (tildeOp) {
            const end = makeLocation();
            yield Token.make(tildeOp, { start, end }, null);
            continue;
        }

        const identifier = consume(IDENTIFIER);
        if (identifier) {
            const end = makeLocation();

            if (FORBIDDEN_KEYWORDS.has(identifier))
                throw new ThingTalkSyntaxError(`Forbidden token ${identifier}`, { start, end });

            if (KEYWORDS.has(identifier) || CONTEXTUAL_KEYWORDS.has(identifier))
                yield Token.make(identifier, { start, end }, null);
            else
                yield Token.make('IDENTIFIER', { start, end }, identifier);

            continue;
        }

        const dollarident = consume(DOLLAR_IDENT);
        if (dollarident) {
            const end = makeLocation();

            if (DOLLAR_KEYWORDS.has(dollarident))
                yield Token.make(dollarident, { start, end }, null);
            else
                yield Token.make('DOLLARIDENTIFIER', { start, end }, dollarident.substring(1));
            continue;
        }

        const className = consume(CLASSNAME);
        if (className) {
            const end = makeLocation();

            // eat the @ at the beginning
            yield Token.make('CLASS_OR_FUNCTION_REF', { start, end }, className.substring(1));
            continue;
        }

        const entityName = consume(ENTITYNAME);
        if (entityName) {
            const end = makeLocation();

            // eat the ^^ at the beginning
            yield Token.make('ENTITY_NAME', { start, end }, entityName.substring(2));
            continue;
        }

        const stringLiteral = consume(STRING_LITERAL);
        if (stringLiteral) {
            const end = makeLocation();

            const range = { start, end };
            // eat the opening/closing quote
            const string = unescape(stringLiteral.substring(1, stringLiteral.length-1), range);
            yield Token.make('QUOTED_STRING', range, string);
            continue;
        }

        const intWithBase = consume(BASE_INT_LITERAL);
        if (intWithBase) {
            const negative = intWithBase[0] === '-';
            const baseChar = negative ? intWithBase[2] : intWithBase[1];
            let base : number;
            switch (baseChar) {
            case 'x':
            case 'X':
                base = 16;
                break;
            case 'b':
            case 'B':
                base = 2;
                break;
            case 'o':
            case 'O':
                base = 8;
                break;
            default:
                throw new Error('unexpected');
            }
            const value = parseInt(intWithBase.substring(negative ? 3 : 2), base)
                * (negative ? -1 : 1);

            const end = makeLocation();
            yield Token.make('NUMBER', { start, end }, value);
            continue;
        } else {
            const decimal = consume(DECIMAL_LITERAL);

            if (decimal) {
                const end = makeLocation();
                yield Token.make('NUMBER', { start, end }, parseFloat(decimal));
                continue;
            }
        }

        const punct = consume(PUNCTUATOR);
        if (punct) {
            const end = makeLocation();
            yield Token.make(punct, { start, end }, null);
            continue;
        }

        // we have exhausted all possibilities: it is not an identifier, not a keyword, not a numeric or string literal,
        // hence it is an invalid token
        // we just take the next character, generate a token for it, and let the parser deal with it

        const char = input[offset];
        offset += 1;
        column += 1;
        const end = makeLocation();
        yield Token.make(char, { start, end }, null);
    }
}
