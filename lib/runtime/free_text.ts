// -*- mode: typescript; indent-tabs-mode: nil; js-basic-offArray: 4 -*-
//
// This file is part of ThingTalk
//
// Copyright 2023 The Board of Trustees of the Leland Stanford Junior University
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
// Author: Shicheng Liu <shicheng@cs.stanford.edu>

const FREE_TEXT_SERVER = "http://127.0.0.1:8500";

export async function summary(text : string, focus : string) : Promise<string> {
    return text;
}

export async function answer(text : string | string[], question : string) : Promise<string> {
    if (Array.isArray(text))
        text = text.join("\n");
    

    const options = {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            "text" : text,
            "question" : question
        })
    };

    let result = "";
    await fetch(FREE_TEXT_SERVER + "/answer", options)
        .then((response : any) => response.json())
        .then((responseData : any) => {
            result = responseData["result"] as string;
        })
        .catch((error : any) => {
            console.error('Fetching /answer free text server error:', error);
        });

    return result;
}

export async function booleanAnswer(text : string | string[], question : string) : Promise<boolean> {
    const options = {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            "text" : text,
            "question" : question
        })
    };

    let result = false;
    await fetch(FREE_TEXT_SERVER + "/booleanAnswer", options)
        .then((response : any) => response.json())
        .then((responseData : any) => {
            result = responseData["result"] as boolean;
        })
        .catch((error : any) => {
            console.error('Fetching /booleanAnswer free text server error:', error);
        });

    return result;
}

export async function mentions(text : string | string[], concept : string) : Promise<boolean> {
    return true;
}

export async function entails(text : string, claim : string) : Promise<boolean> {
    return true;
}