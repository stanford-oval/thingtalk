
const Q = require('q');
Q.longStackSupport = true;
const CVC4Solver = require('cvc4');

const Ast = require('../lib/ast');
const Grammar = require('../lib/grammar_api');
const Compiler = require('../lib/compiler');
const SchemaRetriever = require('../lib/schema');
const PermissionChecker = require('../lib/permission_checker');
const { optimizeProgram } = require('../lib/optimize');

const _mockSchemaDelegate = require('./mock_schema_delegate');
const ThingpediaClientHttp = require('./http_client');

var schemaRetriever = new SchemaRetriever(_mockSchemaDelegate, false);

const TEST_CASES = [
    [`Test() {
    @test.source() => @builtin.debug_log(message="Test App received an event on Test Channel");
}`, [`"use strict";
  let _t_0;
  let _t_1;
  let _t_2;
  let _t_3;
  let _t_4;
  let _t_5;
  let _t_6;
  let _t_7;
  try {
    _t_0 = new Array(1);
    _t_1 = yield env.invokeTrigger(0, _t_0, false);
    {
      let _iter_tmp = yield _t_1.next();
      while (!_iter_tmp.done) {
        _t_2 = _iter_tmp.value;
        env.clearGetCache();
        _t_3 = _t_2[0];
        _t_4 = _t_2[1];
        _t_5 = _t_2[2];
        try {
          _t_6 = new Array(1);
          _t_7 = "Test App received an event on Test Channel";
          _t_6[0] = _t_7;
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

    [`SabrinaLikesItHot(Threshold : Measure(C)) {
    @thermostat.temperature(), temperature > Threshold => @builtin.say(message="bla");
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
  _t_0 = env._scope.Threshold;
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
        _t_7 = _t_8 > _t_0;
        if (_t_7) {
          try {
            _t_9 = new Array(1);
            _t_10 = "bla";
            _t_9[0] = _t_10;
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

    [`CommandTest() {
  now => @builtin.say(message="test");
}`, [`"use strict";
  let _t_0;
  let _t_1;
  try {
    _t_0 = new Array(1);
    _t_1 = "test";
    _t_0[0] = _t_1;
    yield env.invokeAction(0, _t_0);
  } catch(_exc_) {
    env.reportError("Failed to invoke action", _exc_);
  }`]],

    [`SabrinaGeneratedMonitorTwitter() {
    @twitter(id="twitter-foo").source(), from="HillaryClinton"^^tt:username => notify;
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

    [`LocationWithDisplayAsTriggerParam() {
    @weatherapi.weather(location=makeLocation(1, 3, "Somewhere")) => notify;
}`, [`"use strict";
  let _t_0;
  let _t_1;
  let _t_2;
  let _t_3;
  let _t_4;
  let _t_5;
  let _t_6;
  try {
    _t_0 = new Array(2);
    _t_1 = new __builtin.Location(1, 3, "Somewhere");
    _t_0[0] = _t_1;
    _t_2 = yield env.invokeTrigger(0, _t_0, false);
    {
      let _iter_tmp = yield _t_2.next();
      while (!_iter_tmp.done) {
        _t_3 = _iter_tmp.value;
        env.clearGetCache();
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

    [`LocationAsTriggerParam() {
    @weatherapi.weather(location=makeLocation(1, 3)) => notify;
}`, [`"use strict";
  let _t_0;
  let _t_1;
  let _t_2;
  let _t_3;
  let _t_4;
  let _t_5;
  let _t_6;
  try {
    _t_0 = new Array(2);
    _t_1 = new __builtin.Location(1, 3, null);
    _t_0[0] = _t_1;
    _t_2 = yield env.invokeTrigger(0, _t_0, false);
    {
      let _iter_tmp = yield _t_2.next();
      while (!_iter_tmp.done) {
        _t_3 = _iter_tmp.value;
        env.clearGetCache();
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

    [`TimeTest() {
        @builtin.at(time=makeTime(12, 30)) => notify;
}`, [`"use strict";
  let _t_0;
  let _t_1;
  let _t_2;
  let _t_3;
  let _t_4;
  let _t_5;
  let _t_6;
  try {
    _t_0 = new Array(1);
    _t_1 = new __builtin.Time(12, 30, 0);
    _t_0[0] = _t_1;
    _t_2 = yield env.invokeTrigger(0, _t_0, false);
    {
      let _iter_tmp = yield _t_2.next();
      while (!_iter_tmp.done) {
        _t_3 = _iter_tmp.value;
        env.clearGetCache();
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

    [`SearchYoutube() {
        now => @youtube.search_videos(query="lol"), video_url = "http://www.youtube.com"^^tt:url =>  notify;
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
  try {
    _t_0 = new Array(2);
    _t_1 = "lol";
    _t_0[0] = _t_1;
    _t_2 = yield env.invokeQuery(0, _t_0);
    for (_t_3 of _t_2) {
      _t_4 = _t_3[0];
      _t_5 = _t_3[1];
      _t_6 = _t_3[2];
      _t_8 = _t_6[1];
      _t_9 = new __builtin.Entity("http://www.youtube.com", null);
      _t_7 = __builtin.equality(_t_8, _t_9);
      if (_t_7) {
        try {
          yield env.output(String(_t_4), _t_6, _t_5);
        } catch(_exc_) {
          env.reportError("Failed to invoke action", _exc_);
        }
      } else {

      }
    }
  } catch(_exc_) {
    env.reportError("Failed to invoke query", _exc_);
  }`]],

    [`ParameterPassing() {
    @xkcd(id="com.xkcd-6").new_comic(), v_title := title, v_picture_url := picture_url
    => @twitter(id="twitter-foo").post_picture(caption=v_title, picture_url=v_picture_url);
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
        try {
          _t_8 = new Array(2);
          _t_8[0] = _t_6;
          _t_8[1] = _t_7;
          yield env.invokeAction(1, _t_8);
        } catch(_exc_) {
          env.reportError("Failed to invoke action", _exc_);
        }
        _iter_tmp = yield _t_1.next();
      }
    }
  } catch(_exc_) {
    env.reportError("Failed to invoke trigger", _exc_);
  }`]],

    [`WithClassDef() {
    class @dyn_0 extends @remote {
        action send(in req foo : String);
    }
    now => @dyn_0.send(foo="foo");
}`, [`"use strict";
  let _t_0;
  let _t_1;
  try {
    _t_0 = new Array(1);
    _t_1 = "foo";
    _t_0[0] = _t_1;
    yield env.invokeAction(0, _t_0);
  } catch(_exc_) {
    env.reportError("Failed to invoke action", _exc_);
  }`]],

    [`ComplexFilter() {
    @twitter.source(), text =~ "foo" || (text =~"bar" && !(text =~ "lol")) => notify;
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

    [`FormatEvent() {
    @twitter.source() => @builtin.say(message=$event.title);
}`, [`"use strict";
  let _t_0;
  let _t_1;
  let _t_2;
  let _t_3;
  let _t_4;
  let _t_5;
  let _t_6;
  let _t_7;
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
        try {
          _t_6 = new Array(1);
          _t_7 = yield env.formatEvent(_t_4, _t_0, _t_5, "string-title");
          _t_6[0] = _t_7;
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

    [`EventType() {
    @twitter.source() => @builtin.say(message=$event.type);
}`, [`"use strict";
  let _t_0;
  let _t_1;
  let _t_2;
  let _t_3;
  let _t_4;
  let _t_5;
  let _t_6;
  let _t_7;
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
        try {
          _t_6 = new Array(1);
          _t_7 = String (_t_3);
          _t_6[0] = _t_7;
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

    [`DownCast() {
    @xkcd(id="com.xkcd-6").new_comic(), v_title := title, v_picture_url := picture_url
    => @twitter.sink(status=v_picture_url);
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
        try {
          _t_8 = new Array(1);
          _t_9 = String (_t_7);
          _t_8[0] = _t_9;
          yield env.invokeAction(1, _t_8);
        } catch(_exc_) {
          env.reportError("Failed to invoke action", _exc_);
        }
        _iter_tmp = yield _t_1.next();
      }
    }
  } catch(_exc_) {
    env.reportError("Failed to invoke trigger", _exc_);
  }`]],

    [`CompareDate() {
    now => @builtin.get_time(), time > makeTime(10,0) => notify;
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
  try {
    _t_0 = new Array(1);
    _t_1 = yield env.invokeQuery(0, _t_0);
    for (_t_2 of _t_1) {
      _t_3 = _t_2[0];
      _t_4 = _t_2[1];
      _t_5 = _t_2[2];
      _t_7 = _t_5[0];
      _t_8 = __builtin.getTime (_t_7);
      _t_9 = new __builtin.Time(10, 0, 0);
      _t_6 = _t_8 > _t_9;
      if (_t_6) {
        try {
          yield env.output(String(_t_3), _t_5, _t_4);
        } catch(_exc_) {
          env.reportError("Failed to invoke action", _exc_);
        }
      } else {

      }
    }
  } catch(_exc_) {
    env.reportError("Failed to invoke query", _exc_);
  }`]],

    [`AlmondGenerated() {
    class @__dyn_0 extends @org.thingpedia.builtin.thingengine.remote {
        action send (in req __principal : Entity(tt:contact), in req __token : Entity(tt:flow_token), in req __kindChannel : Entity(tt:function));
    }
    @twitter.source()  => @__dyn_0.send(__principal="mock-account:12345678"^^tt:contact("me"), __token="XXXXXXXX"^^tt:flow_token, __kindChannel=$event.type) ;
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
        try {
          _t_6 = new Array(3);
          _t_7 = new __builtin.Entity("mock-account:12345678", "me");
          _t_6[0] = _t_7;
          _t_8 = new __builtin.Entity("XXXXXXXX", null);
          _t_6[1] = _t_8;
          _t_6[2] = _t_3;
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
    _t_9 = new __builtin.Entity("mock-account:12345678", "me");
    _t_10 = new __builtin.Entity("XXXXXXXX", null);
    yield env.sendEndOfFlow(_t_9, _t_10);
  } catch(_exc_) {
    env.reportError("Failed to signal end-of-flow", _exc_);
  }`]],

    [`TestExternalPredicate() {
    @twitter.source(), @builtin.get_time() { time >= makeTime(9,0) && time <= makeTime(10, 0) } => notify;
    @twitter.source(), text =~ "lol" && @builtin.get_time() { time >= makeTime(9,0) && time <= makeTime(10, 0) } => notify;
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
          for (_t_9 of _t_7) {
            _t_10 = _t_9[2];
            _t_11 = true;
            _t_13 = _t_10[0];
            _t_14 = __builtin.getTime (_t_13);
            _t_15 = new __builtin.Time(9, 0, 0);
            _t_12 = _t_14 >= _t_15;
            _t_11 = _t_11 && _t_12;
            _t_17 = _t_10[0];
            _t_18 = __builtin.getTime (_t_17);
            _t_19 = new __builtin.Time(10, 0, 0);
            _t_16 = _t_18 <= _t_19;
            _t_11 = _t_11 && _t_16;
            if (_t_11) {
              _t_6 = true;
              break;
            } else {

            }
          }
        } catch(_exc_) {
          env.reportError("Failed to invoke get-predicate query", _exc_);
        }
        if (_t_6) {
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
        _t_6 = true;
        _t_8 = _t_5[0];
        _t_9 = "lol";
        _t_7 = __builtin.like(_t_8, _t_9);
        _t_6 = _t_6 && _t_7;
        _t_10 = false;
        try {
          _t_12 = new Array(6);
          _t_11 = yield env.invokeQuery(1, _t_12);
          for (_t_13 of _t_11) {
            _t_14 = _t_13[2];
            _t_15 = true;
            _t_17 = _t_14[0];
            _t_18 = __builtin.getTime (_t_17);
            _t_19 = new __builtin.Time(9, 0, 0);
            _t_16 = _t_18 >= _t_19;
            _t_15 = _t_15 && _t_16;
            _t_21 = _t_14[0];
            _t_22 = __builtin.getTime (_t_21);
            _t_23 = new __builtin.Time(10, 0, 0);
            _t_20 = _t_22 <= _t_23;
            _t_15 = _t_15 && _t_20;
            if (_t_15) {
              _t_10 = true;
              break;
            } else {

            }
          }
        } catch(_exc_) {
          env.reportError("Failed to invoke get-predicate query", _exc_);
        }
        _t_6 = _t_6 && _t_10;
        if (_t_6) {
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
  }`]]
];

const GeneratorFunction = Object.getPrototypeOf(function*(){}).constructor;
function test(i) {
    console.log('Test Case #' + (i+1));

    let [code, expected] = TEST_CASES[i];

    return Q.try(function() {
        var compiler = new Compiler(true);
        compiler.setSchemaRetriever(schemaRetriever);

        return compiler.compileCode(code).then(function() {
            let rules = compiler.rules;
            for (let j = 0; j < Math.max(expected.length, rules.length); j++) {
                let [_, code] = rules[j] || [];

                new GeneratorFunction('__builtin', 'env', code);

                if (code === undefined || code.trim() !== expected[j].trim()) {
                    console.error('Test Case #' + (i+1) + ': compiled code does not match what expected');
                    //console.error('Expected: ' + expected[j]);
                    console.error('Compiled: ' + code);
                }
            }
        });
    }).catch((e) => {
        console.error('Test Case #' + (i+1) + ': failed with exception');
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
