2.1.1
=====

* Updated dependencies [#404, #409, #414, #415].

2.1.0
=====

* Updated dependencies [#400, #401, #402].

Please see the previous releases for the full list of changes in
ThingTalk 2.1.

2.1.0-alpha.11
==============

* Fixed compiling programs with unary operators in filters.

2.1.0-alpha.10
==============

* Fixed computing the distance between two locations.
* Changed the range of location equality filters.
* Fixed timezone handling in relative and unspecified dates. Date
  values must now be normalized prior to calling `toJS`.
* Added support for distance filters in query hints [#398].

2.1.0-alpha.9
=============

* Added the ability to override the behavior of `=~` for specific
  entities at runtime [#397].
* Changed the behavior of `monitor()` so the first instance does
  not return a lot of results [#397].
* Misc fixes [#397].

2.1.0-alpha.8
=============

* Improved documentation and fixed TypeDoc warnings [#396].
* Updated dependencies [#388, #389, #391, #392, #393, #394, #395].

2.1.0-alpha.7
=============

This release includes the first batch of changes to make ThingTalk
timezone-aware, using the Temporal proposed standard API, polyfilled.
* Parsing and serialization APIs now have a timezone
  parameter to interpret dates and times in ThingTalk syntax. The
  parameter is required for TypeScript users and optional for
  JavaScript users. If undefined, it defaults to the system timezone.
* Runtime operators will now depend on the timezone exposed by the
  execution environment, and will operate correctly on Temporal objects.

We expect additional, more-invasive changes in the future to make
ThingTalk fully timezone aware and completely independent of the system
timezone.

2.1.0-alpha.6
=============

* Misc bug fixes [#386].

2.1.0-alpha.5
=============

* New syntax: join. A join constructs an output that combines the
  fields of two queries. The fields are prefixed with `first.` and
  `second.` so they are not ambiguous [#380].
* Invalid relative locations and relative times are now rejected by
  typechecking [#378].
* Updated dependencies [#379, #381, #383, #384, #385].

2.1.0-alpha.4
=============

* New syntax: annotations on dialogue states, dialogue history items [#370].
* Misc bug fixes [#369].
* Updated dependencies [#371, #372, #373, #374, #375, #376, #377].

2.1.0-alpha.3
=============

Empty release to workaround NPM issues

2.1.0-alpha.2
=============

* New syntax: boolean questions. Similar to a projection, but compute
  a boolean expression based on the result and add it to the other
  fields in the result [#363].
* Added multiple inheritance for entities. Multiple inheritance is
  accounted for when resolving equality filters [#361].
* Added convenience APIs to dialogue states to access current, next
  item [#358].
* Action outputs are now emitted unconditionally, regardless of whether
  the action is declared with an output parameter or not [#365].
* Fixed stack overflow when serializing large programs [#362].
* Misc bug fixes [#368].
* Updated dependencies [#359, #360].

2.1.0-alpha.1
=============

* New features for timers:
  - `ontimer`: a new type of timer that fires at a given set of dates
    and does not repeat [#347].
  - `set_time`: a scalar operator that combines a date and a time;
    this is useful with relative dates and times [#356].
* The compiler was updated to avoid legacy code paths. Going forward,
  legacy AST classes and legacy syntax will no longer support all
  features in ThingTalk. Where possible, conversion will be maintained
  for a few more releases, but users are encouraged to upgrade their
  datasets to ThingTalk 2.0. [#349].
* All entities now can be represented implicitly in the sentence and
  not preprocessed, including phone numbers, email addresses, urls,
  path names, etc. This helps for cases where the entity cannot be
  detected deterministically [#357].
* Updated dependencies [#351, #352, #353].

2.0.1
=====

* Misc bug fixes [#350].

2.0.0
=====

* Misc bug fixes [#348].
* Updated dependencies [#346].

Please see the previous release for the full list of changes in
ThingTalk 2.0.

2.0.0-beta.1
============

* New syntax: return statements. These statements have the form:
  ```
  return <expression>;
  ```
  They allow to mark explicitly which statement should be the result
  of a user-defined function [#326].
* Added support for not preprocessing numbers, by looking up numbers
  in the utterance during serialization to tokenized ThingTalk [#325].
* Dialogue act parameters can now be arbitrary values instead of just
  identifiers [#327].
* Added `$ood;` (out-of-domain) control command to indicate a command
  that is not representable in ThingTalk.
* Added the ability to have conditionally required parameters, using
  the `#[required_if]` annotation, which complements the existing
  `#[require_either]` [#334].
* Added the option to include entity values explicitly in tokenized
  ThingTalk syntax [#345].
* Misc bug fixes [#330, #331, #332].
* Updated and improved documentation [#328].
* Updated dependencies [#335, #336, #337, #338, #339, #340, #341,
  #342, #343].

2.0.0-alpha.5
=============

* Misc bug fixes [#322, #323, #324].

2.0.0-alpha.4
=============

* New syntax: existential subqueries. These subqueries have the form:
  ```
  any(@dn.fn() filter f)
  ```
  And generalize the previous external boolean expressions (get predicates)
  to support any table inside the `any` clause, including projection, sort,
  index, aggregation, etc. [#310, #320].
* Fixed normalization of location entities in tokenized syntax [#318].
* Updated dependencies [#311, #312, #313, #314, #315].

2.0.0-alpha.3
=============

* The minimum supported version of node is now 12.* [#308].
* Misc bug fixes [#306, #307].

2.0.0-alpha.2
=============

* New syntax: comparison subqueries. These have the form of:
  ```
  v1 op any([v2] of @dn.fn())
  ```
  They are an alternative to existential subqueries that avoids some
  of the scoping issues of existential subqueries. Currently, only
  projection is supported inside the subquery, and no parameters can be
  passed from outside query. We plan to lift this restriction in the
  future.
* New syntax: entity inheritance [#296].
  Entity types can be made to subtype each other with the syntax
  ```
  entity e1 extends e2;
  ```
  inside a class declaration [#294].
* `$context` values are no longer compilable. ThingTalk API users must
  ensure these values are replaced by concrete values before executing
  a ThingTalk program.
* All natural language and internationalization code was removed from
  ThingTalk, and moved to the Genie Toolkit. This includes the entirety
  of the Describe module, that was formerly responsible for converting
  ThingTalk to natural language. Gettext is no longer required to
  build ThingTalk [#288].
* Parsing of ThingTalk code was optimized and is now much faster [#287].
* Misc bug fixes [#286].
* Updated dependencies [#285, #291, #292, #301, #302, #303, #304, #305].

2.0.0-alpha.1
=============

This is the first release that introduces the ThingTalk 2.0 language.
ThingTalk is a major redesign of the language to make it more accessible,
less verbose, and more compatible with pre-trained neural networks.

## AST changes

- Remove non-device selectors.

- Table, Stream, Actions are no longer used. Instead, everything is
  an Expression, which could be a table Expression (Index, Sort, Aggregation),
  a table-or-stream Expression (Filter, Projection), or any of the
  three types (FunctionCall, Invocation)

- The Expression class has a toLegacy() method to convert to the old AST
  objects and aid in the transition.

- NotifyActions are no longer used.

- To parse the new syntax, use `Syntax.parse()` and pass `SyntaxType.Normal`
  (user input) or `SyntaxType.Tokenized` (neural network output). The two
  syntaxes differ only in tokenization.

- Legacy programs can be parsed with `Syntax.parse()` using `SyntaxType.Legacy`
  or `SyntaxType.LegacyNN`.

- To serialize to the new syntax, use `Syntax.serialize()` passing one of the
  syntax types. As a convenience, serialization to normal syntax can use
  `node.prettyprint()`

## Syntax changes compared to old surface syntax

### Major

- `now` and `notify` keyword no longer exist (they are still accepted to aid
  transition but are no longer required)

- aggregate syntax is now `op(field of table)`; example:
  ```
  min(file_size of @com.dropbox.list_folder())
  ```

  `count` is just that:
  ```
  count(@com.dropbox.list_folder())
  ```

- computation is now part of projection, with the syntax `[expr1, expr2, ...] of table`; example:
  ```
  [geo, cuisines, distance(geo, $location.current_location)] of @com.yelp.restaurant()
  ```

- computation can be aliased; example:
  ```
  [distance(geo, $location.current_location) as dist] of @com.yelp.restaurant()
  ```

- sorting can be applied on a computed field; example:
  ```
  sort(distance(geo, $location.current_location) asc of @com.yelp.restaurant())
  ```

- `join` with parameter passing is now expressed `=>`; the semantics are slighlty
  different in that only the result of the last expression in a sequence of `=>`
  is returned; true table joins should be expressed as subqueries instead

- `monitor` of a specific field is `monitor(fields of table)`; example:
  ```
  monitor(text, author of @com.twitter.home_timeline())
  ```

- filters of a stream have edge semantics unconditionally (no more `edge` keyword)

- function declaration use `function x() { }` instead of `let x( ) := `

- assignment statements use `let x = ...` instead of `let result :=`

- `return` syntax for multi-party programs is not supported yet

### Minor

- relative locations and relative times use `$location.*` and `$time.*`
  instead of `$context.location.*`

- `$now` is now a synonym for `new Date()`

- it is now possible to have a space between number and unit in a measure or
  currency literal

- edge dates now use `$start_of(...)` instead of `start_of(...)`; this is to
  preserve `start_of` as an identifier, and also to introduce the convention
  that `$` variables are variables that depend on the context of where/how the
  program is executed

- `$event` is now called `$result`, and `$event.program_id` is now called
  `$program_id`; `$event.title` and `$event.body` are not supported

- the source of a program in an access control policy is now called `$source`

- the priority of `filter` and `of` scalar operators, and aritmhetic operators
  was flipped, so `[1,2,3] filter value > 1 + 1` is now parsed as
  `[1,2,3] filter value > (1 + 1)`; this is necessary to avoid ambiguity with
  table-level `filter` and `of` operators

- parenthesis around the operand of `monitor` and `sort` are now required; example:
  ```
  sort(file_size asc of @com.dropbox.list_folder())
  ```

- `enum` no longer needs parenthesis: `enum off` and `enum(off)` are equivalent
  (and so is `enum (off)`)

- the syntax to declare an entity type is now `Entity(^^com.foo:bar)` - the `^^`
  informs the lexer to read the entity token, which is treated as one token and
  cannot have spaces; for compatibility, `Entity(com.foo:bar)` is also recognized,
  provided it has no spaces

### Syntax changes compared to old NN syntax

This list is not comprehensive.

- the number of parenthesis used was reduced to the minimum to avoid ambiguity

- `timer` and `attimer` must use parenthesis, and are parsed as general functions,
  they do not have special syntax

- `param:` and `unit:` prefixes are no longer used

- type annotations are gone

- `enum:` is now `enum`, a separate keyword before the enum value

- `location: " foo "` syntax is now `new Location ( " foo " )`

- `" foo " ^^com.foo:bar` syntax has changed meaning to match surface syntax

## Other changes

- The library was entirely rewritten in TypeScript.
- The preferred package manager is now NPM instead of Yarn.

1.11.0
======

* Fixed the Wikidata SPARQL compiler for ThingTalk [#254].
* Updated dependencies [#256].

Please see the 1.11.0 development releases below for the full list of features
and changes in this release.

1.11.0-rc.1
===========

* The `=~` operator is now a "loose string match", rather an a simple
  string match. It implements a number of heuristics, including removing
  accents and punctuation. We expect heuristics to be refined in the
  future [#252].
* Improved prettyprinting of annotations [#251].
* Misc bug fixes [#236, #250].
* Updated dependencies [#248, #249, #253].

1.11.0-beta.5
=============

* Added typechecking for `#[default]`, `#[min_number]` and `#[max_number]`
  annotations [#247].
* Misc bug fixes [#246, #247].

1.11.0-beta.4
=============

* Added new syntax to support referring to dates by week day ("this Sunday") [#241].
* Added new type: RecurrentTimeSpecification. This type refers to a time or time
  interval that recurs over multiple days. It can be used for calendar events,
  shop opening hours, TV shows, etc. [#241].
* Misc bug fixes [#242].
* Update dependencies [#244, #245]

1.11.0-beta.3
=============

* Added support for partial dates (specifying only the day, only the month,
  or only the year, or a combination of those) [#232].
* Substring match (=~) now ignores accents [#239].
* Fixed normalization of nested compute tables [#240].
* Procedure enter/exit runtime hooks are now called for the main program as
  well [#234].
* Updated dependencies [#228, #233].

1.11.0-beta.2
=============

* Added the ability to convert NN syntax code to older versions of ThingTalk,
  for compatibility [#223].
* Added new syntax to choose a specific device ID in NN syntax [#226].
* Misc bug fixes [#224].
* Updated dependencies [#225].

1.11.0-beta.1
=============

* The ThingTalk library and compiler is now licensed under the Apache 2.0
  license, which allows proprietary applications to use it [#219].
* Added a new syntax to define entities inside a ThingTalk class. Defining
  an entity provides annotations on the entities and reduces the need for
  separate entity metadata files [#220].
* Fixed a number of small grammar bugs [#220, #221].
* Fixed compiling projections of functions with input parameters [#222].

1.11.0-alpha.2
==============

* Library users can now implement custom matching of values mentioned in a
  sentence when converting to NN syntax. As a result, a number of hacks
  have been removed in the default implementation [#217].
* Updated dependencies [#218].

1.11.0-alpha.1
==============

* Actions and procedures are now allowed to return values (as output parameters).
  They can be called in assignment statements to make use of the return value [#197].
* Procedure calling is now trackable by the runtime through appropriate hooks in
  ExecEnvironment. This is useful when actions are stateful and state should not
  be affected by nested procedures [#197].
* The #[error] annotation on dialogue states has changed to an enum instead of
  a string [#198].
* Added new short-hand syntax for Currencies: "number $ unit" (without spaces) [#216].
* NN syntax conversion now allows strings to be non-consecutive in the input [#201].
* Fixed NN syntax conversion and normalization bugs [#199, #200, #202].
* Fixed various compiler bugs [#198, #203].
* Fixed compatibility with node 12 [#212].
* Updated dependencies [#204, #205, #206, #208, #210, #211, #214, #215].

1.10.0
======

* Fixed NN-syntax conversion in sequential entity allocation mode [#196].

Please see the 1.10.0 development releases below for the full list of features
in this release.

1.10.0-beta.1
=============

* A number of incomplete language features have been removed from ThingTalk. These
  features had buggy, incomplete or entirely missing implementation, and we think
  it is unlikely they had any use in the wild [#194].
* Misc bug fixes [#195].

1.10.0-alpha.5
==============

* A new language of dialogue states has been introduces. This allows to
  express the state of a dialogue as a sequence of ThingTalk statements that
  have been executed, and statements that should be executed next [#192].
* Thingpedia queries now receive "hints" including the projection and filter
  that will be applied after the query. These allows to push those operations
  to the remote server, and avoid retrieving large amounts of data, or not
  retrieiving the correct data due to API limits [#189].
* Time values now support the "+" and "-" operations with Measure(ms) values [#192].
* The refactoring of Ast classes has been completed. All Ast nodes are now
  true ES6 classes, and must be constructed with `new` [#191, #193].
* Misc bug fixes [#192].

1.10.0-alpha.4
==============

* Update and optimize operators in ThingTalk. A set of new operators for soft
  matching for arrays are added. Soft matching for entities are now allowed
  base on display value. `or` filters are optimized as `in_array` filters.
  Both < and > operators are totally removed, use >= and <= instead. [#188]
* Add "minimal_projection" annotation. This allow developers to set parameters
  that will always be present regardless of the program; it is default to `id`
  if `id` is present [#188]
* Add "don't care" boolean expression in the format of `true($param)`. It is
  semantically equivalent to true constant, but the agent will no longer ask
  about it [#188]
* Nerf typechecking for natural language annotations since they are template
  dependent [#188]
* Misc bug fixes [#188, #190]
* Update dependencies [#188]

1.10.0-alpha.3
==============

* Misc bug fixes [#182].

1.10.0-alpha.2
==============

* Constructors for all AST classes (except Ast.Value and descendant) have been
  modified to accept a parameter indicating the location of the corresponding
  code in the original source. All callers must be updated. This is a large
  breaking change [#177].
* The word `filter` is now treated as a keyword everywhere, rather than a
  contextual keyword. Hence, parameters and functions cannot be named `filter`
  any more [#179].
* Misc bug fixes [#181].

1.10.0-alpha.1
==============

* AST classes were refactored to simplify usage and clean up the API.
  As part of the refactoring, the use of the adt library was reduced significantly,
  and refactored AST objects are native ES6 classes. Hence, constructors must
  now be called with `new`. The refactoring is not complete yet, but will
  be completed before 1.10.0 [#158]
* Scalar and list expressions have been eliminated, and merged with new subclasses
  of Ast.Value. All places where values can be referenced (parameters, filters, slice
  indices) now admit arithmetic and computation expressions. The syntax of these
  experimental features also changed incompatibly. Using computation expression
  is still experimental and subject to change [#75, #178].
* String formatting for confirmation strings and formatted output has been
  refactored to use a new library called `string-interp`. This ensures that
  both `#_[confirmation]` and `#_[formatted]` annotations use a consistent syntax
  and the same features. It also introduces more flexible formatting of numbers,
  dates, plural and ordinal forms, and optional parameters [#137, #175].
* Updated dependencies [#174, #176].

1.9.3
=====
* Added new pseudo-unit "defaultTemperature" to indicate the user's preferred
  temperature unit [#187]
* Fixed constants of type Entity(tt:function) in NN syntax [#185, #186]
* Fixed displaying times in recent versions of node

1.9.2
=====

* Added new units to better support Home Assistant [#172]

1.9.1
=====

* Misc bug fixes [#168, #169, #170, #171]

1.9.0
=====

* Fixed typechecking of enums [#167]
* Misc bug fixes [#164]
* Updated translation: Italian [#163]

Please see the previous release notes for the full list of changes and new features
in this release series.

1.9.0-beta.1
============

* Add support for selecting devices by name [#162]
* Add pictures in RDL format objects [#161]

1.9.0-alpha.4
=============

* Fix lowering `return`

1.9.0-alpha.3
=============

* Added the ability to reference the current selection on the screen, and similar
  context items, as a value in the program [Jackie Yang; #160]
* Added the ability to traverse records when formatting [#155]
* Misc bug fixes [Lim Swee Kiat; #159]

1.9.0-alpha.2
=============

* Add "aggregate filters". These are filters that invoke an aggregation or
  computation function on the left-hand-side of the comparator [#152].
* Add flattening of fields in compound types [#151].
* Allow overriding parameters in function inheritance [#151].
* Add basic support for compute operations [#152, #153].
* Add `distance` scalar operator [#153].
* Added experimental support for user-defined scalar & filter functions ("macros") [#152].
* Improved default formatting of results for functions without a `#_[formatted]`
  annotation [#152].
* Added basic jsdoc documentation, which can be built with `yarn doc` [#154].
* SchemaRetriever now caches missing classes, to avoid repeated calls to Thingpedia [#156]
* Misc bug fixes [#152, #157].

1.9.0-alpha.1
=============

* Queries can now return a `__response` hidden parameter, and if that's present,
  it overrides formatting-based outputs [#134].
* Interval timers can now be specified in terms of frequency instead of interval,
  to support e.g. "twice a week", "three times an hour" without doing arithmetic
  [Richard Grannis-Vu; #135, #136, #139].
* Added compound (record) types [#142].
* Added the ability to "extend" query functions. Extending function will inherit
  all input and output parameters of the base function, including annotations,
  and do not need to redeclare them. There is no link between the two functions other
  than shared parameters [#146, #148].
* Datasets can now be prettyprinted individually [#143].
* Build system fixes and dependency updates [#150].

1.8.0
=====

* Final bug fixes to the ThingTalk-to-SPARQL converter [Ryan Chen; #132, #133]

Please see the beta version release notes for the full list of changes and new features
in this release.

1.8.0-beta.2
============

* Misc bug fixes [#131, #128]
* Removed csv devDependency

1.8.0-beta.1
============

* New operator `result()` retrieves the latest result of a given type from the assistant
  history [#74, #104]
* `attimer()` now supports firing at multiple times, and supports and `expiration_date`
  parameter [Richard Grannis-Vu; #107]
* The `Time` has been extended to support relative times, such as "morning" and "evening";
  relative time values must be slot-filled before execution [Richard Grannis-Vu; #121, #123]
* New annotations [#97, #106]:
  - #[require_filter] indicates a that a function must be filtered in some way
    (and will not typecheck otherwise)
  - #[default_projection] contains a limited set of parameter that will be returned
    if no other projection is applied
  - #[unique] indicates that a parameter is a "unique key" for the results of
    the function; multiple equality filters with unique parameters are disallowed
  - #[handle_thingtalk] indicates that a query function is able to understanding
    whole ThingTalk subtrees instead of simple invocations [#120]
* The #_[canonical] annotation on parameters has been extended and can now include multiple
  grammatical forms (e.g. noun, verb) [#114, #117]
* New API for iterating slots: `node.iterateSlots2()`; the new API yields `Slot`
  object instead of tuples, and is generally more usable [#115]
* New API to convert ThingTalk query programs to SPARQL queries suitable to query WikiData
  [Ryan Cheng; #113, #125, #126]
* New API provides global support for internationalization, even in place where a `platform`
  object is not accessible [#115]
* Projections can now be synthesized and expressed in neural network syntax [#97, #119]
* Normalization has been extended to handle projections correctly [#97, #112]
* Both neural network and surface syntax now allow variables and `$undefined` in more
  places [#108]
* Neural network entity assignment now lowercases entity names, to match the tokenization
  of the sentence [#102]
* __const variables are now typechecked correctly, based on their name [#108]
* The obsolete JSON manifest format is no longer used by SchemaRetriever; manifest
  conversion code is now fully deprecated [#122]
* The compiler now correctly verifies and refuses to execute programs that are not fully
  slot-filled [#124]
* The formatter now correctly uses the canonical form of parameters when displaying
  aggregations or constructing fallback display forms [#127]
* Misc bug fixes [#116]
* Misc build system and test fixes [#111, #118]
* Updated dependencies [#109, #110]

1.7.3
=====

* Numbers can now be casted to Currencies implicitly; this allows
  comparing a currency value to a number without specifying the currency
  code [Aydan Pirani, #17, #95]
* Locations can now be "unresolved"; this is similar to entities
  with null value and marks a span of an input sentence corresponding
  to a location that has not been linked to a specific place on Earth [#98]
* Misc bug fixes [#100, #101]
* Updated dependencies [#99]

1.7.2
=====

* Fixed two bugs related to array literals [#96]
* Updated dependencies

1.7.1
=====

* Brown paper bag fix of the new formatting support for location

1.7.0
=====

* New feature: bookkeeping language. This new language allows to express commands that are
  not programs but are necessary for the correct operation of the dialog agent, such as yes,
  no, stop, etc. [#89].
* New feature: map, sound effect, media output types are now available for formatted query output [#92].
* New feature: `program` examples can have parameters now [#91].
* New feature: entities can be allocated sequentially when converting to neural network (NN) syntax [#93].

1.6.1
=====

This is a bug fix release. Notable fixes:

* Fixed basic authentication mixins and manifest conversion [#83]
* Fixed retrieving invalid devices in SchemaRetriever [#82, #85]
* Monitor of non-monitorable queries is now correctly rejected by the typechecker [#66, #86]
* Fixed cloning of classes [#63, #87]
* Fixed monitoring of RSS feeds [#90]
* Updated dependencies

1.6.0
=====

* The language was extended to support multiple connected statements. This involved
  a significant change in the compiler and runtime interface.
* New language feature: assignments. This is a new kind of statement that
  invokes a query eagerly and makes the result available to later statements.
* New language feature: procedures. These are a new kind of declaration that
  opens a nested scope when invoked. They can be invoked as actions.
* New language feature: `oninput`. This is a statement that declares, but does not invoke,
  actions that are related to the current program. It is expected that the frontend
  will represent `oninput` statements as buttons or suggestions.
* `iterateSlots` and `iteratePrimitives` API were adapted to reflect their use in slot-filling,
  and will not recurse into new statements that should not be slot-filled eagerly.
* More of the Ast API were converted away from adt types to ES6 classes. This includes
  the Ast.Input types and the Ast.Statement types.
* New syntax: `$?` is now a syntactic sugar for `$undefined`. Note the new syntax is
  used by default, which can cause compatibility issues with the old library.
* New language operators: `sort`, indexing and slicing. These operate on queries
  and can be used to sort or select an index or range of the result. These operators
  are fully supported (including compiler, describe, NN syntax support)
* The `argmin` and `argmax` operators are now redundant and have been removed.
* It is now possible to build the library on windows (provided that the dependencies
  are available)
* New API: `Example`s can be typechecked individually.
* Misc bug fixes

1.5.2
=====

* Fix a bug in the new nn-syntax grammar, caught by the almond-dialog-agent tests

1.5.1
=====

* Fix tarball again, missing generated files

1.5.0
=====

* BREAKING CHANGE: the SentenceGenerator module, and the associated template files, have been moved
  to [genie-toolkit](https://github.com/stanford-oval/genie-toolkit),
  and they are not in the library anymore.
* The NN syntax definition was redone to make it easier to extend, with a custom
  domain-specific language and the ability to generate a Python parser as well.
* The formatter now supports missing or invalid parameters, and will automatically
  display only the available information. In the future, this will allow for projections
  on notifications.
* Minor bug fixes and code style improvements [#68]

1.4.2
=====

* Updated messaging interface to work with the latest version of thingengine-core [#67].
* Fixed syntax of argmin/argmax [#62].
* Misc bug fixes.
* Dependencies have been updated [#61].
* Build system and CI fixes.

1.4.1
=====

* Fix botched tarball in previous release, missing important files

1.4.0
=====

* New feature: aggregations and argmin/argmax are now fully implemented, including
  the compiler and runtime parts [#56, #57, #60]
* New module: SentenceGenerator; used to generate programs and their associated sentences.
  The generator uses a new DSL, dubbed yasgg (Yet Another Sentence Generator Generator,
  a reference to the well-known parser generator YACC).
  This module is epxerimental and expected to change in the future.
* Internal modules have been reorganized.
* Misc bug fixes [#47, #55, #58].
* Dependencies have been updated [#54].

1.3.1
=====

* Misc bug fixes

1.3.0
=====

* New Class syntax to replace Thingpedia manifests.
* New syntax on queries to indicate whether they are monitorable and/or lists.
* New language component: mixins and import statements.
* New language component: dataset and examples; these replace the use of declarations
  for composable code snippets in Thingpedia.
* New language component: annotations; these can be applied to function declarations
  in classes, to classes themselves, and to examples in datasets.
* Minor API changes in the Ast module. Ast API is still considered experimental and
  is not covered by the API stability promise.
* The API of SchemaRetriever has changed significantly, following the changes in
  the upstream Thingpedia API.
* The syntax of Stream Joins have changed from "$stream join $table" to "$stream => $table";
  the old syntax is accepted for compatibility but not generated. Other libraries
  should be updated to follow suit.
* The value type Builtin.ExampleProgram was removed. It was never meant for use
  outside of the Almond platform.
* Misc bug fixes [#11, #12].
* Build system and CI fixes.
* Dependencies have been updated.

1.2.0
=====

* New API to check programs without transforming them
* Misc bug fixes
* Build system and CI fixes

1.1.1
=====

* Fix compiling of picture constants
* Build system and CI fixes

1.1.0
=====

* New feature: support for quote-free programs in NN syntax (experimental, might change)
* Compiled ThingTalk code uses native async functions instead of generator functions now
* More tests

1.0.0
=====

* First official release
* Includes the ThingTalk language, compiler, and library to manipulate ThingTalk programs
* Includes a preview (not yet stable) of the Comma extensions for ThingTalk
