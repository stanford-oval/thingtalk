# ThingTalk

[![Build Status](https://travis-ci.org/Stanford-Mobisocial-IoT-Lab/ThingTalk.svg?branch=master)](https://travis-ci.org/Stanford-Mobisocial-IoT-Lab/ThingTalk) [![Coverage Status](https://coveralls.io/repos/github/Stanford-Mobisocial-IoT-Lab/ThingTalk/badge.svg?branch=master)](https://coveralls.io/github/Stanford-Mobisocial-IoT-Lab/ThingTalk?branch=master)

## The Programming Language of Virtual Assistants

ThingTalk is the declarative (rule-based) distributed programming
language for virtual assistants. It connects to multiple web services
and IoT devices.

It is the language component of the Almond virtual assistant.

This package contains the grammar, the compiler of the language,
the interface to analyze programs using SMT, the code to translate
from ThingTalk to natural language, part of the ThingTalk runtime,
and various libraries to manipulate ThingTalk ASTs.

While this library is useful on its own for specific purposes, to
run ThingTalk programs you will need a full Almond runtime, such
as one provided by [thingengine-platform-cloud](thingengine-platform-cloud)
or [thingengine-platform-cmdline](thingengine-platform-cmdline).

Almond is a research project led by prof. Monica Lam,
from Stanford University.  You can find more information at
<https://almond.stanford.edu>

## License

This package is covered by the GNU General Public License, version 2
or any later version.
