# ThingTalk

[![Build Status](https://travis-ci.org/Stanford-Mobisocial-IoT-Lab/thingtalk.svg?branch=master)](https://travis-ci.org/Stanford-Mobisocial-IoT-Lab/thingtalk) [![Coverage Status](https://coveralls.io/repos/github/Stanford-Mobisocial-IoT-Lab/thingtalk/badge.svg?branch=master)](https://coveralls.io/github/Stanford-Mobisocial-IoT-Lab/thingtalk?branch=master) [![Dependency Status](https://david-dm.org/Stanford-Mobisocial-IoT-Lab/thingtalk/status.svg)](https://david-dm.org/Stanford-Mobisocial-IoT-Lab/thingtalk) [![Greenkeeper badge](https://badges.greenkeeper.io/Stanford-Mobisocial-IoT-Lab/thingtalk.svg)](https://greenkeeper.io/) [![Language grade: JavaScript](https://img.shields.io/lgtm/grade/javascript/g/Stanford-Mobisocial-IoT-Lab/thingtalk.svg?logo=lgtm&logoWidth=18)](https://lgtm.com/projects/g/Stanford-Mobisocial-IoT-Lab/thingtalk/context:javascript)

## The Programming Language of Virtual Assistants

ThingTalk is the declarative (rule-based) distributed programming
language for virtual assistants. It connects to multiple web services
and IoT devices in a single _when-get-do_ statement.

For example, in ThingTalk you can say:
```
monitor (@com.washingtonpost.get_article(section=enum(world))) => @com.yandex.translate.translate(target_language="zh"^^tt:iso_lang_code) on (text=title) =>
@com.facebook.post(status=$event);
```

This program automatically monitors Washington Post headlines, translates them to Chinese, and then posts them on Facebook.
It does so by referring to primitives defined in [Thingpedia](https://thingpedia.stanford.edu), an open-source crowdsourced repository of APIs and metadata.

ThingTalk the language component of the Almond virtual assistant.
You can find a guide to the ThingTalk language on the [Almond website](https://almond.stanford.edu/thingpedia/developers/thingtalk-intro.md).

This package contains the grammar, the compiler of the language,
the interface to analyze programs using SMT, the code to translate
from ThingTalk to natural language, part of the ThingTalk runtime,
and various libraries to manipulate ThingTalk ASTs.

While this library is useful on its own for specific purposes, to
run ThingTalk programs you will need a full Almond runtime, such
as one provided by [almond-cloud](https://github.com/Stanford-Mobisocial-IoT-Lab/almond-cloud)
or [almond-cmdline](https://github.com/Stanford-Mobisocial-IoT-Lab/almond-cmdline).

Almond is a research project led by prof. Monica Lam,
from Stanford University.  You can find more information at
<https://almond.stanford.edu>

## License

This package is covered by the GNU General Public License, version 3
or any later version. See [LICENSE](LICENSE) for details.
