# API & Language Changes in ThingTalk 2.0

Informal notes ahead of the release. This document will be merged
into HISTORY when the release is cut.

## AST changes

- Remove non-device selectors.

- Table, Stream, Actions are no longer used. Instead, everything is
  an Expression, which could be a table Expression (Index, Sort, Aggregation),
  a table-or-stream Expression (Filter, Projection), or any of the
  three types (FunctionCall, Invocation)

- The Expression class has a toLegacy() method to convert to the old AST
  objects and aid in the transition.

- NotifyActions are no longer used.

- To parse the new syntax, use `Grammar.parse()` and pass `SyntaxType.Normal`
  (user input) or `SyntaxType.Tokenized` (neural network output)
  
- To serialize to the new syntax, use `node.toSource()` to generate a token
  stream (for neural network) and `node.prettyprint2()` to generate actual syntax

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

- sort syntax is now `sort(field direction of table)`; example:
  ```
  sort(file_size asc of @com.dropbox.list_folder())
  ```
  
- computation is now part of projection, with the syntax `[expr1, expr2, ...] of table`; example:
  ```
  [geo, cuisines, distance(geo, $location.current_location)] of @com.yelp.restaurant()
  ```
  
- computation can be aliased; example:
  ```
  [distance(geo, $location.current_location) as dist] of @com.yelp.restaurant()
  ```

- `join` is now expressed as `=>` (true table joins should be expressed as
  subqueries instead)
  
- `monitor` of a specific field is `monitor(fields of table)`; example:
  ```
  monitor(text, author of @com.twitter.home_timeline())
  ```
  
- Edge filters are not supported yet.

- `return` syntax is not supported yet.

#### Planned but not implemented yet.

- Function declaration statements as `function x() { }` instead of `let x( ) := `
  (used by VASH/WebTalk)

- Assignment statements as `let x = ...` and `x = ...`
  (used by VASH/WebTalk)
  
### Minor

- relative locations and relative times use `$location.*` and `$time.*`
  instead of `$context.location.*`
  
- `now` and `$now` are now synonyms for `new Date()`

- it is now possible to have a space between number and unit in a measure or
  currency literal
  
- edge dates now use `$start_of(...)` instead of `start_of(...)`; this is to
  preserve `start_of` as an identifier, and also to introduce the convention
  that `$` variables are variables that depend on the context of where/how the
  program is executed

- `$event` is now called `$result`, and `$event.program_id` is now called
  `$program_id`; `$event.title` and `$event.body` are not supported

- the priority of `filter` and `of` scalar operators, and aritmhetic operators
  was flipped, so `[1,2,3] filter value > 1 + 1` is now parsed as
  `[1,2,3] filter value > (1 + 1)`; this is necessary to avoid ambiguity with
  table-level `filter` and `of` operators
  
- `enum` no longer needs parenthesis: `enum off` and `enum(off)` are equivalent
  (and so is `enum (off)`)

- the syntax to declare an entity type is now `Entity(^^com.foo:bar)` - the `^^`
  informs the lexer to read the entity token, which is treated as one token and
  cannot have spaces; for compatibility, `Entity(com.foo:bar)` is also recognized,
  provided it has no spaces
  
### Syntax changes compared to old NN syntax

This list is not comprehensive.

- Parenthesis are no longer required

- `timer` and `attimer` must use parenthesis, and are parsed as general functions,
  they do not have special syntax 

- `param:` prefixes are no longer needed

- `location: " foo "` syntax is now `new Location ( " foo " )`

- `" foo " ^^com.foo:bar` syntax has changed meaning to match surface syntax
