"use strict";

require('../lib/grammar_api');
const Compiler = require('../lib/compiler');
const SchemaRetriever = require('../lib/schema');

const _mockSchemaDelegate = require('./mock_schema_delegate');
const _mockMemoryClient = require('./mock_memory_client');
var schemaRetriever = new SchemaRetriever(_mockSchemaDelegate, _mockMemoryClient, true);

const TEST_CASES = [
    //1
    [`now => @com.xkcd.get_comic() => notify;`,
    [`"use strict";
  let _t_0;
  let _t_1;
  let _t_2;
  let _t_3;
  let _t_4;
  let _t_5;
  let _t_6;
  let _t_7;
  let _t_8;
  let _t_9;
  let _t_10;
  let _t_11;
  try {
    _t_0 = {};
    _t_1 = await __env.invokeQuery("com.xkcd", { }, "get_comic", _t_0);
    _t_2 = _t_1[Symbol.iterator]();
    {
      let _iter_tmp = await _t_2.next();
      while (!_iter_tmp.done) {
        _t_3 = _iter_tmp.value;
        _t_4 = _t_3[0];
        _t_5 = _t_3[1];
        _t_6 = _t_5.number;
        _t_7 = _t_5.__response;
        _t_8 = _t_5.title;
        _t_9 = _t_5.picture_url;
        _t_10 = _t_5.link;
        _t_11 = _t_5.alt_text;
        try {
          await __env.output(String(_t_4), _t_5);
        } catch(_exc_) {
          __env.reportError("Failed to invoke action", _exc_);
        }
        _iter_tmp = await _t_2.next();
      }
    }
  } catch(_exc_) {
    __env.reportError("Failed to invoke query", _exc_);
  }`]],

    //2
    [`now => @com.xkcd(id="com.xkcd-123").get_comic() => notify;`,
    [`"use strict";
  let _t_0;
  let _t_1;
  let _t_2;
  let _t_3;
  let _t_4;
  let _t_5;
  let _t_6;
  let _t_7;
  let _t_8;
  let _t_9;
  let _t_10;
  let _t_11;
  try {
    _t_0 = {};
    _t_1 = await __env.invokeQuery("com.xkcd", { id: "com.xkcd-123", }, "get_comic", _t_0);
    _t_2 = _t_1[Symbol.iterator]();
    {
      let _iter_tmp = await _t_2.next();
      while (!_iter_tmp.done) {
        _t_3 = _iter_tmp.value;
        _t_4 = _t_3[0];
        _t_5 = _t_3[1];
        _t_6 = _t_5.number;
        _t_7 = _t_5.__response;
        _t_8 = _t_5.title;
        _t_9 = _t_5.picture_url;
        _t_10 = _t_5.link;
        _t_11 = _t_5.alt_text;
        try {
          await __env.output(String(_t_4), _t_5);
        } catch(_exc_) {
          __env.reportError("Failed to invoke action", _exc_);
        }
        _iter_tmp = await _t_2.next();
      }
    }
  } catch(_exc_) {
    __env.reportError("Failed to invoke query", _exc_);
  }`]],

    //3
    [`now => @com.xkcd.get_comic() => { notify; @com.twitter.post(status=title); };`,
    [`"use strict";
  let _t_0;
  let _t_1;
  let _t_2;
  let _t_3;
  let _t_4;
  let _t_5;
  let _t_6;
  let _t_7;
  let _t_8;
  let _t_9;
  let _t_10;
  let _t_11;
  let _t_12;
  try {
    _t_0 = {};
    _t_1 = await __env.invokeQuery("com.xkcd", { }, "get_comic", _t_0);
    _t_2 = _t_1[Symbol.iterator]();
    {
      let _iter_tmp = await _t_2.next();
      while (!_iter_tmp.done) {
        _t_3 = _iter_tmp.value;
        _t_4 = _t_3[0];
        _t_5 = _t_3[1];
        _t_6 = _t_5.number;
        _t_7 = _t_5.__response;
        _t_8 = _t_5.title;
        _t_9 = _t_5.picture_url;
        _t_10 = _t_5.link;
        _t_11 = _t_5.alt_text;
        try {
          await __env.output(String(_t_4), _t_5);
        } catch(_exc_) {
          __env.reportError("Failed to invoke action", _exc_);
        }
        try {
          _t_12 = {};
          _t_12.status = _t_8;
          await __env.invokeAction("com.twitter", { }, "post", _t_12);
        } catch(_exc_) {
          __env.reportError("Failed to invoke action", _exc_);
        }
        _iter_tmp = await _t_2.next();
      }
    }
  } catch(_exc_) {
    __env.reportError("Failed to invoke query", _exc_);
  }`]],

    //4
    [`now => @com.xkcd.get_comic(), number <= 1000 => { notify; @com.twitter.post(status=title); };`,
    [`"use strict";
  let _t_0;
  let _t_1;
  let _t_2;
  let _t_3;
  let _t_4;
  let _t_5;
  let _t_6;
  let _t_7;
  let _t_8;
  let _t_9;
  let _t_10;
  let _t_11;
  let _t_12;
  let _t_13;
  let _t_14;
  try {
    _t_0 = {};
    _t_1 = await __env.invokeQuery("com.xkcd", { }, "get_comic", _t_0);
    _t_2 = _t_1[Symbol.iterator]();
    {
      let _iter_tmp = await _t_2.next();
      while (!_iter_tmp.done) {
        _t_3 = _iter_tmp.value;
        _t_4 = _t_3[0];
        _t_5 = _t_3[1];
        _t_6 = _t_5.number;
        _t_7 = _t_5.__response;
        _t_8 = _t_5.title;
        _t_9 = _t_5.picture_url;
        _t_10 = _t_5.link;
        _t_11 = _t_5.alt_text;
        _t_13 = 1000;
        _t_12 = _t_6 <= _t_13;
        if (_t_12) {
          try {
            await __env.output(String(_t_4), _t_5);
          } catch(_exc_) {
            __env.reportError("Failed to invoke action", _exc_);
          }
          try {
            _t_14 = {};
            _t_14.status = _t_8;
            await __env.invokeAction("com.twitter", { }, "post", _t_14);
          } catch(_exc_) {
            __env.reportError("Failed to invoke action", _exc_);
          }
        } else {

        }
        _iter_tmp = await _t_2.next();
      }
    }
  } catch(_exc_) {
    __env.reportError("Failed to invoke query", _exc_);
  }`]],

    //5
    [`monitor @thermostat.get_temperature(), value >= 21C => @org.thingpedia.builtin.thingengine.builtin.say(message="bla");`,
     [`"use strict";
  let _t_0;
  let _t_1;
  let _t_2;
  let _t_3;
  let _t_4;
  let _t_5;
  let _t_6;
  let _t_7;
  let _t_8;
  let _t_9;
  let _t_10;
  let _t_11;
  let _t_12;
  let _t_13;
  _t_0 = await __env.readState(0);
  try {
    _t_1 = {};
    _t_2 = await __env.invokeMonitor("thermostat", { }, "get_temperature", _t_1, false);
    {
      let _iter_tmp = await _t_2.next();
      while (!_iter_tmp.done) {
        _t_3 = _iter_tmp.value;
        _t_4 = _t_3[0];
        _t_5 = _t_3[1];
        _t_6 = _t_5.__response;
        _t_7 = _t_5.value;
        _t_8 = __builtin.isNewTuple(_t_0, _t_5, ["value"]);
        _t_9 = __builtin.addTuple(_t_0, _t_5);
        await __env.writeState(0, _t_9);
        _t_0 = _t_9;
        if (_t_8) {
          _t_11 = 21;
          _t_10 = _t_7 >= _t_11;
          if (_t_10) {
            try {
              _t_12 = {};
              _t_13 = "bla";
              _t_12.message = _t_13;
              await __env.invokeAction("org.thingpedia.builtin.thingengine.builtin", { }, "say", _t_12);
            } catch(_exc_) {
              __env.reportError("Failed to invoke action", _exc_);
            }
          } else {

          }
        } else {

        }
        _iter_tmp = await _t_2.next();
      }
    }
  } catch(_exc_) {
    __env.reportError("Failed to invoke trigger", _exc_);
  }`]],

    //6
    [`monitor (@thermostat.get_temperature(), value >= 21C) => @org.thingpedia.builtin.thingengine.builtin.say(message="bla");`,
     [`"use strict";
  let _t_0;
  let _t_1;
  let _t_2;
  let _t_3;
  let _t_4;
  let _t_5;
  let _t_6;
  let _t_7;
  let _t_8;
  let _t_9;
  let _t_10;
  let _t_11;
  let _t_12;
  let _t_13;
  _t_0 = await __env.readState(0);
  try {
    _t_1 = {};
    _t_2 = await __env.invokeMonitor("thermostat", { }, "get_temperature", _t_1, false);
    {
      let _iter_tmp = await _t_2.next();
      while (!_iter_tmp.done) {
        _t_3 = _iter_tmp.value;
        _t_4 = _t_3[0];
        _t_5 = _t_3[1];
        _t_6 = _t_5.__response;
        _t_7 = _t_5.value;
        _t_8 = __builtin.isNewTuple(_t_0, _t_5, ["value"]);
        _t_9 = __builtin.addTuple(_t_0, _t_5);
        await __env.writeState(0, _t_9);
        _t_0 = _t_9;
        if (_t_8) {
          _t_11 = 21;
          _t_10 = _t_7 >= _t_11;
          if (_t_10) {
            try {
              _t_12 = {};
              _t_13 = "bla";
              _t_12.message = _t_13;
              await __env.invokeAction("org.thingpedia.builtin.thingengine.builtin", { }, "say", _t_12);
            } catch(_exc_) {
              __env.reportError("Failed to invoke action", _exc_);
            }
          } else {

          }
        } else {

        }
        _iter_tmp = await _t_2.next();
      }
    }
  } catch(_exc_) {
    __env.reportError("Failed to invoke trigger", _exc_);
  }`]],

    //7
    [`now => @org.thingpedia.builtin.thingengine.builtin.say(message="test");`, [`"use strict";
  let _t_0;
  let _t_1;
  try {
    _t_0 = {};
    _t_1 = "test";
    _t_0.message = _t_1;
    await __env.invokeAction("org.thingpedia.builtin.thingengine.builtin", { }, "say", _t_0);
  } catch(_exc_) {
    __env.reportError("Failed to invoke action", _exc_);
  }`]],

    //8
    [`monitor @com.twitter(id="twitter-foo").home_timeline(), author=="HillaryClinton"^^tt:username => notify;`,
     [`"use strict";
  let _t_0;
  let _t_1;
  let _t_2;
  let _t_3;
  let _t_4;
  let _t_5;
  let _t_6;
  let _t_7;
  let _t_8;
  let _t_9;
  let _t_10;
  let _t_11;
  let _t_12;
  let _t_13;
  let _t_14;
  let _t_15;
  let _t_16;
  _t_0 = await __env.readState(0);
  try {
    _t_1 = {};
    _t_2 = await __env.invokeMonitor("com.twitter", { id: "twitter-foo", }, "home_timeline", _t_1, false);
    {
      let _iter_tmp = await _t_2.next();
      while (!_iter_tmp.done) {
        _t_3 = _iter_tmp.value;
        _t_4 = _t_3[0];
        _t_5 = _t_3[1];
        _t_6 = _t_5.__response;
        _t_7 = _t_5.text;
        _t_8 = _t_5.hashtags;
        _t_9 = _t_5.urls;
        _t_10 = _t_5.author;
        _t_11 = _t_5.in_reply_to;
        _t_12 = _t_5.tweet_id;
        _t_13 = __builtin.isNewTuple(_t_0, _t_5, ["text", "hashtags", "urls", "author", "in_reply_to", "tweet_id"]);
        _t_14 = __builtin.addTuple(_t_0, _t_5);
        await __env.writeState(0, _t_14);
        _t_0 = _t_14;
        if (_t_13) {
          _t_16 = new __builtin.Entity("HillaryClinton", null);
          _t_15 = __builtin.equality(_t_10, _t_16);
          if (_t_15) {
            try {
              await __env.output(String(_t_4), _t_5);
            } catch(_exc_) {
              __env.reportError("Failed to invoke action", _exc_);
            }
          } else {

          }
        } else {

        }
        _iter_tmp = await _t_2.next();
      }
    }
  } catch(_exc_) {
    __env.reportError("Failed to invoke trigger", _exc_);
  }`]],

    //9
    [`monitor @org.thingpedia.weather.current(location=makeLocation(1, 3, "Somewhere")) => notify;`,
     [`"use strict";
  let _t_0;
  let _t_1;
  let _t_2;
  let _t_3;
  let _t_4;
  let _t_5;
  let _t_6;
  let _t_7;
  let _t_8;
  let _t_9;
  let _t_10;
  let _t_11;
  let _t_12;
  let _t_13;
  let _t_14;
  let _t_15;
  let _t_16;
  _t_0 = await __env.readState(0);
  try {
    _t_1 = {};
    _t_2 = new __builtin.Location(1, 3, "Somewhere");
    _t_1.location = _t_2;
    _t_3 = await __env.invokeMonitor("org.thingpedia.weather", { }, "current", _t_1, false);
    {
      let _iter_tmp = await _t_3.next();
      while (!_iter_tmp.done) {
        _t_4 = _iter_tmp.value;
        _t_5 = _t_4[0];
        _t_6 = _t_4[1];
        _t_7 = _t_6.__response;
        _t_8 = _t_6.temperature;
        _t_9 = _t_6.wind_speed;
        _t_10 = _t_6.humidity;
        _t_11 = _t_6.cloudiness;
        _t_12 = _t_6.fog;
        _t_13 = _t_6.status;
        _t_14 = _t_6.icon;
        _t_15 = __builtin.isNewTuple(_t_0, _t_6, ["temperature", "wind_speed", "humidity", "cloudiness", "fog", "status", "icon"]);
        _t_16 = __builtin.addTuple(_t_0, _t_6);
        await __env.writeState(0, _t_16);
        _t_0 = _t_16;
        if (_t_15) {
          try {
            await __env.output(String(_t_5), _t_6);
          } catch(_exc_) {
            __env.reportError("Failed to invoke action", _exc_);
          }
        } else {

        }
        _iter_tmp = await _t_3.next();
      }
    }
  } catch(_exc_) {
    __env.reportError("Failed to invoke trigger", _exc_);
  }`]],

    //10
    [`monitor @org.thingpedia.weather.current(location=makeLocation(1, 3)) => notify;`,
     [`"use strict";
  let _t_0;
  let _t_1;
  let _t_2;
  let _t_3;
  let _t_4;
  let _t_5;
  let _t_6;
  let _t_7;
  let _t_8;
  let _t_9;
  let _t_10;
  let _t_11;
  let _t_12;
  let _t_13;
  let _t_14;
  let _t_15;
  let _t_16;
  _t_0 = await __env.readState(0);
  try {
    _t_1 = {};
    _t_2 = new __builtin.Location(1, 3, null);
    _t_1.location = _t_2;
    _t_3 = await __env.invokeMonitor("org.thingpedia.weather", { }, "current", _t_1, false);
    {
      let _iter_tmp = await _t_3.next();
      while (!_iter_tmp.done) {
        _t_4 = _iter_tmp.value;
        _t_5 = _t_4[0];
        _t_6 = _t_4[1];
        _t_7 = _t_6.__response;
        _t_8 = _t_6.temperature;
        _t_9 = _t_6.wind_speed;
        _t_10 = _t_6.humidity;
        _t_11 = _t_6.cloudiness;
        _t_12 = _t_6.fog;
        _t_13 = _t_6.status;
        _t_14 = _t_6.icon;
        _t_15 = __builtin.isNewTuple(_t_0, _t_6, ["temperature", "wind_speed", "humidity", "cloudiness", "fog", "status", "icon"]);
        _t_16 = __builtin.addTuple(_t_0, _t_6);
        await __env.writeState(0, _t_16);
        _t_0 = _t_16;
        if (_t_15) {
          try {
            await __env.output(String(_t_5), _t_6);
          } catch(_exc_) {
            __env.reportError("Failed to invoke action", _exc_);
          }
        } else {

        }
        _iter_tmp = await _t_3.next();
      }
    }
  } catch(_exc_) {
    __env.reportError("Failed to invoke trigger", _exc_);
  }`]],

    //11
    [`attimer(time=makeTime(12, 30)) => notify;`,
     [`"use strict";
  let _t_0;
  let _t_1;
  let _t_2;
  let _t_3;
  try {
    _t_1 = new Array(1);
    _t_2 = new __builtin.Time(12, 30, 0);
    _t_1[0] = _t_2;
    _t_0 = await __env.invokeAtTimer(_t_1, null);
    {
      let _iter_tmp = await _t_0.next();
      while (!_iter_tmp.done) {
        _t_3 = _iter_tmp.value;
        try {
          await __env.output(null, _t_3);
        } catch(_exc_) {
          __env.reportError("Failed to invoke action", _exc_);
        }
        _iter_tmp = await _t_0.next();
      }
    }
  } catch(_exc_) {
    __env.reportError("Failed to invoke at-timer", _exc_);
  }`]],

    //12
    [`attimer(time=makeTime(12, 30)) => @com.twitter.post(status="lol");`,
     [`"use strict";
  let _t_0;
  let _t_1;
  let _t_2;
  let _t_3;
  let _t_4;
  let _t_5;
  try {
    _t_1 = new Array(1);
    _t_2 = new __builtin.Time(12, 30, 0);
    _t_1[0] = _t_2;
    _t_0 = await __env.invokeAtTimer(_t_1, null);
    {
      let _iter_tmp = await _t_0.next();
      while (!_iter_tmp.done) {
        _t_3 = _iter_tmp.value;
        try {
          _t_4 = {};
          _t_5 = "lol";
          _t_4.status = _t_5;
          await __env.invokeAction("com.twitter", { }, "post", _t_4);
        } catch(_exc_) {
          __env.reportError("Failed to invoke action", _exc_);
        }
        _iter_tmp = await _t_0.next();
      }
    }
  } catch(_exc_) {
    __env.reportError("Failed to invoke at-timer", _exc_);
  }`]],

    //13
    [`timer(base=makeDate(), interval=1h) => notify;`,
     [`"use strict";
  let _t_0;
  let _t_1;
  let _t_2;
  let _t_3;
  try {
    _t_1 = new Date(XNOWX);
    _t_2 = 3600000;
    _t_0 = await __env.invokeTimer(_t_1, _t_2, null);
    {
      let _iter_tmp = await _t_0.next();
      while (!_iter_tmp.done) {
        _t_3 = _iter_tmp.value;
        try {
          await __env.output(null, _t_3);
        } catch(_exc_) {
          __env.reportError("Failed to invoke action", _exc_);
        }
        _iter_tmp = await _t_0.next();
      }
    }
  } catch(_exc_) {
    __env.reportError("Failed to invoke timer", _exc_);
  }`]],

    //14
    [`timer(base=makeDate(), interval=1h) => @com.twitter.post(status="lol");`,
     [`"use strict";
  let _t_0;
  let _t_1;
  let _t_2;
  let _t_3;
  let _t_4;
  let _t_5;
  try {
    _t_1 = new Date(XNOWX);
    _t_2 = 3600000;
    _t_0 = await __env.invokeTimer(_t_1, _t_2, null);
    {
      let _iter_tmp = await _t_0.next();
      while (!_iter_tmp.done) {
        _t_3 = _iter_tmp.value;
        try {
          _t_4 = {};
          _t_5 = "lol";
          _t_4.status = _t_5;
          await __env.invokeAction("com.twitter", { }, "post", _t_4);
        } catch(_exc_) {
          __env.reportError("Failed to invoke action", _exc_);
        }
        _iter_tmp = await _t_0.next();
      }
    }
  } catch(_exc_) {
    __env.reportError("Failed to invoke timer", _exc_);
  }`]],

    //15
    [`now => @com.youtube.search_videos(query="lol"), video_url == "http://www.youtube.com"^^tt:url =>  notify;`,
     [`"use strict";
  let _t_0;
  let _t_1;
  let _t_2;
  let _t_3;
  let _t_4;
  let _t_5;
  let _t_6;
  let _t_7;
  let _t_8;
  let _t_9;
  let _t_10;
  let _t_11;
  let _t_12;
  let _t_13;
  let _t_14;
  let _t_15;
  let _t_16;
  try {
    _t_0 = {};
    _t_1 = "lol";
    _t_0.query = _t_1;
    _t_2 = await __env.invokeQuery("com.youtube", { }, "search_videos", _t_0);
    _t_3 = _t_2[Symbol.iterator]();
    {
      let _iter_tmp = await _t_3.next();
      while (!_iter_tmp.done) {
        _t_4 = _iter_tmp.value;
        _t_5 = _t_4[0];
        _t_6 = _t_4[1];
        _t_7 = _t_6.channel_id;
        _t_8 = _t_6.count;
        _t_9 = _t_6.__response;
        _t_10 = _t_6.video_id;
        _t_11 = _t_6.title;
        _t_12 = _t_6.description;
        _t_13 = _t_6.thumbnail;
        _t_14 = _t_6.video_url;
        _t_16 = new __builtin.Entity("http://www.youtube.com", null);
        _t_15 = __builtin.equality(_t_14, _t_16);
        if (_t_15) {
          try {
            await __env.output(String(_t_5), _t_6);
          } catch(_exc_) {
            __env.reportError("Failed to invoke action", _exc_);
          }
        } else {

        }
        _iter_tmp = await _t_3.next();
      }
    }
  } catch(_exc_) {
    __env.reportError("Failed to invoke query", _exc_);
  }`]],

    //16
    [`monitor @com.xkcd(id="com.xkcd-6").get_comic() => @com.twitter(id="twitter-foo").post_picture(caption=title, picture_url=picture_url);`,
     [`"use strict";
  let _t_0;
  let _t_1;
  let _t_2;
  let _t_3;
  let _t_4;
  let _t_5;
  let _t_6;
  let _t_7;
  let _t_8;
  let _t_9;
  let _t_10;
  let _t_11;
  let _t_12;
  let _t_13;
  let _t_14;
  let _t_15;
  _t_0 = await __env.readState(0);
  try {
    _t_1 = {};
    _t_2 = await __env.invokeMonitor("com.xkcd", { id: "com.xkcd-6", }, "get_comic", _t_1, false);
    {
      let _iter_tmp = await _t_2.next();
      while (!_iter_tmp.done) {
        _t_3 = _iter_tmp.value;
        _t_4 = _t_3[0];
        _t_5 = _t_3[1];
        _t_6 = _t_5.number;
        _t_7 = _t_5.__response;
        _t_8 = _t_5.title;
        _t_9 = _t_5.picture_url;
        _t_10 = _t_5.link;
        _t_11 = _t_5.alt_text;
        _t_12 = __builtin.isNewTuple(_t_0, _t_5, ["title", "picture_url", "link", "alt_text"]);
        _t_13 = __builtin.addTuple(_t_0, _t_5);
        await __env.writeState(0, _t_13);
        _t_0 = _t_13;
        if (_t_12) {
          try {
            _t_14 = {};
            _t_14.caption = _t_8;
            _t_15 = String (_t_9);
            _t_14.picture_url = _t_15;
            await __env.invokeAction("com.twitter", { id: "twitter-foo", }, "post_picture", _t_14);
          } catch(_exc_) {
            __env.reportError("Failed to invoke action", _exc_);
          }
        } else {

        }
        _iter_tmp = await _t_2.next();
      }
    }
  } catch(_exc_) {
    __env.reportError("Failed to invoke trigger", _exc_);
  }`]],

    //17
    [`{
    class @dyn_0 extends @remote {
        action send(in req foo : String);
    }
    now => @dyn_0.send(foo="foo");
}`, [`"use strict";
  let _t_0;
  let _t_1;
  try {
    _t_0 = {};
    _t_1 = "foo";
    _t_0.foo = _t_1;
    await __env.invokeAction("org.thingpedia.builtin.thingengine.remote", { }, "send", _t_0);
  } catch(_exc_) {
    __env.reportError("Failed to invoke action", _exc_);
  }`]],

    //18
    [`monitor @com.twitter.home_timeline(), text =~ "foo" || (text =~"bar" && !(text =~ "lol")) => notify;`,
     [`"use strict";
  let _t_0;
  let _t_1;
  let _t_2;
  let _t_3;
  let _t_4;
  let _t_5;
  let _t_6;
  let _t_7;
  let _t_8;
  let _t_9;
  let _t_10;
  let _t_11;
  let _t_12;
  let _t_13;
  let _t_14;
  let _t_15;
  let _t_16;
  let _t_17;
  let _t_18;
  let _t_19;
  let _t_20;
  let _t_21;
  let _t_22;
  let _t_23;
  _t_0 = await __env.readState(0);
  try {
    _t_1 = {};
    _t_2 = await __env.invokeMonitor("com.twitter", { }, "home_timeline", _t_1, false);
    {
      let _iter_tmp = await _t_2.next();
      while (!_iter_tmp.done) {
        _t_3 = _iter_tmp.value;
        _t_4 = _t_3[0];
        _t_5 = _t_3[1];
        _t_6 = _t_5.__response;
        _t_7 = _t_5.text;
        _t_8 = _t_5.hashtags;
        _t_9 = _t_5.urls;
        _t_10 = _t_5.author;
        _t_11 = _t_5.in_reply_to;
        _t_12 = _t_5.tweet_id;
        _t_13 = __builtin.isNewTuple(_t_0, _t_5, ["text", "hashtags", "urls", "author", "in_reply_to", "tweet_id"]);
        _t_14 = __builtin.addTuple(_t_0, _t_5);
        await __env.writeState(0, _t_14);
        _t_0 = _t_14;
        if (_t_13) {
          _t_15 = false;
          _t_17 = "foo";
          _t_16 = __builtin.like(_t_7, _t_17);
          _t_15 = _t_15 || _t_16;
          _t_18 = true;
          _t_20 = "bar";
          _t_19 = __builtin.like(_t_7, _t_20);
          _t_18 = _t_18 && _t_19;
          _t_23 = "lol";
          _t_22 = __builtin.like(_t_7, _t_23);
          _t_21 = ! (_t_22);
          _t_18 = _t_18 && _t_21;
          _t_15 = _t_15 || _t_18;
          if (_t_15) {
            try {
              await __env.output(String(_t_4), _t_5);
            } catch(_exc_) {
              __env.reportError("Failed to invoke action", _exc_);
            }
          } else {

          }
        } else {

        }
        _iter_tmp = await _t_2.next();
      }
    }
  } catch(_exc_) {
    __env.reportError("Failed to invoke trigger", _exc_);
  }`]],

    //19
    [`monitor @com.twitter.home_timeline() => @org.thingpedia.builtin.thingengine.builtin.say(message=$event);`,
     [`"use strict";
  let _t_0;
  let _t_1;
  let _t_2;
  let _t_3;
  let _t_4;
  let _t_5;
  let _t_6;
  let _t_7;
  let _t_8;
  let _t_9;
  let _t_10;
  let _t_11;
  let _t_12;
  let _t_13;
  let _t_14;
  let _t_15;
  let _t_16;
  _t_0 = await __env.readState(0);
  try {
    _t_1 = {};
    _t_2 = await __env.invokeMonitor("com.twitter", { }, "home_timeline", _t_1, false);
    {
      let _iter_tmp = await _t_2.next();
      while (!_iter_tmp.done) {
        _t_3 = _iter_tmp.value;
        _t_4 = _t_3[0];
        _t_5 = _t_3[1];
        _t_6 = _t_5.__response;
        _t_7 = _t_5.text;
        _t_8 = _t_5.hashtags;
        _t_9 = _t_5.urls;
        _t_10 = _t_5.author;
        _t_11 = _t_5.in_reply_to;
        _t_12 = _t_5.tweet_id;
        _t_13 = __builtin.isNewTuple(_t_0, _t_5, ["text", "hashtags", "urls", "author", "in_reply_to", "tweet_id"]);
        _t_14 = __builtin.addTuple(_t_0, _t_5);
        await __env.writeState(0, _t_14);
        _t_0 = _t_14;
        if (_t_13) {
          try {
            _t_15 = {};
            _t_16 = await __env.formatEvent(_t_4, _t_5, "string");
            _t_15.message = _t_16;
            await __env.invokeAction("org.thingpedia.builtin.thingengine.builtin", { }, "say", _t_15);
          } catch(_exc_) {
            __env.reportError("Failed to invoke action", _exc_);
          }
        } else {

        }
        _iter_tmp = await _t_2.next();
      }
    }
  } catch(_exc_) {
    __env.reportError("Failed to invoke trigger", _exc_);
  }`]],

    //20
    [`monitor @com.twitter.home_timeline() => @org.thingpedia.builtin.thingengine.builtin.say(message=$event.type);`,
     [`"use strict";
  let _t_0;
  let _t_1;
  let _t_2;
  let _t_3;
  let _t_4;
  let _t_5;
  let _t_6;
  let _t_7;
  let _t_8;
  let _t_9;
  let _t_10;
  let _t_11;
  let _t_12;
  let _t_13;
  let _t_14;
  let _t_15;
  let _t_16;
  _t_0 = await __env.readState(0);
  try {
    _t_1 = {};
    _t_2 = await __env.invokeMonitor("com.twitter", { }, "home_timeline", _t_1, false);
    {
      let _iter_tmp = await _t_2.next();
      while (!_iter_tmp.done) {
        _t_3 = _iter_tmp.value;
        _t_4 = _t_3[0];
        _t_5 = _t_3[1];
        _t_6 = _t_5.__response;
        _t_7 = _t_5.text;
        _t_8 = _t_5.hashtags;
        _t_9 = _t_5.urls;
        _t_10 = _t_5.author;
        _t_11 = _t_5.in_reply_to;
        _t_12 = _t_5.tweet_id;
        _t_13 = __builtin.isNewTuple(_t_0, _t_5, ["text", "hashtags", "urls", "author", "in_reply_to", "tweet_id"]);
        _t_14 = __builtin.addTuple(_t_0, _t_5);
        await __env.writeState(0, _t_14);
        _t_0 = _t_14;
        if (_t_13) {
          try {
            _t_15 = {};
            _t_16 = String (_t_4);
            _t_15.message = _t_16;
            await __env.invokeAction("org.thingpedia.builtin.thingengine.builtin", { }, "say", _t_15);
          } catch(_exc_) {
            __env.reportError("Failed to invoke action", _exc_);
          }
        } else {

        }
        _iter_tmp = await _t_2.next();
      }
    }
  } catch(_exc_) {
    __env.reportError("Failed to invoke trigger", _exc_);
  }`]],

    //21
    [`monitor @com.xkcd(id="com.xkcd-6").get_comic() => @com.twitter.post(status=picture_url);`,
     [`"use strict";
  let _t_0;
  let _t_1;
  let _t_2;
  let _t_3;
  let _t_4;
  let _t_5;
  let _t_6;
  let _t_7;
  let _t_8;
  let _t_9;
  let _t_10;
  let _t_11;
  let _t_12;
  let _t_13;
  let _t_14;
  let _t_15;
  _t_0 = await __env.readState(0);
  try {
    _t_1 = {};
    _t_2 = await __env.invokeMonitor("com.xkcd", { id: "com.xkcd-6", }, "get_comic", _t_1, false);
    {
      let _iter_tmp = await _t_2.next();
      while (!_iter_tmp.done) {
        _t_3 = _iter_tmp.value;
        _t_4 = _t_3[0];
        _t_5 = _t_3[1];
        _t_6 = _t_5.number;
        _t_7 = _t_5.__response;
        _t_8 = _t_5.title;
        _t_9 = _t_5.picture_url;
        _t_10 = _t_5.link;
        _t_11 = _t_5.alt_text;
        _t_12 = __builtin.isNewTuple(_t_0, _t_5, ["title", "picture_url", "link", "alt_text"]);
        _t_13 = __builtin.addTuple(_t_0, _t_5);
        await __env.writeState(0, _t_13);
        _t_0 = _t_13;
        if (_t_12) {
          try {
            _t_14 = {};
            _t_15 = String (_t_9);
            _t_14.status = _t_15;
            await __env.invokeAction("com.twitter", { }, "post", _t_14);
          } catch(_exc_) {
            __env.reportError("Failed to invoke action", _exc_);
          }
        } else {

        }
        _iter_tmp = await _t_2.next();
      }
    }
  } catch(_exc_) {
    __env.reportError("Failed to invoke trigger", _exc_);
  }`]],

    //22
    [`now => @org.thingpedia.builtin.thingengine.builtin.get_time(), time >= makeTime(10,0) => notify;`,
     [`"use strict";
  let _t_0;
  let _t_1;
  let _t_2;
  let _t_3;
  let _t_4;
  let _t_5;
  let _t_6;
  let _t_7;
  let _t_8;
  let _t_9;
  let _t_10;
  try {
    _t_0 = {};
    _t_1 = await __env.invokeQuery("org.thingpedia.builtin.thingengine.builtin", { }, "get_time", _t_0);
    _t_2 = _t_1[Symbol.iterator]();
    {
      let _iter_tmp = await _t_2.next();
      while (!_iter_tmp.done) {
        _t_3 = _iter_tmp.value;
        _t_4 = _t_3[0];
        _t_5 = _t_3[1];
        _t_6 = _t_5.__response;
        _t_7 = _t_5.time;
        _t_9 = __builtin.getTime (_t_7);
        _t_10 = new __builtin.Time(10, 0, 0);
        _t_8 = _t_9 >= _t_10;
        if (_t_8) {
          try {
            await __env.output(String(_t_4), _t_5);
          } catch(_exc_) {
            __env.reportError("Failed to invoke action", _exc_);
          }
        } else {

        }
        _iter_tmp = await _t_2.next();
      }
    }
  } catch(_exc_) {
    __env.reportError("Failed to invoke query", _exc_);
  }`]],

    //23
    //Changes start here
    [`now => @com.uber.price_estimate(start=makeLocation(1, 3, "Somewhere"), end=makeLocation(1, 3, "Somewhere")), low_estimate >= 7 => notify;`,
  [`"use strict";
  let _t_0;
  let _t_1;
  let _t_2;
  let _t_3;
  let _t_4;
  let _t_5;
  let _t_6;
  let _t_7;
  let _t_8;
  let _t_9;
  let _t_10;
  let _t_11;
  let _t_12;
  let _t_13;
  let _t_14;
  let _t_15;
  let _t_16;
  let _t_17;
  try {
    _t_0 = {};
    _t_1 = new __builtin.Location(1, 3, "Somewhere");
    _t_0.start = _t_1;
    _t_2 = new __builtin.Location(1, 3, "Somewhere");
    _t_0.end = _t_2;
    _t_3 = await __env.invokeQuery("com.uber", { }, "price_estimate", _t_0);
    _t_4 = _t_3[Symbol.iterator]();
    {
      let _iter_tmp = await _t_4.next();
      while (!_iter_tmp.done) {
        _t_5 = _iter_tmp.value;
        _t_6 = _t_5[0];
        _t_7 = _t_5[1];
        _t_8 = _t_7.__response;
        _t_9 = _t_7.uber_type;
        _t_10 = _t_7.low_estimate;
        _t_11 = _t_7.high_estimate;
        _t_12 = _t_7.surge;
        _t_13 = _t_7.duration;
        _t_14 = _t_7.distance;
        _t_16 = 7;
        _t_17 = __builtin.getCurrency (_t_16);
        _t_15 = _t_10 >= _t_17;
        if (_t_15) {
          try {
            await __env.output(String(_t_6), _t_7);
          } catch(_exc_) {
            __env.reportError("Failed to invoke action", _exc_);
          }
        } else {

        }
        _iter_tmp = await _t_4.next();
      }
    }
  } catch(_exc_) {
    __env.reportError("Failed to invoke query", _exc_);
  }`]],
    //Changes end here

    //24
    [`{
    class @__dyn_0 extends @org.thingpedia.builtin.thingengine.remote {
        action send (in req __principal : Entity(tt:contact), in req __program_id : Entity(tt:program_id), in req __flow : Number, in req __kindChannel : Entity(tt:function));
    }
    monitor @com.twitter.home_timeline()  => @__dyn_0.send(__principal="mock-account:12345678"^^tt:contact("me"), __program_id=$event.program_id, __flow=0, __kindChannel=$event.type) ;
}`, [`"use strict";
  let _t_0;
  let _t_1;
  let _t_2;
  let _t_3;
  let _t_4;
  let _t_5;
  let _t_6;
  let _t_7;
  let _t_8;
  let _t_9;
  let _t_10;
  let _t_11;
  let _t_12;
  let _t_13;
  let _t_14;
  let _t_15;
  let _t_16;
  let _t_17;
  let _t_18;
  let _t_19;
  let _t_20;
  _t_0 = await __env.readState(0);
  try {
    _t_1 = {};
    _t_2 = await __env.invokeMonitor("com.twitter", { }, "home_timeline", _t_1, false);
    {
      let _iter_tmp = await _t_2.next();
      while (!_iter_tmp.done) {
        _t_3 = _iter_tmp.value;
        _t_4 = _t_3[0];
        _t_5 = _t_3[1];
        _t_6 = _t_5.__response;
        _t_7 = _t_5.text;
        _t_8 = _t_5.hashtags;
        _t_9 = _t_5.urls;
        _t_10 = _t_5.author;
        _t_11 = _t_5.in_reply_to;
        _t_12 = _t_5.tweet_id;
        _t_13 = __builtin.isNewTuple(_t_0, _t_5, ["text", "hashtags", "urls", "author", "in_reply_to", "tweet_id"]);
        _t_14 = __builtin.addTuple(_t_0, _t_5);
        await __env.writeState(0, _t_14);
        _t_0 = _t_14;
        if (_t_13) {
          try {
            _t_15 = {};
            _t_16 = new __builtin.Entity("mock-account:12345678", "me");
            _t_15.__principal = _t_16;
            _t_17 = __env.program_id;
            _t_15.__program_id = _t_17;
            _t_18 = 0;
            _t_15.__flow = _t_18;
            _t_15.__kindChannel = _t_4;
            await __env.invokeAction("org.thingpedia.builtin.thingengine.remote", { }, "send", _t_15);
          } catch(_exc_) {
            __env.reportError("Failed to invoke action", _exc_);
          }
        } else {

        }
        _iter_tmp = await _t_2.next();
      }
    }
  } catch(_exc_) {
    __env.reportError("Failed to invoke trigger", _exc_);
  }
  try {
    _t_19 = new __builtin.Entity("mock-account:12345678", "me");
    _t_20 = 0;
    await __env.sendEndOfFlow(_t_19, _t_20);
  } catch(_exc_) {
    __env.reportError("Failed to signal end-of-flow", _exc_);
  }`]],

    //25
    [`{
    monitor @com.twitter.home_timeline(), @org.thingpedia.builtin.thingengine.builtin.get_time() { time >= makeTime(9,0) && time <= makeTime(10, 0) } => notify;
    monitor @com.twitter.home_timeline(), text =~ "lol" && @org.thingpedia.builtin.thingengine.builtin.get_time() { time >= makeTime(9,0) && time <= makeTime(10, 0) } => notify;
}`, [`"use strict";
  let _t_0;
  let _t_1;
  let _t_2;
  let _t_3;
  let _t_4;
  let _t_5;
  let _t_6;
  let _t_7;
  let _t_8;
  let _t_9;
  let _t_10;
  let _t_11;
  let _t_12;
  let _t_13;
  let _t_14;
  let _t_15;
  let _t_16;
  let _t_17;
  let _t_18;
  let _t_19;
  let _t_20;
  let _t_21;
  let _t_22;
  let _t_23;
  let _t_24;
  let _t_25;
  let _t_26;
  let _t_27;
  let _t_28;
  let _t_29;
  _t_0 = await __env.readState(0);
  try {
    _t_1 = {};
    _t_2 = await __env.invokeMonitor("com.twitter", { }, "home_timeline", _t_1, false);
    {
      let _iter_tmp = await _t_2.next();
      while (!_iter_tmp.done) {
        _t_3 = _iter_tmp.value;
        _t_4 = _t_3[0];
        _t_5 = _t_3[1];
        _t_6 = _t_5.__response;
        _t_7 = _t_5.text;
        _t_8 = _t_5.hashtags;
        _t_9 = _t_5.urls;
        _t_10 = _t_5.author;
        _t_11 = _t_5.in_reply_to;
        _t_12 = _t_5.tweet_id;
        _t_13 = __builtin.isNewTuple(_t_0, _t_5, ["text", "hashtags", "urls", "author", "in_reply_to", "tweet_id"]);
        _t_14 = __builtin.addTuple(_t_0, _t_5);
        await __env.writeState(0, _t_14);
        _t_0 = _t_14;
        if (_t_13) {
          _t_15 = false;
          try {
            _t_17 = {};
            _t_16 = await __env.invokeQuery("org.thingpedia.builtin.thingengine.builtin", { }, "get_time", _t_17);
            _t_18 = _t_16[Symbol.iterator]();
            {
              let _iter_tmp = await _t_18.next();
              while (!_iter_tmp.done) {
                _t_19 = _iter_tmp.value;
                _t_20 = _t_19[0];
                _t_21 = _t_19[1];
                _t_22 = _t_21.time;
                _t_23 = true;
                _t_25 = __builtin.getTime (_t_22);
                _t_26 = new __builtin.Time(9, 0, 0);
                _t_24 = _t_25 >= _t_26;
                _t_23 = _t_23 && _t_24;
                _t_28 = __builtin.getTime (_t_22);
                _t_29 = new __builtin.Time(10, 0, 0);
                _t_27 = _t_28 <= _t_29;
                _t_23 = _t_23 && _t_27;
                if (_t_23) {
                  _t_15 = true;
                  break;
                } else {

                }
                _iter_tmp = await _t_18.next();
              }
            }
          } catch(_exc_) {
            __env.reportError("Failed to invoke get-predicate query", _exc_);
          }
          if (_t_15) {
            try {
              await __env.output(String(_t_4), _t_5);
            } catch(_exc_) {
              __env.reportError("Failed to invoke action", _exc_);
            }
          } else {

          }
        } else {

        }
        _iter_tmp = await _t_2.next();
      }
    }
  } catch(_exc_) {
    __env.reportError("Failed to invoke trigger", _exc_);
  }`, `"use strict";
  let _t_0;
  let _t_1;
  let _t_2;
  let _t_3;
  let _t_4;
  let _t_5;
  let _t_6;
  let _t_7;
  let _t_8;
  let _t_9;
  let _t_10;
  let _t_11;
  let _t_12;
  let _t_13;
  let _t_14;
  let _t_15;
  let _t_16;
  let _t_17;
  let _t_18;
  let _t_19;
  let _t_20;
  let _t_21;
  let _t_22;
  let _t_23;
  let _t_24;
  let _t_25;
  let _t_26;
  let _t_27;
  let _t_28;
  let _t_29;
  let _t_30;
  let _t_31;
  let _t_32;
  _t_0 = await __env.readState(1);
  try {
    _t_1 = {};
    _t_2 = await __env.invokeMonitor("com.twitter", { }, "home_timeline", _t_1, false);
    {
      let _iter_tmp = await _t_2.next();
      while (!_iter_tmp.done) {
        _t_3 = _iter_tmp.value;
        _t_4 = _t_3[0];
        _t_5 = _t_3[1];
        _t_6 = _t_5.__response;
        _t_7 = _t_5.text;
        _t_8 = _t_5.hashtags;
        _t_9 = _t_5.urls;
        _t_10 = _t_5.author;
        _t_11 = _t_5.in_reply_to;
        _t_12 = _t_5.tweet_id;
        _t_13 = __builtin.isNewTuple(_t_0, _t_5, ["text", "hashtags", "urls", "author", "in_reply_to", "tweet_id"]);
        _t_14 = __builtin.addTuple(_t_0, _t_5);
        await __env.writeState(1, _t_14);
        _t_0 = _t_14;
        if (_t_13) {
          _t_15 = true;
          _t_17 = "lol";
          _t_16 = __builtin.like(_t_7, _t_17);
          _t_15 = _t_15 && _t_16;
          _t_18 = false;
          try {
            _t_20 = {};
            _t_19 = await __env.invokeQuery("org.thingpedia.builtin.thingengine.builtin", { }, "get_time", _t_20);
            _t_21 = _t_19[Symbol.iterator]();
            {
              let _iter_tmp = await _t_21.next();
              while (!_iter_tmp.done) {
                _t_22 = _iter_tmp.value;
                _t_23 = _t_22[0];
                _t_24 = _t_22[1];
                _t_25 = _t_24.time;
                _t_26 = true;
                _t_28 = __builtin.getTime (_t_25);
                _t_29 = new __builtin.Time(9, 0, 0);
                _t_27 = _t_28 >= _t_29;
                _t_26 = _t_26 && _t_27;
                _t_31 = __builtin.getTime (_t_25);
                _t_32 = new __builtin.Time(10, 0, 0);
                _t_30 = _t_31 <= _t_32;
                _t_26 = _t_26 && _t_30;
                if (_t_26) {
                  _t_18 = true;
                  break;
                } else {

                }
                _iter_tmp = await _t_21.next();
              }
            }
          } catch(_exc_) {
            __env.reportError("Failed to invoke get-predicate query", _exc_);
          }
          _t_15 = _t_15 && _t_18;
          if (_t_15) {
            try {
              await __env.output(String(_t_4), _t_5);
            } catch(_exc_) {
              __env.reportError("Failed to invoke action", _exc_);
            }
          } else {

          }
        } else {

        }
        _iter_tmp = await _t_2.next();
      }
    }
  } catch(_exc_) {
    __env.reportError("Failed to invoke trigger", _exc_);
  }`]],

    //26
    [`{
    class @__dyn_0 extends @org.thingpedia.builtin.thingengine.remote {
        action send (in req __principal : Entity(tt:contact), in req __program_id : Entity(tt:program_id), in req __flow : Number, in req __kindChannel : Entity(tt:function), in opt interval : Measure(ms));
    }
    timer(base=makeDate(), interval=10s)  => @__dyn_0.send(__principal="1234"^^tt:contact, __program_id=$event.program_id, __flow=0, __kindChannel=$event.type, interval=10s) ;
}`, [`"use strict";
  let _t_0;
  let _t_1;
  let _t_2;
  let _t_3;
  let _t_4;
  let _t_5;
  let _t_6;
  let _t_7;
  let _t_8;
  let _t_9;
  let _t_10;
  try {
    _t_1 = new Date(XNOWX);
    _t_2 = 10000;
    _t_0 = await __env.invokeTimer(_t_1, _t_2, null);
    {
      let _iter_tmp = await _t_0.next();
      while (!_iter_tmp.done) {
        _t_3 = _iter_tmp.value;
        try {
          _t_4 = {};
          _t_5 = new __builtin.Entity("1234", null);
          _t_4.__principal = _t_5;
          _t_6 = __env.program_id;
          _t_4.__program_id = _t_6;
          _t_7 = 0;
          _t_4.__flow = _t_7;
          _t_4.__kindChannel = null;
          _t_8 = 10000;
          _t_4.interval = _t_8;
          await __env.invokeAction("org.thingpedia.builtin.thingengine.remote", { }, "send", _t_4);
        } catch(_exc_) {
          __env.reportError("Failed to invoke action", _exc_);
        }
        _iter_tmp = await _t_0.next();
      }
    }
  } catch(_exc_) {
    __env.reportError("Failed to invoke timer", _exc_);
  }
  try {
    _t_9 = new __builtin.Entity("1234", null);
    _t_10 = 0;
    await __env.sendEndOfFlow(_t_9, _t_10);
  } catch(_exc_) {
    __env.reportError("Failed to signal end-of-flow", _exc_);
  }`]],


    //27
    [`{
    class @__dyn_0 extends @org.thingpedia.builtin.thingengine.remote {
        monitorable list query receive (in req __principal : Entity(tt:contact), in req __program_id : Entity(tt:program_id), in req __flow : Number, out __kindChannel : Entity(tt:function), out interval : Measure(ms));
    }
    monitor @__dyn_0.receive(__principal="mock-account:12345678"^^tt:contact("me"), __program_id=$event.program_id, __flow=0)  => @security-camera.set_power(power=enum(on)) ;
}`, [`"use strict";
  let _t_0;
  let _t_1;
  let _t_2;
  let _t_3;
  let _t_4;
  let _t_5;
  let _t_6;
  let _t_7;
  let _t_8;
  let _t_9;
  let _t_10;
  let _t_11;
  let _t_12;
  let _t_13;
  let _t_14;
  let _t_15;
  _t_0 = await __env.readState(0);
  try {
    _t_1 = {};
    _t_2 = new __builtin.Entity("mock-account:12345678", "me");
    _t_1.__principal = _t_2;
    _t_3 = __env.program_id;
    _t_1.__program_id = _t_3;
    _t_4 = 0;
    _t_1.__flow = _t_4;
    _t_5 = await __env.invokeMonitor("org.thingpedia.builtin.thingengine.remote", { }, "receive", _t_1, false);
    {
      let _iter_tmp = await _t_5.next();
      while (!_iter_tmp.done) {
        _t_6 = _iter_tmp.value;
        _t_7 = _t_6[0];
        _t_8 = _t_6[1];
        _t_9 = _t_8.__response;
        _t_10 = _t_8.__kindChannel;
        _t_11 = _t_8.interval;
        _t_12 = __builtin.isNewTuple(_t_0, _t_8, ["__kindChannel", "interval"]);
        _t_13 = __builtin.addTuple(_t_0, _t_8);
        await __env.writeState(0, _t_13);
        _t_0 = _t_13;
        if (_t_12) {
          try {
            _t_14 = {};
            _t_15 = "on";
            _t_14.power = _t_15;
            await __env.invokeAction("security-camera", { }, "set_power", _t_14);
          } catch(_exc_) {
            __env.reportError("Failed to invoke action", _exc_);
          }
        } else {

        }
        _iter_tmp = await _t_5.next();
      }
    }
  } catch(_exc_) {
    __env.reportError("Failed to invoke trigger", _exc_);
  }`]],

    //28
    [`monitor (@com.twitter.home_timeline() join @com.bing.web_search(query="foo")) => notify;`,
    [`"use strict";
  let _t_0;
  let _t_1;
  let _t_2;
  let _t_3;
  let _t_4;
  let _t_5;
  let _t_6;
  let _t_7;
  let _t_8;
  let _t_9;
  let _t_10;
  let _t_11;
  let _t_12;
  let _t_13;
  let _t_14;
  let _t_15;
  let _t_16;
  let _t_17;
  let _t_18;
  let _t_19;
  let _t_20;
  let _t_21;
  let _t_22;
  let _t_23;
  let _t_24;
  let _t_25;
  let _t_26;
  let _t_27;
  let _t_28;
  let _t_29;
  let _t_30;
  let _t_31;
  let _t_32;
  let _t_33;
  let _t_34;
  let _t_35;
  let _t_36;
  let _t_37;
  let _t_38;
  let _t_39;
  let _t_40;
  let _t_41;
  let _t_42;
  let _t_43;
  let _t_44;
  let _t_45;
  let _t_46;
  let _t_47;
  _t_0 = await __env.readState(0);
  _t_1 = async function(emit) {
    _t_2 = await __env.readState(1);
    try {
      _t_3 = {};
      _t_4 = await __env.invokeMonitor("com.twitter", { }, "home_timeline", _t_3, false);
      {
        let _iter_tmp = await _t_4.next();
        while (!_iter_tmp.done) {
          _t_5 = _iter_tmp.value;
          _t_6 = _t_5[0];
          _t_7 = _t_5[1];
          _t_8 = _t_7.__response;
          _t_9 = _t_7.text;
          _t_10 = _t_7.hashtags;
          _t_11 = _t_7.urls;
          _t_12 = _t_7.author;
          _t_13 = _t_7.in_reply_to;
          _t_14 = _t_7.tweet_id;
          _t_15 = __builtin.isNewTuple(_t_2, _t_7, ["text", "hashtags", "urls", "author", "in_reply_to", "tweet_id"]);
          _t_16 = __builtin.addTuple(_t_2, _t_7);
          await __env.writeState(1, _t_16);
          _t_2 = _t_16;
          if (_t_15) {
            emit(_t_6, _t_7);
          } else {

          }
          _iter_tmp = await _t_4.next();
        }
      }
    } catch(_exc_) {
      __env.reportError("Failed to invoke trigger", _exc_);
    }
  }
  _t_17 = async function(emit) {
    _t_18 = await __env.readState(2);
    try {
      _t_19 = {};
      _t_20 = "foo";
      _t_19.query = _t_20;
      _t_21 = await __env.invokeMonitor("com.bing", { }, "web_search", _t_19, false);
      {
        let _iter_tmp = await _t_21.next();
        while (!_iter_tmp.done) {
          _t_22 = _iter_tmp.value;
          _t_23 = _t_22[0];
          _t_24 = _t_22[1];
          _t_25 = _t_24.__response;
          _t_26 = _t_24.title;
          _t_27 = _t_24.description;
          _t_28 = _t_24.link;
          _t_29 = __builtin.isNewTuple(_t_18, _t_24, ["title", "description", "link"]);
          _t_30 = __builtin.addTuple(_t_18, _t_24);
          await __env.writeState(2, _t_30);
          _t_18 = _t_30;
          if (_t_29) {
            emit(_t_23, _t_24);
          } else {

          }
          _iter_tmp = await _t_21.next();
        }
      }
    } catch(_exc_) {
      __env.reportError("Failed to invoke trigger", _exc_);
    }
  }
  _t_31 = __builtin.streamUnion(_t_1, _t_17);
  {
    let _iter_tmp = await _t_31.next();
    while (!_iter_tmp.done) {
      _t_32 = _iter_tmp.value;
      _t_33 = _t_32[0];
      _t_34 = _t_32[1];
      _t_35 = _t_34.query;
      _t_36 = _t_34.__response;
      _t_37 = _t_34.title;
      _t_38 = _t_34.description;
      _t_39 = _t_34.link;
      _t_40 = _t_34.text;
      _t_41 = _t_34.hashtags;
      _t_42 = _t_34.urls;
      _t_43 = _t_34.author;
      _t_44 = _t_34.in_reply_to;
      _t_45 = _t_34.tweet_id;
      _t_46 = __builtin.isNewTuple(_t_0, _t_34, ["title", "description", "link", "text", "hashtags", "urls", "author", "in_reply_to", "tweet_id"]);
      _t_47 = __builtin.addTuple(_t_0, _t_34);
      await __env.writeState(0, _t_47);
      _t_0 = _t_47;
      if (_t_46) {
        try {
          await __env.output(String(_t_33), _t_34);
        } catch(_exc_) {
          __env.reportError("Failed to invoke action", _exc_);
        }
      } else {

      }
      _iter_tmp = await _t_31.next();
    }
  }`]],

    //29
    [`monitor (@com.twitter.home_timeline() join @com.bing.web_search(query="foo")), text =~ "lol" => notify;`,
    [`"use strict";
  let _t_0;
  let _t_1;
  let _t_2;
  let _t_3;
  let _t_4;
  let _t_5;
  let _t_6;
  let _t_7;
  let _t_8;
  let _t_9;
  let _t_10;
  let _t_11;
  let _t_12;
  let _t_13;
  let _t_14;
  let _t_15;
  let _t_16;
  let _t_17;
  let _t_18;
  let _t_19;
  let _t_20;
  let _t_21;
  let _t_22;
  let _t_23;
  let _t_24;
  let _t_25;
  let _t_26;
  let _t_27;
  let _t_28;
  let _t_29;
  let _t_30;
  let _t_31;
  let _t_32;
  let _t_33;
  let _t_34;
  let _t_35;
  let _t_36;
  let _t_37;
  let _t_38;
  let _t_39;
  let _t_40;
  let _t_41;
  let _t_42;
  let _t_43;
  let _t_44;
  let _t_45;
  let _t_46;
  let _t_47;
  let _t_48;
  let _t_49;
  _t_0 = await __env.readState(0);
  _t_1 = async function(emit) {
    _t_2 = await __env.readState(1);
    try {
      _t_3 = {};
      _t_4 = await __env.invokeMonitor("com.twitter", { }, "home_timeline", _t_3, false);
      {
        let _iter_tmp = await _t_4.next();
        while (!_iter_tmp.done) {
          _t_5 = _iter_tmp.value;
          _t_6 = _t_5[0];
          _t_7 = _t_5[1];
          _t_8 = _t_7.__response;
          _t_9 = _t_7.text;
          _t_10 = _t_7.hashtags;
          _t_11 = _t_7.urls;
          _t_12 = _t_7.author;
          _t_13 = _t_7.in_reply_to;
          _t_14 = _t_7.tweet_id;
          _t_15 = __builtin.isNewTuple(_t_2, _t_7, ["text", "hashtags", "urls", "author", "in_reply_to", "tweet_id"]);
          _t_16 = __builtin.addTuple(_t_2, _t_7);
          await __env.writeState(1, _t_16);
          _t_2 = _t_16;
          if (_t_15) {
            emit(_t_6, _t_7);
          } else {

          }
          _iter_tmp = await _t_4.next();
        }
      }
    } catch(_exc_) {
      __env.reportError("Failed to invoke trigger", _exc_);
    }
  }
  _t_17 = async function(emit) {
    _t_18 = await __env.readState(2);
    try {
      _t_19 = {};
      _t_20 = "foo";
      _t_19.query = _t_20;
      _t_21 = await __env.invokeMonitor("com.bing", { }, "web_search", _t_19, false);
      {
        let _iter_tmp = await _t_21.next();
        while (!_iter_tmp.done) {
          _t_22 = _iter_tmp.value;
          _t_23 = _t_22[0];
          _t_24 = _t_22[1];
          _t_25 = _t_24.__response;
          _t_26 = _t_24.title;
          _t_27 = _t_24.description;
          _t_28 = _t_24.link;
          _t_29 = __builtin.isNewTuple(_t_18, _t_24, ["title", "description", "link"]);
          _t_30 = __builtin.addTuple(_t_18, _t_24);
          await __env.writeState(2, _t_30);
          _t_18 = _t_30;
          if (_t_29) {
            emit(_t_23, _t_24);
          } else {

          }
          _iter_tmp = await _t_21.next();
        }
      }
    } catch(_exc_) {
      __env.reportError("Failed to invoke trigger", _exc_);
    }
  }
  _t_31 = __builtin.streamUnion(_t_1, _t_17);
  {
    let _iter_tmp = await _t_31.next();
    while (!_iter_tmp.done) {
      _t_32 = _iter_tmp.value;
      _t_33 = _t_32[0];
      _t_34 = _t_32[1];
      _t_35 = _t_34.query;
      _t_36 = _t_34.__response;
      _t_37 = _t_34.title;
      _t_38 = _t_34.description;
      _t_39 = _t_34.link;
      _t_40 = _t_34.text;
      _t_41 = _t_34.hashtags;
      _t_42 = _t_34.urls;
      _t_43 = _t_34.author;
      _t_44 = _t_34.in_reply_to;
      _t_45 = _t_34.tweet_id;
      _t_46 = __builtin.isNewTuple(_t_0, _t_34, ["title", "description", "link", "text", "hashtags", "urls", "author", "in_reply_to", "tweet_id"]);
      _t_47 = __builtin.addTuple(_t_0, _t_34);
      await __env.writeState(0, _t_47);
      _t_0 = _t_47;
      if (_t_46) {
        _t_49 = "lol";
        _t_48 = __builtin.like(_t_40, _t_49);
        if (_t_48) {
          try {
            await __env.output(String(_t_33), _t_34);
          } catch(_exc_) {
            __env.reportError("Failed to invoke action", _exc_);
          }
        } else {

        }
      } else {

      }
      _iter_tmp = await _t_31.next();
    }
  }
`]],

    //30
    [`now => @com.twitter.home_timeline() join @com.bing.web_search() on (query=text) => notify;`,
    [`"use strict";
  let _t_0;
  let _t_1;
  let _t_2;
  let _t_3;
  let _t_4;
  let _t_5;
  let _t_6;
  let _t_7;
  let _t_8;
  let _t_9;
  let _t_10;
  let _t_11;
  let _t_12;
  let _t_13;
  let _t_14;
  let _t_15;
  let _t_16;
  let _t_17;
  let _t_18;
  let _t_19;
  let _t_20;
  let _t_21;
  let _t_22;
  let _t_23;
  let _t_24;
  let _t_25;
  let _t_26;
  let _t_27;
  let _t_28;
  let _t_29;
  let _t_30;
  let _t_31;
  let _t_32;
  let _t_33;
  let _t_34;
  let _t_35;
  try {
    _t_0 = {};
    _t_1 = await __env.invokeQuery("com.twitter", { }, "home_timeline", _t_0);
    _t_2 = _t_1[Symbol.iterator]();
    {
      let _iter_tmp = await _t_2.next();
      while (!_iter_tmp.done) {
        _t_3 = _iter_tmp.value;
        _t_4 = _t_3[0];
        _t_5 = _t_3[1];
        _t_6 = _t_5.__response;
        _t_7 = _t_5.text;
        _t_8 = _t_5.hashtags;
        _t_9 = _t_5.urls;
        _t_10 = _t_5.author;
        _t_11 = _t_5.in_reply_to;
        _t_12 = _t_5.tweet_id;
        try {
          _t_13 = {};
          _t_13.query = _t_7;
          _t_14 = await __env.invokeQuery("com.bing", { }, "web_search", _t_13);
          _t_15 = _t_14[Symbol.iterator]();
          {
            let _iter_tmp = await _t_15.next();
            while (!_iter_tmp.done) {
              _t_16 = _iter_tmp.value;
              _t_17 = _t_16[0];
              _t_18 = _t_16[1];
              _t_19 = _t_18.__response;
              _t_20 = _t_18.title;
              _t_21 = _t_18.description;
              _t_22 = _t_18.link;
              _t_23 = __builtin.combineOutputTypes(_t_4, _t_17);
              _t_24 = {};
              _t_24.query = _t_7;
              _t_24.__response = _t_19;
              _t_24.title = _t_20;
              _t_24.description = _t_21;
              _t_24.link = _t_22;
              _t_24.text = _t_7;
              _t_24.hashtags = _t_8;
              _t_24.urls = _t_9;
              _t_24.author = _t_10;
              _t_24.in_reply_to = _t_11;
              _t_24.tweet_id = _t_12;
              _t_25 = _t_24.query;
              _t_26 = _t_24.__response;
              _t_27 = _t_24.title;
              _t_28 = _t_24.description;
              _t_29 = _t_24.link;
              _t_30 = _t_24.text;
              _t_31 = _t_24.hashtags;
              _t_32 = _t_24.urls;
              _t_33 = _t_24.author;
              _t_34 = _t_24.in_reply_to;
              _t_35 = _t_24.tweet_id;
              try {
                await __env.output(String(_t_23), _t_24);
              } catch(_exc_) {
                __env.reportError("Failed to invoke action", _exc_);
              }
              _iter_tmp = await _t_15.next();
            }
          }
        } catch(_exc_) {
          __env.reportError("Failed to invoke query", _exc_);
        }
        _iter_tmp = await _t_2.next();
      }
    }
  } catch(_exc_) {
    __env.reportError("Failed to invoke query", _exc_);
  }`]],

    //31
    [`now => @com.twitter.home_timeline() join @com.bing.web_search(query="foo") => notify;`,
    [`"use strict";
  let _t_0;
  let _t_1;
  let _t_2;
  let _t_3;
  let _t_4;
  let _t_5;
  let _t_6;
  let _t_7;
  let _t_8;
  let _t_9;
  let _t_10;
  let _t_11;
  let _t_12;
  let _t_13;
  let _t_14;
  let _t_15;
  let _t_16;
  let _t_17;
  let _t_18;
  let _t_19;
  let _t_20;
  let _t_21;
  let _t_22;
  let _t_23;
  let _t_24;
  let _t_25;
  let _t_26;
  let _t_27;
  let _t_28;
  let _t_29;
  let _t_30;
  let _t_31;
  let _t_32;
  let _t_33;
  let _t_34;
  let _t_35;
  let _t_36;
  let _t_37;
  let _t_38;
  let _t_39;
  let _t_40;
  _t_0 = async function(emit) {
    try {
      _t_1 = {};
      _t_2 = await __env.invokeQuery("com.twitter", { }, "home_timeline", _t_1);
      _t_3 = _t_2[Symbol.iterator]();
      {
        let _iter_tmp = await _t_3.next();
        while (!_iter_tmp.done) {
          _t_4 = _iter_tmp.value;
          _t_5 = _t_4[0];
          _t_6 = _t_4[1];
          _t_7 = _t_6.__response;
          _t_8 = _t_6.text;
          _t_9 = _t_6.hashtags;
          _t_10 = _t_6.urls;
          _t_11 = _t_6.author;
          _t_12 = _t_6.in_reply_to;
          _t_13 = _t_6.tweet_id;
          emit(_t_5, _t_6);
          _iter_tmp = await _t_3.next();
        }
      }
    } catch(_exc_) {
      __env.reportError("Failed to invoke query", _exc_);
    }
  }
  _t_14 = async function(emit) {
    try {
      _t_15 = {};
      _t_16 = "foo";
      _t_15.query = _t_16;
      _t_17 = await __env.invokeQuery("com.bing", { }, "web_search", _t_15);
      _t_18 = _t_17[Symbol.iterator]();
      {
        let _iter_tmp = await _t_18.next();
        while (!_iter_tmp.done) {
          _t_19 = _iter_tmp.value;
          _t_20 = _t_19[0];
          _t_21 = _t_19[1];
          _t_22 = _t_21.__response;
          _t_23 = _t_21.title;
          _t_24 = _t_21.description;
          _t_25 = _t_21.link;
          emit(_t_20, _t_21);
          _iter_tmp = await _t_18.next();
        }
      }
    } catch(_exc_) {
      __env.reportError("Failed to invoke query", _exc_);
    }
  }
  _t_26 = __builtin.tableCrossJoin(_t_0, _t_14);
  {
    let _iter_tmp = await _t_26.next();
    while (!_iter_tmp.done) {
      _t_27 = _iter_tmp.value;
      _t_28 = _t_27[0];
      _t_29 = _t_27[1];
      _t_30 = _t_29.query;
      _t_31 = _t_29.__response;
      _t_32 = _t_29.title;
      _t_33 = _t_29.description;
      _t_34 = _t_29.link;
      _t_35 = _t_29.text;
      _t_36 = _t_29.hashtags;
      _t_37 = _t_29.urls;
      _t_38 = _t_29.author;
      _t_39 = _t_29.in_reply_to;
      _t_40 = _t_29.tweet_id;
      try {
        await __env.output(String(_t_28), _t_29);
      } catch(_exc_) {
        __env.reportError("Failed to invoke action", _exc_);
      }
      _iter_tmp = await _t_26.next();
    }
  }`]],

    //32
    [`(attimer(time=makeTime(20, 10)) join @com.thecatapi(id="com.thecatapi").get()) => @com.gmail(id="xxxx").send_picture(to="xxxx"^^tt:email_address, subject="xxx", message="xxx", picture_url=picture_url);`,
  [`"use strict";
  let _t_0;
  let _t_1;
  let _t_2;
  let _t_3;
  let _t_4;
  let _t_5;
  let _t_6;
  let _t_7;
  let _t_8;
  let _t_9;
  let _t_10;
  let _t_11;
  let _t_12;
  let _t_13;
  let _t_14;
  let _t_15;
  let _t_16;
  let _t_17;
  let _t_18;
  let _t_19;
  let _t_20;
  let _t_21;
  let _t_22;
  let _t_23;
  let _t_24;
  let _t_25;
  try {
    _t_1 = new Array(1);
    _t_2 = new __builtin.Time(20, 10, 0);
    _t_1[0] = _t_2;
    _t_0 = await __env.invokeAtTimer(_t_1, null);
    {
      let _iter_tmp = await _t_0.next();
      while (!_iter_tmp.done) {
        _t_3 = _iter_tmp.value;
        try {
          _t_4 = {};
          _t_5 = await __env.invokeQuery("com.thecatapi", { id: "com.thecatapi", }, "get", _t_4);
          _t_6 = _t_5[Symbol.iterator]();
          {
            let _iter_tmp = await _t_6.next();
            while (!_iter_tmp.done) {
              _t_7 = _iter_tmp.value;
              _t_8 = _t_7[0];
              _t_9 = _t_7[1];
              _t_10 = _t_9.count;
              _t_11 = _t_9.__response;
              _t_12 = _t_9.image_id;
              _t_13 = _t_9.picture_url;
              _t_14 = _t_9.link;
              _t_15 = {};
              _t_15.count = _t_10;
              _t_15.__response = _t_11;
              _t_15.image_id = _t_12;
              _t_15.picture_url = _t_13;
              _t_15.link = _t_14;
              _t_16 = _t_15.count;
              _t_17 = _t_15.__response;
              _t_18 = _t_15.image_id;
              _t_19 = _t_15.picture_url;
              _t_20 = _t_15.link;
              try {
                _t_21 = {};
                _t_22 = new __builtin.Entity("xxxx", null);
                _t_21.to = _t_22;
                _t_23 = "xxx";
                _t_21.subject = _t_23;
                _t_24 = "xxx";
                _t_21.message = _t_24;
                _t_25 = String (_t_19);
                _t_21.picture_url = _t_25;
                await __env.invokeAction("com.gmail", { id: "xxxx", }, "send_picture", _t_21);
              } catch(_exc_) {
                __env.reportError("Failed to invoke action", _exc_);
              }
              _iter_tmp = await _t_6.next();
            }
          }
        } catch(_exc_) {
          __env.reportError("Failed to invoke query", _exc_);
        }
        _iter_tmp = await _t_0.next();
      }
    }
  } catch(_exc_) {
    __env.reportError("Failed to invoke at-timer", _exc_);
  }`]],

    //33
    [`{
    class @__dyn_0 extends @org.thingpedia.builtin.thingengine.remote {
        action send (in req __principal : Entity(tt:contact), in req __program_id : Entity(tt:program_id), in req __flow : Number, in req __kindChannel : Entity(tt:function), in req data : String);
    }
    now => @org.thingpedia.builtin.test(id="org.thingpedia.builtin.test").get_data(size=10byte, count=1) => @__dyn_0(id="org.thingpedia.builtin.thingengine.remote").send(__principal="matrix-account:@gcampax2:matrix.org"^^tt:contact, __program_id=$event.program_id, __flow=0, __kindChannel=$event.type, data=data);
}`, [`"use strict";
  let _t_0;
  let _t_1;
  let _t_2;
  let _t_3;
  let _t_4;
  let _t_5;
  let _t_6;
  let _t_7;
  let _t_8;
  let _t_9;
  let _t_10;
  let _t_11;
  let _t_12;
  let _t_13;
  let _t_14;
  let _t_15;
  try {
    _t_0 = {};
    _t_1 = 10;
    _t_0.size = _t_1;
    _t_2 = 1;
    _t_0.count = _t_2;
    _t_3 = await __env.invokeQuery("org.thingpedia.builtin.test", { id: "org.thingpedia.builtin.test", }, "get_data", _t_0);
    _t_4 = _t_3[Symbol.iterator]();
    {
      let _iter_tmp = await _t_4.next();
      while (!_iter_tmp.done) {
        _t_5 = _iter_tmp.value;
        _t_6 = _t_5[0];
        _t_7 = _t_5[1];
        _t_8 = _t_7.__response;
        _t_9 = _t_7.data;
        try {
          _t_10 = {};
          _t_11 = new __builtin.Entity("matrix-account:@gcampax2:matrix.org", null);
          _t_10.__principal = _t_11;
          _t_12 = __env.program_id;
          _t_10.__program_id = _t_12;
          _t_13 = 0;
          _t_10.__flow = _t_13;
          _t_10.__kindChannel = _t_6;
          _t_10.data = _t_9;
          await __env.invokeAction("org.thingpedia.builtin.thingengine.remote", { id: "org.thingpedia.builtin.thingengine.remote", }, "send", _t_10);
        } catch(_exc_) {
          __env.reportError("Failed to invoke action", _exc_);
        }
        _iter_tmp = await _t_4.next();
      }
    }
  } catch(_exc_) {
    __env.reportError("Failed to invoke query", _exc_);
  }
  try {
    _t_14 = new __builtin.Entity("matrix-account:@gcampax2:matrix.org", null);
    _t_15 = 0;
    await __env.sendEndOfFlow(_t_14, _t_15);
  } catch(_exc_) {
    __env.reportError("Failed to signal end-of-flow", _exc_);
  }`]],

    //34
    [`timer(base=makeDate(), interval=1h) join @com.twitter.search(), text =~ "lol" => notify;`,
    [`"use strict";
  let _t_0;
  let _t_1;
  let _t_2;
  let _t_3;
  let _t_4;
  let _t_5;
  let _t_6;
  let _t_7;
  let _t_8;
  let _t_9;
  let _t_10;
  let _t_11;
  let _t_12;
  let _t_13;
  let _t_14;
  let _t_15;
  let _t_16;
  let _t_17;
  let _t_18;
  let _t_19;
  let _t_20;
  let _t_21;
  let _t_22;
  let _t_23;
  let _t_24;
  let _t_25;
  let _t_26;
  let _t_27;
  let _t_28;
  try {
    _t_1 = new Date(XNOWX);
    _t_2 = 3600000;
    _t_0 = await __env.invokeTimer(_t_1, _t_2, null);
    {
      let _iter_tmp = await _t_0.next();
      while (!_iter_tmp.done) {
        _t_3 = _iter_tmp.value;
        try {
          _t_4 = {};
          _t_5 = await __env.invokeQuery("com.twitter", { }, "search", _t_4);
          _t_6 = _t_5[Symbol.iterator]();
          {
            let _iter_tmp = await _t_6.next();
            while (!_iter_tmp.done) {
              _t_7 = _iter_tmp.value;
              _t_8 = _t_7[0];
              _t_9 = _t_7[1];
              _t_10 = _t_9.count;
              _t_11 = _t_9.__response;
              _t_12 = _t_9.text;
              _t_13 = _t_9.hashtags;
              _t_14 = _t_9.urls;
              _t_15 = _t_9.author;
              _t_16 = _t_9.in_reply_to;
              _t_17 = _t_9.tweet_id;
              _t_19 = "lol";
              _t_18 = __builtin.like(_t_12, _t_19);
              if (_t_18) {
                _t_20 = {};
                _t_20.count = _t_10;
                _t_20.__response = _t_11;
                _t_20.text = _t_12;
                _t_20.hashtags = _t_13;
                _t_20.urls = _t_14;
                _t_20.author = _t_15;
                _t_20.in_reply_to = _t_16;
                _t_20.tweet_id = _t_17;
                _t_21 = _t_20.count;
                _t_22 = _t_20.__response;
                _t_23 = _t_20.text;
                _t_24 = _t_20.hashtags;
                _t_25 = _t_20.urls;
                _t_26 = _t_20.author;
                _t_27 = _t_20.in_reply_to;
                _t_28 = _t_20.tweet_id;
                try {
                  await __env.output(String(_t_8), _t_20);
                } catch(_exc_) {
                  __env.reportError("Failed to invoke action", _exc_);
                }
              } else {

              }
              _iter_tmp = await _t_6.next();
            }
          }
        } catch(_exc_) {
          __env.reportError("Failed to invoke query", _exc_);
        }
        _iter_tmp = await _t_0.next();
      }
    }
  } catch(_exc_) {
    __env.reportError("Failed to invoke timer", _exc_);
  }`]],

    //35
    [`{
    now => @com.twitter.post_picture(picture_url="file:///home/gcampagn/Pictures/Me/me%202016.jpg"^^tt:picture, caption="lol");
}`,
  [`"use strict";
  let _t_0;
  let _t_1;
  let _t_2;
  let _t_3;
  try {
    _t_0 = {};
    _t_1 = new __builtin.Entity("file:///home/gcampagn/Pictures/Me/me%202016.jpg", null);
    _t_2 = String (_t_1);
    _t_0.picture_url = _t_2;
    _t_3 = "lol";
    _t_0.caption = _t_3;
    await __env.invokeAction("com.twitter", { }, "post_picture", _t_0);
  } catch(_exc_) {
    __env.reportError("Failed to invoke action", _exc_);
  }`]],

    //36
    [`{
    now => aggregate count of @com.bing.web_search(query="dogs") => notify;
}`,
  [`"use strict";
  let _t_0;
  let _t_1;
  let _t_2;
  let _t_3;
  let _t_4;
  let _t_5;
  let _t_6;
  let _t_7;
  let _t_8;
  let _t_9;
  let _t_10;
  let _t_11;
  let _t_12;
  let _t_13;
  let _t_14;
  let _t_15;
  _t_0 = 0;
  try {
    _t_1 = {};
    _t_2 = "dogs";
    _t_1.query = _t_2;
    _t_3 = await __env.invokeQuery("com.bing", { }, "web_search", _t_1);
    _t_4 = _t_3[Symbol.iterator]();
    {
      let _iter_tmp = await _t_4.next();
      while (!_iter_tmp.done) {
        _t_5 = _iter_tmp.value;
        _t_6 = _t_5[0];
        _t_7 = _t_5[1];
        _t_8 = _t_7.__response;
        _t_9 = _t_7.title;
        _t_10 = _t_7.description;
        _t_11 = _t_7.link;
        _t_12 = 1;
        _t_0 = _t_0 + _t_12;
        _iter_tmp = await _t_4.next();
      }
    }
  } catch(_exc_) {
    __env.reportError("Failed to invoke query", _exc_);
  }
  _t_14 = "count";
  _t_13 = __builtin.aggregateOutputType(_t_14, _t_6);
  _t_15 = {};
  _t_15.count = _t_0;
  try {
    await __env.output(String(_t_13), _t_15);
  } catch(_exc_) {
    __env.reportError("Failed to invoke action", _exc_);
  }`]],

    //37
    [`{
    timer(base=makeDate(),interval=1h) => aggregate count of @com.bing.web_search(query="dogs") => notify;
}`,
  [`"use strict";
  let _t_0;
  let _t_1;
  let _t_2;
  let _t_3;
  let _t_4;
  let _t_5;
  let _t_6;
  let _t_7;
  let _t_8;
  let _t_9;
  let _t_10;
  let _t_11;
  let _t_12;
  let _t_13;
  let _t_14;
  let _t_15;
  let _t_16;
  let _t_17;
  let _t_18;
  let _t_19;
  let _t_20;
  let _t_21;
  try {
    _t_1 = new Date(XNOWX);
    _t_2 = 3600000;
    _t_0 = await __env.invokeTimer(_t_1, _t_2, null);
    {
      let _iter_tmp = await _t_0.next();
      while (!_iter_tmp.done) {
        _t_3 = _iter_tmp.value;
        _t_4 = 0;
        try {
          _t_5 = {};
          _t_6 = "dogs";
          _t_5.query = _t_6;
          _t_7 = await __env.invokeQuery("com.bing", { }, "web_search", _t_5);
          _t_8 = _t_7[Symbol.iterator]();
          {
            let _iter_tmp = await _t_8.next();
            while (!_iter_tmp.done) {
              _t_9 = _iter_tmp.value;
              _t_10 = _t_9[0];
              _t_11 = _t_9[1];
              _t_12 = _t_11.__response;
              _t_13 = _t_11.title;
              _t_14 = _t_11.description;
              _t_15 = _t_11.link;
              _t_16 = 1;
              _t_4 = _t_4 + _t_16;
              _iter_tmp = await _t_8.next();
            }
          }
        } catch(_exc_) {
          __env.reportError("Failed to invoke query", _exc_);
        }
        _t_18 = "count";
        _t_17 = __builtin.aggregateOutputType(_t_18, _t_10);
        _t_19 = {};
        _t_19.count = _t_4;
        _t_20 = {};
        _t_20.count = _t_4;
        _t_21 = _t_20.count;
        try {
          await __env.output(String(_t_17), _t_20);
        } catch(_exc_) {
          __env.reportError("Failed to invoke action", _exc_);
        }
        _iter_tmp = await _t_0.next();
      }
    }
  } catch(_exc_) {
    __env.reportError("Failed to invoke timer", _exc_);
  }`]],

    //38
    [`{
    timer(base=makeDate(),interval=1h) => aggregate count mime_type of @com.google.drive.list_drive_files() => notify;
}`,
  [`"use strict";
  let _t_0;
  let _t_1;
  let _t_2;
  let _t_3;
  let _t_4;
  let _t_5;
  let _t_6;
  let _t_7;
  let _t_8;
  let _t_9;
  let _t_10;
  let _t_11;
  let _t_12;
  let _t_13;
  let _t_14;
  let _t_15;
  let _t_16;
  let _t_17;
  let _t_18;
  let _t_19;
  let _t_20;
  let _t_21;
  let _t_22;
  let _t_23;
  let _t_24;
  let _t_25;
  let _t_26;
  let _t_27;
  let _t_28;
  try {
    _t_1 = new Date(XNOWX);
    _t_2 = 3600000;
    _t_0 = await __env.invokeTimer(_t_1, _t_2, null);
    {
      let _iter_tmp = await _t_0.next();
      while (!_iter_tmp.done) {
        _t_3 = _iter_tmp.value;
        _t_4 = new __builtin.EqualitySet();
        try {
          _t_5 = {};
          _t_6 = await __env.invokeQuery("com.google.drive", { }, "list_drive_files", _t_5);
          _t_7 = _t_6[Symbol.iterator]();
          {
            let _iter_tmp = await _t_7.next();
            while (!_iter_tmp.done) {
              _t_8 = _iter_tmp.value;
              _t_9 = _t_8[0];
              _t_10 = _t_8[1];
              _t_11 = _t_10.order_by;
              _t_12 = _t_10.__response;
              _t_13 = _t_10.file_id;
              _t_14 = _t_10.file_name;
              _t_15 = _t_10.mime_type;
              _t_16 = _t_10.description;
              _t_17 = _t_10.starred;
              _t_18 = _t_10.created_time;
              _t_19 = _t_10.modified_time;
              _t_20 = _t_10.file_size;
              _t_21 = _t_10.last_modified_by;
              _t_22 = _t_10.link;
              _t_4.add(_t_10);
              _iter_tmp = await _t_7.next();
            }
          }
        } catch(_exc_) {
          __env.reportError("Failed to invoke query", _exc_);
        }
        _t_24 = "count";
        _t_23 = __builtin.aggregateOutputType(_t_24, _t_9);
        _t_25 = {};
        _t_26 = _t_4.size;
        _t_25.mime_type = _t_26;
        _t_27 = {};
        _t_27.mime_type = _t_26;
        _t_28 = _t_27.mime_type;
        try {
          await __env.output(String(_t_23), _t_27);
        } catch(_exc_) {
          __env.reportError("Failed to invoke action", _exc_);
        }
        _iter_tmp = await _t_0.next();
      }
    }
  } catch(_exc_) {
    __env.reportError("Failed to invoke timer", _exc_);
  }`]],

    //39
    [`{
    timer(base=makeDate(),interval=1h) => aggregate avg file_size of @com.google.drive.list_drive_files() => notify;
}`,
  [`"use strict";
  let _t_0;
  let _t_1;
  let _t_2;
  let _t_3;
  let _t_4;
  let _t_5;
  let _t_6;
  let _t_7;
  let _t_8;
  let _t_9;
  let _t_10;
  let _t_11;
  let _t_12;
  let _t_13;
  let _t_14;
  let _t_15;
  let _t_16;
  let _t_17;
  let _t_18;
  let _t_19;
  let _t_20;
  let _t_21;
  let _t_22;
  let _t_23;
  let _t_24;
  let _t_25;
  let _t_26;
  let _t_27;
  let _t_28;
  let _t_29;
  let _t_30;
  try {
    _t_1 = new Date(XNOWX);
    _t_2 = 3600000;
    _t_0 = await __env.invokeTimer(_t_1, _t_2, null);
    {
      let _iter_tmp = await _t_0.next();
      while (!_iter_tmp.done) {
        _t_3 = _iter_tmp.value;
        _t_5 = 0;
        _t_4 = 0;
        try {
          _t_6 = {};
          _t_7 = await __env.invokeQuery("com.google.drive", { }, "list_drive_files", _t_6);
          _t_8 = _t_7[Symbol.iterator]();
          {
            let _iter_tmp = await _t_8.next();
            while (!_iter_tmp.done) {
              _t_9 = _iter_tmp.value;
              _t_10 = _t_9[0];
              _t_11 = _t_9[1];
              _t_12 = _t_11.order_by;
              _t_13 = _t_11.__response;
              _t_14 = _t_11.file_id;
              _t_15 = _t_11.file_name;
              _t_16 = _t_11.mime_type;
              _t_17 = _t_11.description;
              _t_18 = _t_11.starred;
              _t_19 = _t_11.created_time;
              _t_20 = _t_11.modified_time;
              _t_21 = _t_11.file_size;
              _t_22 = _t_11.last_modified_by;
              _t_23 = _t_11.link;
              _t_24 = 1;
              _t_4 = _t_4 + _t_24;
              _t_5 = _t_5 + _t_21;
              _iter_tmp = await _t_8.next();
            }
          }
        } catch(_exc_) {
          __env.reportError("Failed to invoke query", _exc_);
        }
        _t_26 = "avg";
        _t_25 = __builtin.aggregateOutputType(_t_26, _t_10);
        _t_27 = {};
        _t_28 = _t_5 / _t_4;
        _t_27.file_size = _t_28;
        _t_29 = {};
        _t_29.file_size = _t_28;
        _t_30 = _t_29.file_size;
        try {
          await __env.output(String(_t_25), _t_29);
        } catch(_exc_) {
          __env.reportError("Failed to invoke action", _exc_);
        }
        _iter_tmp = await _t_0.next();
      }
    }
  } catch(_exc_) {
    __env.reportError("Failed to invoke timer", _exc_);
  }`]],

    //40
    [`{
    timer(base=makeDate(),interval=1h) => aggregate max file_size of @com.google.drive.list_drive_files() => notify;
}`,
  [`"use strict";
  let _t_0;
  let _t_1;
  let _t_2;
  let _t_3;
  let _t_4;
  let _t_5;
  let _t_6;
  let _t_7;
  let _t_8;
  let _t_9;
  let _t_10;
  let _t_11;
  let _t_12;
  let _t_13;
  let _t_14;
  let _t_15;
  let _t_16;
  let _t_17;
  let _t_18;
  let _t_19;
  let _t_20;
  let _t_21;
  let _t_22;
  let _t_23;
  let _t_24;
  let _t_25;
  let _t_26;
  let _t_27;
  try {
    _t_1 = new Date(XNOWX);
    _t_2 = 3600000;
    _t_0 = await __env.invokeTimer(_t_1, _t_2, null);
    {
      let _iter_tmp = await _t_0.next();
      while (!_iter_tmp.done) {
        _t_3 = _iter_tmp.value;
        _t_4 = -Infinity;
        try {
          _t_5 = {};
          _t_6 = await __env.invokeQuery("com.google.drive", { }, "list_drive_files", _t_5);
          _t_7 = _t_6[Symbol.iterator]();
          {
            let _iter_tmp = await _t_7.next();
            while (!_iter_tmp.done) {
              _t_8 = _iter_tmp.value;
              _t_9 = _t_8[0];
              _t_10 = _t_8[1];
              _t_11 = _t_10.order_by;
              _t_12 = _t_10.__response;
              _t_13 = _t_10.file_id;
              _t_14 = _t_10.file_name;
              _t_15 = _t_10.mime_type;
              _t_16 = _t_10.description;
              _t_17 = _t_10.starred;
              _t_18 = _t_10.created_time;
              _t_19 = _t_10.modified_time;
              _t_20 = _t_10.file_size;
              _t_21 = _t_10.last_modified_by;
              _t_22 = _t_10.link;
              _t_4 = __builtin.max(_t_4, _t_20);
              _iter_tmp = await _t_7.next();
            }
          }
        } catch(_exc_) {
          __env.reportError("Failed to invoke query", _exc_);
        }
        _t_24 = "max";
        _t_23 = __builtin.aggregateOutputType(_t_24, _t_9);
        _t_25 = {};
        _t_25.file_size = _t_4;
        _t_26 = {};
        _t_26.file_size = _t_4;
        _t_27 = _t_26.file_size;
        try {
          await __env.output(String(_t_23), _t_26);
        } catch(_exc_) {
          __env.reportError("Failed to invoke action", _exc_);
        }
        _iter_tmp = await _t_0.next();
      }
    }
  } catch(_exc_) {
    __env.reportError("Failed to invoke timer", _exc_);
  }`]],

    //41
    [`{
    now => @com.google.drive.list_drive_files() join aggregate max file_size of @com.google.drive.list_drive_files() => notify;
}` ,
    [`"use strict";
  let _t_0;
  let _t_1;
  let _t_2;
  let _t_3;
  let _t_4;
  let _t_5;
  let _t_6;
  let _t_7;
  let _t_8;
  let _t_9;
  let _t_10;
  let _t_11;
  let _t_12;
  let _t_13;
  let _t_14;
  let _t_15;
  let _t_16;
  let _t_17;
  let _t_18;
  let _t_19;
  let _t_20;
  let _t_21;
  let _t_22;
  let _t_23;
  let _t_24;
  let _t_25;
  let _t_26;
  let _t_27;
  let _t_28;
  let _t_29;
  let _t_30;
  let _t_31;
  let _t_32;
  let _t_33;
  let _t_34;
  let _t_35;
  let _t_36;
  let _t_37;
  let _t_38;
  let _t_39;
  let _t_40;
  let _t_41;
  let _t_42;
  let _t_43;
  let _t_44;
  let _t_45;
  let _t_46;
  let _t_47;
  let _t_48;
  let _t_49;
  let _t_50;
  let _t_51;
  let _t_52;
  let _t_53;
  let _t_54;
  let _t_55;
  let _t_56;
  let _t_57;
  _t_0 = async function(emit) {
    try {
      _t_1 = {};
      _t_2 = await __env.invokeQuery("com.google.drive", { }, "list_drive_files", _t_1);
      _t_3 = _t_2[Symbol.iterator]();
      {
        let _iter_tmp = await _t_3.next();
        while (!_iter_tmp.done) {
          _t_4 = _iter_tmp.value;
          _t_5 = _t_4[0];
          _t_6 = _t_4[1];
          _t_7 = _t_6.order_by;
          _t_8 = _t_6.__response;
          _t_9 = _t_6.file_id;
          _t_10 = _t_6.file_name;
          _t_11 = _t_6.mime_type;
          _t_12 = _t_6.description;
          _t_13 = _t_6.starred;
          _t_14 = _t_6.created_time;
          _t_15 = _t_6.modified_time;
          _t_16 = _t_6.file_size;
          _t_17 = _t_6.last_modified_by;
          _t_18 = _t_6.link;
          emit(_t_5, _t_6);
          _iter_tmp = await _t_3.next();
        }
      }
    } catch(_exc_) {
      __env.reportError("Failed to invoke query", _exc_);
    }
  }
  _t_19 = async function(emit) {
    _t_20 = -Infinity;
    try {
      _t_21 = {};
      _t_22 = await __env.invokeQuery("com.google.drive", { }, "list_drive_files", _t_21);
      _t_23 = _t_22[Symbol.iterator]();
      {
        let _iter_tmp = await _t_23.next();
        while (!_iter_tmp.done) {
          _t_24 = _iter_tmp.value;
          _t_25 = _t_24[0];
          _t_26 = _t_24[1];
          _t_27 = _t_26.order_by;
          _t_28 = _t_26.__response;
          _t_29 = _t_26.file_id;
          _t_30 = _t_26.file_name;
          _t_31 = _t_26.mime_type;
          _t_32 = _t_26.description;
          _t_33 = _t_26.starred;
          _t_34 = _t_26.created_time;
          _t_35 = _t_26.modified_time;
          _t_36 = _t_26.file_size;
          _t_37 = _t_26.last_modified_by;
          _t_38 = _t_26.link;
          _t_20 = __builtin.max(_t_20, _t_36);
          _iter_tmp = await _t_23.next();
        }
      }
    } catch(_exc_) {
      __env.reportError("Failed to invoke query", _exc_);
    }
    _t_40 = "max";
    _t_39 = __builtin.aggregateOutputType(_t_40, _t_25);
    _t_41 = {};
    _t_41.file_size = _t_20;
    emit(_t_39, _t_41);
  }
  _t_42 = __builtin.tableCrossJoin(_t_0, _t_19);
  {
    let _iter_tmp = await _t_42.next();
    while (!_iter_tmp.done) {
      _t_43 = _iter_tmp.value;
      _t_44 = _t_43[0];
      _t_45 = _t_43[1];
      _t_46 = _t_45.file_size;
      _t_47 = _t_45.order_by;
      _t_48 = _t_45.__response;
      _t_49 = _t_45.file_id;
      _t_50 = _t_45.file_name;
      _t_51 = _t_45.mime_type;
      _t_52 = _t_45.description;
      _t_53 = _t_45.starred;
      _t_54 = _t_45.created_time;
      _t_55 = _t_45.modified_time;
      _t_56 = _t_45.last_modified_by;
      _t_57 = _t_45.link;
      try {
        await __env.output(String(_t_44), _t_45);
      } catch(_exc_) {
        __env.reportError("Failed to invoke action", _exc_);
      }
      _iter_tmp = await _t_42.next();
    }
  }`]],

    //42
    [`{
    monitor (aggregate max file_size of @com.google.drive.list_drive_files()) => notify;
}`,
  [`"use strict";
  let _t_0;
  let _t_1;
  let _t_2;
  let _t_3;
  let _t_4;
  let _t_5;
  let _t_6;
  let _t_7;
  let _t_8;
  let _t_9;
  let _t_10;
  let _t_11;
  let _t_12;
  let _t_13;
  let _t_14;
  let _t_15;
  let _t_16;
  let _t_17;
  let _t_18;
  let _t_19;
  let _t_20;
  let _t_21;
  let _t_22;
  let _t_23;
  let _t_24;
  let _t_25;
  let _t_26;
  let _t_27;
  let _t_28;
  let _t_29;
  let _t_30;
  let _t_31;
  let _t_32;
  let _t_33;
  let _t_34;
  let _t_35;
  let _t_36;
  let _t_37;
  let _t_38;
  let _t_39;
  let _t_40;
  let _t_41;
  let _t_42;
  let _t_43;
  let _t_44;
  let _t_45;
  let _t_46;
  let _t_47;
  let _t_48;
  _t_0 = await __env.readState(0);
  _t_1 = await __env.readState(1);
  _t_2 = await __env.readState(2);
  try {
    _t_3 = {};
    _t_4 = await __env.invokeMonitor("com.google.drive", { }, "list_drive_files", _t_3, false);
    {
      let _iter_tmp = await _t_4.next();
      while (!_iter_tmp.done) {
        _t_5 = _iter_tmp.value;
        _t_6 = _t_5[0];
        _t_7 = _t_5[1];
        _t_8 = _t_7.order_by;
        _t_9 = _t_7.__response;
        _t_10 = _t_7.file_id;
        _t_11 = _t_7.file_name;
        _t_12 = _t_7.mime_type;
        _t_13 = _t_7.description;
        _t_14 = _t_7.starred;
        _t_15 = _t_7.created_time;
        _t_16 = _t_7.modified_time;
        _t_17 = _t_7.file_size;
        _t_18 = _t_7.last_modified_by;
        _t_19 = _t_7.link;
        _t_20 = __builtin.isNewTuple(_t_2, _t_7, ["file_id", "file_name", "mime_type", "description", "starred", "created_time", "modified_time", "file_size", "last_modified_by", "link"]);
        _t_21 = __builtin.addTuple(_t_2, _t_7);
        await __env.writeState(2, _t_21);
        _t_2 = _t_21;
        if (_t_20) {
          _t_22 = _t_7.__timestamp;
          _t_23 = _t_22 <= _t_1;
          _t_24 = ! (_t_23);
          if (_t_24) {
            await __env.writeState(1, _t_22);
            _t_1 = _t_22;
            _t_25 = -Infinity;
            try {
              _t_26 = {};
              _t_27 = await __env.invokeQuery("com.google.drive", { }, "list_drive_files", _t_26);
              _t_28 = _t_27[Symbol.iterator]();
              {
                let _iter_tmp = await _t_28.next();
                while (!_iter_tmp.done) {
                  _t_29 = _iter_tmp.value;
                  _t_30 = _t_29[0];
                  _t_31 = _t_29[1];
                  _t_32 = _t_31.order_by;
                  _t_33 = _t_31.__response;
                  _t_34 = _t_31.file_id;
                  _t_35 = _t_31.file_name;
                  _t_36 = _t_31.mime_type;
                  _t_37 = _t_31.description;
                  _t_38 = _t_31.starred;
                  _t_39 = _t_31.created_time;
                  _t_40 = _t_31.modified_time;
                  _t_41 = _t_31.file_size;
                  _t_42 = _t_31.last_modified_by;
                  _t_43 = _t_31.link;
                  _t_25 = __builtin.max(_t_25, _t_41);
                  _iter_tmp = await _t_28.next();
                }
              }
            } catch(_exc_) {
              __env.reportError("Failed to invoke query", _exc_);
            }
            _t_45 = "max";
            _t_44 = __builtin.aggregateOutputType(_t_45, _t_30);
            _t_46 = {};
            _t_46.file_size = _t_25;
            _t_47 = __builtin.isNewTuple(_t_0, _t_46, ["file_size"]);
            _t_48 = __builtin.addTuple(_t_0, _t_46);
            await __env.writeState(0, _t_48);
            _t_0 = _t_48;
            if (_t_47) {
              try {
                await __env.output(String(_t_44), _t_46);
              } catch(_exc_) {
                __env.reportError("Failed to invoke action", _exc_);
              }
            } else {

            }
          } else {

          }
        } else {

        }
        _iter_tmp = await _t_4.next();
      }
    }
  } catch(_exc_) {
    __env.reportError("Failed to invoke trigger", _exc_);
  }`]],

    //43
    [`{
    timer(base=makeDate(),interval=1h) => (sort file_size desc of @com.google.drive.list_drive_files())[1] => notify;
}`,
  [`"use strict";
  let _t_0;
  let _t_1;
  let _t_2;
  let _t_3;
  let _t_4;
  let _t_5;
  let _t_6;
  let _t_7;
  let _t_8;
  let _t_9;
  let _t_10;
  let _t_11;
  let _t_12;
  let _t_13;
  let _t_14;
  let _t_15;
  let _t_16;
  let _t_17;
  let _t_18;
  let _t_19;
  let _t_20;
  let _t_21;
  let _t_22;
  let _t_23;
  let _t_24;
  let _t_25;
  let _t_26;
  let _t_27;
  let _t_28;
  let _t_29;
  let _t_30;
  let _t_31;
  let _t_32;
  let _t_33;
  let _t_34;
  let _t_35;
  let _t_36;
  let _t_37;
  let _t_38;
  let _t_39;
  let _t_40;
  let _t_41;
  let _t_42;
  let _t_43;
  let _t_44;
  let _t_45;
  let _t_46;
  let _t_47;
  let _t_48;
  let _t_49;
  let _t_50;
  let _t_51;
  try {
    _t_1 = new Date(XNOWX);
    _t_2 = 3600000;
    _t_0 = await __env.invokeTimer(_t_1, _t_2, null);
    {
      let _iter_tmp = await _t_0.next();
      while (!_iter_tmp.done) {
        _t_3 = _iter_tmp.value;
        _t_4 = false;
        _t_5 = -Infinity;
        try {
          _t_8 = {};
          _t_9 = await __env.invokeQuery("com.google.drive", { }, "list_drive_files", _t_8);
          _t_10 = _t_9[Symbol.iterator]();
          {
            let _iter_tmp = await _t_10.next();
            while (!_iter_tmp.done) {
              _t_11 = _iter_tmp.value;
              _t_12 = _t_11[0];
              _t_13 = _t_11[1];
              _t_14 = _t_13.order_by;
              _t_15 = _t_13.__response;
              _t_16 = _t_13.file_id;
              _t_17 = _t_13.file_name;
              _t_18 = _t_13.mime_type;
              _t_19 = _t_13.description;
              _t_20 = _t_13.starred;
              _t_21 = _t_13.created_time;
              _t_22 = _t_13.modified_time;
              _t_23 = _t_13.file_size;
              _t_24 = _t_13.last_modified_by;
              _t_25 = _t_13.link;
              _t_26 = _t_5 < _t_23;
              if (_t_26) {
                _t_5 = _t_23;
                _t_6 = _t_13;
                _t_7 = _t_12;
                _t_4 = true;
              } else {

              }
              _iter_tmp = await _t_10.next();
            }
          }
        } catch(_exc_) {
          __env.reportError("Failed to invoke query", _exc_);
        }
        if (_t_4) {
          _t_27 = _t_6.order_by;
          _t_28 = _t_6.__response;
          _t_29 = _t_6.file_id;
          _t_30 = _t_6.file_name;
          _t_31 = _t_6.mime_type;
          _t_32 = _t_6.description;
          _t_33 = _t_6.starred;
          _t_34 = _t_6.created_time;
          _t_35 = _t_6.modified_time;
          _t_36 = _t_6.file_size;
          _t_37 = _t_6.last_modified_by;
          _t_38 = _t_6.link;
          _t_39 = {};
          _t_39.order_by = _t_27;
          _t_39.__response = _t_28;
          _t_39.file_id = _t_29;
          _t_39.file_name = _t_30;
          _t_39.mime_type = _t_31;
          _t_39.description = _t_32;
          _t_39.starred = _t_33;
          _t_39.created_time = _t_34;
          _t_39.modified_time = _t_35;
          _t_39.file_size = _t_36;
          _t_39.last_modified_by = _t_37;
          _t_39.link = _t_38;
          _t_40 = _t_39.order_by;
          _t_41 = _t_39.__response;
          _t_42 = _t_39.file_id;
          _t_43 = _t_39.file_name;
          _t_44 = _t_39.mime_type;
          _t_45 = _t_39.description;
          _t_46 = _t_39.starred;
          _t_47 = _t_39.created_time;
          _t_48 = _t_39.modified_time;
          _t_49 = _t_39.file_size;
          _t_50 = _t_39.last_modified_by;
          _t_51 = _t_39.link;
          try {
            await __env.output(String(_t_7), _t_39);
          } catch(_exc_) {
            __env.reportError("Failed to invoke action", _exc_);
          }
        } else {

        }
        _iter_tmp = await _t_0.next();
      }
    }
  } catch(_exc_) {
    __env.reportError("Failed to invoke timer", _exc_);
  }`]],

    //44
    [`{
    timer(base=makeDate(),interval=1h) => (sort file_size asc of @com.google.drive.list_drive_files())[1] => notify;
}`,
  [`"use strict";
  let _t_0;
  let _t_1;
  let _t_2;
  let _t_3;
  let _t_4;
  let _t_5;
  let _t_6;
  let _t_7;
  let _t_8;
  let _t_9;
  let _t_10;
  let _t_11;
  let _t_12;
  let _t_13;
  let _t_14;
  let _t_15;
  let _t_16;
  let _t_17;
  let _t_18;
  let _t_19;
  let _t_20;
  let _t_21;
  let _t_22;
  let _t_23;
  let _t_24;
  let _t_25;
  let _t_26;
  let _t_27;
  let _t_28;
  let _t_29;
  let _t_30;
  let _t_31;
  let _t_32;
  let _t_33;
  let _t_34;
  let _t_35;
  let _t_36;
  let _t_37;
  let _t_38;
  let _t_39;
  let _t_40;
  let _t_41;
  let _t_42;
  let _t_43;
  let _t_44;
  let _t_45;
  let _t_46;
  let _t_47;
  let _t_48;
  let _t_49;
  let _t_50;
  let _t_51;
  try {
    _t_1 = new Date(XNOWX);
    _t_2 = 3600000;
    _t_0 = await __env.invokeTimer(_t_1, _t_2, null);
    {
      let _iter_tmp = await _t_0.next();
      while (!_iter_tmp.done) {
        _t_3 = _iter_tmp.value;
        _t_4 = false;
        _t_5 = Infinity;
        try {
          _t_8 = {};
          _t_9 = await __env.invokeQuery("com.google.drive", { }, "list_drive_files", _t_8);
          _t_10 = _t_9[Symbol.iterator]();
          {
            let _iter_tmp = await _t_10.next();
            while (!_iter_tmp.done) {
              _t_11 = _iter_tmp.value;
              _t_12 = _t_11[0];
              _t_13 = _t_11[1];
              _t_14 = _t_13.order_by;
              _t_15 = _t_13.__response;
              _t_16 = _t_13.file_id;
              _t_17 = _t_13.file_name;
              _t_18 = _t_13.mime_type;
              _t_19 = _t_13.description;
              _t_20 = _t_13.starred;
              _t_21 = _t_13.created_time;
              _t_22 = _t_13.modified_time;
              _t_23 = _t_13.file_size;
              _t_24 = _t_13.last_modified_by;
              _t_25 = _t_13.link;
              _t_26 = _t_5 > _t_23;
              if (_t_26) {
                _t_5 = _t_23;
                _t_6 = _t_13;
                _t_7 = _t_12;
                _t_4 = true;
              } else {

              }
              _iter_tmp = await _t_10.next();
            }
          }
        } catch(_exc_) {
          __env.reportError("Failed to invoke query", _exc_);
        }
        if (_t_4) {
          _t_27 = _t_6.order_by;
          _t_28 = _t_6.__response;
          _t_29 = _t_6.file_id;
          _t_30 = _t_6.file_name;
          _t_31 = _t_6.mime_type;
          _t_32 = _t_6.description;
          _t_33 = _t_6.starred;
          _t_34 = _t_6.created_time;
          _t_35 = _t_6.modified_time;
          _t_36 = _t_6.file_size;
          _t_37 = _t_6.last_modified_by;
          _t_38 = _t_6.link;
          _t_39 = {};
          _t_39.order_by = _t_27;
          _t_39.__response = _t_28;
          _t_39.file_id = _t_29;
          _t_39.file_name = _t_30;
          _t_39.mime_type = _t_31;
          _t_39.description = _t_32;
          _t_39.starred = _t_33;
          _t_39.created_time = _t_34;
          _t_39.modified_time = _t_35;
          _t_39.file_size = _t_36;
          _t_39.last_modified_by = _t_37;
          _t_39.link = _t_38;
          _t_40 = _t_39.order_by;
          _t_41 = _t_39.__response;
          _t_42 = _t_39.file_id;
          _t_43 = _t_39.file_name;
          _t_44 = _t_39.mime_type;
          _t_45 = _t_39.description;
          _t_46 = _t_39.starred;
          _t_47 = _t_39.created_time;
          _t_48 = _t_39.modified_time;
          _t_49 = _t_39.file_size;
          _t_50 = _t_39.last_modified_by;
          _t_51 = _t_39.link;
          try {
            await __env.output(String(_t_7), _t_39);
          } catch(_exc_) {
            __env.reportError("Failed to invoke action", _exc_);
          }
        } else {

        }
        _iter_tmp = await _t_0.next();
      }
    }
  } catch(_exc_) {
    __env.reportError("Failed to invoke timer", _exc_);
  }`]],

    //45
    [`{
    now => (sort file_size desc of @com.google.drive.list_drive_files())[2:1] => notify;
}`,
  [`"use strict";
  let _t_0;
  let _t_1;
  let _t_2;
  let _t_3;
  let _t_4;
  let _t_5;
  let _t_6;
  let _t_7;
  let _t_8;
  let _t_9;
  let _t_10;
  let _t_11;
  let _t_12;
  let _t_13;
  let _t_14;
  let _t_15;
  let _t_16;
  let _t_17;
  let _t_18;
  let _t_19;
  let _t_20;
  let _t_21;
  let _t_22;
  let _t_23;
  let _t_24;
  let _t_25;
  let _t_26;
  let _t_27;
  let _t_28;
  let _t_29;
  let _t_30;
  let _t_31;
  let _t_32;
  let _t_33;
  let _t_34;
  let _t_35;
  let _t_36;
  let _t_37;
  _t_0 = 2;
  _t_1 = 1;
  _t_2 = __builtin.argmax;
  _t_3 = "file_size";
  _t_4 = new __builtin.ArgMinMaxState(_t_2, _t_3, _t_0, _t_1);
  try {
    _t_5 = {};
    _t_6 = await __env.invokeQuery("com.google.drive", { }, "list_drive_files", _t_5);
    _t_7 = _t_6[Symbol.iterator]();
    {
      let _iter_tmp = await _t_7.next();
      while (!_iter_tmp.done) {
        _t_8 = _iter_tmp.value;
        _t_9 = _t_8[0];
        _t_10 = _t_8[1];
        _t_11 = _t_10.order_by;
        _t_12 = _t_10.__response;
        _t_13 = _t_10.file_id;
        _t_14 = _t_10.file_name;
        _t_15 = _t_10.mime_type;
        _t_16 = _t_10.description;
        _t_17 = _t_10.starred;
        _t_18 = _t_10.created_time;
        _t_19 = _t_10.modified_time;
        _t_20 = _t_10.file_size;
        _t_21 = _t_10.last_modified_by;
        _t_22 = _t_10.link;
        _t_4.update(_t_10, _t_9);
        _iter_tmp = await _t_7.next();
      }
    }
  } catch(_exc_) {
    __env.reportError("Failed to invoke query", _exc_);
  }
  for (_t_23 of _t_4) {
    _t_24 = _t_23[0];
    _t_25 = _t_23[1];
    _t_26 = _t_25.order_by;
    _t_27 = _t_25.__response;
    _t_28 = _t_25.file_id;
    _t_29 = _t_25.file_name;
    _t_30 = _t_25.mime_type;
    _t_31 = _t_25.description;
    _t_32 = _t_25.starred;
    _t_33 = _t_25.created_time;
    _t_34 = _t_25.modified_time;
    _t_35 = _t_25.file_size;
    _t_36 = _t_25.last_modified_by;
    _t_37 = _t_25.link;
    try {
      await __env.output(String(_t_24), _t_25);
    } catch(_exc_) {
      __env.reportError("Failed to invoke action", _exc_);
    }
  }`]],

    //46 simple indexing
    [`{
    now => @com.google.drive.list_drive_files()[2:1] => notify;
}`,
  [`"use strict";
  let _t_0;
  let _t_1;
  let _t_2;
  let _t_3;
  let _t_4;
  let _t_5;
  let _t_6;
  let _t_7;
  let _t_8;
  let _t_9;
  let _t_10;
  let _t_11;
  let _t_12;
  let _t_13;
  let _t_14;
  let _t_15;
  let _t_16;
  let _t_17;
  let _t_18;
  let _t_19;
  let _t_20;
  let _t_21;
  let _t_22;
  _t_0 = 2;
  _t_1 = false;
  _t_2 = 0;
  try {
    _t_3 = {};
    _t_4 = await __env.invokeQuery("com.google.drive", { }, "list_drive_files", _t_3);
    _t_5 = _t_4[Symbol.iterator]();
    {
      let _iter_tmp = await _t_5.next();
      while (!_iter_tmp.done) {
        _t_6 = _iter_tmp.value;
        _t_7 = _t_6[0];
        _t_8 = _t_6[1];
        _t_9 = _t_8.order_by;
        _t_10 = _t_8.__response;
        _t_11 = _t_8.file_id;
        _t_12 = _t_8.file_name;
        _t_13 = _t_8.mime_type;
        _t_14 = _t_8.description;
        _t_15 = _t_8.starred;
        _t_16 = _t_8.created_time;
        _t_17 = _t_8.modified_time;
        _t_18 = _t_8.file_size;
        _t_19 = _t_8.last_modified_by;
        _t_20 = _t_8.link;
        _t_21 = 1;
        _t_2 = _t_2 + _t_21;
        _t_22 = _t_0 == _t_2;
        if (_t_22) {
          _t_1 = true;
          break;
        } else {

        }
        _iter_tmp = await _t_5.next();
      }
    }
  } catch(_exc_) {
    __env.reportError("Failed to invoke query", _exc_);
  }
  if (_t_1) {
    try {
      await __env.output(String(_t_7), _t_8);
    } catch(_exc_) {
      __env.reportError("Failed to invoke action", _exc_);
    }
  } else {

  }`]],

    //47 more simple indexing
    [`{
    attimer(time=makeTime(7, 30)) => @com.google.drive.list_drive_files()[2:1] => notify;
}`,
  [`"use strict";
  let _t_0;
  let _t_1;
  let _t_2;
  let _t_3;
  let _t_4;
  let _t_5;
  let _t_6;
  let _t_7;
  let _t_8;
  let _t_9;
  let _t_10;
  let _t_11;
  let _t_12;
  let _t_13;
  let _t_14;
  let _t_15;
  let _t_16;
  let _t_17;
  let _t_18;
  let _t_19;
  let _t_20;
  let _t_21;
  let _t_22;
  let _t_23;
  let _t_24;
  let _t_25;
  let _t_26;
  let _t_27;
  let _t_28;
  let _t_29;
  let _t_30;
  let _t_31;
  let _t_32;
  let _t_33;
  let _t_34;
  let _t_35;
  let _t_36;
  let _t_37;
  let _t_38;
  let _t_39;
  try {
    _t_1 = new Array(1);
    _t_2 = new __builtin.Time(7, 30, 0);
    _t_1[0] = _t_2;
    _t_0 = await __env.invokeAtTimer(_t_1, null);
    {
      let _iter_tmp = await _t_0.next();
      while (!_iter_tmp.done) {
        _t_3 = _iter_tmp.value;
        _t_4 = 2;
        _t_5 = false;
        _t_6 = 0;
        try {
          _t_7 = {};
          _t_8 = await __env.invokeQuery("com.google.drive", { }, "list_drive_files", _t_7);
          _t_9 = _t_8[Symbol.iterator]();
          {
            let _iter_tmp = await _t_9.next();
            while (!_iter_tmp.done) {
              _t_10 = _iter_tmp.value;
              _t_11 = _t_10[0];
              _t_12 = _t_10[1];
              _t_13 = _t_12.order_by;
              _t_14 = _t_12.__response;
              _t_15 = _t_12.file_id;
              _t_16 = _t_12.file_name;
              _t_17 = _t_12.mime_type;
              _t_18 = _t_12.description;
              _t_19 = _t_12.starred;
              _t_20 = _t_12.created_time;
              _t_21 = _t_12.modified_time;
              _t_22 = _t_12.file_size;
              _t_23 = _t_12.last_modified_by;
              _t_24 = _t_12.link;
              _t_25 = 1;
              _t_6 = _t_6 + _t_25;
              _t_26 = _t_4 == _t_6;
              if (_t_26) {
                _t_5 = true;
                break;
              } else {

              }
              _iter_tmp = await _t_9.next();
            }
          }
        } catch(_exc_) {
          __env.reportError("Failed to invoke query", _exc_);
        }
        if (_t_5) {
          _t_27 = {};
          _t_27.order_by = _t_13;
          _t_27.__response = _t_14;
          _t_27.file_id = _t_15;
          _t_27.file_name = _t_16;
          _t_27.mime_type = _t_17;
          _t_27.description = _t_18;
          _t_27.starred = _t_19;
          _t_27.created_time = _t_20;
          _t_27.modified_time = _t_21;
          _t_27.file_size = _t_22;
          _t_27.last_modified_by = _t_23;
          _t_27.link = _t_24;
          _t_28 = _t_27.order_by;
          _t_29 = _t_27.__response;
          _t_30 = _t_27.file_id;
          _t_31 = _t_27.file_name;
          _t_32 = _t_27.mime_type;
          _t_33 = _t_27.description;
          _t_34 = _t_27.starred;
          _t_35 = _t_27.created_time;
          _t_36 = _t_27.modified_time;
          _t_37 = _t_27.file_size;
          _t_38 = _t_27.last_modified_by;
          _t_39 = _t_27.link;
          try {
            await __env.output(String(_t_11), _t_27);
          } catch(_exc_) {
            __env.reportError("Failed to invoke action", _exc_);
          }
        } else {

        }
        _iter_tmp = await _t_0.next();
      }
    }
  } catch(_exc_) {
    __env.reportError("Failed to invoke at-timer", _exc_);
  }`]],

    //48 complex indexing
    [`{
    now => @com.google.drive.list_drive_files()[2, 3, 4] => notify;
}`,
  [`"use strict";
  let _t_0;
  let _t_1;
  let _t_2;
  let _t_3;
  let _t_4;
  let _t_5;
  let _t_6;
  let _t_7;
  let _t_8;
  let _t_9;
  let _t_10;
  let _t_11;
  let _t_12;
  let _t_13;
  let _t_14;
  let _t_15;
  let _t_16;
  let _t_17;
  let _t_18;
  let _t_19;
  let _t_20;
  let _t_21;
  let _t_22;
  let _t_23;
  let _t_24;
  let _t_25;
  let _t_26;
  let _t_27;
  let _t_28;
  let _t_29;
  let _t_30;
  let _t_31;
  let _t_32;
  let _t_33;
  let _t_34;
  let _t_35;
  let _t_36;
  let _t_37;
  let _t_38;
  let _t_39;
  _t_0 = new Array(3);
  _t_1 = 2;
  _t_0[0] = _t_1;
  _t_2 = 3;
  _t_0[1] = _t_2;
  _t_3 = 4;
  _t_0[2] = _t_3;
  _t_4 = new Array(0);
  try {
    _t_5 = {};
    _t_6 = await __env.invokeQuery("com.google.drive", { }, "list_drive_files", _t_5);
    _t_7 = _t_6[Symbol.iterator]();
    {
      let _iter_tmp = await _t_7.next();
      while (!_iter_tmp.done) {
        _t_8 = _iter_tmp.value;
        _t_9 = _t_8[0];
        _t_10 = _t_8[1];
        _t_11 = _t_10.order_by;
        _t_12 = _t_10.__response;
        _t_13 = _t_10.file_id;
        _t_14 = _t_10.file_name;
        _t_15 = _t_10.mime_type;
        _t_16 = _t_10.description;
        _t_17 = _t_10.starred;
        _t_18 = _t_10.created_time;
        _t_19 = _t_10.modified_time;
        _t_20 = _t_10.file_size;
        _t_21 = _t_10.last_modified_by;
        _t_22 = _t_10.link;
        _t_23 = new Array(2);
        _t_23[0] = _t_10;
        _t_23[1] = _t_9;
        _t_4.push(_t_23);
        _iter_tmp = await _t_7.next();
      }
    }
  } catch(_exc_) {
    __env.reportError("Failed to invoke query", _exc_);
  }
  _t_24 = __builtin.indexArray(_t_4, _t_0);
  for (_t_25 of _t_24) {
    _t_27 = _t_25[0];
    _t_26 = _t_25[1];
    _t_28 = _t_27.order_by;
    _t_29 = _t_27.__response;
    _t_30 = _t_27.file_id;
    _t_31 = _t_27.file_name;
    _t_32 = _t_27.mime_type;
    _t_33 = _t_27.description;
    _t_34 = _t_27.starred;
    _t_35 = _t_27.created_time;
    _t_36 = _t_27.modified_time;
    _t_37 = _t_27.file_size;
    _t_38 = _t_27.last_modified_by;
    _t_39 = _t_27.link;
    try {
      await __env.output(String(_t_26), _t_27);
    } catch(_exc_) {
      __env.reportError("Failed to invoke action", _exc_);
    }
  }`]],

    //49 complex slicing
    [`{
    now => @com.google.drive.list_drive_files()[2:4] => notify;
}`,
  [`"use strict";
  let _t_0;
  let _t_1;
  let _t_2;
  let _t_3;
  let _t_4;
  let _t_5;
  let _t_6;
  let _t_7;
  let _t_8;
  let _t_9;
  let _t_10;
  let _t_11;
  let _t_12;
  let _t_13;
  let _t_14;
  let _t_15;
  let _t_16;
  let _t_17;
  let _t_18;
  let _t_19;
  let _t_20;
  let _t_21;
  let _t_22;
  let _t_23;
  let _t_24;
  let _t_25;
  let _t_26;
  let _t_27;
  let _t_28;
  let _t_29;
  let _t_30;
  let _t_31;
  let _t_32;
  let _t_33;
  let _t_34;
  let _t_35;
  let _t_36;
  let _t_37;
  _t_0 = 2;
  _t_1 = 4;
  _t_2 = new Array(0);
  try {
    _t_3 = {};
    _t_4 = await __env.invokeQuery("com.google.drive", { }, "list_drive_files", _t_3);
    _t_5 = _t_4[Symbol.iterator]();
    {
      let _iter_tmp = await _t_5.next();
      while (!_iter_tmp.done) {
        _t_6 = _iter_tmp.value;
        _t_7 = _t_6[0];
        _t_8 = _t_6[1];
        _t_9 = _t_8.order_by;
        _t_10 = _t_8.__response;
        _t_11 = _t_8.file_id;
        _t_12 = _t_8.file_name;
        _t_13 = _t_8.mime_type;
        _t_14 = _t_8.description;
        _t_15 = _t_8.starred;
        _t_16 = _t_8.created_time;
        _t_17 = _t_8.modified_time;
        _t_18 = _t_8.file_size;
        _t_19 = _t_8.last_modified_by;
        _t_20 = _t_8.link;
        _t_21 = new Array(2);
        _t_21[0] = _t_8;
        _t_21[1] = _t_7;
        _t_2.push(_t_21);
        _iter_tmp = await _t_5.next();
      }
    }
  } catch(_exc_) {
    __env.reportError("Failed to invoke query", _exc_);
  }
  _t_22 = __builtin.sliceArray(_t_2, _t_0, _t_1);
  for (_t_23 of _t_22) {
    _t_25 = _t_23[0];
    _t_24 = _t_23[1];
    _t_26 = _t_25.order_by;
    _t_27 = _t_25.__response;
    _t_28 = _t_25.file_id;
    _t_29 = _t_25.file_name;
    _t_30 = _t_25.mime_type;
    _t_31 = _t_25.description;
    _t_32 = _t_25.starred;
    _t_33 = _t_25.created_time;
    _t_34 = _t_25.modified_time;
    _t_35 = _t_25.file_size;
    _t_36 = _t_25.last_modified_by;
    _t_37 = _t_25.link;
    try {
      await __env.output(String(_t_24), _t_25);
    } catch(_exc_) {
      __env.reportError("Failed to invoke action", _exc_);
    }
  }`]],

    //50 sorting
    [`{
    now => sort file_size asc of @com.google.drive.list_drive_files() => notify;
}`,
  [`"use strict";
  let _t_0;
  let _t_1;
  let _t_2;
  let _t_3;
  let _t_4;
  let _t_5;
  let _t_6;
  let _t_7;
  let _t_8;
  let _t_9;
  let _t_10;
  let _t_11;
  let _t_12;
  let _t_13;
  let _t_14;
  let _t_15;
  let _t_16;
  let _t_17;
  let _t_18;
  let _t_19;
  let _t_20;
  let _t_21;
  let _t_22;
  let _t_23;
  let _t_24;
  let _t_25;
  let _t_26;
  let _t_27;
  let _t_28;
  let _t_29;
  let _t_30;
  let _t_31;
  let _t_32;
  let _t_33;
  let _t_34;
  let _t_35;
  _t_0 = new Array(0);
  try {
    _t_1 = {};
    _t_2 = await __env.invokeQuery("com.google.drive", { }, "list_drive_files", _t_1);
    _t_3 = _t_2[Symbol.iterator]();
    {
      let _iter_tmp = await _t_3.next();
      while (!_iter_tmp.done) {
        _t_4 = _iter_tmp.value;
        _t_5 = _t_4[0];
        _t_6 = _t_4[1];
        _t_7 = _t_6.order_by;
        _t_8 = _t_6.__response;
        _t_9 = _t_6.file_id;
        _t_10 = _t_6.file_name;
        _t_11 = _t_6.mime_type;
        _t_12 = _t_6.description;
        _t_13 = _t_6.starred;
        _t_14 = _t_6.created_time;
        _t_15 = _t_6.modified_time;
        _t_16 = _t_6.file_size;
        _t_17 = _t_6.last_modified_by;
        _t_18 = _t_6.link;
        _t_19 = new Array(2);
        _t_19[0] = _t_6;
        _t_19[1] = _t_5;
        _t_0.push(_t_19);
        _iter_tmp = await _t_3.next();
      }
    }
  } catch(_exc_) {
    __env.reportError("Failed to invoke query", _exc_);
  }
  _t_20 = "file_size";
  __builtin.sortasc(_t_0, _t_20);
  for (_t_21 of _t_0) {
    _t_23 = _t_21[0];
    _t_22 = _t_21[1];
    _t_24 = _t_23.order_by;
    _t_25 = _t_23.__response;
    _t_26 = _t_23.file_id;
    _t_27 = _t_23.file_name;
    _t_28 = _t_23.mime_type;
    _t_29 = _t_23.description;
    _t_30 = _t_23.starred;
    _t_31 = _t_23.created_time;
    _t_32 = _t_23.modified_time;
    _t_33 = _t_23.file_size;
    _t_34 = _t_23.last_modified_by;
    _t_35 = _t_23.link;
    try {
      await __env.output(String(_t_22), _t_23);
    } catch(_exc_) {
      __env.reportError("Failed to invoke action", _exc_);
    }
  }`]],

    //51
    [`{
    now => @com.thecatapi.get() => notify;
    now => @com.twitter.post(status="foo");
    }`,
    [`"use strict";
  let _t_0;
  let _t_1;
  let _t_2;
  let _t_3;
  let _t_4;
  let _t_5;
  let _t_6;
  let _t_7;
  let _t_8;
  let _t_9;
  let _t_10;
  let _t_11;
  let _t_12;
  try {
    _t_0 = {};
    _t_1 = await __env.invokeQuery("com.thecatapi", { }, "get", _t_0);
    _t_2 = _t_1[Symbol.iterator]();
    {
      let _iter_tmp = await _t_2.next();
      while (!_iter_tmp.done) {
        _t_3 = _iter_tmp.value;
        _t_4 = _t_3[0];
        _t_5 = _t_3[1];
        _t_6 = _t_5.count;
        _t_7 = _t_5.__response;
        _t_8 = _t_5.image_id;
        _t_9 = _t_5.picture_url;
        _t_10 = _t_5.link;
        try {
          await __env.output(String(_t_4), _t_5);
        } catch(_exc_) {
          __env.reportError("Failed to invoke action", _exc_);
        }
        _iter_tmp = await _t_2.next();
      }
    }
  } catch(_exc_) {
    __env.reportError("Failed to invoke query", _exc_);
  }
  __env.clearGetCache();
  try {
    _t_11 = {};
    _t_12 = "foo";
    _t_11.status = _t_12;
    await __env.invokeAction("com.twitter", { }, "post", _t_11);
  } catch(_exc_) {
    __env.reportError("Failed to invoke action", _exc_);
  }`]],

    //52
    [`{
    monitor (@com.twitter.home_timeline()) => notify;
    now => @com.thecatapi.get() => notify;
    now => @com.twitter.post(status="foo");
    }`,
    [`"use strict";
  let _t_0;
  let _t_1;
  let _t_2;
  let _t_3;
  let _t_4;
  let _t_5;
  let _t_6;
  let _t_7;
  let _t_8;
  let _t_9;
  let _t_10;
  let _t_11;
  let _t_12;
  try {
    _t_0 = {};
    _t_1 = await __env.invokeQuery("com.thecatapi", { }, "get", _t_0);
    _t_2 = _t_1[Symbol.iterator]();
    {
      let _iter_tmp = await _t_2.next();
      while (!_iter_tmp.done) {
        _t_3 = _iter_tmp.value;
        _t_4 = _t_3[0];
        _t_5 = _t_3[1];
        _t_6 = _t_5.count;
        _t_7 = _t_5.__response;
        _t_8 = _t_5.image_id;
        _t_9 = _t_5.picture_url;
        _t_10 = _t_5.link;
        try {
          await __env.output(String(_t_4), _t_5);
        } catch(_exc_) {
          __env.reportError("Failed to invoke action", _exc_);
        }
        _iter_tmp = await _t_2.next();
      }
    }
  } catch(_exc_) {
    __env.reportError("Failed to invoke query", _exc_);
  }
  __env.clearGetCache();
  try {
    _t_11 = {};
    _t_12 = "foo";
    _t_11.status = _t_12;
    await __env.invokeAction("com.twitter", { }, "post", _t_11);
  } catch(_exc_) {
    __env.reportError("Failed to invoke action", _exc_);
  }`, `"use strict";
  let _t_0;
  let _t_1;
  let _t_2;
  let _t_3;
  let _t_4;
  let _t_5;
  let _t_6;
  let _t_7;
  let _t_8;
  let _t_9;
  let _t_10;
  let _t_11;
  let _t_12;
  let _t_13;
  let _t_14;
  _t_0 = await __env.readState(0);
  try {
    _t_1 = {};
    _t_2 = await __env.invokeMonitor("com.twitter", { }, "home_timeline", _t_1, false);
    {
      let _iter_tmp = await _t_2.next();
      while (!_iter_tmp.done) {
        _t_3 = _iter_tmp.value;
        _t_4 = _t_3[0];
        _t_5 = _t_3[1];
        _t_6 = _t_5.__response;
        _t_7 = _t_5.text;
        _t_8 = _t_5.hashtags;
        _t_9 = _t_5.urls;
        _t_10 = _t_5.author;
        _t_11 = _t_5.in_reply_to;
        _t_12 = _t_5.tweet_id;
        _t_13 = __builtin.isNewTuple(_t_0, _t_5, ["text", "hashtags", "urls", "author", "in_reply_to", "tweet_id"]);
        _t_14 = __builtin.addTuple(_t_0, _t_5);
        await __env.writeState(0, _t_14);
        _t_0 = _t_14;
        if (_t_13) {
          try {
            await __env.output(String(_t_4), _t_5);
          } catch(_exc_) {
            __env.reportError("Failed to invoke action", _exc_);
          }
        } else {

        }
        _iter_tmp = await _t_2.next();
      }
    }
  } catch(_exc_) {
    __env.reportError("Failed to invoke trigger", _exc_);
  }`]],

    //53
    [`let query q(p_query : String) := @com.bing.web_search(query=p_query);
      let action a(p_status : String) := @com.twitter.post(status=p_status);

      now => q(p_query="foo") => a(p_status=link);
      now => a(p_status="no");
      `,
     [`"use strict";
  let _t_1;
  let _t_2;
  let _t_3;
  let _t_4;
  let _t_5;
  let _t_6;
  let _t_7;
  let _t_8;
  let _t_9;
  let _t_10;
  try {
    _t_1 = {};
    _t_1.query = _t_0;
    _t_2 = await __env.invokeQuery("com.bing", { }, "web_search", _t_1);
    _t_3 = _t_2[Symbol.iterator]();
    {
      let _iter_tmp = await _t_3.next();
      while (!_iter_tmp.done) {
        _t_4 = _iter_tmp.value;
        _t_5 = _t_4[0];
        _t_6 = _t_4[1];
        _t_7 = _t_6.__response;
        _t_8 = _t_6.title;
        _t_9 = _t_6.description;
        _t_10 = _t_6.link;
        emit(_t_5, _t_6);
        _iter_tmp = await _t_3.next();
      }
    }
  } catch(_exc_) {
    __env.reportError("Failed to invoke query", _exc_);
  }`, `"use strict";
  let _t_1;
  try {
    _t_1 = {};
    _t_1.status = _t_0;
    await __env.invokeAction("com.twitter", { }, "post", _t_1);
  } catch(_exc_) {
    __env.reportError("Failed to invoke action", _exc_);
  }`, `"use strict";
  let _t_0;
  let _t_1;
  let _t_2;
  let _t_3;
  let _t_4;
  let _t_5;
  let _t_6;
  let _t_7;
  let _t_8;
  let _t_9;
  let _t_10;
  let _t_11;
  let _t_12;
  let _t_13;
  try {
    _t_0 = __scope.q;
    _t_1 = "foo";
    _t_2 = await __builtin.invokeStreamVarRef(__env, _t_0, _t_1);
    {
      let _iter_tmp = await _t_2.next();
      while (!_iter_tmp.done) {
        _t_3 = _iter_tmp.value;
        _t_4 = _t_3[0];
        _t_5 = _t_3[1];
        _t_6 = _t_5.__response;
        _t_7 = _t_5.title;
        _t_8 = _t_5.description;
        _t_9 = _t_5.link;
        try {
          _t_10 = __scope.a;
          _t_11 = String (_t_9);
          await _t_10(__env, _t_11);
        } catch(_exc_) {
          __env.reportError("Failed to invoke action", _exc_);
        }
        _iter_tmp = await _t_2.next();
      }
    }
  } catch(_exc_) {
    __env.reportError("Failed to invoke query", _exc_);
  }
  __env.clearGetCache();
  try {
    _t_12 = __scope.a;
    _t_13 = "no";
    await _t_12(__env, _t_13);
  } catch(_exc_) {
    __env.reportError("Failed to invoke action", _exc_);
  }`]],

    //54
    [`let stream s1 := monitor(@org.thingpedia.weather.current(location=makeLocation(1,2,"foo")));
    s1 => notify;`
  ,
  [`"use strict";
  let _t_0;
  let _t_1;
  let _t_2;
  let _t_3;
  let _t_4;
  let _t_5;
  let _t_6;
  let _t_7;
  let _t_8;
  let _t_9;
  let _t_10;
  let _t_11;
  let _t_12;
  let _t_13;
  let _t_14;
  let _t_15;
  let _t_16;
  _t_0 = await __env.readState(0);
  try {
    _t_1 = {};
    _t_2 = new __builtin.Location(1, 2, "foo");
    _t_1.location = _t_2;
    _t_3 = await __env.invokeMonitor("org.thingpedia.weather", { }, "current", _t_1, false);
    {
      let _iter_tmp = await _t_3.next();
      while (!_iter_tmp.done) {
        _t_4 = _iter_tmp.value;
        _t_5 = _t_4[0];
        _t_6 = _t_4[1];
        _t_7 = _t_6.__response;
        _t_8 = _t_6.temperature;
        _t_9 = _t_6.wind_speed;
        _t_10 = _t_6.humidity;
        _t_11 = _t_6.cloudiness;
        _t_12 = _t_6.fog;
        _t_13 = _t_6.status;
        _t_14 = _t_6.icon;
        _t_15 = __builtin.isNewTuple(_t_0, _t_6, ["temperature", "wind_speed", "humidity", "cloudiness", "fog", "status", "icon"]);
        _t_16 = __builtin.addTuple(_t_0, _t_6);
        await __env.writeState(0, _t_16);
        _t_0 = _t_16;
        if (_t_15) {
          emit(_t_5, _t_6);
        } else {

        }
        _iter_tmp = await _t_3.next();
      }
    }
  } catch(_exc_) {
    __env.reportError("Failed to invoke trigger", _exc_);
  }`, `"use strict";
  let _t_0;
  let _t_1;
  let _t_2;
  let _t_3;
  let _t_4;
  let _t_5;
  let _t_6;
  let _t_7;
  let _t_8;
  let _t_9;
  let _t_10;
  let _t_11;
  let _t_12;
  try {
    _t_0 = __scope.s1;
    _t_1 = await __builtin.invokeStreamVarRef(__env, _t_0);
    {
      let _iter_tmp = await _t_1.next();
      while (!_iter_tmp.done) {
        _t_2 = _iter_tmp.value;
        _t_3 = _t_2[0];
        _t_4 = _t_2[1];
        _t_5 = _t_4.__response;
        _t_6 = _t_4.temperature;
        _t_7 = _t_4.wind_speed;
        _t_8 = _t_4.humidity;
        _t_9 = _t_4.cloudiness;
        _t_10 = _t_4.fog;
        _t_11 = _t_4.status;
        _t_12 = _t_4.icon;
        try {
          await __env.output(String(_t_3), _t_4);
        } catch(_exc_) {
          __env.reportError("Failed to invoke action", _exc_);
        }
        _iter_tmp = await _t_1.next();
      }
    }
  } catch(_exc_) {
    __env.reportError("Failed to invoke stream", _exc_);
  }`]],

    //55
    [`let result cat := @com.thecatapi.get();
      now => cat => notify;
      now => cat => @com.twitter.post_picture(caption="cat", picture_url=picture_url);
    `,
    [`"use strict";
  let _t_0;
  let _t_1;
  let _t_2;
  let _t_3;
  let _t_4;
  let _t_5;
  let _t_6;
  let _t_7;
  let _t_8;
  let _t_9;
  let _t_10;
  let _t_11;
  let _t_12;
  let _t_13;
  let _t_14;
  let _t_15;
  let _t_16;
  let _t_17;
  let _t_18;
  let _t_19;
  let _t_20;
  let _t_21;
  let _t_22;
  let _t_23;
  let _t_24;
  let _t_25;
  let _t_26;
  let _t_27;
  let _t_28;
  let _t_29;
  let _t_30;
  let _t_31;
  _t_0 = new Array(0);
  try {
    _t_1 = {};
    _t_2 = await __env.invokeQuery("com.thecatapi", { }, "get", _t_1);
    _t_3 = _t_2[Symbol.iterator]();
    {
      let _iter_tmp = await _t_3.next();
      while (!_iter_tmp.done) {
        _t_4 = _iter_tmp.value;
        _t_5 = _t_4[0];
        _t_6 = _t_4[1];
        _t_7 = _t_6.count;
        _t_8 = _t_6.__response;
        _t_9 = _t_6.image_id;
        _t_10 = _t_6.picture_url;
        _t_11 = _t_6.link;
        _t_12 = new Array(2);
        _t_12[0] = _t_5;
        _t_12[1] = _t_6;
        _t_0.push(_t_12);
        _iter_tmp = await _t_3.next();
      }
    }
  } catch(_exc_) {
    __env.reportError("Failed to invoke query", _exc_);
  }
  __env.clearGetCache();
  _t_13 = _t_0[Symbol.iterator]();
  {
    let _iter_tmp = await _t_13.next();
    while (!_iter_tmp.done) {
      _t_14 = _iter_tmp.value;
      _t_15 = _t_14[0];
      _t_16 = _t_14[1];
      _t_17 = _t_16.__response;
      _t_18 = _t_16.image_id;
      _t_19 = _t_16.picture_url;
      _t_20 = _t_16.link;
      try {
        await __env.output(String(_t_15), _t_16);
      } catch(_exc_) {
        __env.reportError("Failed to invoke action", _exc_);
      }
      _iter_tmp = await _t_13.next();
    }
  }
  __env.clearGetCache();
  _t_21 = _t_0[Symbol.iterator]();
  {
    let _iter_tmp = await _t_21.next();
    while (!_iter_tmp.done) {
      _t_22 = _iter_tmp.value;
      _t_23 = _t_22[0];
      _t_24 = _t_22[1];
      _t_25 = _t_24.__response;
      _t_26 = _t_24.image_id;
      _t_27 = _t_24.picture_url;
      _t_28 = _t_24.link;
      try {
        _t_29 = {};
        _t_30 = "cat";
        _t_29.caption = _t_30;
        _t_31 = String (_t_27);
        _t_29.picture_url = _t_31;
        await __env.invokeAction("com.twitter", { }, "post_picture", _t_29);
      } catch(_exc_) {
        __env.reportError("Failed to invoke action", _exc_);
      }
      _iter_tmp = await _t_21.next();
    }
  }`]],

    //56
    [`let result cat := @com.thecatapi.get();
      now => cat => notify;

      // every hour post THE SAME cat picture
      timer(base=makeDate(), interval=1h) => cat => @com.twitter.post_picture(caption="cat", picture_url=picture_url);
    `,
    [`"use strict";
  let _t_0;
  let _t_1;
  let _t_2;
  let _t_3;
  let _t_4;
  let _t_5;
  let _t_6;
  let _t_7;
  let _t_8;
  let _t_9;
  let _t_10;
  let _t_11;
  let _t_12;
  let _t_13;
  let _t_14;
  let _t_15;
  let _t_16;
  let _t_17;
  let _t_18;
  let _t_19;
  let _t_20;
  let _t_21;
  _t_0 = new Array(0);
  try {
    _t_1 = {};
    _t_2 = await __env.invokeQuery("com.thecatapi", { }, "get", _t_1);
    _t_3 = _t_2[Symbol.iterator]();
    {
      let _iter_tmp = await _t_3.next();
      while (!_iter_tmp.done) {
        _t_4 = _iter_tmp.value;
        _t_5 = _t_4[0];
        _t_6 = _t_4[1];
        _t_7 = _t_6.count;
        _t_8 = _t_6.__response;
        _t_9 = _t_6.image_id;
        _t_10 = _t_6.picture_url;
        _t_11 = _t_6.link;
        _t_12 = new Array(2);
        _t_12[0] = _t_5;
        _t_12[1] = _t_6;
        _t_0.push(_t_12);
        _iter_tmp = await _t_3.next();
      }
    }
  } catch(_exc_) {
    __env.reportError("Failed to invoke query", _exc_);
  }
  await __env.writeState(0, _t_0);
  __env.clearGetCache();
  _t_13 = await __env.readState(0);
  _t_14 = _t_13[Symbol.iterator]();
  {
    let _iter_tmp = await _t_14.next();
    while (!_iter_tmp.done) {
      _t_15 = _iter_tmp.value;
      _t_16 = _t_15[0];
      _t_17 = _t_15[1];
      _t_18 = _t_17.__response;
      _t_19 = _t_17.image_id;
      _t_20 = _t_17.picture_url;
      _t_21 = _t_17.link;
      try {
        await __env.output(String(_t_16), _t_17);
      } catch(_exc_) {
        __env.reportError("Failed to invoke action", _exc_);
      }
      _iter_tmp = await _t_14.next();
    }
  }`, `"use strict";
  let _t_0;
  let _t_1;
  let _t_2;
  let _t_3;
  let _t_4;
  let _t_5;
  let _t_6;
  let _t_7;
  let _t_8;
  let _t_9;
  let _t_10;
  let _t_11;
  let _t_12;
  let _t_13;
  let _t_14;
  let _t_15;
  let _t_16;
  let _t_17;
  let _t_18;
  let _t_19;
  let _t_20;
  try {
    _t_1 = new Date(XNOWX);
    _t_2 = 3600000;
    _t_0 = await __env.invokeTimer(_t_1, _t_2, null);
    {
      let _iter_tmp = await _t_0.next();
      while (!_iter_tmp.done) {
        _t_3 = _iter_tmp.value;
        _t_4 = await __env.readState(0);
        _t_5 = _t_4[Symbol.iterator]();
        {
          let _iter_tmp = await _t_5.next();
          while (!_iter_tmp.done) {
            _t_6 = _iter_tmp.value;
            _t_7 = _t_6[0];
            _t_8 = _t_6[1];
            _t_9 = _t_8.__response;
            _t_10 = _t_8.image_id;
            _t_11 = _t_8.picture_url;
            _t_12 = _t_8.link;
            _t_13 = {};
            _t_13.__response = _t_9;
            _t_13.image_id = _t_10;
            _t_13.picture_url = _t_11;
            _t_13.link = _t_12;
            _t_14 = _t_13.__response;
            _t_15 = _t_13.image_id;
            _t_16 = _t_13.picture_url;
            _t_17 = _t_13.link;
            try {
              _t_18 = {};
              _t_19 = "cat";
              _t_18.caption = _t_19;
              _t_20 = String (_t_16);
              _t_18.picture_url = _t_20;
              await __env.invokeAction("com.twitter", { }, "post_picture", _t_18);
            } catch(_exc_) {
              __env.reportError("Failed to invoke action", _exc_);
            }
            _iter_tmp = await _t_5.next();
          }
        }
        _iter_tmp = await _t_0.next();
      }
    }
  } catch(_exc_) {
    __env.reportError("Failed to invoke timer", _exc_);
  }`]],

    //57 simple procedure declarations
    [`let procedure p1(p_foo : String) := {
        now => @com.bing.web_search(query = p_foo) => notify;
        now => @com.twitter.post(status = p_foo);
    };
    let procedure p2(p_foo : String) := {
        now => @com.facebook.post(status = p_foo);
    };
    now => p1(p_foo = "one");
    now => p1(p_foo = "two");
    now => {
        p1(p_foo = "three");
        p2(p_foo = "four");
    };
    `,
    [`"use strict";
  let _t_1;
  let _t_2;
  let _t_3;
  let _t_4;
  let _t_5;
  let _t_6;
  let _t_7;
  let _t_8;
  let _t_9;
  let _t_10;
  let _t_11;
  await __env.enterProcedure(0, "p1");
  try {
    try {
      _t_1 = {};
      _t_1.query = _t_0;
      _t_2 = await __env.invokeQuery("com.bing", { }, "web_search", _t_1);
      _t_3 = _t_2[Symbol.iterator]();
      {
        let _iter_tmp = await _t_3.next();
        while (!_iter_tmp.done) {
          _t_4 = _iter_tmp.value;
          _t_5 = _t_4[0];
          _t_6 = _t_4[1];
          _t_7 = _t_6.__response;
          _t_8 = _t_6.title;
          _t_9 = _t_6.description;
          _t_10 = _t_6.link;
          try {
            await __env.output(String(_t_5), _t_6);
          } catch(_exc_) {
            __env.reportError("Failed to invoke action", _exc_);
          }
          _iter_tmp = await _t_3.next();
        }
      }
    } catch(_exc_) {
      __env.reportError("Failed to invoke query", _exc_);
    }
    __env.clearGetCache();
    try {
      _t_11 = {};
      _t_11.status = _t_0;
      await __env.invokeAction("com.twitter", { }, "post", _t_11);
    } catch(_exc_) {
      __env.reportError("Failed to invoke action", _exc_);
    }
  } finally {
    await __env.exitProcedure(0, "p1");
  }`, `"use strict";
  let _t_1;
  await __env.enterProcedure(1, "p2");
  try {
    try {
      _t_1 = {};
      _t_1.status = _t_0;
      await __env.invokeAction("com.facebook", { }, "post", _t_1);
    } catch(_exc_) {
      __env.reportError("Failed to invoke action", _exc_);
    }
  } finally {
    await __env.exitProcedure(1, "p2");
  }`, `"use strict";
  let _t_0;
  let _t_1;
  let _t_2;
  let _t_3;
  let _t_4;
  let _t_5;
  let _t_6;
  let _t_7;
  try {
    _t_0 = __scope.p1;
    _t_1 = "one";
    await _t_0(__env, _t_1);
  } catch(_exc_) {
    __env.reportError("Failed to invoke action", _exc_);
  }
  __env.clearGetCache();
  try {
    _t_2 = __scope.p1;
    _t_3 = "two";
    await _t_2(__env, _t_3);
  } catch(_exc_) {
    __env.reportError("Failed to invoke action", _exc_);
  }
  __env.clearGetCache();
  try {
    _t_4 = __scope.p1;
    _t_5 = "three";
    await _t_4(__env, _t_5);
  } catch(_exc_) {
    __env.reportError("Failed to invoke action", _exc_);
  }
  try {
    _t_6 = __scope.p2;
    _t_7 = "four";
    await _t_6(__env, _t_7);
  } catch(_exc_) {
    __env.reportError("Failed to invoke action", _exc_);
  }`]],

    //58 procedure with results
    [`let procedure p1(p_foo : String) := {
        let result r1 := @com.bing.web_search(query = p_foo);
        now => r1 => notify;
        now => r1 => @com.twitter.post(status = title);
    };
    now => p1(p_foo = "one");
    now => p1(p_foo = "two");
    `,
    [`"use strict";
  let _t_1;
  let _t_2;
  let _t_3;
  let _t_4;
  let _t_5;
  let _t_6;
  let _t_7;
  let _t_8;
  let _t_9;
  let _t_10;
  let _t_11;
  let _t_12;
  let _t_13;
  let _t_14;
  let _t_15;
  let _t_16;
  let _t_17;
  let _t_18;
  let _t_19;
  let _t_20;
  let _t_21;
  let _t_22;
  let _t_23;
  let _t_24;
  let _t_25;
  let _t_26;
  let _t_27;
  let _t_28;
  let _t_29;
  await __env.enterProcedure(0, "p1");
  try {
    _t_1 = new Array(0);
    try {
      _t_2 = {};
      _t_2.query = _t_0;
      _t_3 = await __env.invokeQuery("com.bing", { }, "web_search", _t_2);
      _t_4 = _t_3[Symbol.iterator]();
      {
        let _iter_tmp = await _t_4.next();
        while (!_iter_tmp.done) {
          _t_5 = _iter_tmp.value;
          _t_6 = _t_5[0];
          _t_7 = _t_5[1];
          _t_8 = _t_7.__response;
          _t_9 = _t_7.title;
          _t_10 = _t_7.description;
          _t_11 = _t_7.link;
          _t_12 = new Array(2);
          _t_12[0] = _t_6;
          _t_12[1] = _t_7;
          _t_1.push(_t_12);
          _iter_tmp = await _t_4.next();
        }
      }
    } catch(_exc_) {
      __env.reportError("Failed to invoke query", _exc_);
    }
    __env.clearGetCache();
    _t_13 = _t_1[Symbol.iterator]();
    {
      let _iter_tmp = await _t_13.next();
      while (!_iter_tmp.done) {
        _t_14 = _iter_tmp.value;
        _t_15 = _t_14[0];
        _t_16 = _t_14[1];
        _t_17 = _t_16.__response;
        _t_18 = _t_16.title;
        _t_19 = _t_16.description;
        _t_20 = _t_16.link;
        try {
          await __env.output(String(_t_15), _t_16);
        } catch(_exc_) {
          __env.reportError("Failed to invoke action", _exc_);
        }
        _iter_tmp = await _t_13.next();
      }
    }
    __env.clearGetCache();
    _t_21 = _t_1[Symbol.iterator]();
    {
      let _iter_tmp = await _t_21.next();
      while (!_iter_tmp.done) {
        _t_22 = _iter_tmp.value;
        _t_23 = _t_22[0];
        _t_24 = _t_22[1];
        _t_25 = _t_24.__response;
        _t_26 = _t_24.title;
        _t_27 = _t_24.description;
        _t_28 = _t_24.link;
        try {
          _t_29 = {};
          _t_29.status = _t_26;
          await __env.invokeAction("com.twitter", { }, "post", _t_29);
        } catch(_exc_) {
          __env.reportError("Failed to invoke action", _exc_);
        }
        _iter_tmp = await _t_21.next();
      }
    }
  } finally {
    await __env.exitProcedure(0, "p1");
  }`, `"use strict";
  let _t_0;
  let _t_1;
  let _t_2;
  let _t_3;
  try {
    _t_0 = __scope.p1;
    _t_1 = "one";
    await _t_0(__env, _t_1);
  } catch(_exc_) {
    __env.reportError("Failed to invoke action", _exc_);
  }
  __env.clearGetCache();
  try {
    _t_2 = __scope.p1;
    _t_3 = "two";
    await _t_2(__env, _t_3);
  } catch(_exc_) {
    __env.reportError("Failed to invoke action", _exc_);
  }`]],

    //59 procedure with nested declarations
    [`let procedure p1(p_foo : String) := {
        let query q1 := @com.bing.web_search(query = p_foo);
        now => q1 => notify;
        now => q1 => @com.twitter.post(status = title);
    };
    now => p1(p_foo = "one");
    now => p1(p_foo = "two");
    `,
    [`"use strict";
  let _t_11;
  let _t_12;
  let _t_13;
  let _t_14;
  let _t_15;
  let _t_16;
  let _t_17;
  let _t_18;
  let _t_19;
  let _t_20;
  let _t_21;
  let _t_22;
  let _t_23;
  let _t_24;
  let _t_25;
  let _t_26;
  let _t_27;
  let _t_28;
  await __env.enterProcedure(0, "p1");
  try {
    _t_11 = async function(__env, emit) {
      "use strict";
      let _t_1;
      let _t_2;
      let _t_3;
      let _t_4;
      let _t_5;
      let _t_6;
      let _t_7;
      let _t_8;
      let _t_9;
      let _t_10;
      try {
        _t_1 = {};
        _t_1.query = _t_0;
        _t_2 = await __env.invokeQuery("com.bing", { }, "web_search", _t_1);
        _t_3 = _t_2[Symbol.iterator]();
        {
          let _iter_tmp = await _t_3.next();
          while (!_iter_tmp.done) {
            _t_4 = _iter_tmp.value;
            _t_5 = _t_4[0];
            _t_6 = _t_4[1];
            _t_7 = _t_6.__response;
            _t_8 = _t_6.title;
            _t_9 = _t_6.description;
            _t_10 = _t_6.link;
            emit(_t_5, _t_6);
            _iter_tmp = await _t_3.next();
          }
        }
      } catch(_exc_) {
        __env.reportError("Failed to invoke query", _exc_);
      }
    };
    try {
      _t_12 = await __builtin.invokeStreamVarRef(__env, _t_11);
      {
        let _iter_tmp = await _t_12.next();
        while (!_iter_tmp.done) {
          _t_13 = _iter_tmp.value;
          _t_14 = _t_13[0];
          _t_15 = _t_13[1];
          _t_16 = _t_15.__response;
          _t_17 = _t_15.title;
          _t_18 = _t_15.description;
          _t_19 = _t_15.link;
          try {
            await __env.output(String(_t_14), _t_15);
          } catch(_exc_) {
            __env.reportError("Failed to invoke action", _exc_);
          }
          _iter_tmp = await _t_12.next();
        }
      }
    } catch(_exc_) {
      __env.reportError("Failed to invoke query", _exc_);
    }
    __env.clearGetCache();
    try {
      _t_20 = await __builtin.invokeStreamVarRef(__env, _t_11);
      {
        let _iter_tmp = await _t_20.next();
        while (!_iter_tmp.done) {
          _t_21 = _iter_tmp.value;
          _t_22 = _t_21[0];
          _t_23 = _t_21[1];
          _t_24 = _t_23.__response;
          _t_25 = _t_23.title;
          _t_26 = _t_23.description;
          _t_27 = _t_23.link;
          try {
            _t_28 = {};
            _t_28.status = _t_25;
            await __env.invokeAction("com.twitter", { }, "post", _t_28);
          } catch(_exc_) {
            __env.reportError("Failed to invoke action", _exc_);
          }
          _iter_tmp = await _t_20.next();
        }
      }
    } catch(_exc_) {
      __env.reportError("Failed to invoke query", _exc_);
    }
  } finally {
    await __env.exitProcedure(0, "p1");
  }`, `"use strict";
  let _t_0;
  let _t_1;
  let _t_2;
  let _t_3;
  try {
    _t_0 = __scope.p1;
    _t_1 = "one";
    await _t_0(__env, _t_1);
  } catch(_exc_) {
    __env.reportError("Failed to invoke action", _exc_);
  }
  __env.clearGetCache();
  try {
    _t_2 = __scope.p1;
    _t_3 = "two";
    await _t_2(__env, _t_3);
  } catch(_exc_) {
    __env.reportError("Failed to invoke action", _exc_);
  }`]],

    //60 nested procedures
    [`let procedure p1(p_foo : String) := {
        let procedure p2(p_bar : String) := {
            now => @com.tumblr.blog.post_text(title = p_foo, body = p_bar);
        };
        now => p2(p_bar = "body one");
        now => p2(p_bar = "body two");
    };
    now => p1(p_foo = "title one");
    now => p1(p_foo = "title two");
    `,
    [`"use strict";
  let _t_3;
  let _t_4;
  let _t_5;
  await __env.enterProcedure(0, "p1");
  try {
    _t_3 = async function(__env, _t_1) {
      "use strict";
      let _t_2;
      await __env.enterProcedure(1, "p2");
      try {
        try {
          _t_2 = {};
          _t_2.title = _t_0;
          _t_2.body = _t_1;
          await __env.invokeAction("com.tumblr.blog", { }, "post_text", _t_2);
        } catch(_exc_) {
          __env.reportError("Failed to invoke action", _exc_);
        }
      } finally {
        await __env.exitProcedure(1, "p2");
      }
    };
    try {
      _t_4 = "body one";
      await _t_3(__env, _t_4);
    } catch(_exc_) {
      __env.reportError("Failed to invoke action", _exc_);
    }
    __env.clearGetCache();
    try {
      _t_5 = "body two";
      await _t_3(__env, _t_5);
    } catch(_exc_) {
      __env.reportError("Failed to invoke action", _exc_);
    }
  } finally {
    await __env.exitProcedure(0, "p1");
  }`, `"use strict";
  let _t_0;
  let _t_1;
  let _t_2;
  let _t_3;
  try {
    _t_0 = __scope.p1;
    _t_1 = "title one";
    await _t_0(__env, _t_1);
  } catch(_exc_) {
    __env.reportError("Failed to invoke action", _exc_);
  }
  __env.clearGetCache();
  try {
    _t_2 = __scope.p1;
    _t_3 = "title two";
    await _t_2(__env, _t_3);
  } catch(_exc_) {
    __env.reportError("Failed to invoke action", _exc_);
  }`]],

    //61 nested procedures, called from a rule
    [`let procedure p1(p_foo : String) := {
        let procedure p2(p_bar : String) := {
            now => @com.tumblr.blog.post_text(title = p_foo, body = p_bar);
        };
        now => p2(p_bar = "body one");
        now => p2(p_bar = "body two");
    };
    timer(base=makeDate(), interval=1h) => p1(p_foo = "title one");
    `,
    [`"use strict";
  let _t_3;
  let _t_4;
  let _t_5;
  await __env.enterProcedure(0, "p1");
  try {
    _t_3 = async function(__env, _t_1) {
      "use strict";
      let _t_2;
      await __env.enterProcedure(1, "p2");
      try {
        try {
          _t_2 = {};
          _t_2.title = _t_0;
          _t_2.body = _t_1;
          await __env.invokeAction("com.tumblr.blog", { }, "post_text", _t_2);
        } catch(_exc_) {
          __env.reportError("Failed to invoke action", _exc_);
        }
      } finally {
        await __env.exitProcedure(1, "p2");
      }
    };
    try {
      _t_4 = "body one";
      await _t_3(__env, _t_4);
    } catch(_exc_) {
      __env.reportError("Failed to invoke action", _exc_);
    }
    __env.clearGetCache();
    try {
      _t_5 = "body two";
      await _t_3(__env, _t_5);
    } catch(_exc_) {
      __env.reportError("Failed to invoke action", _exc_);
    }
  } finally {
    await __env.exitProcedure(0, "p1");
  }`, `"use strict";
  let _t_0;
  let _t_1;
  let _t_2;
  let _t_3;
  let _t_4;
  let _t_5;
  try {
    _t_1 = new Date(XNOWX);
    _t_2 = 3600000;
    _t_0 = await __env.invokeTimer(_t_1, _t_2, null);
    {
      let _iter_tmp = await _t_0.next();
      while (!_iter_tmp.done) {
        _t_3 = _iter_tmp.value;
        try {
          _t_4 = __scope.p1;
          _t_5 = "title one";
          await _t_4(__env, _t_5);
        } catch(_exc_) {
          __env.reportError("Failed to invoke action", _exc_);
        }
        _iter_tmp = await _t_0.next();
      }
    }
  } catch(_exc_) {
    __env.reportError("Failed to invoke timer", _exc_);
  }`]],

    //62
    [`attimer(time=[makeTime(9,0), makeTime(15,0)]) => @org.thingpedia.builtin.thingengine.builtin.say(message="it's 9am or 3pm");`,
  [`"use strict";
  let _t_0;
  let _t_1;
  let _t_2;
  let _t_3;
  let _t_4;
  let _t_5;
  let _t_6;
  try {
    _t_1 = new Array(2);
    _t_2 = new __builtin.Time(9, 0, 0);
    _t_1[0] = _t_2;
    _t_3 = new __builtin.Time(15, 0, 0);
    _t_1[1] = _t_3;
    _t_0 = await __env.invokeAtTimer(_t_1, null);
    {
      let _iter_tmp = await _t_0.next();
      while (!_iter_tmp.done) {
        _t_4 = _iter_tmp.value;
        try {
          _t_5 = {};
          _t_6 = "it's 9am or 3pm";
          _t_5.message = _t_6;
          await __env.invokeAction("org.thingpedia.builtin.thingengine.builtin", { }, "say", _t_5);
        } catch(_exc_) {
          __env.reportError("Failed to invoke action", _exc_);
        }
        _iter_tmp = await _t_0.next();
      }
    }
  } catch(_exc_) {
    __env.reportError("Failed to invoke at-timer", _exc_);
  }`]],

    //63
    [`now => result(@com.thecatapi.get) => notify;`,
    [`"use strict";
  let _t_0;
  let _t_1;
  let _t_2;
  let _t_3;
  let _t_4;
  let _t_5;
  let _t_6;
  let _t_7;
  let _t_8;
  let _t_9;
  try {
    _t_0 = -1;
    _t_1 = await __env.readResult("com.thecatapi:get", _t_0);
    _t_2 = _t_1[Symbol.iterator]();
    {
      let _iter_tmp = await _t_2.next();
      while (!_iter_tmp.done) {
        _t_3 = _iter_tmp.value;
        _t_4 = _t_3[0];
        _t_5 = _t_3[1];
        _t_6 = _t_5.__response;
        _t_7 = _t_5.image_id;
        _t_8 = _t_5.picture_url;
        _t_9 = _t_5.link;
        try {
          await __env.output(String(_t_4), _t_5);
        } catch(_exc_) {
          __env.reportError("Failed to invoke action", _exc_);
        }
        _iter_tmp = await _t_2.next();
      }
    }
  } catch(_exc_) {
    __env.reportError("Failed to invoke readResult", _exc_);
  }`]],

    //64
    [`now => result(@com.thecatapi.get[-2]) => notify;`,
    [`"use strict";
  let _t_0;
  let _t_1;
  let _t_2;
  let _t_3;
  let _t_4;
  let _t_5;
  let _t_6;
  let _t_7;
  let _t_8;
  let _t_9;
  try {
    _t_0 = -2;
    _t_1 = await __env.readResult("com.thecatapi:get", _t_0);
    _t_2 = _t_1[Symbol.iterator]();
    {
      let _iter_tmp = await _t_2.next();
      while (!_iter_tmp.done) {
        _t_3 = _iter_tmp.value;
        _t_4 = _t_3[0];
        _t_5 = _t_3[1];
        _t_6 = _t_5.__response;
        _t_7 = _t_5.image_id;
        _t_8 = _t_5.picture_url;
        _t_9 = _t_5.link;
        try {
          await __env.output(String(_t_4), _t_5);
        } catch(_exc_) {
          __env.reportError("Failed to invoke action", _exc_);
        }
        _iter_tmp = await _t_2.next();
      }
    }
  } catch(_exc_) {
    __env.reportError("Failed to invoke readResult", _exc_);
  }`]],

    //65
    [`now => result(@com.thecatapi.get) => @com.twitter.post_picture(picture_url=picture_url, caption="cat");`,
    [`"use strict";
  let _t_0;
  let _t_1;
  let _t_2;
  let _t_3;
  let _t_4;
  let _t_5;
  let _t_6;
  let _t_7;
  let _t_8;
  let _t_9;
  let _t_10;
  let _t_11;
  let _t_12;
  try {
    _t_0 = -1;
    _t_1 = await __env.readResult("com.thecatapi:get", _t_0);
    _t_2 = _t_1[Symbol.iterator]();
    {
      let _iter_tmp = await _t_2.next();
      while (!_iter_tmp.done) {
        _t_3 = _iter_tmp.value;
        _t_4 = _t_3[0];
        _t_5 = _t_3[1];
        _t_6 = _t_5.__response;
        _t_7 = _t_5.image_id;
        _t_8 = _t_5.picture_url;
        _t_9 = _t_5.link;
        try {
          _t_10 = {};
          _t_11 = String (_t_8);
          _t_10.picture_url = _t_11;
          _t_12 = "cat";
          _t_10.caption = _t_12;
          await __env.invokeAction("com.twitter", { }, "post_picture", _t_10);
        } catch(_exc_) {
          __env.reportError("Failed to invoke action", _exc_);
        }
        _iter_tmp = await _t_2.next();
      }
    }
  } catch(_exc_) {
    __env.reportError("Failed to invoke readResult", _exc_);
  }`]],

    //66
    [`now => @com.spotify.get_currently_playing() => @com.spotify.add_songs_to_playlist(songs=[song], playlist="my favorite");`,
  [`"use strict";
  let _t_0;
  let _t_1;
  let _t_2;
  let _t_3;
  let _t_4;
  let _t_5;
  let _t_6;
  let _t_7;
  let _t_8;
  let _t_9;
  let _t_10;
  try {
    _t_0 = {};
    _t_1 = await __env.invokeQuery("com.spotify", { }, "get_currently_playing", _t_0);
    _t_2 = _t_1[Symbol.iterator]();
    {
      let _iter_tmp = await _t_2.next();
      while (!_iter_tmp.done) {
        _t_3 = _iter_tmp.value;
        _t_4 = _t_3[0];
        _t_5 = _t_3[1];
        _t_6 = _t_5.__response;
        _t_7 = _t_5.song;
        try {
          _t_8 = {};
          _t_9 = new Array(1);
          _t_9[0] = _t_7;
          _t_8.songs = _t_9;
          _t_10 = "my favorite";
          _t_8.playlist = _t_10;
          await __env.invokeAction("com.spotify", { }, "add_songs_to_playlist", _t_8);
        } catch(_exc_) {
          __env.reportError("Failed to invoke action", _exc_);
        }
        _iter_tmp = await _t_2.next();
      }
    }
  } catch(_exc_) {
    __env.reportError("Failed to invoke query", _exc_);
  }`]],

    //67 Database query
    [`now => [id] of @org.wikidata.person(), P735 ~= 'Bob' => notify;`,
    [`"use strict";
  let _t_0;
  let _t_1;
  let _t_2;
  let _t_3;
  let _t_4;
  let _t_5;
  let _t_6;
  let _t_7;
  try {
    _t_1 = __ast[0];
    _t_0 = await __env.invokeDBQuery("org.wikidata", { }, _t_1);
    _t_2 = _t_0[Symbol.iterator]();
    {
      let _iter_tmp = await _t_2.next();
      while (!_iter_tmp.done) {
        _t_3 = _iter_tmp.value;
        _t_4 = _t_3[0];
        _t_5 = _t_3[1];
        _t_6 = _t_5.__response;
        _t_7 = _t_5.id;
        try {
          await __env.output(String(_t_4), _t_5);
        } catch(_exc_) {
          __env.reportError("Failed to invoke action", _exc_);
        }
        _iter_tmp = await _t_2.next();
      }
    }
  } catch(_exc_) {
    __env.reportError("Failed to invoke query", _exc_);
  }`]],

    //68 Auto apply projections to database query
    [`now => @org.wikidata.person(), P735 ~= 'Bob' => notify;`,
    [`"use strict";
  let _t_0;
  let _t_1;
  let _t_2;
  let _t_3;
  let _t_4;
  let _t_5;
  let _t_6;
  let _t_7;
  try {
    _t_1 = __ast[0];
    _t_0 = await __env.invokeDBQuery("org.wikidata", { }, _t_1);
    _t_2 = _t_0[Symbol.iterator]();
    {
      let _iter_tmp = await _t_2.next();
      while (!_iter_tmp.done) {
        _t_3 = _iter_tmp.value;
        _t_4 = _t_3[0];
        _t_5 = _t_3[1];
        _t_6 = _t_5.__response;
        _t_7 = _t_5.id;
        try {
          await __env.output(String(_t_4), _t_5);
        } catch(_exc_) {
          __env.reportError("Failed to invoke action", _exc_);
        }
        _iter_tmp = await _t_2.next();
      }
    }
  } catch(_exc_) {
    __env.reportError("Failed to invoke query", _exc_);
  }`]],

    //69 Auto apply projections to database query
    [`now => @org.wikidata.person(), P735 ~= 'Bob' => @com.twitter.post(status=P1477);`,
    [`"use strict";
  let _t_0;
  let _t_1;
  let _t_2;
  let _t_3;
  let _t_4;
  let _t_5;
  let _t_6;
  let _t_7;
  let _t_8;
  try {
    _t_1 = __ast[0];
    _t_0 = await __env.invokeDBQuery("org.wikidata", { }, _t_1);
    _t_2 = _t_0[Symbol.iterator]();
    {
      let _iter_tmp = await _t_2.next();
      while (!_iter_tmp.done) {
        _t_3 = _iter_tmp.value;
        _t_4 = _t_3[0];
        _t_5 = _t_3[1];
        _t_6 = _t_5.__response;
        _t_7 = _t_5.P1477;
        try {
          _t_8 = {};
          _t_8.status = _t_7;
          await __env.invokeAction("com.twitter", { }, "post", _t_8);
        } catch(_exc_) {
          __env.reportError("Failed to invoke action", _exc_);
        }
        _iter_tmp = await _t_2.next();
      }
    }
  } catch(_exc_) {
    __env.reportError("Failed to invoke query", _exc_);
  }`]],

    //70
    [`timer(base=makeDate(), interval=1h, frequency=3) => notify;`,
    [`"use strict";
  let _t_0;
  let _t_1;
  let _t_2;
  let _t_3;
  let _t_4;
  try {
    _t_1 = new Date(XNOWX);
    _t_2 = 3600000;
    _t_3 = 3;
    _t_0 = await __env.invokeTimer(_t_1, _t_2, _t_3);
    {
      let _iter_tmp = await _t_0.next();
      while (!_iter_tmp.done) {
        _t_4 = _iter_tmp.value;
        try {
          await __env.output(null, _t_4);
        } catch(_exc_) {
          __env.reportError("Failed to invoke action", _exc_);
        }
        _iter_tmp = await _t_0.next();
      }
    }
  } catch(_exc_) {
    __env.reportError("Failed to invoke timer", _exc_);
  }`]],

    //71 compound types & function inheritance
    [`now => @org.thingpedia.test.compounds_and_inheritance.foo() => notify;`,
    [`"use strict";
  let _t_0;
  let _t_1;
  let _t_2;
  let _t_3;
  let _t_4;
  let _t_5;
  let _t_6;
  let _t_7;
  let _t_8;
  let _t_9;
  let _t_10;
  let _t_11;
  let _t_12;
  let _t_13;
  let _t_14;
  let _t_15;
  try {
    _t_0 = {};
    _t_1 = await __env.invokeQuery("org.thingpedia.test.compounds_and_inheritance", { }, "foo", _t_0);
    _t_2 = _t_1[Symbol.iterator]();
    {
      let _iter_tmp = await _t_2.next();
      while (!_iter_tmp.done) {
        _t_3 = _iter_tmp.value;
        _t_4 = _t_3[0];
        _t_5 = _t_3[1];
        _t_6 = _t_5.__response;
        _t_7 = _t_5.compound;
        if (_t_7) {
          _t_8 = _t_7.nestedCompound;
          if (_t_8) {
            _t_9 = _t_8.p1;
            _t_10 = _t_8.p2;
          } else {

          }
          _t_11 = _t_7.p3;
        } else {

        }
        _t_12 = _t_5.p4;
        _t_13 = _t_5.name;
        _t_14 = _t_5.description;
        _t_15 = _t_5.image;
        try {
          await __env.output(String(_t_4), _t_5);
        } catch(_exc_) {
          __env.reportError("Failed to invoke action", _exc_);
        }
        _iter_tmp = await _t_2.next();
      }
    }
  } catch(_exc_) {
    __env.reportError("Failed to invoke query", _exc_);
  }`]],

    //72 parameter passing with compound types
    [`now => @org.thingpedia.test.compounds_and_inheritance.foo() => @com.twitter.post(status=compound.nestedCompound.p1);`,
    [`"use strict";
  let _t_0;
  let _t_1;
  let _t_2;
  let _t_3;
  let _t_4;
  let _t_5;
  let _t_6;
  let _t_7;
  let _t_8;
  let _t_9;
  let _t_10;
  let _t_11;
  let _t_12;
  let _t_13;
  let _t_14;
  let _t_15;
  let _t_16;
  try {
    _t_0 = {};
    _t_1 = await __env.invokeQuery("org.thingpedia.test.compounds_and_inheritance", { }, "foo", _t_0);
    _t_2 = _t_1[Symbol.iterator]();
    {
      let _iter_tmp = await _t_2.next();
      while (!_iter_tmp.done) {
        _t_3 = _iter_tmp.value;
        _t_4 = _t_3[0];
        _t_5 = _t_3[1];
        _t_6 = _t_5.__response;
        _t_7 = _t_5.compound;
        if (_t_7) {
          _t_8 = _t_7.nestedCompound;
          if (_t_8) {
            _t_9 = _t_8.p1;
            _t_10 = _t_8.p2;
          } else {

          }
          _t_11 = _t_7.p3;
        } else {

        }
        _t_12 = _t_5.p4;
        _t_13 = _t_5.name;
        _t_14 = _t_5.description;
        _t_15 = _t_5.image;
        try {
          _t_16 = {};
          _t_16.status = _t_9;
          await __env.invokeAction("com.twitter", { }, "post", _t_16);
        } catch(_exc_) {
          __env.reportError("Failed to invoke action", _exc_);
        }
        _iter_tmp = await _t_2.next();
      }
    }
  } catch(_exc_) {
    __env.reportError("Failed to invoke query", _exc_);
  }`]],

    // 73 monitor of that stuff
    [`monitor @org.thingpedia.test.compounds_and_inheritance.foo() => notify;`,
    [`"use strict";
  let _t_0;
  let _t_1;
  let _t_2;
  let _t_3;
  let _t_4;
  let _t_5;
  let _t_6;
  let _t_7;
  let _t_8;
  let _t_9;
  let _t_10;
  let _t_11;
  let _t_12;
  let _t_13;
  let _t_14;
  let _t_15;
  let _t_16;
  let _t_17;
  _t_0 = await __env.readState(0);
  try {
    _t_1 = {};
    _t_2 = await __env.invokeMonitor("org.thingpedia.test.compounds_and_inheritance", { }, "foo", _t_1, false);
    {
      let _iter_tmp = await _t_2.next();
      while (!_iter_tmp.done) {
        _t_3 = _iter_tmp.value;
        _t_4 = _t_3[0];
        _t_5 = _t_3[1];
        _t_6 = _t_5.__response;
        _t_7 = _t_5.compound;
        if (_t_7) {
          _t_8 = _t_7.nestedCompound;
          if (_t_8) {
            _t_9 = _t_8.p1;
            _t_10 = _t_8.p2;
          } else {

          }
          _t_11 = _t_7.p3;
        } else {

        }
        _t_12 = _t_5.p4;
        _t_13 = _t_5.name;
        _t_14 = _t_5.description;
        _t_15 = _t_5.image;
        _t_16 = __builtin.isNewTuple(_t_0, _t_5, ["compound", "p4", "name", "description", "image"]);
        _t_17 = __builtin.addTuple(_t_0, _t_5);
        await __env.writeState(0, _t_17);
        _t_0 = _t_17;
        if (_t_16) {
          try {
            await __env.output(String(_t_4), _t_5);
          } catch(_exc_) {
            __env.reportError("Failed to invoke action", _exc_);
          }
        } else {

        }
        _iter_tmp = await _t_2.next();
      }
    }
  } catch(_exc_) {
    __env.reportError("Failed to invoke trigger", _exc_);
  }`]],

    // 74 filter() compute operator
    [`now => compute (review filter { reviewRating.ratingValue >= 0 }) of @org.schema.restaurant() => notify;`,
    [`"use strict";
  let _t_0;
  let _t_1;
  let _t_2;
  let _t_3;
  let _t_4;
  let _t_5;
  let _t_6;
  let _t_7;
  let _t_8;
  let _t_9;
  let _t_10;
  let _t_11;
  let _t_12;
  let _t_13;
  let _t_14;
  let _t_15;
  let _t_16;
  let _t_17;
  let _t_18;
  let _t_19;
  let _t_20;
  let _t_21;
  let _t_22;
  let _t_23;
  let _t_24;
  let _t_25;
  let _t_26;
  let _t_27;
  let _t_28;
  let _t_29;
  let _t_30;
  let _t_31;
  let _t_32;
  let _t_33;
  let _t_34;
  let _t_35;
  try {
    _t_0 = {};
    _t_1 = await __env.invokeQuery("org.schema", { }, "restaurant", _t_0);
    _t_2 = _t_1[Symbol.iterator]();
    {
      let _iter_tmp = await _t_2.next();
      while (!_iter_tmp.done) {
        _t_3 = _iter_tmp.value;
        _t_4 = _t_3[0];
        _t_5 = _t_3[1];
        _t_6 = _t_5.__response;
        _t_7 = _t_5.name;
        _t_8 = _t_5.serveCuisine;
        _t_9 = _t_5.priceRange;
        _t_10 = _t_5.openingHours;
        _t_11 = _t_5.address;
        if (_t_11) {
          _t_12 = _t_11.addressCountry;
          _t_13 = _t_11.addressRegion;
          _t_14 = _t_11.postalCode;
          _t_15 = _t_11.streetAddress;
          _t_16 = _t_11.addressLocality;
        } else {

        }
        _t_17 = _t_5.aggregateRating;
        if (_t_17) {
          _t_18 = _t_17.ratingValue;
          _t_19 = _t_17.reviewCount;
        } else {

        }
        _t_20 = _t_5.review;
        _t_21 = _t_5.telephone;
        _t_22 = _t_5.brand;
        if (_t_22) {
          _t_23 = _t_22.name;
        } else {

        }
        _t_24 = _t_5.description;
        _t_25 = _t_5.image;
        _t_26 = _t_5.geo;
        _t_27 = _t_20.filter((_t_28) => {
          _t_29 = _t_28.reviewRating;
          if (_t_29) {
            _t_30 = _t_29.ratingValue;
          } else {

          }
          _t_31 = _t_28.datePublished;
          _t_32 = _t_28.description;
          _t_33 = _t_28.author;
          _t_35 = 0;
          _t_34 = _t_30 >= _t_35;
          return _t_34;
        });
        _t_5.review = _t_27;
        try {
          await __env.output(String(_t_4), _t_5);
        } catch(_exc_) {
          __env.reportError("Failed to invoke action", _exc_);
        }
        _iter_tmp = await _t_2.next();
      }
    }
  } catch(_exc_) {
    __env.reportError("Failed to invoke query", _exc_);
  }`]],

    // 75 aggregate filter
    [`now => @org.schema.restaurant(), count(review filter { reviewRating.ratingValue >= 0 }) >= 0 => notify;`,
    [`"use strict";
  let _t_0;
  let _t_1;
  let _t_2;
  let _t_3;
  let _t_4;
  let _t_5;
  let _t_6;
  let _t_7;
  let _t_8;
  let _t_9;
  let _t_10;
  let _t_11;
  let _t_12;
  let _t_13;
  let _t_14;
  let _t_15;
  let _t_16;
  let _t_17;
  let _t_18;
  let _t_19;
  let _t_20;
  let _t_21;
  let _t_22;
  let _t_23;
  let _t_24;
  let _t_25;
  let _t_26;
  let _t_27;
  let _t_28;
  let _t_29;
  let _t_30;
  let _t_31;
  let _t_32;
  let _t_33;
  let _t_34;
  let _t_35;
  let _t_36;
  let _t_37;
  let _t_38;
  try {
    _t_0 = {};
    _t_1 = await __env.invokeQuery("org.schema", { }, "restaurant", _t_0);
    _t_2 = _t_1[Symbol.iterator]();
    {
      let _iter_tmp = await _t_2.next();
      while (!_iter_tmp.done) {
        _t_3 = _iter_tmp.value;
        _t_4 = _t_3[0];
        _t_5 = _t_3[1];
        _t_6 = _t_5.__response;
        _t_7 = _t_5.name;
        _t_8 = _t_5.serveCuisine;
        _t_9 = _t_5.priceRange;
        _t_10 = _t_5.openingHours;
        _t_11 = _t_5.address;
        if (_t_11) {
          _t_12 = _t_11.addressCountry;
          _t_13 = _t_11.addressRegion;
          _t_14 = _t_11.postalCode;
          _t_15 = _t_11.streetAddress;
          _t_16 = _t_11.addressLocality;
        } else {

        }
        _t_17 = _t_5.aggregateRating;
        if (_t_17) {
          _t_18 = _t_17.ratingValue;
          _t_19 = _t_17.reviewCount;
        } else {

        }
        _t_20 = _t_5.review;
        _t_21 = _t_5.telephone;
        _t_22 = _t_5.brand;
        if (_t_22) {
          _t_23 = _t_22.name;
        } else {

        }
        _t_24 = _t_5.description;
        _t_25 = _t_5.image;
        _t_26 = _t_5.geo;
        _t_28 = _t_20.filter((_t_29) => {
          _t_30 = _t_29.reviewRating;
          if (_t_30) {
            _t_31 = _t_30.ratingValue;
          } else {

          }
          _t_32 = _t_29.datePublished;
          _t_33 = _t_29.description;
          _t_34 = _t_29.author;
          _t_36 = 0;
          _t_35 = _t_31 >= _t_36;
          return _t_35;
        });
        _t_37 = __builtin.count(_t_28);
        _t_38 = 0;
        _t_27 = _t_37 >= _t_38;
        if (_t_27) {
          try {
            await __env.output(String(_t_4), _t_5);
          } catch(_exc_) {
            __env.reportError("Failed to invoke action", _exc_);
          }
        } else {

        }
        _iter_tmp = await _t_2.next();
      }
    }
  } catch(_exc_) {
    __env.reportError("Failed to invoke query", _exc_);
  }`]],

    // 76 distance operator
    [`now => compute distance(geo, makeLocation(90,0,"north pole")) of @org.schema.place() => notify;`,
    [`"use strict";
  let _t_0;
  let _t_1;
  let _t_2;
  let _t_3;
  let _t_4;
  let _t_5;
  let _t_6;
  let _t_7;
  let _t_8;
  let _t_9;
  let _t_10;
  let _t_11;
  let _t_12;
  let _t_13;
  let _t_14;
  let _t_15;
  let _t_16;
  let _t_17;
  let _t_18;
  try {
    _t_0 = {};
    _t_1 = await __env.invokeQuery("org.schema", { }, "place", _t_0);
    _t_2 = _t_1[Symbol.iterator]();
    {
      let _iter_tmp = await _t_2.next();
      while (!_iter_tmp.done) {
        _t_3 = _iter_tmp.value;
        _t_4 = _t_3[0];
        _t_5 = _t_3[1];
        _t_6 = _t_5.__response;
        _t_7 = _t_5.address;
        if (_t_7) {
          _t_8 = _t_7.addressCountry;
          _t_9 = _t_7.addressRegion;
          _t_10 = _t_7.postalCode;
          _t_11 = _t_7.streetAddress;
          _t_12 = _t_7.addressLocality;
        } else {

        }
        _t_13 = _t_5.geo;
        _t_14 = _t_5.name;
        _t_15 = _t_5.description;
        _t_16 = _t_5.image;
        _t_17 = new __builtin.Location(90, 0, "north pole");
        _t_18 = __builtin.distance(_t_13, _t_17);
        _t_5.distance = _t_18;
        try {
          await __env.output(String(_t_4), _t_5);
        } catch(_exc_) {
          __env.reportError("Failed to invoke action", _exc_);
        }
        _iter_tmp = await _t_2.next();
      }
    }
  } catch(_exc_) {
    __env.reportError("Failed to invoke query", _exc_);
  }`]],

  //77 Test screen selection as a context
    [`now => @com.twitter.post(status=$context.selection: String);`,
    [`"use strict";
  let _t_0;
  let _t_1;
  try {
    _t_0 = {};
    _t_1 = await __env.loadContext("selection", "String");
    _t_0.status = _t_1;
    await __env.invokeAction("com.twitter", { }, "post", _t_0);
  } catch(_exc_) {
    __env.reportError("Failed to invoke action", _exc_);
  }`]],

    //78 Test device selector
    [`now => @light-bulb(name="bedroom").set_power(power=enum(on));`,
    [`"use strict";
  let _t_0;
  let _t_1;
  try {
    _t_0 = {};
    _t_1 = "on";
    _t_0.power = _t_1;
    await __env.invokeAction("light-bulb", { name: "bedroom", }, "set_power", _t_0);
  } catch(_exc_) {
    __env.reportError("Failed to invoke action", _exc_);
  }`]],

    //79 Test device selector (with explicit all)
    [`now => @light-bulb(name="bedroom", all=true).set_power(power=enum(on));`,
    [`"use strict";
  let _t_0;
  let _t_1;
  try {
    _t_0 = {};
    _t_1 = "on";
    _t_0.power = _t_1;
    await __env.invokeAction("light-bulb", { name: "bedroom", }, "set_power", _t_0);
  } catch(_exc_) {
    __env.reportError("Failed to invoke action", _exc_);
  }`]],

    // 80 computation (+)
    [`now => compute ("Author: " + author) of @com.twitter.home_timeline() => notify;`,
    [`"use strict";
  let _t_0;
  let _t_1;
  let _t_2;
  let _t_3;
  let _t_4;
  let _t_5;
  let _t_6;
  let _t_7;
  let _t_8;
  let _t_9;
  let _t_10;
  let _t_11;
  let _t_12;
  let _t_13;
  let _t_14;
  try {
    _t_0 = {};
    _t_1 = await __env.invokeQuery("com.twitter", { }, "home_timeline", _t_0);
    _t_2 = _t_1[Symbol.iterator]();
    {
      let _iter_tmp = await _t_2.next();
      while (!_iter_tmp.done) {
        _t_3 = _iter_tmp.value;
        _t_4 = _t_3[0];
        _t_5 = _t_3[1];
        _t_6 = _t_5.__response;
        _t_7 = _t_5.text;
        _t_8 = _t_5.hashtags;
        _t_9 = _t_5.urls;
        _t_10 = _t_5.author;
        _t_11 = _t_5.in_reply_to;
        _t_12 = _t_5.tweet_id;
        _t_13 = "Author: ";
        _t_14 = _t_13 + _t_10;
        _t_5.result = _t_14;
        try {
          await __env.output(String(_t_4), _t_5);
        } catch(_exc_) {
          __env.reportError("Failed to invoke action", _exc_);
        }
        _iter_tmp = await _t_2.next();
      }
    }
  } catch(_exc_) {
    __env.reportError("Failed to invoke query", _exc_);
  }`]],

    // 81 computation (-)
    [`now => compute (file_size - 1GiB) of @com.google.drive.list_drive_files() => notify;`,
    [`"use strict";
  let _t_0;
  let _t_1;
  let _t_2;
  let _t_3;
  let _t_4;
  let _t_5;
  let _t_6;
  let _t_7;
  let _t_8;
  let _t_9;
  let _t_10;
  let _t_11;
  let _t_12;
  let _t_13;
  let _t_14;
  let _t_15;
  let _t_16;
  let _t_17;
  let _t_18;
  let _t_19;
  try {
    _t_0 = {};
    _t_1 = await __env.invokeQuery("com.google.drive", { }, "list_drive_files", _t_0);
    _t_2 = _t_1[Symbol.iterator]();
    {
      let _iter_tmp = await _t_2.next();
      while (!_iter_tmp.done) {
        _t_3 = _iter_tmp.value;
        _t_4 = _t_3[0];
        _t_5 = _t_3[1];
        _t_6 = _t_5.order_by;
        _t_7 = _t_5.__response;
        _t_8 = _t_5.file_id;
        _t_9 = _t_5.file_name;
        _t_10 = _t_5.mime_type;
        _t_11 = _t_5.description;
        _t_12 = _t_5.starred;
        _t_13 = _t_5.created_time;
        _t_14 = _t_5.modified_time;
        _t_15 = _t_5.file_size;
        _t_16 = _t_5.last_modified_by;
        _t_17 = _t_5.link;
        _t_18 = 1073741824;
        _t_19 = _t_15 - _t_18;
        _t_5.result = _t_19;
        try {
          await __env.output(String(_t_4), _t_5);
        } catch(_exc_) {
          __env.reportError("Failed to invoke action", _exc_);
        }
        _iter_tmp = await _t_2.next();
      }
    }
  } catch(_exc_) {
    __env.reportError("Failed to invoke query", _exc_);
  }`]],

    // 82 date
    [`now => @org.thingpedia.weather.sunrise(location=new Location(90, 0, "north pole"), date=new Date("2020-01-04T18:08:20.451Z")) => notify;`,
    [`"use strict";
  let _t_0;
  let _t_1;
  let _t_2;
  let _t_3;
  let _t_4;
  let _t_5;
  let _t_6;
  let _t_7;
  let _t_8;
  let _t_9;
  let _t_10;
  try {
    _t_0 = {};
    _t_1 = new __builtin.Location(90, 0, "north pole");
    _t_0.location = _t_1;
    _t_2 = new Date(XNOWX);
    _t_0.date = _t_2;
    _t_3 = await __env.invokeQuery("org.thingpedia.weather", { }, "sunrise", _t_0);
    _t_4 = _t_3[Symbol.iterator]();
    {
      let _iter_tmp = await _t_4.next();
      while (!_iter_tmp.done) {
        _t_5 = _iter_tmp.value;
        _t_6 = _t_5[0];
        _t_7 = _t_5[1];
        _t_8 = _t_7.__response;
        _t_9 = _t_7.sunrise_time;
        _t_10 = _t_7.sunset_time;
        try {
          await __env.output(String(_t_6), _t_7);
        } catch(_exc_) {
          __env.reportError("Failed to invoke action", _exc_);
        }
        _iter_tmp = await _t_4.next();
      }
    }
  } catch(_exc_) {
    __env.reportError("Failed to invoke query", _exc_);
  }`]],

    // 83 computed date (+)
    [`now => @org.thingpedia.weather.sunrise(location=new Location(90, 0, "north pole"), date=new Date("2020-01-04T18:08:20.451Z") + 7min) => notify;`,
    [`"use strict";
  let _t_0;
  let _t_1;
  let _t_2;
  let _t_3;
  let _t_4;
  let _t_5;
  let _t_6;
  let _t_7;
  let _t_8;
  let _t_9;
  let _t_10;
  let _t_11;
  let _t_12;
  try {
    _t_0 = {};
    _t_1 = new __builtin.Location(90, 0, "north pole");
    _t_0.location = _t_1;
    _t_2 = new Date(XNOWX);
    _t_3 = 420000;
    _t_4 = __builtin.dateAdd(_t_2, _t_3);
    _t_0.date = _t_4;
    _t_5 = await __env.invokeQuery("org.thingpedia.weather", { }, "sunrise", _t_0);
    _t_6 = _t_5[Symbol.iterator]();
    {
      let _iter_tmp = await _t_6.next();
      while (!_iter_tmp.done) {
        _t_7 = _iter_tmp.value;
        _t_8 = _t_7[0];
        _t_9 = _t_7[1];
        _t_10 = _t_9.__response;
        _t_11 = _t_9.sunrise_time;
        _t_12 = _t_9.sunset_time;
        try {
          await __env.output(String(_t_8), _t_9);
        } catch(_exc_) {
          __env.reportError("Failed to invoke action", _exc_);
        }
        _iter_tmp = await _t_6.next();
      }
    }
  } catch(_exc_) {
    __env.reportError("Failed to invoke query", _exc_);
  }`]],

    // 84 computed date (-)
    [`now => @org.thingpedia.weather.sunrise(location=new Location(90, 0, "north pole"), date=new Date("2020-01-04T18:08:20.451Z") - 7min) => notify;`,
    [`"use strict";
  let _t_0;
  let _t_1;
  let _t_2;
  let _t_3;
  let _t_4;
  let _t_5;
  let _t_6;
  let _t_7;
  let _t_8;
  let _t_9;
  let _t_10;
  let _t_11;
  let _t_12;
  try {
    _t_0 = {};
    _t_1 = new __builtin.Location(90, 0, "north pole");
    _t_0.location = _t_1;
    _t_2 = new Date(XNOWX);
    _t_3 = 420000;
    _t_4 = __builtin.dateSub(_t_2, _t_3);
    _t_0.date = _t_4;
    _t_5 = await __env.invokeQuery("org.thingpedia.weather", { }, "sunrise", _t_0);
    _t_6 = _t_5[Symbol.iterator]();
    {
      let _iter_tmp = await _t_6.next();
      while (!_iter_tmp.done) {
        _t_7 = _iter_tmp.value;
        _t_8 = _t_7[0];
        _t_9 = _t_7[1];
        _t_10 = _t_9.__response;
        _t_11 = _t_9.sunrise_time;
        _t_12 = _t_9.sunset_time;
        try {
          await __env.output(String(_t_8), _t_9);
        } catch(_exc_) {
          __env.reportError("Failed to invoke action", _exc_);
        }
        _iter_tmp = await _t_6.next();
      }
    }
  } catch(_exc_) {
    __env.reportError("Failed to invoke query", _exc_);
  }`]],

    // 85 compilation bug
    [`now => (sort distance asc of (compute (distance(geo, new Location(13, 13))) of (@com.yelp.restaurant())))[1] => notify;`,
[`"use strict";
  let _t_0;
  let _t_1;
  let _t_2;
  let _t_3;
  let _t_4;
  let _t_5;
  let _t_6;
  let _t_7;
  let _t_8;
  let _t_9;
  let _t_10;
  let _t_11;
  let _t_12;
  let _t_13;
  let _t_14;
  let _t_15;
  let _t_16;
  let _t_17;
  let _t_18;
  let _t_19;
  let _t_20;
  let _t_21;
  let _t_22;
  let _t_23;
  let _t_24;
  let _t_25;
  let _t_26;
  let _t_27;
  let _t_28;
  let _t_29;
  let _t_30;
  let _t_31;
  let _t_32;
  let _t_33;
  _t_0 = false;
  _t_1 = Infinity;
  try {
    _t_4 = {};
    _t_5 = await __env.invokeQuery("com.yelp", { }, "restaurant", _t_4);
    _t_6 = _t_5[Symbol.iterator]();
    {
      let _iter_tmp = await _t_6.next();
      while (!_iter_tmp.done) {
        _t_7 = _iter_tmp.value;
        _t_8 = _t_7[0];
        _t_9 = _t_7[1];
        _t_10 = _t_9.__response;
        _t_11 = _t_9.id;
        _t_12 = _t_9.image_url;
        _t_13 = _t_9.link;
        _t_14 = _t_9.cuisines;
        _t_15 = _t_9.price;
        _t_16 = _t_9.rating;
        _t_17 = _t_9.reviewCount;
        _t_18 = _t_9.geo;
        _t_19 = _t_9.phone;
        _t_20 = new __builtin.Location(13, 13, null);
        _t_21 = __builtin.distance(_t_18, _t_20);
        _t_9.distance = _t_21;
        _t_22 = _t_1 > _t_21;
        if (_t_22) {
          _t_1 = _t_21;
          _t_2 = _t_9;
          _t_3 = _t_8;
          _t_0 = true;
        } else {

        }
        _iter_tmp = await _t_6.next();
      }
    }
  } catch(_exc_) {
    __env.reportError("Failed to invoke query", _exc_);
  }
  if (_t_0) {
    _t_23 = _t_2.__response;
    _t_24 = _t_2.id;
    _t_25 = _t_2.image_url;
    _t_26 = _t_2.link;
    _t_27 = _t_2.cuisines;
    _t_28 = _t_2.price;
    _t_29 = _t_2.rating;
    _t_30 = _t_2.reviewCount;
    _t_31 = _t_2.geo;
    _t_32 = _t_2.phone;
    _t_33 = _t_2.distance;
    try {
      await __env.output(String(_t_3), _t_2);
    } catch(_exc_) {
      __env.reportError("Failed to invoke action", _exc_);
    }
  } else {

  }
`]],

    // 86 compiler bug
    [`now => aggregate count of (@com.yelp.restaurant()) => notify;`,
[`"use strict";
  let _t_0;
  let _t_1;
  let _t_2;
  let _t_3;
  let _t_4;
  let _t_5;
  let _t_6;
  let _t_7;
  let _t_8;
  let _t_9;
  let _t_10;
  let _t_11;
  let _t_12;
  let _t_13;
  let _t_14;
  let _t_15;
  let _t_16;
  let _t_17;
  let _t_18;
  let _t_19;
  let _t_20;
  _t_0 = 0;
  try {
    _t_1 = {};
    _t_2 = await __env.invokeQuery("com.yelp", { }, "restaurant", _t_1);
    _t_3 = _t_2[Symbol.iterator]();
    {
      let _iter_tmp = await _t_3.next();
      while (!_iter_tmp.done) {
        _t_4 = _iter_tmp.value;
        _t_5 = _t_4[0];
        _t_6 = _t_4[1];
        _t_7 = _t_6.__response;
        _t_8 = _t_6.id;
        _t_9 = _t_6.image_url;
        _t_10 = _t_6.link;
        _t_11 = _t_6.cuisines;
        _t_12 = _t_6.price;
        _t_13 = _t_6.rating;
        _t_14 = _t_6.reviewCount;
        _t_15 = _t_6.geo;
        _t_16 = _t_6.phone;
        _t_17 = 1;
        _t_0 = _t_0 + _t_17;
        _iter_tmp = await _t_3.next();
      }
    }
  } catch(_exc_) {
    __env.reportError("Failed to invoke query", _exc_);
  }
  _t_19 = "count";
  _t_18 = __builtin.aggregateOutputType(_t_19, _t_5);
  _t_20 = {};
  _t_20.count = _t_0;
  try {
    await __env.output(String(_t_18), _t_20);
  } catch(_exc_) {
    __env.reportError("Failed to invoke action", _exc_);
  }`]]
];

// eslint-disable-next-line prefer-arrow-callback
const AsyncFunction = Object.getPrototypeOf(async function() {}).constructor;
async function test(i) {
    console.log('Test Case #' + (i+1));

    let [code, expected] = TEST_CASES[i];

    try {
        const compiler = new Compiler(schemaRetriever, true);

        const compiled = await compiler.compileCode(code);

        const generated = [];
        for (let name in compiler._toplevelscope)
            generated.push(compiler._toplevelscope[name]);
        if (compiled.command)
            generated.push(compiled.command);
        generated.push(...compiled.rules);
        if (generated.length !== expected.length) {
            console.error('Test Case #' + (i+1) + ': wrong number of generated functions');
            console.error(`Expected ${expected.length}, Generated ${generated.length}`);
            if (process.env.TEST_MODE)
                throw new Error(`testCompiler ${i+1} FAILED`);
            return;
        }

        for (let j = 0; j < Math.max(expected.length, generated.length); j++) {
            let code = generated[j] || [];
            code = code.replace(/new Date\([0-9]+\)/g, 'new Date(XNOWX)');

            if (code === undefined || code.trim() !== expected[j].trim()) {
                console.error('Test Case #' + (i+1) + ': compiled code does not match what expected');
                console.error('Expected: ' + expected[j]);
                console.error('Compiled: ' + code);
                if (process.env.TEST_MODE)
                    throw new Error(`testCompiler ${i+1} FAILED`);
            } else {
                new AsyncFunction('__builtin', '__scope', '__ast', '__env', code);
            }
        }
    } catch (e) {
        console.error('Test Case #' + (i+1) + ': failed with exception');
        console.error('Code: ' + code);
        console.error('Error: ' + e.message);
        console.error(e.stack);
        if (process.env.TEST_MODE)
            throw e;
    }
}

async function main() {
    const max = !module.parent && process.argv[2] ? parseInt(process.argv[2]) : Infinity;
    for (let i = 0; i < Math.min(max, TEST_CASES.length); i++)
        await test(i);
}
module.exports = main;
if (!module.parent)
    main();
