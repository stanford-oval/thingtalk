"use strict";

const FileThingpediaClient = require('./file_thingpedia_client');

module.exports = new FileThingpediaClient({
    locale: 'en',
    thingpedia: './test/thingpedia.tt',
    entities: './test/entities.json'
});
