"use strict";

require('../lib/grammar_api');
const Compiler = require('../lib/compiler');
const SchemaRetriever = require('../lib/schema');

const _mockSchemaDelegate = require('./mock_schema_delegate');
const _mockMemoryClient = require('./mock_memory_client');
var schemaRetriever = new SchemaRetriever(_mockSchemaDelegate, _mockMemoryClient, true);

const TEST_CASES = [
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
        _t_7 = _t_5.title;
        _t_8 = _t_5.picture_url;
        _t_9 = _t_5.link;
        _t_10 = _t_5.alt_text;
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
        _t_7 = _t_5.title;
        _t_8 = _t_5.picture_url;
        _t_9 = _t_5.link;
        _t_10 = _t_5.alt_text;
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
        _t_7 = _t_5.title;
        _t_8 = _t_5.picture_url;
        _t_9 = _t_5.link;
        _t_10 = _t_5.alt_text;
        try {
          await __env.output(String(_t_4), _t_5);
        } catch(_exc_) {
          __env.reportError("Failed to invoke action", _exc_);
        }
        try {
          _t_11 = {};
          _t_11.status = _t_7;
          await __env.invokeAction("com.twitter", { }, "post", _t_11);
        } catch(_exc_) {
          __env.reportError("Failed to invoke action", _exc_);
        }
        _iter_tmp = await _t_2.next();
      }
    }
  } catch(_exc_) {
    __env.reportError("Failed to invoke query", _exc_);
  }`]],

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
        _t_7 = _t_5.title;
        _t_8 = _t_5.picture_url;
        _t_9 = _t_5.link;
        _t_10 = _t_5.alt_text;
        _t_12 = 1000;
        _t_11 = _t_6 <= _t_12;
        if (_t_11) {
          try {
            await __env.output(String(_t_4), _t_5);
          } catch(_exc_) {
            __env.reportError("Failed to invoke action", _exc_);
          }
          try {
            _t_13 = {};
            _t_13.status = _t_7;
            await __env.invokeAction("com.twitter", { }, "post", _t_13);
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
        _t_6 = _t_5.value;
        _t_7 = __builtin.isNewTuple(_t_0, _t_5, ["value"]);
        _t_8 = __builtin.addTuple(_t_0, _t_5);
        await __env.writeState(0, _t_8);
        _t_0 = _t_8;
        if (_t_7) {
          _t_10 = 21;
          _t_9 = _t_6 >= _t_10;
          if (_t_9) {
            try {
              _t_11 = {};
              _t_12 = "bla";
              _t_11.message = _t_12;
              await __env.invokeAction("org.thingpedia.builtin.thingengine.builtin", { }, "say", _t_11);
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
        _t_6 = _t_5.value;
        _t_7 = __builtin.isNewTuple(_t_0, _t_5, ["value"]);
        _t_8 = __builtin.addTuple(_t_0, _t_5);
        await __env.writeState(0, _t_8);
        _t_0 = _t_8;
        if (_t_7) {
          _t_10 = 21;
          _t_9 = _t_6 >= _t_10;
          if (_t_9) {
            try {
              _t_11 = {};
              _t_12 = "bla";
              _t_11.message = _t_12;
              await __env.invokeAction("org.thingpedia.builtin.thingengine.builtin", { }, "say", _t_11);
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
        _t_6 = _t_5.text;
        _t_7 = _t_5.hashtags;
        _t_8 = _t_5.urls;
        _t_9 = _t_5.author;
        _t_10 = _t_5.in_reply_to;
        _t_11 = _t_5.tweet_id;
        _t_12 = __builtin.isNewTuple(_t_0, _t_5, ["text", "hashtags", "urls", "author", "in_reply_to", "tweet_id"]);
        _t_13 = __builtin.addTuple(_t_0, _t_5);
        await __env.writeState(0, _t_13);
        _t_0 = _t_13;
        if (_t_12) {
          _t_15 = new __builtin.Entity("HillaryClinton", null);
          _t_14 = __builtin.equality(_t_9, _t_15);
          if (_t_14) {
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
        _t_7 = _t_6.temperature;
        _t_8 = _t_6.wind_speed;
        _t_9 = _t_6.humidity;
        _t_10 = _t_6.cloudiness;
        _t_11 = _t_6.fog;
        _t_12 = _t_6.status;
        _t_13 = _t_6.icon;
        _t_14 = __builtin.isNewTuple(_t_0, _t_6, ["location", "temperature", "wind_speed", "humidity", "cloudiness", "fog", "status", "icon"]);
        _t_15 = __builtin.addTuple(_t_0, _t_6);
        await __env.writeState(0, _t_15);
        _t_0 = _t_15;
        if (_t_14) {
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
        _t_7 = _t_6.temperature;
        _t_8 = _t_6.wind_speed;
        _t_9 = _t_6.humidity;
        _t_10 = _t_6.cloudiness;
        _t_11 = _t_6.fog;
        _t_12 = _t_6.status;
        _t_13 = _t_6.icon;
        _t_14 = __builtin.isNewTuple(_t_0, _t_6, ["location", "temperature", "wind_speed", "humidity", "cloudiness", "fog", "status", "icon"]);
        _t_15 = __builtin.addTuple(_t_0, _t_6);
        await __env.writeState(0, _t_15);
        _t_0 = _t_15;
        if (_t_14) {
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

    [`timer(base=makeDate(), interval=1h) => notify;`,
     [`"use strict";
  let _t_0;
  let _t_1;
  let _t_2;
  let _t_3;
  try {
    _t_1 = new Date(XNOWX);
    _t_2 = 3600000;
    _t_0 = await __env.invokeTimer(_t_1, _t_2);
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
    _t_0 = await __env.invokeTimer(_t_1, _t_2);
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
        _t_9 = _t_6.video_id;
        _t_10 = _t_6.title;
        _t_11 = _t_6.description;
        _t_12 = _t_6.thumbnail;
        _t_13 = _t_6.video_url;
        _t_15 = new __builtin.Entity("http://www.youtube.com", null);
        _t_14 = __builtin.equality(_t_13, _t_15);
        if (_t_14) {
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
        _t_7 = _t_5.title;
        _t_8 = _t_5.picture_url;
        _t_9 = _t_5.link;
        _t_10 = _t_5.alt_text;
        _t_11 = __builtin.isNewTuple(_t_0, _t_5, ["number", "title", "picture_url", "link", "alt_text"]);
        _t_12 = __builtin.addTuple(_t_0, _t_5);
        await __env.writeState(0, _t_12);
        _t_0 = _t_12;
        if (_t_11) {
          try {
            _t_13 = {};
            _t_13.caption = _t_7;
            _t_14 = String (_t_8);
            _t_13.picture_url = _t_14;
            await __env.invokeAction("com.twitter", { id: "twitter-foo", }, "post_picture", _t_13);
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
        _t_6 = _t_5.text;
        _t_7 = _t_5.hashtags;
        _t_8 = _t_5.urls;
        _t_9 = _t_5.author;
        _t_10 = _t_5.in_reply_to;
        _t_11 = _t_5.tweet_id;
        _t_12 = __builtin.isNewTuple(_t_0, _t_5, ["text", "hashtags", "urls", "author", "in_reply_to", "tweet_id"]);
        _t_13 = __builtin.addTuple(_t_0, _t_5);
        await __env.writeState(0, _t_13);
        _t_0 = _t_13;
        if (_t_12) {
          _t_14 = false;
          _t_16 = "foo";
          _t_15 = __builtin.like(_t_6, _t_16);
          _t_14 = _t_14 || _t_15;
          _t_17 = true;
          _t_19 = "bar";
          _t_18 = __builtin.like(_t_6, _t_19);
          _t_17 = _t_17 && _t_18;
          _t_22 = "lol";
          _t_21 = __builtin.like(_t_6, _t_22);
          _t_20 = ! (_t_21);
          _t_17 = _t_17 && _t_20;
          _t_14 = _t_14 || _t_17;
          if (_t_14) {
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
        _t_6 = _t_5.text;
        _t_7 = _t_5.hashtags;
        _t_8 = _t_5.urls;
        _t_9 = _t_5.author;
        _t_10 = _t_5.in_reply_to;
        _t_11 = _t_5.tweet_id;
        _t_12 = __builtin.isNewTuple(_t_0, _t_5, ["text", "hashtags", "urls", "author", "in_reply_to", "tweet_id"]);
        _t_13 = __builtin.addTuple(_t_0, _t_5);
        await __env.writeState(0, _t_13);
        _t_0 = _t_13;
        if (_t_12) {
          try {
            _t_14 = {};
            _t_15 = await __env.formatEvent(_t_4, _t_5, "string");
            _t_14.message = _t_15;
            await __env.invokeAction("org.thingpedia.builtin.thingengine.builtin", { }, "say", _t_14);
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
        _t_6 = _t_5.text;
        _t_7 = _t_5.hashtags;
        _t_8 = _t_5.urls;
        _t_9 = _t_5.author;
        _t_10 = _t_5.in_reply_to;
        _t_11 = _t_5.tweet_id;
        _t_12 = __builtin.isNewTuple(_t_0, _t_5, ["text", "hashtags", "urls", "author", "in_reply_to", "tweet_id"]);
        _t_13 = __builtin.addTuple(_t_0, _t_5);
        await __env.writeState(0, _t_13);
        _t_0 = _t_13;
        if (_t_12) {
          try {
            _t_14 = {};
            _t_15 = String (_t_4);
            _t_14.message = _t_15;
            await __env.invokeAction("org.thingpedia.builtin.thingengine.builtin", { }, "say", _t_14);
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
        _t_7 = _t_5.title;
        _t_8 = _t_5.picture_url;
        _t_9 = _t_5.link;
        _t_10 = _t_5.alt_text;
        _t_11 = __builtin.isNewTuple(_t_0, _t_5, ["number", "title", "picture_url", "link", "alt_text"]);
        _t_12 = __builtin.addTuple(_t_0, _t_5);
        await __env.writeState(0, _t_12);
        _t_0 = _t_12;
        if (_t_11) {
          try {
            _t_13 = {};
            _t_14 = String (_t_8);
            _t_13.status = _t_14;
            await __env.invokeAction("com.twitter", { }, "post", _t_13);
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
        _t_6 = _t_5.time;
        _t_8 = __builtin.getTime (_t_6);
        _t_9 = new __builtin.Time(10, 0, 0);
        _t_7 = _t_8 >= _t_9;
        if (_t_7) {
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
        _t_8 = _t_7.uber_type;
        _t_9 = _t_7.low_estimate;
        _t_10 = _t_7.high_estimate;
        _t_11 = _t_7.surge;
        _t_12 = _t_7.duration;
        _t_13 = _t_7.distance;
        _t_15 = 7;
        _t_16 = __builtin.getCurrency (_t_15);
        _t_14 = _t_9 >= _t_16;
        if (_t_14) {
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
        _t_6 = _t_5.text;
        _t_7 = _t_5.hashtags;
        _t_8 = _t_5.urls;
        _t_9 = _t_5.author;
        _t_10 = _t_5.in_reply_to;
        _t_11 = _t_5.tweet_id;
        _t_12 = __builtin.isNewTuple(_t_0, _t_5, ["text", "hashtags", "urls", "author", "in_reply_to", "tweet_id"]);
        _t_13 = __builtin.addTuple(_t_0, _t_5);
        await __env.writeState(0, _t_13);
        _t_0 = _t_13;
        if (_t_12) {
          try {
            _t_14 = {};
            _t_15 = new __builtin.Entity("mock-account:12345678", "me");
            _t_14.__principal = _t_15;
            _t_16 = __env.program_id;
            _t_14.__program_id = _t_16;
            _t_17 = 0;
            _t_14.__flow = _t_17;
            _t_14.__kindChannel = _t_4;
            await __env.invokeAction("org.thingpedia.builtin.thingengine.remote", { }, "send", _t_14);
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
    _t_18 = new __builtin.Entity("mock-account:12345678", "me");
    _t_19 = 0;
    await __env.sendEndOfFlow(_t_18, _t_19);
  } catch(_exc_) {
    __env.reportError("Failed to signal end-of-flow", _exc_);
  }`]],

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
        _t_6 = _t_5.text;
        _t_7 = _t_5.hashtags;
        _t_8 = _t_5.urls;
        _t_9 = _t_5.author;
        _t_10 = _t_5.in_reply_to;
        _t_11 = _t_5.tweet_id;
        _t_12 = __builtin.isNewTuple(_t_0, _t_5, ["text", "hashtags", "urls", "author", "in_reply_to", "tweet_id"]);
        _t_13 = __builtin.addTuple(_t_0, _t_5);
        await __env.writeState(0, _t_13);
        _t_0 = _t_13;
        if (_t_12) {
          _t_14 = false;
          try {
            _t_16 = {};
            _t_15 = await __env.invokeQuery("org.thingpedia.builtin.thingengine.builtin", { }, "get_time", _t_16);
            _t_17 = _t_15[Symbol.iterator]();
            {
              let _iter_tmp = await _t_17.next();
              while (!_iter_tmp.done) {
                _t_18 = _iter_tmp.value;
                _t_19 = _t_18[0];
                _t_20 = _t_18[1];
                _t_21 = _t_20.time;
                _t_22 = true;
                _t_24 = __builtin.getTime (_t_21);
                _t_25 = new __builtin.Time(9, 0, 0);
                _t_23 = _t_24 >= _t_25;
                _t_22 = _t_22 && _t_23;
                _t_27 = __builtin.getTime (_t_21);
                _t_28 = new __builtin.Time(10, 0, 0);
                _t_26 = _t_27 <= _t_28;
                _t_22 = _t_22 && _t_26;
                if (_t_22) {
                  _t_14 = true;
                  break;
                } else {

                }
                _iter_tmp = await _t_17.next();
              }
            }
          } catch(_exc_) {
            __env.reportError("Failed to invoke get-predicate query", _exc_);
          }
          if (_t_14) {
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
        _t_6 = _t_5.text;
        _t_7 = _t_5.hashtags;
        _t_8 = _t_5.urls;
        _t_9 = _t_5.author;
        _t_10 = _t_5.in_reply_to;
        _t_11 = _t_5.tweet_id;
        _t_12 = __builtin.isNewTuple(_t_0, _t_5, ["text", "hashtags", "urls", "author", "in_reply_to", "tweet_id"]);
        _t_13 = __builtin.addTuple(_t_0, _t_5);
        await __env.writeState(1, _t_13);
        _t_0 = _t_13;
        if (_t_12) {
          _t_14 = true;
          _t_16 = "lol";
          _t_15 = __builtin.like(_t_6, _t_16);
          _t_14 = _t_14 && _t_15;
          _t_17 = false;
          try {
            _t_19 = {};
            _t_18 = await __env.invokeQuery("org.thingpedia.builtin.thingengine.builtin", { }, "get_time", _t_19);
            _t_20 = _t_18[Symbol.iterator]();
            {
              let _iter_tmp = await _t_20.next();
              while (!_iter_tmp.done) {
                _t_21 = _iter_tmp.value;
                _t_22 = _t_21[0];
                _t_23 = _t_21[1];
                _t_24 = _t_23.time;
                _t_25 = true;
                _t_27 = __builtin.getTime (_t_24);
                _t_28 = new __builtin.Time(9, 0, 0);
                _t_26 = _t_27 >= _t_28;
                _t_25 = _t_25 && _t_26;
                _t_30 = __builtin.getTime (_t_24);
                _t_31 = new __builtin.Time(10, 0, 0);
                _t_29 = _t_30 <= _t_31;
                _t_25 = _t_25 && _t_29;
                if (_t_25) {
                  _t_17 = true;
                  break;
                } else {

                }
                _iter_tmp = await _t_20.next();
              }
            }
          } catch(_exc_) {
            __env.reportError("Failed to invoke get-predicate query", _exc_);
          }
          _t_14 = _t_14 && _t_17;
          if (_t_14) {
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
    _t_0 = await __env.invokeTimer(_t_1, _t_2);
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

  [`executor = "1234"^^tt:contact : {
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
        _t_9 = _t_8.__kindChannel;
        _t_10 = _t_8.interval;
        _t_11 = __builtin.isNewTuple(_t_0, _t_8, ["__principal", "__program_id", "__flow", "__kindChannel", "interval"]);
        _t_12 = __builtin.addTuple(_t_0, _t_8);
        await __env.writeState(0, _t_12);
        _t_0 = _t_12;
        if (_t_11) {
          try {
            _t_13 = {};
            _t_14 = "on";
            _t_13.power = _t_14;
            await __env.invokeAction("security-camera", { }, "set_power", _t_13);
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
          _t_8 = _t_7.text;
          _t_9 = _t_7.hashtags;
          _t_10 = _t_7.urls;
          _t_11 = _t_7.author;
          _t_12 = _t_7.in_reply_to;
          _t_13 = _t_7.tweet_id;
          _t_14 = __builtin.isNewTuple(_t_2, _t_7, ["text", "hashtags", "urls", "author", "in_reply_to", "tweet_id"]);
          _t_15 = __builtin.addTuple(_t_2, _t_7);
          await __env.writeState(1, _t_15);
          _t_2 = _t_15;
          if (_t_14) {
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
  _t_16 = async function(emit) {
    _t_17 = await __env.readState(2);
    try {
      _t_18 = {};
      _t_19 = "foo";
      _t_18.query = _t_19;
      _t_20 = await __env.invokeMonitor("com.bing", { }, "web_search", _t_18, false);
      {
        let _iter_tmp = await _t_20.next();
        while (!_iter_tmp.done) {
          _t_21 = _iter_tmp.value;
          _t_22 = _t_21[0];
          _t_23 = _t_21[1];
          _t_24 = _t_23.title;
          _t_25 = _t_23.description;
          _t_26 = _t_23.link;
          _t_27 = __builtin.isNewTuple(_t_17, _t_23, ["query", "title", "description", "link"]);
          _t_28 = __builtin.addTuple(_t_17, _t_23);
          await __env.writeState(2, _t_28);
          _t_17 = _t_28;
          if (_t_27) {
            emit(_t_22, _t_23);
          } else {

          }
          _iter_tmp = await _t_20.next();
        }
      }
    } catch(_exc_) {
      __env.reportError("Failed to invoke trigger", _exc_);
    }
  }
  _t_29 = __builtin.streamUnion(_t_1, _t_16);
  {
    let _iter_tmp = await _t_29.next();
    while (!_iter_tmp.done) {
      _t_30 = _iter_tmp.value;
      _t_31 = _t_30[0];
      _t_32 = _t_30[1];
      _t_33 = _t_32.query;
      _t_34 = _t_32.title;
      _t_35 = _t_32.description;
      _t_36 = _t_32.link;
      _t_37 = _t_32.text;
      _t_38 = _t_32.hashtags;
      _t_39 = _t_32.urls;
      _t_40 = _t_32.author;
      _t_41 = _t_32.in_reply_to;
      _t_42 = _t_32.tweet_id;
      _t_43 = __builtin.isNewTuple(_t_0, _t_32, ["query", "title", "description", "link", "text", "hashtags", "urls", "author", "in_reply_to", "tweet_id"]);
      _t_44 = __builtin.addTuple(_t_0, _t_32);
      await __env.writeState(0, _t_44);
      _t_0 = _t_44;
      if (_t_43) {
        try {
          await __env.output(String(_t_31), _t_32);
        } catch(_exc_) {
          __env.reportError("Failed to invoke action", _exc_);
        }
      } else {

      }
      _iter_tmp = await _t_29.next();
    }
  }`]],

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
          _t_8 = _t_7.text;
          _t_9 = _t_7.hashtags;
          _t_10 = _t_7.urls;
          _t_11 = _t_7.author;
          _t_12 = _t_7.in_reply_to;
          _t_13 = _t_7.tweet_id;
          _t_14 = __builtin.isNewTuple(_t_2, _t_7, ["text", "hashtags", "urls", "author", "in_reply_to", "tweet_id"]);
          _t_15 = __builtin.addTuple(_t_2, _t_7);
          await __env.writeState(1, _t_15);
          _t_2 = _t_15;
          if (_t_14) {
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
  _t_16 = async function(emit) {
    _t_17 = await __env.readState(2);
    try {
      _t_18 = {};
      _t_19 = "foo";
      _t_18.query = _t_19;
      _t_20 = await __env.invokeMonitor("com.bing", { }, "web_search", _t_18, false);
      {
        let _iter_tmp = await _t_20.next();
        while (!_iter_tmp.done) {
          _t_21 = _iter_tmp.value;
          _t_22 = _t_21[0];
          _t_23 = _t_21[1];
          _t_24 = _t_23.title;
          _t_25 = _t_23.description;
          _t_26 = _t_23.link;
          _t_27 = __builtin.isNewTuple(_t_17, _t_23, ["query", "title", "description", "link"]);
          _t_28 = __builtin.addTuple(_t_17, _t_23);
          await __env.writeState(2, _t_28);
          _t_17 = _t_28;
          if (_t_27) {
            emit(_t_22, _t_23);
          } else {

          }
          _iter_tmp = await _t_20.next();
        }
      }
    } catch(_exc_) {
      __env.reportError("Failed to invoke trigger", _exc_);
    }
  }
  _t_29 = __builtin.streamUnion(_t_1, _t_16);
  {
    let _iter_tmp = await _t_29.next();
    while (!_iter_tmp.done) {
      _t_30 = _iter_tmp.value;
      _t_31 = _t_30[0];
      _t_32 = _t_30[1];
      _t_33 = _t_32.query;
      _t_34 = _t_32.title;
      _t_35 = _t_32.description;
      _t_36 = _t_32.link;
      _t_37 = _t_32.text;
      _t_38 = _t_32.hashtags;
      _t_39 = _t_32.urls;
      _t_40 = _t_32.author;
      _t_41 = _t_32.in_reply_to;
      _t_42 = _t_32.tweet_id;
      _t_43 = __builtin.isNewTuple(_t_0, _t_32, ["query", "title", "description", "link", "text", "hashtags", "urls", "author", "in_reply_to", "tweet_id"]);
      _t_44 = __builtin.addTuple(_t_0, _t_32);
      await __env.writeState(0, _t_44);
      _t_0 = _t_44;
      if (_t_43) {
        _t_46 = "lol";
        _t_45 = __builtin.like(_t_37, _t_46);
        if (_t_45) {
          try {
            await __env.output(String(_t_31), _t_32);
          } catch(_exc_) {
            __env.reportError("Failed to invoke action", _exc_);
          }
        } else {

        }
      } else {

      }
      _iter_tmp = await _t_29.next();
    }
  }`]],

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
        _t_6 = _t_5.text;
        _t_7 = _t_5.hashtags;
        _t_8 = _t_5.urls;
        _t_9 = _t_5.author;
        _t_10 = _t_5.in_reply_to;
        _t_11 = _t_5.tweet_id;
        try {
          _t_12 = {};
          _t_12.query = _t_6;
          _t_13 = await __env.invokeQuery("com.bing", { }, "web_search", _t_12);
          _t_14 = _t_13[Symbol.iterator]();
          {
            let _iter_tmp = await _t_14.next();
            while (!_iter_tmp.done) {
              _t_15 = _iter_tmp.value;
              _t_16 = _t_15[0];
              _t_17 = _t_15[1];
              _t_18 = _t_17.title;
              _t_19 = _t_17.description;
              _t_20 = _t_17.link;
              _t_21 = __builtin.combineOutputTypes(_t_4, _t_16);
              _t_22 = {};
              _t_22.query = _t_6;
              _t_22.title = _t_18;
              _t_22.description = _t_19;
              _t_22.link = _t_20;
              _t_22.text = _t_6;
              _t_22.hashtags = _t_7;
              _t_22.urls = _t_8;
              _t_22.author = _t_9;
              _t_22.in_reply_to = _t_10;
              _t_22.tweet_id = _t_11;
              _t_23 = _t_22.query;
              _t_24 = _t_22.title;
              _t_25 = _t_22.description;
              _t_26 = _t_22.link;
              _t_27 = _t_22.text;
              _t_28 = _t_22.hashtags;
              _t_29 = _t_22.urls;
              _t_30 = _t_22.author;
              _t_31 = _t_22.in_reply_to;
              _t_32 = _t_22.tweet_id;
              try {
                await __env.output(String(_t_21), _t_22);
              } catch(_exc_) {
                __env.reportError("Failed to invoke action", _exc_);
              }
              _iter_tmp = await _t_14.next();
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
          _t_7 = _t_6.text;
          _t_8 = _t_6.hashtags;
          _t_9 = _t_6.urls;
          _t_10 = _t_6.author;
          _t_11 = _t_6.in_reply_to;
          _t_12 = _t_6.tweet_id;
          emit(_t_5, _t_6);
          _iter_tmp = await _t_3.next();
        }
      }
    } catch(_exc_) {
      __env.reportError("Failed to invoke query", _exc_);
    }
  }
  _t_13 = async function(emit) {
    try {
      _t_14 = {};
      _t_15 = "foo";
      _t_14.query = _t_15;
      _t_16 = await __env.invokeQuery("com.bing", { }, "web_search", _t_14);
      _t_17 = _t_16[Symbol.iterator]();
      {
        let _iter_tmp = await _t_17.next();
        while (!_iter_tmp.done) {
          _t_18 = _iter_tmp.value;
          _t_19 = _t_18[0];
          _t_20 = _t_18[1];
          _t_21 = _t_20.title;
          _t_22 = _t_20.description;
          _t_23 = _t_20.link;
          emit(_t_19, _t_20);
          _iter_tmp = await _t_17.next();
        }
      }
    } catch(_exc_) {
      __env.reportError("Failed to invoke query", _exc_);
    }
  }
  _t_24 = __builtin.tableCrossJoin(_t_0, _t_13);
  {
    let _iter_tmp = await _t_24.next();
    while (!_iter_tmp.done) {
      _t_25 = _iter_tmp.value;
      _t_26 = _t_25[0];
      _t_27 = _t_25[1];
      _t_28 = _t_27.query;
      _t_29 = _t_27.title;
      _t_30 = _t_27.description;
      _t_31 = _t_27.link;
      _t_32 = _t_27.text;
      _t_33 = _t_27.hashtags;
      _t_34 = _t_27.urls;
      _t_35 = _t_27.author;
      _t_36 = _t_27.in_reply_to;
      _t_37 = _t_27.tweet_id;
      try {
        await __env.output(String(_t_26), _t_27);
      } catch(_exc_) {
        __env.reportError("Failed to invoke action", _exc_);
      }
      _iter_tmp = await _t_24.next();
    }
  }`]],

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
              _t_11 = _t_9.image_id;
              _t_12 = _t_9.picture_url;
              _t_13 = _t_9.link;
              _t_14 = {};
              _t_14.count = _t_10;
              _t_14.image_id = _t_11;
              _t_14.picture_url = _t_12;
              _t_14.link = _t_13;
              _t_15 = _t_14.count;
              _t_16 = _t_14.image_id;
              _t_17 = _t_14.picture_url;
              _t_18 = _t_14.link;
              try {
                _t_19 = {};
                _t_20 = new __builtin.Entity("xxxx", null);
                _t_19.to = _t_20;
                _t_21 = "xxx";
                _t_19.subject = _t_21;
                _t_22 = "xxx";
                _t_19.message = _t_22;
                _t_23 = String (_t_17);
                _t_19.picture_url = _t_23;
                await __env.invokeAction("com.gmail", { id: "xxxx", }, "send_picture", _t_19);
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
        _t_8 = _t_7.data;
        try {
          _t_9 = {};
          _t_10 = new __builtin.Entity("matrix-account:@gcampax2:matrix.org", null);
          _t_9.__principal = _t_10;
          _t_11 = __env.program_id;
          _t_9.__program_id = _t_11;
          _t_12 = 0;
          _t_9.__flow = _t_12;
          _t_9.__kindChannel = _t_6;
          _t_9.data = _t_8;
          await __env.invokeAction("org.thingpedia.builtin.thingengine.remote", { id: "org.thingpedia.builtin.thingengine.remote", }, "send", _t_9);
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
    _t_13 = new __builtin.Entity("matrix-account:@gcampax2:matrix.org", null);
    _t_14 = 0;
    await __env.sendEndOfFlow(_t_13, _t_14);
  } catch(_exc_) {
    __env.reportError("Failed to signal end-of-flow", _exc_);
  }`]],

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
  try {
    _t_1 = new Date(XNOWX);
    _t_2 = 3600000;
    _t_0 = await __env.invokeTimer(_t_1, _t_2);
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
              _t_11 = _t_9.text;
              _t_12 = _t_9.hashtags;
              _t_13 = _t_9.urls;
              _t_14 = _t_9.author;
              _t_15 = _t_9.in_reply_to;
              _t_16 = _t_9.tweet_id;
              _t_18 = "lol";
              _t_17 = __builtin.like(_t_11, _t_18);
              if (_t_17) {
                _t_19 = {};
                _t_19.count = _t_10;
                _t_19.text = _t_11;
                _t_19.hashtags = _t_12;
                _t_19.urls = _t_13;
                _t_19.author = _t_14;
                _t_19.in_reply_to = _t_15;
                _t_19.tweet_id = _t_16;
                _t_20 = _t_19.count;
                _t_21 = _t_19.text;
                _t_22 = _t_19.hashtags;
                _t_23 = _t_19.urls;
                _t_24 = _t_19.author;
                _t_25 = _t_19.in_reply_to;
                _t_26 = _t_19.tweet_id;
                try {
                  await __env.output(String(_t_8), _t_19);
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
        _t_8 = _t_7.title;
        _t_9 = _t_7.description;
        _t_10 = _t_7.link;
        _t_11 = 1;
        _t_0 = _t_0 + _t_11;
        _iter_tmp = await _t_4.next();
      }
    }
  } catch(_exc_) {
    __env.reportError("Failed to invoke query", _exc_);
  }
  _t_13 = "count";
  _t_12 = __builtin.aggregateOutputType(_t_13, _t_6);
  _t_14 = {};
  _t_14.count = _t_0;
  try {
    await __env.output(String(_t_12), _t_14);
  } catch(_exc_) {
    __env.reportError("Failed to invoke action", _exc_);
  }`]],

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
  try {
    _t_1 = new Date(XNOWX);
    _t_2 = 3600000;
    _t_0 = await __env.invokeTimer(_t_1, _t_2);
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
              _t_12 = _t_11.title;
              _t_13 = _t_11.description;
              _t_14 = _t_11.link;
              _t_15 = 1;
              _t_4 = _t_4 + _t_15;
              _iter_tmp = await _t_8.next();
            }
          }
        } catch(_exc_) {
          __env.reportError("Failed to invoke query", _exc_);
        }
        _t_17 = "count";
        _t_16 = __builtin.aggregateOutputType(_t_17, _t_10);
        _t_18 = {};
        _t_18.count = _t_4;
        _t_19 = {};
        _t_19.count = _t_4;
        _t_20 = _t_19.count;
        try {
          await __env.output(String(_t_16), _t_19);
        } catch(_exc_) {
          __env.reportError("Failed to invoke action", _exc_);
        }
        _iter_tmp = await _t_0.next();
      }
    }
  } catch(_exc_) {
    __env.reportError("Failed to invoke timer", _exc_);
  }`]],

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
  try {
    _t_1 = new Date(XNOWX);
    _t_2 = 3600000;
    _t_0 = await __env.invokeTimer(_t_1, _t_2);
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
              _t_12 = _t_10.file_id;
              _t_13 = _t_10.file_name;
              _t_14 = _t_10.mime_type;
              _t_15 = _t_10.description;
              _t_16 = _t_10.starred;
              _t_17 = _t_10.created_time;
              _t_18 = _t_10.modified_time;
              _t_19 = _t_10.file_size;
              _t_20 = _t_10.last_modified_by;
              _t_21 = _t_10.link;
              _t_4.add(_t_10);
              _iter_tmp = await _t_7.next();
            }
          }
        } catch(_exc_) {
          __env.reportError("Failed to invoke query", _exc_);
        }
        _t_23 = "count";
        _t_22 = __builtin.aggregateOutputType(_t_23, _t_9);
        _t_24 = {};
        _t_25 = _t_4.size;
        _t_24.mime_type = _t_25;
        _t_26 = {};
        _t_26.mime_type = _t_25;
        _t_27 = _t_26.mime_type;
        try {
          await __env.output(String(_t_22), _t_26);
        } catch(_exc_) {
          __env.reportError("Failed to invoke action", _exc_);
        }
        _iter_tmp = await _t_0.next();
      }
    }
  } catch(_exc_) {
    __env.reportError("Failed to invoke timer", _exc_);
  }`]],

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
  try {
    _t_1 = new Date(XNOWX);
    _t_2 = 3600000;
    _t_0 = await __env.invokeTimer(_t_1, _t_2);
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
              _t_13 = _t_11.file_id;
              _t_14 = _t_11.file_name;
              _t_15 = _t_11.mime_type;
              _t_16 = _t_11.description;
              _t_17 = _t_11.starred;
              _t_18 = _t_11.created_time;
              _t_19 = _t_11.modified_time;
              _t_20 = _t_11.file_size;
              _t_21 = _t_11.last_modified_by;
              _t_22 = _t_11.link;
              _t_23 = 1;
              _t_4 = _t_4 + _t_23;
              _t_5 = _t_5 + _t_20;
              _iter_tmp = await _t_8.next();
            }
          }
        } catch(_exc_) {
          __env.reportError("Failed to invoke query", _exc_);
        }
        _t_25 = "avg";
        _t_24 = __builtin.aggregateOutputType(_t_25, _t_10);
        _t_26 = {};
        _t_27 = _t_5 / _t_4;
        _t_26.file_size = _t_27;
        _t_28 = {};
        _t_28.file_size = _t_27;
        _t_29 = _t_28.file_size;
        try {
          await __env.output(String(_t_24), _t_28);
        } catch(_exc_) {
          __env.reportError("Failed to invoke action", _exc_);
        }
        _iter_tmp = await _t_0.next();
      }
    }
  } catch(_exc_) {
    __env.reportError("Failed to invoke timer", _exc_);
  }`]],

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
  try {
    _t_1 = new Date(XNOWX);
    _t_2 = 3600000;
    _t_0 = await __env.invokeTimer(_t_1, _t_2);
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
              _t_12 = _t_10.file_id;
              _t_13 = _t_10.file_name;
              _t_14 = _t_10.mime_type;
              _t_15 = _t_10.description;
              _t_16 = _t_10.starred;
              _t_17 = _t_10.created_time;
              _t_18 = _t_10.modified_time;
              _t_19 = _t_10.file_size;
              _t_20 = _t_10.last_modified_by;
              _t_21 = _t_10.link;
              _t_4 = __builtin.max(_t_4, _t_19);
              _iter_tmp = await _t_7.next();
            }
          }
        } catch(_exc_) {
          __env.reportError("Failed to invoke query", _exc_);
        }
        _t_23 = "max";
        _t_22 = __builtin.aggregateOutputType(_t_23, _t_9);
        _t_24 = {};
        _t_24.file_size = _t_4;
        _t_25 = {};
        _t_25.file_size = _t_4;
        _t_26 = _t_25.file_size;
        try {
          await __env.output(String(_t_22), _t_25);
        } catch(_exc_) {
          __env.reportError("Failed to invoke action", _exc_);
        }
        _iter_tmp = await _t_0.next();
      }
    }
  } catch(_exc_) {
    __env.reportError("Failed to invoke timer", _exc_);
  }`]],

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
          _t_8 = _t_6.file_id;
          _t_9 = _t_6.file_name;
          _t_10 = _t_6.mime_type;
          _t_11 = _t_6.description;
          _t_12 = _t_6.starred;
          _t_13 = _t_6.created_time;
          _t_14 = _t_6.modified_time;
          _t_15 = _t_6.file_size;
          _t_16 = _t_6.last_modified_by;
          _t_17 = _t_6.link;
          emit(_t_5, _t_6);
          _iter_tmp = await _t_3.next();
        }
      }
    } catch(_exc_) {
      __env.reportError("Failed to invoke query", _exc_);
    }
  }
  _t_18 = async function(emit) {
    _t_19 = -Infinity;
    try {
      _t_20 = {};
      _t_21 = await __env.invokeQuery("com.google.drive", { }, "list_drive_files", _t_20);
      _t_22 = _t_21[Symbol.iterator]();
      {
        let _iter_tmp = await _t_22.next();
        while (!_iter_tmp.done) {
          _t_23 = _iter_tmp.value;
          _t_24 = _t_23[0];
          _t_25 = _t_23[1];
          _t_26 = _t_25.order_by;
          _t_27 = _t_25.file_id;
          _t_28 = _t_25.file_name;
          _t_29 = _t_25.mime_type;
          _t_30 = _t_25.description;
          _t_31 = _t_25.starred;
          _t_32 = _t_25.created_time;
          _t_33 = _t_25.modified_time;
          _t_34 = _t_25.file_size;
          _t_35 = _t_25.last_modified_by;
          _t_36 = _t_25.link;
          _t_19 = __builtin.max(_t_19, _t_34);
          _iter_tmp = await _t_22.next();
        }
      }
    } catch(_exc_) {
      __env.reportError("Failed to invoke query", _exc_);
    }
    _t_38 = "max";
    _t_37 = __builtin.aggregateOutputType(_t_38, _t_24);
    _t_39 = {};
    _t_39.file_size = _t_19;
    emit(_t_37, _t_39);
  }
  _t_40 = __builtin.tableCrossJoin(_t_0, _t_18);
  {
    let _iter_tmp = await _t_40.next();
    while (!_iter_tmp.done) {
      _t_41 = _iter_tmp.value;
      _t_42 = _t_41[0];
      _t_43 = _t_41[1];
      _t_44 = _t_43.file_size;
      _t_45 = _t_43.order_by;
      _t_46 = _t_43.file_id;
      _t_47 = _t_43.file_name;
      _t_48 = _t_43.mime_type;
      _t_49 = _t_43.description;
      _t_50 = _t_43.starred;
      _t_51 = _t_43.created_time;
      _t_52 = _t_43.modified_time;
      _t_53 = _t_43.last_modified_by;
      _t_54 = _t_43.link;
      try {
        await __env.output(String(_t_42), _t_43);
      } catch(_exc_) {
        __env.reportError("Failed to invoke action", _exc_);
      }
      _iter_tmp = await _t_40.next();
    }
  }`]],

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
        _t_9 = _t_7.file_id;
        _t_10 = _t_7.file_name;
        _t_11 = _t_7.mime_type;
        _t_12 = _t_7.description;
        _t_13 = _t_7.starred;
        _t_14 = _t_7.created_time;
        _t_15 = _t_7.modified_time;
        _t_16 = _t_7.file_size;
        _t_17 = _t_7.last_modified_by;
        _t_18 = _t_7.link;
        _t_19 = __builtin.isNewTuple(_t_2, _t_7, ["order_by", "file_id", "file_name", "mime_type", "description", "starred", "created_time", "modified_time", "file_size", "last_modified_by", "link"]);
        _t_20 = __builtin.addTuple(_t_2, _t_7);
        await __env.writeState(2, _t_20);
        _t_2 = _t_20;
        if (_t_19) {
          _t_21 = _t_7.__timestamp;
          _t_22 = _t_21 <= _t_1;
          _t_23 = ! (_t_22);
          if (_t_23) {
            await __env.writeState(1, _t_21);
            _t_1 = _t_21;
            _t_24 = -Infinity;
            try {
              _t_25 = {};
              _t_26 = await __env.invokeQuery("com.google.drive", { }, "list_drive_files", _t_25);
              _t_27 = _t_26[Symbol.iterator]();
              {
                let _iter_tmp = await _t_27.next();
                while (!_iter_tmp.done) {
                  _t_28 = _iter_tmp.value;
                  _t_29 = _t_28[0];
                  _t_30 = _t_28[1];
                  _t_31 = _t_30.order_by;
                  _t_32 = _t_30.file_id;
                  _t_33 = _t_30.file_name;
                  _t_34 = _t_30.mime_type;
                  _t_35 = _t_30.description;
                  _t_36 = _t_30.starred;
                  _t_37 = _t_30.created_time;
                  _t_38 = _t_30.modified_time;
                  _t_39 = _t_30.file_size;
                  _t_40 = _t_30.last_modified_by;
                  _t_41 = _t_30.link;
                  _t_24 = __builtin.max(_t_24, _t_39);
                  _iter_tmp = await _t_27.next();
                }
              }
            } catch(_exc_) {
              __env.reportError("Failed to invoke query", _exc_);
            }
            _t_43 = "max";
            _t_42 = __builtin.aggregateOutputType(_t_43, _t_29);
            _t_44 = {};
            _t_44.file_size = _t_24;
            _t_45 = __builtin.isNewTuple(_t_0, _t_44, ["file_size"]);
            _t_46 = __builtin.addTuple(_t_0, _t_44);
            await __env.writeState(0, _t_46);
            _t_0 = _t_46;
            if (_t_45) {
              try {
                await __env.output(String(_t_42), _t_44);
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
  try {
    _t_1 = new Date(XNOWX);
    _t_2 = 3600000;
    _t_0 = await __env.invokeTimer(_t_1, _t_2);
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
              _t_15 = _t_13.file_id;
              _t_16 = _t_13.file_name;
              _t_17 = _t_13.mime_type;
              _t_18 = _t_13.description;
              _t_19 = _t_13.starred;
              _t_20 = _t_13.created_time;
              _t_21 = _t_13.modified_time;
              _t_22 = _t_13.file_size;
              _t_23 = _t_13.last_modified_by;
              _t_24 = _t_13.link;
              _t_25 = _t_5 < _t_22;
              if (_t_25) {
                _t_5 = _t_22;
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
          _t_26 = _t_6.order_by;
          _t_27 = _t_6.file_id;
          _t_28 = _t_6.file_name;
          _t_29 = _t_6.mime_type;
          _t_30 = _t_6.description;
          _t_31 = _t_6.starred;
          _t_32 = _t_6.created_time;
          _t_33 = _t_6.modified_time;
          _t_34 = _t_6.file_size;
          _t_35 = _t_6.last_modified_by;
          _t_36 = _t_6.link;
          _t_37 = {};
          _t_37.order_by = _t_26;
          _t_37.file_id = _t_27;
          _t_37.file_name = _t_28;
          _t_37.mime_type = _t_29;
          _t_37.description = _t_30;
          _t_37.starred = _t_31;
          _t_37.created_time = _t_32;
          _t_37.modified_time = _t_33;
          _t_37.file_size = _t_34;
          _t_37.last_modified_by = _t_35;
          _t_37.link = _t_36;
          _t_38 = _t_37.order_by;
          _t_39 = _t_37.file_id;
          _t_40 = _t_37.file_name;
          _t_41 = _t_37.mime_type;
          _t_42 = _t_37.description;
          _t_43 = _t_37.starred;
          _t_44 = _t_37.created_time;
          _t_45 = _t_37.modified_time;
          _t_46 = _t_37.file_size;
          _t_47 = _t_37.last_modified_by;
          _t_48 = _t_37.link;
          try {
            await __env.output(String(_t_7), _t_37);
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
  try {
    _t_1 = new Date(XNOWX);
    _t_2 = 3600000;
    _t_0 = await __env.invokeTimer(_t_1, _t_2);
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
              _t_15 = _t_13.file_id;
              _t_16 = _t_13.file_name;
              _t_17 = _t_13.mime_type;
              _t_18 = _t_13.description;
              _t_19 = _t_13.starred;
              _t_20 = _t_13.created_time;
              _t_21 = _t_13.modified_time;
              _t_22 = _t_13.file_size;
              _t_23 = _t_13.last_modified_by;
              _t_24 = _t_13.link;
              _t_25 = _t_5 > _t_22;
              if (_t_25) {
                _t_5 = _t_22;
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
          _t_26 = _t_6.order_by;
          _t_27 = _t_6.file_id;
          _t_28 = _t_6.file_name;
          _t_29 = _t_6.mime_type;
          _t_30 = _t_6.description;
          _t_31 = _t_6.starred;
          _t_32 = _t_6.created_time;
          _t_33 = _t_6.modified_time;
          _t_34 = _t_6.file_size;
          _t_35 = _t_6.last_modified_by;
          _t_36 = _t_6.link;
          _t_37 = {};
          _t_37.order_by = _t_26;
          _t_37.file_id = _t_27;
          _t_37.file_name = _t_28;
          _t_37.mime_type = _t_29;
          _t_37.description = _t_30;
          _t_37.starred = _t_31;
          _t_37.created_time = _t_32;
          _t_37.modified_time = _t_33;
          _t_37.file_size = _t_34;
          _t_37.last_modified_by = _t_35;
          _t_37.link = _t_36;
          _t_38 = _t_37.order_by;
          _t_39 = _t_37.file_id;
          _t_40 = _t_37.file_name;
          _t_41 = _t_37.mime_type;
          _t_42 = _t_37.description;
          _t_43 = _t_37.starred;
          _t_44 = _t_37.created_time;
          _t_45 = _t_37.modified_time;
          _t_46 = _t_37.file_size;
          _t_47 = _t_37.last_modified_by;
          _t_48 = _t_37.link;
          try {
            await __env.output(String(_t_7), _t_37);
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
        _t_12 = _t_10.file_id;
        _t_13 = _t_10.file_name;
        _t_14 = _t_10.mime_type;
        _t_15 = _t_10.description;
        _t_16 = _t_10.starred;
        _t_17 = _t_10.created_time;
        _t_18 = _t_10.modified_time;
        _t_19 = _t_10.file_size;
        _t_20 = _t_10.last_modified_by;
        _t_21 = _t_10.link;
        _t_4.update(_t_10, _t_9);
        _iter_tmp = await _t_7.next();
      }
    }
  } catch(_exc_) {
    __env.reportError("Failed to invoke query", _exc_);
  }
  for (_t_22 of _t_4) {
    _t_23 = _t_22[0];
    _t_24 = _t_22[1];
    _t_25 = _t_24.order_by;
    _t_26 = _t_24.file_id;
    _t_27 = _t_24.file_name;
    _t_28 = _t_24.mime_type;
    _t_29 = _t_24.description;
    _t_30 = _t_24.starred;
    _t_31 = _t_24.created_time;
    _t_32 = _t_24.modified_time;
    _t_33 = _t_24.file_size;
    _t_34 = _t_24.last_modified_by;
    _t_35 = _t_24.link;
    try {
      await __env.output(String(_t_23), _t_24);
    } catch(_exc_) {
      __env.reportError("Failed to invoke action", _exc_);
    }
  }`]],

    // simple indexing
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
        _t_10 = _t_8.file_id;
        _t_11 = _t_8.file_name;
        _t_12 = _t_8.mime_type;
        _t_13 = _t_8.description;
        _t_14 = _t_8.starred;
        _t_15 = _t_8.created_time;
        _t_16 = _t_8.modified_time;
        _t_17 = _t_8.file_size;
        _t_18 = _t_8.last_modified_by;
        _t_19 = _t_8.link;
        _t_20 = 1;
        _t_2 = _t_2 + _t_20;
        _t_21 = _t_0 == _t_2;
        if (_t_21) {
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

    // more simple indexing
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
              _t_14 = _t_12.file_id;
              _t_15 = _t_12.file_name;
              _t_16 = _t_12.mime_type;
              _t_17 = _t_12.description;
              _t_18 = _t_12.starred;
              _t_19 = _t_12.created_time;
              _t_20 = _t_12.modified_time;
              _t_21 = _t_12.file_size;
              _t_22 = _t_12.last_modified_by;
              _t_23 = _t_12.link;
              _t_24 = 1;
              _t_6 = _t_6 + _t_24;
              _t_25 = _t_4 == _t_6;
              if (_t_25) {
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
          _t_26 = {};
          _t_26.order_by = _t_13;
          _t_26.file_id = _t_14;
          _t_26.file_name = _t_15;
          _t_26.mime_type = _t_16;
          _t_26.description = _t_17;
          _t_26.starred = _t_18;
          _t_26.created_time = _t_19;
          _t_26.modified_time = _t_20;
          _t_26.file_size = _t_21;
          _t_26.last_modified_by = _t_22;
          _t_26.link = _t_23;
          _t_27 = _t_26.order_by;
          _t_28 = _t_26.file_id;
          _t_29 = _t_26.file_name;
          _t_30 = _t_26.mime_type;
          _t_31 = _t_26.description;
          _t_32 = _t_26.starred;
          _t_33 = _t_26.created_time;
          _t_34 = _t_26.modified_time;
          _t_35 = _t_26.file_size;
          _t_36 = _t_26.last_modified_by;
          _t_37 = _t_26.link;
          try {
            await __env.output(String(_t_11), _t_26);
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

    // complex indexing
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
  _t_0 = [2, 3, 4];
  _t_1 = new Array(0);
  try {
    _t_2 = {};
    _t_3 = await __env.invokeQuery("com.google.drive", { }, "list_drive_files", _t_2);
    _t_4 = _t_3[Symbol.iterator]();
    {
      let _iter_tmp = await _t_4.next();
      while (!_iter_tmp.done) {
        _t_5 = _iter_tmp.value;
        _t_6 = _t_5[0];
        _t_7 = _t_5[1];
        _t_8 = _t_7.order_by;
        _t_9 = _t_7.file_id;
        _t_10 = _t_7.file_name;
        _t_11 = _t_7.mime_type;
        _t_12 = _t_7.description;
        _t_13 = _t_7.starred;
        _t_14 = _t_7.created_time;
        _t_15 = _t_7.modified_time;
        _t_16 = _t_7.file_size;
        _t_17 = _t_7.last_modified_by;
        _t_18 = _t_7.link;
        _t_19 = new Array(2);
        _t_19[0] = _t_7;
        _t_19[1] = _t_6;
        _t_1.push(_t_19);
        _iter_tmp = await _t_4.next();
      }
    }
  } catch(_exc_) {
    __env.reportError("Failed to invoke query", _exc_);
  }
  _t_20 = __builtin.indexArray(_t_1, _t_0);
  for (_t_21 of _t_20) {
    _t_23 = _t_21[0];
    _t_22 = _t_21[1];
    _t_24 = _t_23.order_by;
    _t_25 = _t_23.file_id;
    _t_26 = _t_23.file_name;
    _t_27 = _t_23.mime_type;
    _t_28 = _t_23.description;
    _t_29 = _t_23.starred;
    _t_30 = _t_23.created_time;
    _t_31 = _t_23.modified_time;
    _t_32 = _t_23.file_size;
    _t_33 = _t_23.last_modified_by;
    _t_34 = _t_23.link;
    try {
      await __env.output(String(_t_22), _t_23);
    } catch(_exc_) {
      __env.reportError("Failed to invoke action", _exc_);
    }
  }`]],

    // complex slicing
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
        _t_10 = _t_8.file_id;
        _t_11 = _t_8.file_name;
        _t_12 = _t_8.mime_type;
        _t_13 = _t_8.description;
        _t_14 = _t_8.starred;
        _t_15 = _t_8.created_time;
        _t_16 = _t_8.modified_time;
        _t_17 = _t_8.file_size;
        _t_18 = _t_8.last_modified_by;
        _t_19 = _t_8.link;
        _t_20 = new Array(2);
        _t_20[0] = _t_8;
        _t_20[1] = _t_7;
        _t_2.push(_t_20);
        _iter_tmp = await _t_5.next();
      }
    }
  } catch(_exc_) {
    __env.reportError("Failed to invoke query", _exc_);
  }
  _t_21 = __builtin.sliceArray(_t_2, _t_0, _t_1);
  for (_t_22 of _t_21) {
    _t_24 = _t_22[0];
    _t_23 = _t_22[1];
    _t_25 = _t_24.order_by;
    _t_26 = _t_24.file_id;
    _t_27 = _t_24.file_name;
    _t_28 = _t_24.mime_type;
    _t_29 = _t_24.description;
    _t_30 = _t_24.starred;
    _t_31 = _t_24.created_time;
    _t_32 = _t_24.modified_time;
    _t_33 = _t_24.file_size;
    _t_34 = _t_24.last_modified_by;
    _t_35 = _t_24.link;
    try {
      await __env.output(String(_t_23), _t_24);
    } catch(_exc_) {
      __env.reportError("Failed to invoke action", _exc_);
    }
  }`]],

    // sorting
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
        _t_8 = _t_6.file_id;
        _t_9 = _t_6.file_name;
        _t_10 = _t_6.mime_type;
        _t_11 = _t_6.description;
        _t_12 = _t_6.starred;
        _t_13 = _t_6.created_time;
        _t_14 = _t_6.modified_time;
        _t_15 = _t_6.file_size;
        _t_16 = _t_6.last_modified_by;
        _t_17 = _t_6.link;
        _t_18 = new Array(2);
        _t_18[0] = _t_6;
        _t_18[1] = _t_5;
        _t_0.push(_t_18);
        _iter_tmp = await _t_3.next();
      }
    }
  } catch(_exc_) {
    __env.reportError("Failed to invoke query", _exc_);
  }
  _t_19 = "file_size";
  __builtin.sortasc(_t_0, _t_19);
  for (_t_20 of _t_0) {
    _t_22 = _t_20[0];
    _t_21 = _t_20[1];
    _t_23 = _t_22.order_by;
    _t_24 = _t_22.file_id;
    _t_25 = _t_22.file_name;
    _t_26 = _t_22.mime_type;
    _t_27 = _t_22.description;
    _t_28 = _t_22.starred;
    _t_29 = _t_22.created_time;
    _t_30 = _t_22.modified_time;
    _t_31 = _t_22.file_size;
    _t_32 = _t_22.last_modified_by;
    _t_33 = _t_22.link;
    try {
      await __env.output(String(_t_21), _t_22);
    } catch(_exc_) {
      __env.reportError("Failed to invoke action", _exc_);
    }
  }`]],

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
    __env.reportError("Failed to invoke query", _exc_);
  }
  __env.clearGetCache();
  try {
    _t_10 = {};
    _t_11 = "foo";
    _t_10.status = _t_11;
    await __env.invokeAction("com.twitter", { }, "post", _t_10);
  } catch(_exc_) {
    __env.reportError("Failed to invoke action", _exc_);
  }`]],

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
    __env.reportError("Failed to invoke query", _exc_);
  }
  __env.clearGetCache();
  try {
    _t_10 = {};
    _t_11 = "foo";
    _t_10.status = _t_11;
    await __env.invokeAction("com.twitter", { }, "post", _t_10);
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
        _t_6 = _t_5.text;
        _t_7 = _t_5.hashtags;
        _t_8 = _t_5.urls;
        _t_9 = _t_5.author;
        _t_10 = _t_5.in_reply_to;
        _t_11 = _t_5.tweet_id;
        _t_12 = __builtin.isNewTuple(_t_0, _t_5, ["text", "hashtags", "urls", "author", "in_reply_to", "tweet_id"]);
        _t_13 = __builtin.addTuple(_t_0, _t_5);
        await __env.writeState(0, _t_13);
        _t_0 = _t_13;
        if (_t_12) {
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
        _t_7 = _t_6.title;
        _t_8 = _t_6.description;
        _t_9 = _t_6.link;
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
        _t_6 = _t_5.title;
        _t_7 = _t_5.description;
        _t_8 = _t_5.link;
        try {
          _t_9 = __scope.a;
          _t_10 = String (_t_8);
          await _t_9(__env, _t_10);
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
    _t_11 = __scope.a;
    _t_12 = "no";
    await _t_11(__env, _t_12);
  } catch(_exc_) {
    __env.reportError("Failed to invoke action", _exc_);
  }`]],

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
        _t_7 = _t_6.temperature;
        _t_8 = _t_6.wind_speed;
        _t_9 = _t_6.humidity;
        _t_10 = _t_6.cloudiness;
        _t_11 = _t_6.fog;
        _t_12 = _t_6.status;
        _t_13 = _t_6.icon;
        _t_14 = __builtin.isNewTuple(_t_0, _t_6, ["location", "temperature", "wind_speed", "humidity", "cloudiness", "fog", "status", "icon"]);
        _t_15 = __builtin.addTuple(_t_0, _t_6);
        await __env.writeState(0, _t_15);
        _t_0 = _t_15;
        if (_t_14) {
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
  try {
    _t_0 = __scope.s1;
    _t_1 = await __builtin.invokeStreamVarRef(__env, _t_0);
    {
      let _iter_tmp = await _t_1.next();
      while (!_iter_tmp.done) {
        _t_2 = _iter_tmp.value;
        _t_3 = _t_2[0];
        _t_4 = _t_2[1];
        _t_5 = _t_4.temperature;
        _t_6 = _t_4.wind_speed;
        _t_7 = _t_4.humidity;
        _t_8 = _t_4.cloudiness;
        _t_9 = _t_4.fog;
        _t_10 = _t_4.status;
        _t_11 = _t_4.icon;
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
        _t_8 = _t_6.image_id;
        _t_9 = _t_6.picture_url;
        _t_10 = _t_6.link;
        _t_11 = new Array(2);
        _t_11[0] = _t_5;
        _t_11[1] = _t_6;
        _t_0.push(_t_11);
        _iter_tmp = await _t_3.next();
      }
    }
  } catch(_exc_) {
    __env.reportError("Failed to invoke query", _exc_);
  }
  __env.clearGetCache();
  _t_12 = _t_0[Symbol.iterator]();
  {
    let _iter_tmp = await _t_12.next();
    while (!_iter_tmp.done) {
      _t_13 = _iter_tmp.value;
      _t_14 = _t_13[0];
      _t_15 = _t_13[1];
      _t_16 = _t_15.image_id;
      _t_17 = _t_15.picture_url;
      _t_18 = _t_15.link;
      try {
        await __env.output(String(_t_14), _t_15);
      } catch(_exc_) {
        __env.reportError("Failed to invoke action", _exc_);
      }
      _iter_tmp = await _t_12.next();
    }
  }
  __env.clearGetCache();
  _t_19 = _t_0[Symbol.iterator]();
  {
    let _iter_tmp = await _t_19.next();
    while (!_iter_tmp.done) {
      _t_20 = _iter_tmp.value;
      _t_21 = _t_20[0];
      _t_22 = _t_20[1];
      _t_23 = _t_22.image_id;
      _t_24 = _t_22.picture_url;
      _t_25 = _t_22.link;
      try {
        _t_26 = {};
        _t_27 = "cat";
        _t_26.caption = _t_27;
        _t_28 = String (_t_24);
        _t_26.picture_url = _t_28;
        await __env.invokeAction("com.twitter", { }, "post_picture", _t_26);
      } catch(_exc_) {
        __env.reportError("Failed to invoke action", _exc_);
      }
      _iter_tmp = await _t_19.next();
    }
  }`]],

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
        _t_8 = _t_6.image_id;
        _t_9 = _t_6.picture_url;
        _t_10 = _t_6.link;
        _t_11 = new Array(2);
        _t_11[0] = _t_5;
        _t_11[1] = _t_6;
        _t_0.push(_t_11);
        _iter_tmp = await _t_3.next();
      }
    }
  } catch(_exc_) {
    __env.reportError("Failed to invoke query", _exc_);
  }
  await __env.writeState(0, _t_0);
  __env.clearGetCache();
  _t_12 = await __env.readState(0);
  _t_13 = _t_12[Symbol.iterator]();
  {
    let _iter_tmp = await _t_13.next();
    while (!_iter_tmp.done) {
      _t_14 = _iter_tmp.value;
      _t_15 = _t_14[0];
      _t_16 = _t_14[1];
      _t_17 = _t_16.image_id;
      _t_18 = _t_16.picture_url;
      _t_19 = _t_16.link;
      try {
        await __env.output(String(_t_15), _t_16);
      } catch(_exc_) {
        __env.reportError("Failed to invoke action", _exc_);
      }
      _iter_tmp = await _t_13.next();
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
  try {
    _t_1 = new Date(XNOWX);
    _t_2 = 3600000;
    _t_0 = await __env.invokeTimer(_t_1, _t_2);
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
            _t_9 = _t_8.image_id;
            _t_10 = _t_8.picture_url;
            _t_11 = _t_8.link;
            _t_12 = {};
            _t_12.image_id = _t_9;
            _t_12.picture_url = _t_10;
            _t_12.link = _t_11;
            _t_13 = _t_12.image_id;
            _t_14 = _t_12.picture_url;
            _t_15 = _t_12.link;
            try {
              _t_16 = {};
              _t_17 = "cat";
              _t_16.caption = _t_17;
              _t_18 = String (_t_14);
              _t_16.picture_url = _t_18;
              await __env.invokeAction("com.twitter", { }, "post_picture", _t_16);
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

    // simple procedure declarations
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
          _t_7 = _t_6.title;
          _t_8 = _t_6.description;
          _t_9 = _t_6.link;
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
      _t_10 = {};
      _t_10.status = _t_0;
      await __env.invokeAction("com.twitter", { }, "post", _t_10);
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

    // procedure with results
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
          _t_8 = _t_7.title;
          _t_9 = _t_7.description;
          _t_10 = _t_7.link;
          _t_11 = new Array(2);
          _t_11[0] = _t_6;
          _t_11[1] = _t_7;
          _t_1.push(_t_11);
          _iter_tmp = await _t_4.next();
        }
      }
    } catch(_exc_) {
      __env.reportError("Failed to invoke query", _exc_);
    }
    __env.clearGetCache();
    _t_12 = _t_1[Symbol.iterator]();
    {
      let _iter_tmp = await _t_12.next();
      while (!_iter_tmp.done) {
        _t_13 = _iter_tmp.value;
        _t_14 = _t_13[0];
        _t_15 = _t_13[1];
        _t_16 = _t_15.title;
        _t_17 = _t_15.description;
        _t_18 = _t_15.link;
        try {
          await __env.output(String(_t_14), _t_15);
        } catch(_exc_) {
          __env.reportError("Failed to invoke action", _exc_);
        }
        _iter_tmp = await _t_12.next();
      }
    }
    __env.clearGetCache();
    _t_19 = _t_1[Symbol.iterator]();
    {
      let _iter_tmp = await _t_19.next();
      while (!_iter_tmp.done) {
        _t_20 = _iter_tmp.value;
        _t_21 = _t_20[0];
        _t_22 = _t_20[1];
        _t_23 = _t_22.title;
        _t_24 = _t_22.description;
        _t_25 = _t_22.link;
        try {
          _t_26 = {};
          _t_26.status = _t_23;
          await __env.invokeAction("com.twitter", { }, "post", _t_26);
        } catch(_exc_) {
          __env.reportError("Failed to invoke action", _exc_);
        }
        _iter_tmp = await _t_19.next();
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

    // procedure with nested declarations
    [`let procedure p1(p_foo : String) := {
        let query q1 := @com.bing.web_search(query = p_foo);
        now => q1 => notify;
        now => q1 => @com.twitter.post(status = title);
    };
    now => p1(p_foo = "one");
    now => p1(p_foo = "two");
    `,
    [`"use strict";
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
  await __env.enterProcedure(0, "p1");
  try {
    _t_10 = async function(__env, emit) {
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
            _t_7 = _t_6.title;
            _t_8 = _t_6.description;
            _t_9 = _t_6.link;
            emit(_t_5, _t_6);
            _iter_tmp = await _t_3.next();
          }
        }
      } catch(_exc_) {
        __env.reportError("Failed to invoke query", _exc_);
      }
    };
    try {
      _t_11 = await __builtin.invokeStreamVarRef(__env, _t_10);
      {
        let _iter_tmp = await _t_11.next();
        while (!_iter_tmp.done) {
          _t_12 = _iter_tmp.value;
          _t_13 = _t_12[0];
          _t_14 = _t_12[1];
          _t_15 = _t_14.title;
          _t_16 = _t_14.description;
          _t_17 = _t_14.link;
          try {
            await __env.output(String(_t_13), _t_14);
          } catch(_exc_) {
            __env.reportError("Failed to invoke action", _exc_);
          }
          _iter_tmp = await _t_11.next();
        }
      }
    } catch(_exc_) {
      __env.reportError("Failed to invoke query", _exc_);
    }
    __env.clearGetCache();
    try {
      _t_18 = await __builtin.invokeStreamVarRef(__env, _t_10);
      {
        let _iter_tmp = await _t_18.next();
        while (!_iter_tmp.done) {
          _t_19 = _iter_tmp.value;
          _t_20 = _t_19[0];
          _t_21 = _t_19[1];
          _t_22 = _t_21.title;
          _t_23 = _t_21.description;
          _t_24 = _t_21.link;
          try {
            _t_25 = {};
            _t_25.status = _t_22;
            await __env.invokeAction("com.twitter", { }, "post", _t_25);
          } catch(_exc_) {
            __env.reportError("Failed to invoke action", _exc_);
          }
          _iter_tmp = await _t_18.next();
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

    // nested procedures
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

    // nested procedures, called from a rule
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
    _t_0 = await __env.invokeTimer(_t_1, _t_2);
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
        _t_6 = _t_5.image_id;
        _t_7 = _t_5.picture_url;
        _t_8 = _t_5.link;
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
        _t_6 = _t_5.image_id;
        _t_7 = _t_5.picture_url;
        _t_8 = _t_5.link;
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
        _t_6 = _t_5.image_id;
        _t_7 = _t_5.picture_url;
        _t_8 = _t_5.link;
        try {
          _t_9 = {};
          _t_10 = String (_t_7);
          _t_9.picture_url = _t_10;
          _t_11 = "cat";
          _t_9.caption = _t_11;
          await __env.invokeAction("com.twitter", { }, "post_picture", _t_9);
        } catch(_exc_) {
          __env.reportError("Failed to invoke action", _exc_);
        }
        _iter_tmp = await _t_2.next();
      }
    }
  } catch(_exc_) {
    __env.reportError("Failed to invoke readResult", _exc_);
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
                //console.error('Expected: ' + expected[j]);
                console.error('Compiled: ' + code);
                if (process.env.TEST_MODE)
                    throw new Error(`testCompiler ${i+1} FAILED`);
            } else {
                new AsyncFunction('__builtin', '__env', '__scope', code);
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
