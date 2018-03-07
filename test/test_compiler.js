"use strict";

const Q = require('q');
Q.longStackSupport = true;

const Compiler = require('../lib/compiler');
const SchemaRetriever = require('../lib/schema');

const _mockSchemaDelegate = require('./mock_schema_delegate');
const _mockMemoryClient = require('./mock_memory_client');
var schemaRetriever = new SchemaRetriever(_mockSchemaDelegate, _mockMemoryClient, true);

const TEST_CASES = [
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
  try {
    _t_0 = {};
    _t_1 = yield env.invokeMonitor(0, _t_0, false);
    {
      let _iter_tmp = yield _t_1.next();
      while (!_iter_tmp.done) {
        _t_2 = _iter_tmp.value;
        _t_3 = _t_2[0];
        _t_4 = _t_2[1];
        _t_5 = _t_2[2];
        try {
          _t_6 = {};
          _t_7 = "Test App received an event on Test Channel";
          _t_6.message = _t_7;
          yield env.invokeAction(1, _t_6);
        } catch(_exc_) {
          env.reportError("Failed to invoke action", _exc_);
        }
        _iter_tmp = yield _t_1.next();
      }
    }
  } catch(_exc_) {
    env.reportError("Failed to invoke trigger", _exc_);
  }`]],

    [`monitor @thermostat.get_temperature(), temperature > 21C => @builtin.say(message="bla");`, [`"use strict";
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
    _t_1 = new Array(2);
    _t_2 = yield env.invokeTrigger(0, _t_1, false);
    {
      let _iter_tmp = yield _t_2.next();
      while (!_iter_tmp.done) {
        _t_3 = _iter_tmp.value;
        env.clearGetCache();
        _t_4 = _t_3[0];
        _t_5 = _t_3[1];
        _t_6 = _t_3[2];
        _t_8 = _t_6[1];
        _t_7 = _t_8 > 21;
        if (_t_7) {
          _t_9 = new Array(1);
          _t_9[0] = _t_0;
          yield env.save("auto+thermostat:temperature:", {}, _t_9);
          try {
            _t_10 = new Array(1);
            _t_11 = "bla";
            _t_10[0] = _t_11;
            yield env.invokeAction(1, _t_10);
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
  try {
    _t_0 = new Array(6);
    _t_1 = yield env.invokeTrigger(0, _t_0, false);
    {
      let _iter_tmp = yield _t_1.next();
      while (!_iter_tmp.done) {
        _t_2 = _iter_tmp.value;
        env.clearGetCache();
        _t_3 = _t_2[0];
        _t_4 = _t_2[1];
        _t_5 = _t_2[2];
        _t_7 = _t_5[3];
        _t_8 = new __builtin.Entity("HillaryClinton", null);
        _t_6 = __builtin.equality(_t_7, _t_8);
        if (_t_6) {
          _t_9 = new Array(0);
          yield env.save("auto+twitter:source:", {}, _t_9);
          try {
            yield env.output(String(_t_3), _t_5, _t_4);
          } catch(_exc_) {
            env.reportError("Failed to invoke action", _exc_);
          }
        } else {

        }
        _iter_tmp = yield _t_1.next();
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
  try {
    _t_0 = {};
    _t_1 = new __builtin.Location(1, 3, "Somewhere");
    _t_0.location = _t_1;
    _t_2 = yield env.invokeMonitor(0, _t_0, false);
    {
      let _iter_tmp = yield _t_2.next();
      while (!_iter_tmp.done) {
        _t_3 = _iter_tmp.value;
        _t_4 = _t_3[0];
        _t_5 = _t_3[1];
        _t_6 = _t_3[2];
        try {
          yield env.output(String(_t_4), _t_6, _t_5);
        } catch(_exc_) {
          env.reportError("Failed to invoke action", _exc_);
        }
        _iter_tmp = yield _t_2.next();
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
  try {
    _t_0 = {};
    _t_1 = new __builtin.Location(1, 3, null);
    _t_0.location = _t_1;
    _t_2 = yield env.invokeMonitor(0, _t_0, false);
    {
      let _iter_tmp = yield _t_2.next();
      while (!_iter_tmp.done) {
        _t_3 = _iter_tmp.value;
        _t_4 = _t_3[0];
        _t_5 = _t_3[1];
        _t_6 = _t_3[2];
        try {
          yield env.output(String(_t_4), _t_6, _t_5);
        } catch(_exc_) {
          env.reportError("Failed to invoke action", _exc_);
        }
        _iter_tmp = yield _t_2.next();
      }
    }
  } catch(_exc_) {
    env.reportError("Failed to invoke trigger", _exc_);
  }`]],

    [`attimer(time=makeTime(12, 30)) => notify;`, [`"use strict";
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
          yield env.output(String(_t_undefined), _t_undefined, _t_undefined);
        } catch(_exc_) {
          env.reportError("Failed to invoke action", _exc_);
        }
        _iter_tmp = yield _t_0.next();
      }
    }
  } catch(_exc_) {
    env.reportError("Failed to invoke at-timer", _exc_);
  }`]],

    [`now => @youtube.search_videos(query="lol"), video_url == "http://www.youtube.com"^^tt:url =>  notify;`, [`"use strict";
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
    _t_0 = new Array(2);
    _t_1 = "lol";
    _t_0[0] = _t_1;
    _t_2 = yield env.invokeQuery(0, _t_0);
    _t_3 = _t_2[Symbol.iterator]();
    {
      let _iter_tmp = yield _t_3.next();
      while (!_iter_tmp.done) {
        _t_4 = _iter_tmp.value;
        _t_5 = _t_4[0];
        _t_6 = _t_4[1];
        _t_7 = _t_4[2];
        _t_9 = _t_7[1];
        _t_10 = new __builtin.Entity("http://www.youtube.com", null);
        _t_8 = __builtin.equality(_t_9, _t_10);
        if (_t_8) {
          _t_11 = new Array(0);
          yield env.save("auto+youtube:search_videos:", {}, _t_11);
          try {
            yield env.output(String(_t_5), _t_7, _t_6);
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
  try {
    _t_0 = new Array(3);
    _t_1 = yield env.invokeTrigger(0, _t_0, false);
    {
      let _iter_tmp = yield _t_1.next();
      while (!_iter_tmp.done) {
        _t_2 = _iter_tmp.value;
        env.clearGetCache();
        _t_3 = _t_2[0];
        _t_4 = _t_2[1];
        _t_5 = _t_2[2];
        _t_6 = _t_5[0];
        _t_7 = _t_5[2];
        _t_8 = new Array(2);
        _t_8[0] = _t_6;
        _t_8[1] = _t_7;
        yield env.save("auto+xkcd:get_comic:v_title:title,v_picture_url:picture_url", {}, _t_8);
        try {
          _t_9 = new Array(2);
          _t_9[0] = _t_6;
          _t_9[1] = _t_7;
          yield env.invokeAction(1, _t_9);
        } catch(_exc_) {
          env.reportError("Failed to invoke action", _exc_);
        }
        _iter_tmp = yield _t_1.next();
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
  try {
    _t_0 = new Array(6);
    _t_1 = yield env.invokeTrigger(0, _t_0, false);
    {
      let _iter_tmp = yield _t_1.next();
      while (!_iter_tmp.done) {
        _t_2 = _iter_tmp.value;
        env.clearGetCache();
        _t_3 = _t_2[0];
        _t_4 = _t_2[1];
        _t_5 = _t_2[2];
        _t_6 = false;
        _t_8 = _t_5[0];
        _t_9 = "foo";
        _t_7 = __builtin.like(_t_8, _t_9);
        _t_6 = _t_6 || _t_7;
        _t_10 = true;
        _t_12 = _t_5[0];
        _t_13 = "bar";
        _t_11 = __builtin.like(_t_12, _t_13);
        _t_10 = _t_10 && _t_11;
        _t_16 = _t_5[0];
        _t_17 = "lol";
        _t_15 = __builtin.like(_t_16, _t_17);
        _t_14 = ! (_t_15);
        _t_10 = _t_10 && _t_14;
        _t_6 = _t_6 || _t_10;
        if (_t_6) {
          _t_18 = new Array(0);
          yield env.save("auto+twitter:source:", {}, _t_18);
          try {
            yield env.output(String(_t_3), _t_5, _t_4);
          } catch(_exc_) {
            env.reportError("Failed to invoke action", _exc_);
          }
        } else {

        }
        _iter_tmp = yield _t_1.next();
      }
    }
  } catch(_exc_) {
    env.reportError("Failed to invoke trigger", _exc_);
  }`]],

    [`monitor @twitter.source() => @builtin.say(message=$event.title);`,
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
    _t_0 = {};
    _t_1 = yield env.invokeMonitor(0, _t_0, false);
    {
      let _iter_tmp = yield _t_1.next();
      while (!_iter_tmp.done) {
        _t_2 = _iter_tmp.value;
        _t_3 = _t_2[0];
        _t_4 = _t_2[1];
        _t_5 = _t_2[2];
        try {
          _t_6 = {};
          _t_7 = yield env.formatEvent(_t_4, _t_3, _t_5, "string-title");
          _t_6.message = _t_7;
          yield env.invokeAction(1, _t_6);
        } catch(_exc_) {
          env.reportError("Failed to invoke action", _exc_);
        }
        _iter_tmp = yield _t_1.next();
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
  try {
    _t_0 = {};
    _t_1 = yield env.invokeMonitor(0, _t_0, false);
    {
      let _iter_tmp = yield _t_1.next();
      while (!_iter_tmp.done) {
        _t_2 = _iter_tmp.value;
        _t_3 = _t_2[0];
        _t_4 = _t_2[1];
        _t_5 = _t_2[2];
        try {
          _t_6 = {};
          _t_7 = String (_t_3);
          _t_6.message = _t_7;
          yield env.invokeAction(1, _t_6);
        } catch(_exc_) {
          env.reportError("Failed to invoke action", _exc_);
        }
        _iter_tmp = yield _t_1.next();
      }
    }
  } catch(_exc_) {
    env.reportError("Failed to invoke trigger", _exc_);
  }`]],

    [`monitor @xkcd(id="com.xkcd-6").get_comic() => @twitter.sink(status=picture_url);`, [`"use strict";
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
    _t_0 = new Array(3);
    _t_1 = yield env.invokeTrigger(0, _t_0, false);
    {
      let _iter_tmp = yield _t_1.next();
      while (!_iter_tmp.done) {
        _t_2 = _iter_tmp.value;
        env.clearGetCache();
        _t_3 = _t_2[0];
        _t_4 = _t_2[1];
        _t_5 = _t_2[2];
        _t_6 = _t_5[0];
        _t_7 = _t_5[2];
        _t_8 = new Array(2);
        _t_8[0] = _t_6;
        _t_8[1] = _t_7;
        yield env.save("auto+xkcd:get_comic:v_title:title,v_picture_url:picture_url", {}, _t_8);
        try {
          _t_9 = new Array(1);
          _t_10 = String (_t_7);
          _t_9[0] = _t_10;
          yield env.invokeAction(1, _t_9);
        } catch(_exc_) {
          env.reportError("Failed to invoke action", _exc_);
        }
        _iter_tmp = yield _t_1.next();
      }
    }
  } catch(_exc_) {
    env.reportError("Failed to invoke trigger", _exc_);
  }`]],

    [`now => @builtin.get_time(), time > makeTime(10,0) => notify;`, [`"use strict";
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
    _t_0 = new Array(1);
    _t_1 = yield env.invokeQuery(0, _t_0);
    _t_2 = _t_1[Symbol.iterator]();
    {
      let _iter_tmp = yield _t_2.next();
      while (!_iter_tmp.done) {
        _t_3 = _iter_tmp.value;
        _t_4 = _t_3[0];
        _t_5 = _t_3[1];
        _t_6 = _t_3[2];
        _t_8 = _t_6[0];
        _t_9 = __builtin.getTime (_t_8);
        _t_10 = new __builtin.Time(10, 0, 0);
        _t_7 = _t_9 > _t_10;
        if (_t_7) {
          _t_11 = _t_6[0];
          _t_12 = new Array(1);
          _t_12[0] = _t_11;
          yield env.save("auto+builtin:get_time:*", {}, _t_12);
          try {
            yield env.output(String(_t_4), _t_6, _t_5);
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
  try {
    _t_0 = {};
    _t_1 = yield env.invokeMonitor(0, _t_0, false);
    {
      let _iter_tmp = yield _t_1.next();
      while (!_iter_tmp.done) {
        _t_2 = _iter_tmp.value;
        _t_3 = _t_2[0];
        _t_4 = _t_2[1];
        _t_5 = _t_2[2];
        try {
          _t_6 = {};
          _t_7 = new __builtin.Entity("mock-account:12345678", "me");
          _t_6.__principal = _t_7;
          _t_8 = env.program_id;
          _t_6.__program_id = _t_8;
          _t_9 = 0;
          _t_6.__flow = _t_9;
          _t_6.__kindChannel = _t_3;
          yield env.invokeAction(1, _t_6);
        } catch(_exc_) {
          env.reportError("Failed to invoke action", _exc_);
        }
        _iter_tmp = yield _t_1.next();
      }
    }
  } catch(_exc_) {
    env.reportError("Failed to invoke trigger", _exc_);
  }
  try {
    _t_10 = new __builtin.Entity("mock-account:12345678", "me");
    _t_11 = 0;
    yield env.sendEndOfFlow(_t_10, _t_11);
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
  try {
    _t_0 = new Array(6);
    _t_1 = yield env.invokeTrigger(0, _t_0, false);
    {
      let _iter_tmp = yield _t_1.next();
      while (!_iter_tmp.done) {
        _t_2 = _iter_tmp.value;
        env.clearGetCache();
        _t_3 = _t_2[0];
        _t_4 = _t_2[1];
        _t_5 = _t_2[2];
        _t_6 = false;
        try {
          _t_8 = new Array(6);
          _t_7 = yield env.invokeQuery(1, _t_8);
          _t_9 = _t_7[Symbol.iterator]();
          {
            let _iter_tmp = yield _t_9.next();
            while (!_iter_tmp.done) {
              _t_10 = _iter_tmp.value;
              _t_11 = _t_10[2];
              _t_12 = true;
              _t_14 = _t_11[0];
              _t_15 = __builtin.getTime (_t_14);
              _t_16 = new __builtin.Time(9, 0, 0);
              _t_13 = _t_15 >= _t_16;
              _t_12 = _t_12 && _t_13;
              _t_18 = _t_11[0];
              _t_19 = __builtin.getTime (_t_18);
              _t_20 = new __builtin.Time(10, 0, 0);
              _t_17 = _t_19 <= _t_20;
              _t_12 = _t_12 && _t_17;
              if (_t_12) {
                _t_6 = true;
                break;
              } else {

              }
              _iter_tmp = yield _t_9.next();
            }
          }
        } catch(_exc_) {
          env.reportError("Failed to invoke get-predicate query", _exc_);
        }
        if (_t_6) {
          _t_21 = new Array(0);
          yield env.save("auto+twitter:source:", {}, _t_21);
          try {
            yield env.output(String(_t_3), _t_5, _t_4);
          } catch(_exc_) {
            env.reportError("Failed to invoke action", _exc_);
          }
        } else {

        }
        _iter_tmp = yield _t_1.next();
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
  try {
    _t_0 = {};
    _t_1 = yield env.invokeMonitor(0, _t_0, false);
    {
      let _iter_tmp = yield _t_1.next();
      while (!_iter_tmp.done) {
        _t_2 = _iter_tmp.value;
        _t_3 = _t_2[0];
        _t_4 = _t_2[1];
        _t_5 = _t_2[2];
        try {
          _t_6 = {};
          _t_7 = new __builtin.Entity("mock-account:12345678", "me");
          _t_6.__principal = _t_7;
          _t_8 = env.program_id;
          _t_6.__program_id = _t_8;
          _t_9 = 0;
          _t_6.__flow = _t_9;
          _t_6.__kindChannel = _t_3;
          yield env.invokeAction(1, _t_6);
        } catch(_exc_) {
          env.reportError("Failed to invoke action", _exc_);
        }
        _iter_tmp = yield _t_1.next();
      }
    }
  } catch(_exc_) {
    env.reportError("Failed to invoke trigger", _exc_);
  }
  try {
    _t_10 = new __builtin.Entity("mock-account:12345678", "me");
    _t_11 = 0;
    yield env.sendEndOfFlow(_t_10, _t_11);
  } catch(_exc_) {
    env.reportError("Failed to signal end-of-flow", _exc_);
  }`]],

    [`{
    class @__dyn_0 extends @org.thingpedia.builtin.thingengine.remote {
        action send (in req __principal : Entity(tt:contact_group), in req __program_id : Entity(tt:program_id), in req __flow : Number, in req __kindChannel : Entity(tt:function), in opt interval : Measure(ms));
    }
    timer(base=makeDate(), interval=10s)  => @__dyn_0.send(__principal="1234"^^tt:contact_group, __program_id=$event.program_id, __flow=0, __kindChannel=$event.type, interval=10s) ;
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
          _t_4.__kindChannel = _t_undefined;
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

  [`executor = "1234"^^tt:contact_group : {
    class @__dyn_0 extends @org.thingpedia.builtin.thingengine.remote {
        query receive (in req __principal : Entity(tt:contact_group), in req __program_id : Entity(tt:program_id), in req __flow : Number, out __kindChannel : Entity(tt:function), out interval : Measure(ms));
    }
    monitor @__dyn_0.receive(__principal=["mock-account:12345678"^^tt:contact("me")], __program_id=$event.program_id, __flow=0)  => @security-camera.set_power(power=enum(on)) ;
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
    _t_0 = {};
    _t_1 = [new __builtin.Entity("mock-account:12345678", "me")];
    _t_0.__principal = _t_1;
    _t_2 = env.program_id;
    _t_0.__program_id = _t_2;
    _t_3 = 0;
    _t_0.__flow = _t_3;
    _t_4 = yield env.invokeMonitor(0, _t_0, false);
    {
      let _iter_tmp = yield _t_4.next();
      while (!_iter_tmp.done) {
        _t_5 = _iter_tmp.value;
        _t_6 = _t_5[0];
        _t_7 = _t_5[1];
        _t_8 = _t_5[2];
        try {
          _t_9 = {};
          _t_10 = "on";
          _t_9.power = _t_10;
          yield env.invokeAction(1, _t_9);
        } catch(_exc_) {
          env.reportError("Failed to invoke action", _exc_);
        }
        _iter_tmp = yield _t_4.next();
      }
    }
  } catch(_exc_) {
    env.reportError("Failed to invoke trigger", _exc_);
  }`]],
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
                let [,, code] = rules[j] || [];
                code = code.replace(/new Date\([0-9]+\)/g, 'new Date(XNOWX)');

                if (code === undefined || code.trim() !== expected[j].trim()) {
                    console.error('Test Case #' + (i+1) + ': compiled code does not match what expected');
                    //console.error('Expected: ' + expected[j]);
                    console.error('Compiled: ' + code);
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
    });
}

function loop(i) {
    if (i === TEST_CASES.length)
        return Q();

    return Q(test(i)).then(() => loop(i+1));
}

loop(0).done();
