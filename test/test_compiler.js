"use strict";

const Q = require('q');
Q.longStackSupport = true;

const Compiler = require('../lib/compiler');
const SchemaRetriever = require('../lib/schema');

const _mockSchemaDelegate = require('./mock_schema_delegate');
const _mockMemoryClient = require('./mock_memory_client');
var schemaRetriever = new SchemaRetriever(_mockSchemaDelegate, _mockMemoryClient, true);

const TEST_CASES = [
    [`now => @xkcd.get_comic() => notify;`,
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
    _t_1 = yield env.invokeQuery(0, _t_0);
    _t_2 = _t_1[Symbol.iterator]();
    {
      let _iter_tmp = yield _t_2.next();
      while (!_iter_tmp.done) {
        _t_3 = _iter_tmp.value;
        _t_4 = _t_3[0];
        _t_5 = _t_3[1];
        _t_6 = _t_5.number;
        _t_7 = _t_5.title;
        _t_8 = _t_5.link;
        _t_9 = _t_5.picture_url;
        try {
          yield env.output(String(_t_4), _t_5);
        } catch(_exc_) {
          env.reportError("Failed to invoke action", _exc_);
        }
        _iter_tmp = yield _t_2.next();
      }
    }
  } catch(_exc_) {
    env.reportError("Failed to invoke query", _exc_);
  }`]],

    [`now => @xkcd.get_comic() => { notify; @twitter.sink(status=title); };`,
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
    _t_1 = yield env.invokeQuery(0, _t_0);
    _t_2 = _t_1[Symbol.iterator]();
    {
      let _iter_tmp = yield _t_2.next();
      while (!_iter_tmp.done) {
        _t_3 = _iter_tmp.value;
        _t_4 = _t_3[0];
        _t_5 = _t_3[1];
        _t_6 = _t_5.number;
        _t_7 = _t_5.title;
        _t_8 = _t_5.link;
        _t_9 = _t_5.picture_url;
        try {
          yield env.output(String(_t_4), _t_5);
        } catch(_exc_) {
          env.reportError("Failed to invoke action", _exc_);
        }
        try {
          _t_10 = {};
          _t_10.status = _t_7;
          yield env.invokeAction(1, _t_10);
        } catch(_exc_) {
          env.reportError("Failed to invoke action", _exc_);
        }
        _iter_tmp = yield _t_2.next();
      }
    }
  } catch(_exc_) {
    env.reportError("Failed to invoke query", _exc_);
  }`]],

    [`now => @xkcd.get_comic(), number <= 1000 => { notify; @twitter.sink(status=title); };`,
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
    _t_1 = yield env.invokeQuery(0, _t_0);
    _t_2 = _t_1[Symbol.iterator]();
    {
      let _iter_tmp = yield _t_2.next();
      while (!_iter_tmp.done) {
        _t_3 = _iter_tmp.value;
        _t_4 = _t_3[0];
        _t_5 = _t_3[1];
        _t_6 = _t_5.number;
        _t_7 = _t_5.title;
        _t_8 = _t_5.link;
        _t_9 = _t_5.picture_url;
        _t_11 = 1000;
        _t_10 = _t_6 <= _t_11;
        if (_t_10) {
          try {
            yield env.output(String(_t_4), _t_5);
          } catch(_exc_) {
            env.reportError("Failed to invoke action", _exc_);
          }
          try {
            _t_12 = {};
            _t_12.status = _t_7;
            yield env.invokeAction(1, _t_12);
          } catch(_exc_) {
            env.reportError("Failed to invoke action", _exc_);
          }
        } else {

        }
        _iter_tmp = yield _t_2.next();
      }
    }
  } catch(_exc_) {
    env.reportError("Failed to invoke query", _exc_);
  }`]],

    [`monitor @test.source() => @builtin.debug_log(message="Test App received an event on Test Channel");`,
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
  _t_0 = yield env.readState(0);
  try {
    _t_1 = {};
    _t_2 = yield env.invokeMonitor(0, _t_1, false);
    {
      let _iter_tmp = yield _t_2.next();
      while (!_iter_tmp.done) {
        _t_3 = _iter_tmp.value;
        _t_4 = _t_3[0];
        _t_5 = _t_3[1];
        _t_6 = _t_5.value;
        _t_7 = __builtin.isNewTuple(_t_0, _t_5, ["value"]);
        _t_8 = __builtin.addTuple(_t_0, _t_5);
        yield env.writeState(0, _t_8);
        _t_0 = _t_8;
        if (_t_7) {
          try {
            _t_9 = {};
            _t_10 = "Test App received an event on Test Channel";
            _t_9.message = _t_10;
            yield env.invokeAction(1, _t_9);
          } catch(_exc_) {
            env.reportError("Failed to invoke action", _exc_);
          }
        } else {

        }
        _iter_tmp = yield _t_2.next();
      }
    }
  } catch(_exc_) {
    env.reportError("Failed to invoke trigger", _exc_);
  }`]],

    [`monitor @thermostat.get_temperature(), temperature >= 21C => @builtin.say(message="bla");`,
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
  _t_0 = yield env.readState(0);
  try {
    _t_1 = {};
    _t_2 = yield env.invokeMonitor(0, _t_1, false);
    {
      let _iter_tmp = yield _t_2.next();
      while (!_iter_tmp.done) {
        _t_3 = _iter_tmp.value;
        _t_4 = _t_3[0];
        _t_5 = _t_3[1];
        _t_6 = _t_5.time;
        _t_7 = _t_5.temperature;
        _t_8 = __builtin.isNewTuple(_t_0, _t_5, ["time", "temperature"]);
        _t_9 = __builtin.addTuple(_t_0, _t_5);
        yield env.writeState(0, _t_9);
        _t_0 = _t_9;
        if (_t_8) {
          _t_11 = 21;
          _t_10 = _t_7 >= _t_11;
          if (_t_10) {
            try {
              _t_12 = {};
              _t_13 = "bla";
              _t_12.message = _t_13;
              yield env.invokeAction(1, _t_12);
            } catch(_exc_) {
              env.reportError("Failed to invoke action", _exc_);
            }
          } else {

          }
        } else {

        }
        _iter_tmp = yield _t_2.next();
      }
    }
  } catch(_exc_) {
    env.reportError("Failed to invoke trigger", _exc_);
  }`]],

    [`monitor (@thermostat.get_temperature(), temperature >= 21C) => @builtin.say(message="bla");`,
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
  _t_0 = yield env.readState(0);
  try {
    _t_1 = {};
    _t_2 = yield env.invokeMonitor(0, _t_1, false);
    {
      let _iter_tmp = yield _t_2.next();
      while (!_iter_tmp.done) {
        _t_3 = _iter_tmp.value;
        _t_4 = _t_3[0];
        _t_5 = _t_3[1];
        _t_6 = _t_5.time;
        _t_7 = _t_5.temperature;
        _t_8 = __builtin.isNewTuple(_t_0, _t_5, ["time", "temperature"]);
        _t_9 = __builtin.addTuple(_t_0, _t_5);
        yield env.writeState(0, _t_9);
        _t_0 = _t_9;
        if (_t_8) {
          _t_11 = 21;
          _t_10 = _t_7 >= _t_11;
          if (_t_10) {
            try {
              _t_12 = {};
              _t_13 = "bla";
              _t_12.message = _t_13;
              yield env.invokeAction(1, _t_12);
            } catch(_exc_) {
              env.reportError("Failed to invoke action", _exc_);
            }
          } else {

          }
        } else {

        }
        _iter_tmp = yield _t_2.next();
      }
    }
  } catch(_exc_) {
    env.reportError("Failed to invoke trigger", _exc_);
  }`]],

    [`now => @builtin.say(message="test");`, [`"use strict";
  let _t_0;
  let _t_1;
  try {
    _t_0 = {};
    _t_1 = "test";
    _t_0.message = _t_1;
    yield env.invokeAction(0, _t_0);
  } catch(_exc_) {
    env.reportError("Failed to invoke action", _exc_);
  }`]],

    [`monitor @twitter(id="twitter-foo").source(), from=="HillaryClinton"^^tt:username => notify;`,
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
  _t_0 = yield env.readState(0);
  try {
    _t_1 = {};
    _t_2 = yield env.invokeMonitor(0, _t_1, false);
    {
      let _iter_tmp = yield _t_2.next();
      while (!_iter_tmp.done) {
        _t_3 = _iter_tmp.value;
        _t_4 = _t_3[0];
        _t_5 = _t_3[1];
        _t_6 = _t_5.text;
        _t_7 = _t_5.hashtags;
        _t_8 = _t_5.urls;
        _t_9 = _t_5.from;
        _t_10 = _t_5.inReplyTo;
        _t_11 = _t_5.__reserved;
        _t_12 = __builtin.isNewTuple(_t_0, _t_5, ["text", "hashtags", "urls", "from", "inReplyTo", "__reserved"]);
        _t_13 = __builtin.addTuple(_t_0, _t_5);
        yield env.writeState(0, _t_13);
        _t_0 = _t_13;
        if (_t_12) {
          _t_15 = new __builtin.Entity("HillaryClinton", null);
          _t_14 = __builtin.equality(_t_9, _t_15);
          if (_t_14) {
            try {
              yield env.output(String(_t_4), _t_5);
            } catch(_exc_) {
              env.reportError("Failed to invoke action", _exc_);
            }
          } else {

          }
        } else {

        }
        _iter_tmp = yield _t_2.next();
      }
    }
  } catch(_exc_) {
    env.reportError("Failed to invoke trigger", _exc_);
  }`]],

    [`monitor @weatherapi.weather(location=makeLocation(1, 3, "Somewhere")) => notify;`,
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
  _t_0 = yield env.readState(0);
  try {
    _t_1 = {};
    _t_2 = new __builtin.Location(1, 3, "Somewhere");
    _t_1.location = _t_2;
    _t_3 = yield env.invokeMonitor(0, _t_1, false);
    {
      let _iter_tmp = yield _t_3.next();
      while (!_iter_tmp.done) {
        _t_4 = _iter_tmp.value;
        _t_5 = _t_4[0];
        _t_6 = _t_4[1];
        _t_7 = _t_6.temperature;
        _t_8 = __builtin.isNewTuple(_t_0, _t_6, ["location", "temperature"]);
        _t_9 = __builtin.addTuple(_t_0, _t_6);
        yield env.writeState(0, _t_9);
        _t_0 = _t_9;
        if (_t_8) {
          try {
            yield env.output(String(_t_5), _t_6);
          } catch(_exc_) {
            env.reportError("Failed to invoke action", _exc_);
          }
        } else {

        }
        _iter_tmp = yield _t_3.next();
      }
    }
  } catch(_exc_) {
    env.reportError("Failed to invoke trigger", _exc_);
  }`]],

    [`monitor @weatherapi.weather(location=makeLocation(1, 3)) => notify;`,
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
  _t_0 = yield env.readState(0);
  try {
    _t_1 = {};
    _t_2 = new __builtin.Location(1, 3, null);
    _t_1.location = _t_2;
    _t_3 = yield env.invokeMonitor(0, _t_1, false);
    {
      let _iter_tmp = yield _t_3.next();
      while (!_iter_tmp.done) {
        _t_4 = _iter_tmp.value;
        _t_5 = _t_4[0];
        _t_6 = _t_4[1];
        _t_7 = _t_6.temperature;
        _t_8 = __builtin.isNewTuple(_t_0, _t_6, ["location", "temperature"]);
        _t_9 = __builtin.addTuple(_t_0, _t_6);
        yield env.writeState(0, _t_9);
        _t_0 = _t_9;
        if (_t_8) {
          try {
            yield env.output(String(_t_5), _t_6);
          } catch(_exc_) {
            env.reportError("Failed to invoke action", _exc_);
          }
        } else {

        }
        _iter_tmp = yield _t_3.next();
      }
    }
  } catch(_exc_) {
    env.reportError("Failed to invoke trigger", _exc_);
  }`]],

    [`attimer(time=makeTime(12, 30)) => notify;`,
     [`"use strict";
  let _t_0;
  let _t_1;
  let _t_2;
  try {
    _t_1 = new __builtin.Time(12, 30, 0);
    _t_0 = yield env.invokeAtTimer(_t_1);
    {
      let _iter_tmp = yield _t_0.next();
      while (!_iter_tmp.done) {
        _t_2 = _iter_tmp.value;
        try {
          yield env.output(null, _t_2);
        } catch(_exc_) {
          env.reportError("Failed to invoke action", _exc_);
        }
        _iter_tmp = yield _t_0.next();
      }
    }
  } catch(_exc_) {
    env.reportError("Failed to invoke at-timer", _exc_);
  }`]],

    [`attimer(time=makeTime(12, 30)) => @twitter.sink(status="lol");`,
     [`"use strict";
  let _t_0;
  let _t_1;
  let _t_2;
  let _t_3;
  let _t_4;
  try {
    _t_1 = new __builtin.Time(12, 30, 0);
    _t_0 = yield env.invokeAtTimer(_t_1);
    {
      let _iter_tmp = yield _t_0.next();
      while (!_iter_tmp.done) {
        _t_2 = _iter_tmp.value;
        try {
          _t_3 = {};
          _t_4 = "lol";
          _t_3.status = _t_4;
          yield env.invokeAction(0, _t_3);
        } catch(_exc_) {
          env.reportError("Failed to invoke action", _exc_);
        }
        _iter_tmp = yield _t_0.next();
      }
    }
  } catch(_exc_) {
    env.reportError("Failed to invoke at-timer", _exc_);
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
    _t_0 = yield env.invokeTimer(_t_1, _t_2);
    {
      let _iter_tmp = yield _t_0.next();
      while (!_iter_tmp.done) {
        _t_3 = _iter_tmp.value;
        try {
          yield env.output(null, _t_3);
        } catch(_exc_) {
          env.reportError("Failed to invoke action", _exc_);
        }
        _iter_tmp = yield _t_0.next();
      }
    }
  } catch(_exc_) {
    env.reportError("Failed to invoke timer", _exc_);
  }`]],

    [`timer(base=makeDate(), interval=1h) => @twitter.sink(status="lol");`,
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
    _t_0 = yield env.invokeTimer(_t_1, _t_2);
    {
      let _iter_tmp = yield _t_0.next();
      while (!_iter_tmp.done) {
        _t_3 = _iter_tmp.value;
        try {
          _t_4 = {};
          _t_5 = "lol";
          _t_4.status = _t_5;
          yield env.invokeAction(0, _t_4);
        } catch(_exc_) {
          env.reportError("Failed to invoke action", _exc_);
        }
        _iter_tmp = yield _t_0.next();
      }
    }
  } catch(_exc_) {
    env.reportError("Failed to invoke timer", _exc_);
  }`]],

    [`now => @youtube.search_videos(query="lol"), video_url == "http://www.youtube.com"^^tt:url =>  notify;`,
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
    _t_1 = "lol";
    _t_0.query = _t_1;
    _t_2 = yield env.invokeQuery(0, _t_0);
    _t_3 = _t_2[Symbol.iterator]();
    {
      let _iter_tmp = yield _t_3.next();
      while (!_iter_tmp.done) {
        _t_4 = _iter_tmp.value;
        _t_5 = _t_4[0];
        _t_6 = _t_4[1];
        _t_7 = _t_6.video_url;
        _t_9 = new __builtin.Entity("http://www.youtube.com", null);
        _t_8 = __builtin.equality(_t_7, _t_9);
        if (_t_8) {
          try {
            yield env.output(String(_t_5), _t_6);
          } catch(_exc_) {
            env.reportError("Failed to invoke action", _exc_);
          }
        } else {

        }
        _iter_tmp = yield _t_3.next();
      }
    }
  } catch(_exc_) {
    env.reportError("Failed to invoke query", _exc_);
  }`]],

    [`monitor @xkcd(id="com.xkcd-6").get_comic() => @twitter(id="twitter-foo").post_picture(caption=title, picture_url=picture_url);`,
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
  _t_0 = yield env.readState(0);
  try {
    _t_1 = {};
    _t_2 = yield env.invokeMonitor(0, _t_1, false);
    {
      let _iter_tmp = yield _t_2.next();
      while (!_iter_tmp.done) {
        _t_3 = _iter_tmp.value;
        _t_4 = _t_3[0];
        _t_5 = _t_3[1];
        _t_6 = _t_5.number;
        _t_7 = _t_5.title;
        _t_8 = _t_5.link;
        _t_9 = _t_5.picture_url;
        _t_10 = __builtin.isNewTuple(_t_0, _t_5, ["number", "title", "link", "picture_url"]);
        _t_11 = __builtin.addTuple(_t_0, _t_5);
        yield env.writeState(0, _t_11);
        _t_0 = _t_11;
        if (_t_10) {
          try {
            _t_12 = {};
            _t_12.caption = _t_7;
            _t_12.picture_url = _t_9;
            yield env.invokeAction(1, _t_12);
          } catch(_exc_) {
            env.reportError("Failed to invoke action", _exc_);
          }
        } else {

        }
        _iter_tmp = yield _t_2.next();
      }
    }
  } catch(_exc_) {
    env.reportError("Failed to invoke trigger", _exc_);
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
    yield env.invokeAction(0, _t_0);
  } catch(_exc_) {
    env.reportError("Failed to invoke action", _exc_);
  }`]],

    [`monitor @twitter.source(), text =~ "foo" || (text =~"bar" && !(text =~ "lol")) => notify;`,
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
  _t_0 = yield env.readState(0);
  try {
    _t_1 = {};
    _t_2 = yield env.invokeMonitor(0, _t_1, false);
    {
      let _iter_tmp = yield _t_2.next();
      while (!_iter_tmp.done) {
        _t_3 = _iter_tmp.value;
        _t_4 = _t_3[0];
        _t_5 = _t_3[1];
        _t_6 = _t_5.text;
        _t_7 = _t_5.hashtags;
        _t_8 = _t_5.urls;
        _t_9 = _t_5.from;
        _t_10 = _t_5.inReplyTo;
        _t_11 = _t_5.__reserved;
        _t_12 = __builtin.isNewTuple(_t_0, _t_5, ["text", "hashtags", "urls", "from", "inReplyTo", "__reserved"]);
        _t_13 = __builtin.addTuple(_t_0, _t_5);
        yield env.writeState(0, _t_13);
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
              yield env.output(String(_t_4), _t_5);
            } catch(_exc_) {
              env.reportError("Failed to invoke action", _exc_);
            }
          } else {

          }
        } else {

        }
        _iter_tmp = yield _t_2.next();
      }
    }
  } catch(_exc_) {
    env.reportError("Failed to invoke trigger", _exc_);
  }`]],

    [`monitor @twitter.source() => @builtin.say(message=$event);`,
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
  _t_0 = yield env.readState(0);
  try {
    _t_1 = {};
    _t_2 = yield env.invokeMonitor(0, _t_1, false);
    {
      let _iter_tmp = yield _t_2.next();
      while (!_iter_tmp.done) {
        _t_3 = _iter_tmp.value;
        _t_4 = _t_3[0];
        _t_5 = _t_3[1];
        _t_6 = _t_5.text;
        _t_7 = _t_5.hashtags;
        _t_8 = _t_5.urls;
        _t_9 = _t_5.from;
        _t_10 = _t_5.inReplyTo;
        _t_11 = _t_5.__reserved;
        _t_12 = __builtin.isNewTuple(_t_0, _t_5, ["text", "hashtags", "urls", "from", "inReplyTo", "__reserved"]);
        _t_13 = __builtin.addTuple(_t_0, _t_5);
        yield env.writeState(0, _t_13);
        _t_0 = _t_13;
        if (_t_12) {
          try {
            _t_14 = {};
            _t_15 = yield env.formatEvent(_t_4, _t_5, "string");
            _t_14.message = _t_15;
            yield env.invokeAction(1, _t_14);
          } catch(_exc_) {
            env.reportError("Failed to invoke action", _exc_);
          }
        } else {

        }
        _iter_tmp = yield _t_2.next();
      }
    }
  } catch(_exc_) {
    env.reportError("Failed to invoke trigger", _exc_);
  }`]],

    [`monitor @twitter.source() => @builtin.say(message=$event.type);`,
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
  _t_0 = yield env.readState(0);
  try {
    _t_1 = {};
    _t_2 = yield env.invokeMonitor(0, _t_1, false);
    {
      let _iter_tmp = yield _t_2.next();
      while (!_iter_tmp.done) {
        _t_3 = _iter_tmp.value;
        _t_4 = _t_3[0];
        _t_5 = _t_3[1];
        _t_6 = _t_5.text;
        _t_7 = _t_5.hashtags;
        _t_8 = _t_5.urls;
        _t_9 = _t_5.from;
        _t_10 = _t_5.inReplyTo;
        _t_11 = _t_5.__reserved;
        _t_12 = __builtin.isNewTuple(_t_0, _t_5, ["text", "hashtags", "urls", "from", "inReplyTo", "__reserved"]);
        _t_13 = __builtin.addTuple(_t_0, _t_5);
        yield env.writeState(0, _t_13);
        _t_0 = _t_13;
        if (_t_12) {
          try {
            _t_14 = {};
            _t_15 = String (_t_4);
            _t_14.message = _t_15;
            yield env.invokeAction(1, _t_14);
          } catch(_exc_) {
            env.reportError("Failed to invoke action", _exc_);
          }
        } else {

        }
        _iter_tmp = yield _t_2.next();
      }
    }
  } catch(_exc_) {
    env.reportError("Failed to invoke trigger", _exc_);
  }`]],

    [`monitor @xkcd(id="com.xkcd-6").get_comic() => @twitter.sink(status=picture_url);`,
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
  _t_0 = yield env.readState(0);
  try {
    _t_1 = {};
    _t_2 = yield env.invokeMonitor(0, _t_1, false);
    {
      let _iter_tmp = yield _t_2.next();
      while (!_iter_tmp.done) {
        _t_3 = _iter_tmp.value;
        _t_4 = _t_3[0];
        _t_5 = _t_3[1];
        _t_6 = _t_5.number;
        _t_7 = _t_5.title;
        _t_8 = _t_5.link;
        _t_9 = _t_5.picture_url;
        _t_10 = __builtin.isNewTuple(_t_0, _t_5, ["number", "title", "link", "picture_url"]);
        _t_11 = __builtin.addTuple(_t_0, _t_5);
        yield env.writeState(0, _t_11);
        _t_0 = _t_11;
        if (_t_10) {
          try {
            _t_12 = {};
            _t_13 = String (_t_9);
            _t_12.status = _t_13;
            yield env.invokeAction(1, _t_12);
          } catch(_exc_) {
            env.reportError("Failed to invoke action", _exc_);
          }
        } else {

        }
        _iter_tmp = yield _t_2.next();
      }
    }
  } catch(_exc_) {
    env.reportError("Failed to invoke trigger", _exc_);
  }`]],

    [`now => @builtin.get_time(), time >= makeTime(10,0) => notify;`,
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
    _t_1 = yield env.invokeQuery(0, _t_0);
    _t_2 = _t_1[Symbol.iterator]();
    {
      let _iter_tmp = yield _t_2.next();
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
            yield env.output(String(_t_4), _t_5);
          } catch(_exc_) {
            env.reportError("Failed to invoke action", _exc_);
          }
        } else {

        }
        _iter_tmp = yield _t_2.next();
      }
    }
  } catch(_exc_) {
    env.reportError("Failed to invoke query", _exc_);
  }`]],

    [`{
    class @__dyn_0 extends @org.thingpedia.builtin.thingengine.remote {
        action send (in req __principal : Entity(tt:contact), in req __program_id : Entity(tt:program_id), in req __flow : Number, in req __kindChannel : Entity(tt:function));
    }
    monitor @twitter.source()  => @__dyn_0.send(__principal="mock-account:12345678"^^tt:contact("me"), __program_id=$event.program_id, __flow=0, __kindChannel=$event.type) ;
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
  _t_0 = yield env.readState(0);
  try {
    _t_1 = {};
    _t_2 = yield env.invokeMonitor(0, _t_1, false);
    {
      let _iter_tmp = yield _t_2.next();
      while (!_iter_tmp.done) {
        _t_3 = _iter_tmp.value;
        _t_4 = _t_3[0];
        _t_5 = _t_3[1];
        _t_6 = _t_5.text;
        _t_7 = _t_5.hashtags;
        _t_8 = _t_5.urls;
        _t_9 = _t_5.from;
        _t_10 = _t_5.inReplyTo;
        _t_11 = _t_5.__reserved;
        _t_12 = __builtin.isNewTuple(_t_0, _t_5, ["text", "hashtags", "urls", "from", "inReplyTo", "__reserved"]);
        _t_13 = __builtin.addTuple(_t_0, _t_5);
        yield env.writeState(0, _t_13);
        _t_0 = _t_13;
        if (_t_12) {
          try {
            _t_14 = {};
            _t_15 = new __builtin.Entity("mock-account:12345678", "me");
            _t_14.__principal = _t_15;
            _t_16 = env.program_id;
            _t_14.__program_id = _t_16;
            _t_17 = 0;
            _t_14.__flow = _t_17;
            _t_14.__kindChannel = _t_4;
            yield env.invokeAction(1, _t_14);
          } catch(_exc_) {
            env.reportError("Failed to invoke action", _exc_);
          }
        } else {

        }
        _iter_tmp = yield _t_2.next();
      }
    }
  } catch(_exc_) {
    env.reportError("Failed to invoke trigger", _exc_);
  }
  try {
    _t_18 = new __builtin.Entity("mock-account:12345678", "me");
    _t_19 = 0;
    yield env.sendEndOfFlow(_t_18, _t_19);
  } catch(_exc_) {
    env.reportError("Failed to signal end-of-flow", _exc_);
  }`]],

    [`{
    monitor @twitter.source(), @builtin.get_time() { time >= makeTime(9,0) && time <= makeTime(10, 0) } => notify;
    monitor @twitter.source(), text =~ "lol" && @builtin.get_time() { time >= makeTime(9,0) && time <= makeTime(10, 0) } => notify;
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
  _t_0 = yield env.readState(0);
  try {
    _t_1 = {};
    _t_2 = yield env.invokeMonitor(0, _t_1, false);
    {
      let _iter_tmp = yield _t_2.next();
      while (!_iter_tmp.done) {
        _t_3 = _iter_tmp.value;
        _t_4 = _t_3[0];
        _t_5 = _t_3[1];
        _t_6 = _t_5.text;
        _t_7 = _t_5.hashtags;
        _t_8 = _t_5.urls;
        _t_9 = _t_5.from;
        _t_10 = _t_5.inReplyTo;
        _t_11 = _t_5.__reserved;
        _t_12 = __builtin.isNewTuple(_t_0, _t_5, ["text", "hashtags", "urls", "from", "inReplyTo", "__reserved"]);
        _t_13 = __builtin.addTuple(_t_0, _t_5);
        yield env.writeState(0, _t_13);
        _t_0 = _t_13;
        if (_t_12) {
          _t_14 = false;
          try {
            _t_16 = {};
            _t_15 = yield env.invokeQuery(1, _t_16);
            _t_17 = _t_15[Symbol.iterator]();
            {
              let _iter_tmp = yield _t_17.next();
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
                _iter_tmp = yield _t_17.next();
              }
            }
          } catch(_exc_) {
            env.reportError("Failed to invoke get-predicate query", _exc_);
          }
          if (_t_14) {
            try {
              yield env.output(String(_t_4), _t_5);
            } catch(_exc_) {
              env.reportError("Failed to invoke action", _exc_);
            }
          } else {

          }
        } else {

        }
        _iter_tmp = yield _t_2.next();
      }
    }
  } catch(_exc_) {
    env.reportError("Failed to invoke trigger", _exc_);
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
  _t_0 = yield env.readState(0);
  try {
    _t_1 = {};
    _t_2 = yield env.invokeMonitor(0, _t_1, false);
    {
      let _iter_tmp = yield _t_2.next();
      while (!_iter_tmp.done) {
        _t_3 = _iter_tmp.value;
        _t_4 = _t_3[0];
        _t_5 = _t_3[1];
        _t_6 = _t_5.text;
        _t_7 = _t_5.hashtags;
        _t_8 = _t_5.urls;
        _t_9 = _t_5.from;
        _t_10 = _t_5.inReplyTo;
        _t_11 = _t_5.__reserved;
        _t_12 = __builtin.isNewTuple(_t_0, _t_5, ["text", "hashtags", "urls", "from", "inReplyTo", "__reserved"]);
        _t_13 = __builtin.addTuple(_t_0, _t_5);
        yield env.writeState(0, _t_13);
        _t_0 = _t_13;
        if (_t_12) {
          _t_14 = true;
          _t_16 = "lol";
          _t_15 = __builtin.like(_t_6, _t_16);
          _t_14 = _t_14 && _t_15;
          _t_17 = false;
          try {
            _t_19 = {};
            _t_18 = yield env.invokeQuery(1, _t_19);
            _t_20 = _t_18[Symbol.iterator]();
            {
              let _iter_tmp = yield _t_20.next();
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
                _iter_tmp = yield _t_20.next();
              }
            }
          } catch(_exc_) {
            env.reportError("Failed to invoke get-predicate query", _exc_);
          }
          _t_14 = _t_14 && _t_17;
          if (_t_14) {
            try {
              yield env.output(String(_t_4), _t_5);
            } catch(_exc_) {
              env.reportError("Failed to invoke action", _exc_);
            }
          } else {

          }
        } else {

        }
        _iter_tmp = yield _t_2.next();
      }
    }
  } catch(_exc_) {
    env.reportError("Failed to invoke trigger", _exc_);
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
    _t_0 = yield env.invokeTimer(_t_1, _t_2);
    {
      let _iter_tmp = yield _t_0.next();
      while (!_iter_tmp.done) {
        _t_3 = _iter_tmp.value;
        try {
          _t_4 = {};
          _t_5 = new __builtin.Entity("1234", null);
          _t_4.__principal = _t_5;
          _t_6 = env.program_id;
          _t_4.__program_id = _t_6;
          _t_7 = 0;
          _t_4.__flow = _t_7;
          _t_4.__kindChannel = null;
          _t_8 = 10000;
          _t_4.interval = _t_8;
          yield env.invokeAction(0, _t_4);
        } catch(_exc_) {
          env.reportError("Failed to invoke action", _exc_);
        }
        _iter_tmp = yield _t_0.next();
      }
    }
  } catch(_exc_) {
    env.reportError("Failed to invoke timer", _exc_);
  }
  try {
    _t_9 = new __builtin.Entity("1234", null);
    _t_10 = 0;
    yield env.sendEndOfFlow(_t_9, _t_10);
  } catch(_exc_) {
    env.reportError("Failed to signal end-of-flow", _exc_);
  }`]],

  [`executor = "1234"^^tt:contact : {
    class @__dyn_0 extends @org.thingpedia.builtin.thingengine.remote {
        query receive (in req __principal : Entity(tt:contact), in req __program_id : Entity(tt:program_id), in req __flow : Number, out __kindChannel : Entity(tt:function), out interval : Measure(ms));
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
  _t_0 = yield env.readState(0);
  try {
    _t_1 = {};
    _t_2 = new __builtin.Entity("mock-account:12345678", "me");
    _t_1.__principal = _t_2;
    _t_3 = env.program_id;
    _t_1.__program_id = _t_3;
    _t_4 = 0;
    _t_1.__flow = _t_4;
    _t_5 = yield env.invokeMonitor(0, _t_1, false);
    {
      let _iter_tmp = yield _t_5.next();
      while (!_iter_tmp.done) {
        _t_6 = _iter_tmp.value;
        _t_7 = _t_6[0];
        _t_8 = _t_6[1];
        _t_9 = _t_8.__kindChannel;
        _t_10 = _t_8.interval;
        _t_11 = __builtin.isNewTuple(_t_0, _t_8, ["__principal", "__program_id", "__flow", "__kindChannel", "interval"]);
        _t_12 = __builtin.addTuple(_t_0, _t_8);
        yield env.writeState(0, _t_12);
        _t_0 = _t_12;
        if (_t_11) {
          try {
            _t_13 = {};
            _t_14 = "on";
            _t_13.power = _t_14;
            yield env.invokeAction(1, _t_13);
          } catch(_exc_) {
            env.reportError("Failed to invoke action", _exc_);
          }
        } else {

        }
        _iter_tmp = yield _t_5.next();
      }
    }
  } catch(_exc_) {
    env.reportError("Failed to invoke trigger", _exc_);
  }`]],

    [`monitor (@twitter.source() join @com.bing.web_search(query="foo")) => notify;`,
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
  _t_0 = yield env.readState(0);
  _t_1 = function*(emit) {
    _t_2 = yield env.readState(1);
    try {
      _t_3 = {};
      _t_4 = yield env.invokeMonitor(0, _t_3, false);
      {
        let _iter_tmp = yield _t_4.next();
        while (!_iter_tmp.done) {
          _t_5 = _iter_tmp.value;
          _t_6 = _t_5[0];
          _t_7 = _t_5[1];
          _t_8 = _t_7.text;
          _t_9 = _t_7.hashtags;
          _t_10 = _t_7.urls;
          _t_11 = _t_7.from;
          _t_12 = _t_7.inReplyTo;
          _t_13 = _t_7.__reserved;
          _t_14 = __builtin.isNewTuple(_t_2, _t_7, ["text", "hashtags", "urls", "from", "inReplyTo", "__reserved"]);
          _t_15 = __builtin.addTuple(_t_2, _t_7);
          yield env.writeState(1, _t_15);
          _t_2 = _t_15;
          if (_t_14) {
            emit(_t_7)
          } else {

          }
          _iter_tmp = yield _t_4.next();
        }
      }
    } catch(_exc_) {
      env.reportError("Failed to invoke trigger", _exc_);
    }
  }
  _t_16 = function*(emit) {
    _t_17 = yield env.readState(2);
    try {
      _t_18 = {};
      _t_19 = "foo";
      _t_18.query = _t_19;
      _t_20 = yield env.invokeMonitor(1, _t_18, false);
      {
        let _iter_tmp = yield _t_20.next();
        while (!_iter_tmp.done) {
          _t_21 = _iter_tmp.value;
          _t_22 = _t_21[0];
          _t_23 = _t_21[1];
          _t_24 = _t_23.title;
          _t_25 = _t_23.description;
          _t_26 = __builtin.isNewTuple(_t_17, _t_23, ["query", "title", "description"]);
          _t_27 = __builtin.addTuple(_t_17, _t_23);
          yield env.writeState(2, _t_27);
          _t_17 = _t_27;
          if (_t_26) {
            emit(_t_23)
          } else {

          }
          _iter_tmp = yield _t_20.next();
        }
      }
    } catch(_exc_) {
      env.reportError("Failed to invoke trigger", _exc_);
    }
  }
  _t_28 = __builtin.streamUnion(_t_1, _t_16);
  {
    let _iter_tmp = yield _t_28.next();
    while (!_iter_tmp.done) {
      _t_29 = _iter_tmp.value;
      _t_30 = _t_29[0];
      _t_31 = _t_29[1];
      _t_32 = _t_31.query;
      _t_33 = _t_31.title;
      _t_34 = _t_31.description;
      _t_35 = _t_31.text;
      _t_36 = _t_31.hashtags;
      _t_37 = _t_31.urls;
      _t_38 = _t_31.from;
      _t_39 = _t_31.inReplyTo;
      _t_40 = _t_31.__reserved;
      _t_41 = __builtin.isNewTuple(_t_0, _t_31, ["query", "title", "description", "text", "hashtags", "urls", "from", "inReplyTo", "__reserved"]);
      _t_42 = __builtin.addTuple(_t_0, _t_31);
      yield env.writeState(0, _t_42);
      _t_0 = _t_42;
      if (_t_41) {
        try {
          yield env.output(String(_t_30), _t_31);
        } catch(_exc_) {
          env.reportError("Failed to invoke action", _exc_);
        }
      } else {

      }
      _iter_tmp = yield _t_28.next();
    }
  }`]],

    [`monitor (@twitter.source() join @com.bing.web_search(query="foo")), text =~ "lol" => notify;`,
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
  _t_0 = yield env.readState(0);
  _t_1 = function*(emit) {
    _t_2 = yield env.readState(1);
    try {
      _t_3 = {};
      _t_4 = yield env.invokeMonitor(0, _t_3, false);
      {
        let _iter_tmp = yield _t_4.next();
        while (!_iter_tmp.done) {
          _t_5 = _iter_tmp.value;
          _t_6 = _t_5[0];
          _t_7 = _t_5[1];
          _t_8 = _t_7.text;
          _t_9 = _t_7.hashtags;
          _t_10 = _t_7.urls;
          _t_11 = _t_7.from;
          _t_12 = _t_7.inReplyTo;
          _t_13 = _t_7.__reserved;
          _t_14 = __builtin.isNewTuple(_t_2, _t_7, ["text", "hashtags", "urls", "from", "inReplyTo", "__reserved"]);
          _t_15 = __builtin.addTuple(_t_2, _t_7);
          yield env.writeState(1, _t_15);
          _t_2 = _t_15;
          if (_t_14) {
            emit(_t_7)
          } else {

          }
          _iter_tmp = yield _t_4.next();
        }
      }
    } catch(_exc_) {
      env.reportError("Failed to invoke trigger", _exc_);
    }
  }
  _t_16 = function*(emit) {
    _t_17 = yield env.readState(2);
    try {
      _t_18 = {};
      _t_19 = "foo";
      _t_18.query = _t_19;
      _t_20 = yield env.invokeMonitor(1, _t_18, false);
      {
        let _iter_tmp = yield _t_20.next();
        while (!_iter_tmp.done) {
          _t_21 = _iter_tmp.value;
          _t_22 = _t_21[0];
          _t_23 = _t_21[1];
          _t_24 = _t_23.title;
          _t_25 = _t_23.description;
          _t_26 = __builtin.isNewTuple(_t_17, _t_23, ["query", "title", "description"]);
          _t_27 = __builtin.addTuple(_t_17, _t_23);
          yield env.writeState(2, _t_27);
          _t_17 = _t_27;
          if (_t_26) {
            emit(_t_23)
          } else {

          }
          _iter_tmp = yield _t_20.next();
        }
      }
    } catch(_exc_) {
      env.reportError("Failed to invoke trigger", _exc_);
    }
  }
  _t_28 = __builtin.streamUnion(_t_1, _t_16);
  {
    let _iter_tmp = yield _t_28.next();
    while (!_iter_tmp.done) {
      _t_29 = _iter_tmp.value;
      _t_30 = _t_29[0];
      _t_31 = _t_29[1];
      _t_32 = _t_31.query;
      _t_33 = _t_31.title;
      _t_34 = _t_31.description;
      _t_35 = _t_31.text;
      _t_36 = _t_31.hashtags;
      _t_37 = _t_31.urls;
      _t_38 = _t_31.from;
      _t_39 = _t_31.inReplyTo;
      _t_40 = _t_31.__reserved;
      _t_41 = __builtin.isNewTuple(_t_0, _t_31, ["query", "title", "description", "text", "hashtags", "urls", "from", "inReplyTo", "__reserved"]);
      _t_42 = __builtin.addTuple(_t_0, _t_31);
      yield env.writeState(0, _t_42);
      _t_0 = _t_42;
      if (_t_41) {
        _t_44 = "lol";
        _t_43 = __builtin.like(_t_35, _t_44);
        if (_t_43) {
          try {
            yield env.output(String(_t_30), _t_31);
          } catch(_exc_) {
            env.reportError("Failed to invoke action", _exc_);
          }
        } else {

        }
      } else {

      }
      _iter_tmp = yield _t_28.next();
    }
  }`]],

    [`now => @twitter.source() join @com.bing.web_search() on (query=text) => notify;`,
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
    _t_0 = {};
    _t_1 = yield env.invokeQuery(0, _t_0);
    _t_2 = _t_1[Symbol.iterator]();
    {
      let _iter_tmp = yield _t_2.next();
      while (!_iter_tmp.done) {
        _t_3 = _iter_tmp.value;
        _t_4 = _t_3[0];
        _t_5 = _t_3[1];
        _t_6 = _t_5.text;
        _t_7 = _t_5.hashtags;
        _t_8 = _t_5.urls;
        _t_9 = _t_5.from;
        _t_10 = _t_5.inReplyTo;
        _t_11 = _t_5.__reserved;
        try {
          _t_12 = {};
          _t_12.query = _t_6;
          _t_13 = yield env.invokeQuery(1, _t_12);
          _t_14 = _t_13[Symbol.iterator]();
          {
            let _iter_tmp = yield _t_14.next();
            while (!_iter_tmp.done) {
              _t_15 = _iter_tmp.value;
              _t_16 = _t_15[0];
              _t_17 = _t_15[1];
              _t_18 = _t_17.title;
              _t_19 = _t_17.description;
              _t_20 = __builtin.combineOutputTypes(_t_4, _t_16);
              _t_21 = {};
              _t_21.query = _t_6;
              _t_21.title = _t_18;
              _t_21.description = _t_19;
              _t_21.text = _t_6;
              _t_21.hashtags = _t_7;
              _t_21.urls = _t_8;
              _t_21.from = _t_9;
              _t_21.inReplyTo = _t_10;
              _t_21.__reserved = _t_11;
              _t_22 = _t_21.query;
              _t_23 = _t_21.title;
              _t_24 = _t_21.description;
              _t_25 = _t_21.text;
              _t_26 = _t_21.hashtags;
              _t_27 = _t_21.urls;
              _t_28 = _t_21.from;
              _t_29 = _t_21.inReplyTo;
              _t_30 = _t_21.__reserved;
              try {
                yield env.output(String(_t_20), _t_21);
              } catch(_exc_) {
                env.reportError("Failed to invoke action", _exc_);
              }
              _iter_tmp = yield _t_14.next();
            }
          }
        } catch(_exc_) {
          env.reportError("Failed to invoke query", _exc_);
        }
        _iter_tmp = yield _t_2.next();
      }
    }
  } catch(_exc_) {
    env.reportError("Failed to invoke query", _exc_);
  }`]],

    [`now => @twitter.source() join @com.bing.web_search(query="foo") => notify;`,
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
  _t_0 = function*(emit) {
    try {
      _t_1 = {};
      _t_2 = yield env.invokeQuery(0, _t_1);
      _t_3 = _t_2[Symbol.iterator]();
      {
        let _iter_tmp = yield _t_3.next();
        while (!_iter_tmp.done) {
          _t_4 = _iter_tmp.value;
          _t_5 = _t_4[0];
          _t_6 = _t_4[1];
          _t_7 = _t_6.text;
          _t_8 = _t_6.hashtags;
          _t_9 = _t_6.urls;
          _t_10 = _t_6.from;
          _t_11 = _t_6.inReplyTo;
          _t_12 = _t_6.__reserved;
          emit(_t_6)
          _iter_tmp = yield _t_3.next();
        }
      }
    } catch(_exc_) {
      env.reportError("Failed to invoke query", _exc_);
    }
  }
  _t_13 = function*(emit) {
    try {
      _t_14 = {};
      _t_15 = "foo";
      _t_14.query = _t_15;
      _t_16 = yield env.invokeQuery(1, _t_14);
      _t_17 = _t_16[Symbol.iterator]();
      {
        let _iter_tmp = yield _t_17.next();
        while (!_iter_tmp.done) {
          _t_18 = _iter_tmp.value;
          _t_19 = _t_18[0];
          _t_20 = _t_18[1];
          _t_21 = _t_20.title;
          _t_22 = _t_20.description;
          emit(_t_20)
          _iter_tmp = yield _t_17.next();
        }
      }
    } catch(_exc_) {
      env.reportError("Failed to invoke query", _exc_);
    }
  }
  _t_23 = __builtin.tableCrossJoin(_t_0, _t_13);
  {
    let _iter_tmp = yield _t_23.next();
    while (!_iter_tmp.done) {
      _t_24 = _iter_tmp.value;
      _t_25 = _t_24[0];
      _t_26 = _t_24[1];
      _t_27 = _t_26.query;
      _t_28 = _t_26.title;
      _t_29 = _t_26.description;
      _t_30 = _t_26.text;
      _t_31 = _t_26.hashtags;
      _t_32 = _t_26.urls;
      _t_33 = _t_26.from;
      _t_34 = _t_26.inReplyTo;
      _t_35 = _t_26.__reserved;
      try {
        yield env.output(String(_t_25), _t_26);
      } catch(_exc_) {
        env.reportError("Failed to invoke action", _exc_);
      }
      _iter_tmp = yield _t_23.next();
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
  try {
    _t_1 = new __builtin.Time(20, 10, 0);
    _t_0 = yield env.invokeAtTimer(_t_1);
    {
      let _iter_tmp = yield _t_0.next();
      while (!_iter_tmp.done) {
        _t_2 = _iter_tmp.value;
        try {
          _t_3 = {};
          _t_4 = yield env.invokeQuery(0, _t_3);
          _t_5 = _t_4[Symbol.iterator]();
          {
            let _iter_tmp = yield _t_5.next();
            while (!_iter_tmp.done) {
              _t_6 = _iter_tmp.value;
              _t_7 = _t_6[0];
              _t_8 = _t_6[1];
              _t_9 = _t_8.count;
              _t_10 = _t_8.image_id;
              _t_11 = _t_8.picture_url;
              _t_12 = _t_8.link;
              _t_13 = {};
              _t_13.count = _t_9;
              _t_13.image_id = _t_10;
              _t_13.picture_url = _t_11;
              _t_13.link = _t_12;
              _t_14 = _t_13.count;
              _t_15 = _t_13.image_id;
              _t_16 = _t_13.picture_url;
              _t_17 = _t_13.link;
              try {
                _t_18 = {};
                _t_19 = new __builtin.Entity("xxxx", null);
                _t_18.to = _t_19;
                _t_20 = "xxx";
                _t_18.subject = _t_20;
                _t_21 = "xxx";
                _t_18.message = _t_21;
                _t_18.picture_url = _t_16;
                yield env.invokeAction(1, _t_18);
              } catch(_exc_) {
                env.reportError("Failed to invoke action", _exc_);
              }
              _iter_tmp = yield _t_5.next();
            }
          }
        } catch(_exc_) {
          env.reportError("Failed to invoke query", _exc_);
        }
        _iter_tmp = yield _t_0.next();
      }
    }
  } catch(_exc_) {
    env.reportError("Failed to invoke at-timer", _exc_);
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
    _t_3 = yield env.invokeQuery(0, _t_0);
    _t_4 = _t_3[Symbol.iterator]();
    {
      let _iter_tmp = yield _t_4.next();
      while (!_iter_tmp.done) {
        _t_5 = _iter_tmp.value;
        _t_6 = _t_5[0];
        _t_7 = _t_5[1];
        _t_8 = _t_7.data;
        try {
          _t_9 = {};
          _t_10 = new __builtin.Entity("matrix-account:@gcampax2:matrix.org", null);
          _t_9.__principal = _t_10;
          _t_11 = env.program_id;
          _t_9.__program_id = _t_11;
          _t_12 = 0;
          _t_9.__flow = _t_12;
          _t_9.__kindChannel = _t_6;
          _t_9.data = _t_8;
          yield env.invokeAction(1, _t_9);
        } catch(_exc_) {
          env.reportError("Failed to invoke action", _exc_);
        }
        _iter_tmp = yield _t_4.next();
      }
    }
  } catch(_exc_) {
    env.reportError("Failed to invoke query", _exc_);
  }
  try {
    _t_13 = new __builtin.Entity("matrix-account:@gcampax2:matrix.org", null);
    _t_14 = 0;
    yield env.sendEndOfFlow(_t_13, _t_14);
  } catch(_exc_) {
    env.reportError("Failed to signal end-of-flow", _exc_);
  }`]],

    [`timer(base=makeDate(), interval=1h) join @twitter.search(), text =~ "lol" => notify;`,
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
  try {
    _t_1 = new Date(XNOWX);
    _t_2 = 3600000;
    _t_0 = yield env.invokeTimer(_t_1, _t_2);
    {
      let _iter_tmp = yield _t_0.next();
      while (!_iter_tmp.done) {
        _t_3 = _iter_tmp.value;
        try {
          _t_4 = {};
          _t_5 = yield env.invokeQuery(0, _t_4);
          _t_6 = _t_5[Symbol.iterator]();
          {
            let _iter_tmp = yield _t_6.next();
            while (!_iter_tmp.done) {
              _t_7 = _iter_tmp.value;
              _t_8 = _t_7[0];
              _t_9 = _t_7[1];
              _t_10 = _t_9.text;
              _t_11 = _t_9.hashtags;
              _t_12 = _t_9.urls;
              _t_13 = _t_9.from;
              _t_14 = _t_9.inReplyTo;
              _t_16 = "lol";
              _t_15 = __builtin.like(_t_10, _t_16);
              if (_t_15) {
                _t_17 = {};
                _t_17.text = _t_10;
                _t_17.hashtags = _t_11;
                _t_17.urls = _t_12;
                _t_17.from = _t_13;
                _t_17.inReplyTo = _t_14;
                _t_18 = _t_17.text;
                _t_19 = _t_17.hashtags;
                _t_20 = _t_17.urls;
                _t_21 = _t_17.from;
                _t_22 = _t_17.inReplyTo;
                try {
                  yield env.output(String(_t_8), _t_17);
                } catch(_exc_) {
                  env.reportError("Failed to invoke action", _exc_);
                }
              } else {

              }
              _iter_tmp = yield _t_6.next();
            }
          }
        } catch(_exc_) {
          env.reportError("Failed to invoke query", _exc_);
        }
        _iter_tmp = yield _t_0.next();
      }
    }
  } catch(_exc_) {
    env.reportError("Failed to invoke timer", _exc_);
  }`]]
];

const GeneratorFunction = Object.getPrototypeOf(function*(){}).constructor;
function test(i) {
    console.log('Test Case #' + (i+1));

    let [code, expected] = TEST_CASES[i];

    return Q.try(() => {
        var compiler = new Compiler(true);
        compiler.setSchemaRetriever(schemaRetriever);

        return compiler.compileCode(code).then(() => {
            let rules = compiler.rules;
            for (let j = 0; j < Math.max(expected.length, rules.length); j++) {
                let { code } = rules[j] || [];
                code = code.replace(/new Date\([0-9]+\)/g, 'new Date(XNOWX)');

                if (code === undefined || code.trim() !== expected[j].trim()) {
                    console.error('Test Case #' + (i+1) + ': compiled code does not match what expected');
                    //console.error('Expected: ' + expected[j]);
                    console.error('Compiled: ' + code);
                    if (process.env.TEST_MODE)
                        throw new Error(`testCompiler ${i+1} FAILED`);
                } else {
                    new GeneratorFunction('__builtin', 'env', code);
                }
            }
        });
    }).catch((e) => {
        console.error('Test Case #' + (i+1) + ': failed with exception');
        console.error('Code: ' + code);
        console.error('Error: ' + e.message);
        console.error(e.stack);
        if (process.env.TEST_MODE)
            throw e;
    });
}

function loop(i) {
    if (i === TEST_CASES.length)
        return Q();

    return Q(test(i)).then(() => loop(i+1));
}

loop(0).done();
