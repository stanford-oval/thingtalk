# Grammar

## Constants 
Constant values are named as `$constant_<Type>` where `<Type>` is one of 
`String`, `Entity(tt:<Entity_Type>`, `Number`, `Currency`, `Time`, `Date`, `Measure(<unit>)`, `Boolean`, `Location`, `Any`, `Numeric`. 
Note that `$constant_Any` indicates that constants in any type can be used, while
`constant_Numeric` indicates that constants in type `Number`, `Currency`, `Measure(<unit>)` can be used. 

The value of a constant is taken from a list of example values given the type with the following additions. 

~~~bash
$constant_date_point := now | today | yesterday | tomorrow 
                      | the end of the day | the end of the week 
                      | this week | this month | this year 
                      | next month | next year 
                      | last month | last year 
$constant_Date := $constatnt_date_point 
                | $constant_Measure(ms) from now 
                | $constant_Measure(ms) ago 
                | $constant_Measure(ms) after $constant_date_point
                | $constant_Measure(ms) before $constant_date_point
$constant_Location := here | where i am now | home | work
~~~

## Filters
We use `out_param_<Type>` to denote the name of an output parameter of a function with the given `<Type>`.
Similar to constants, we have the basic types as well as `Any` and `Numeric`.

~~~bash
$the_out_param_<Type> := (the | its | their) $out_param_<Type>
$range := between $constant_Numeric and $constant_Numeric
        | in the range from $constant_Numeric | $constant_Numeric
$atom_filter := before $constant_Time | after $constant_Time | between $constant_Time and $constant_Time 
              | (my location is | i am at) $constant_Location 
              | (my location is not | i am not at) $constant_Location
              | the $projection_Any (is | is exactly | is equal to) $constant_Any
              | the $projection_Any (is not | isn\'t | is different than) $constant_Any
              
              | the $out_param_Any (is | is exactly | is equal to) $constant_Any
              | the $out_param_Any (is not | isn\'t | is different than) $constant_Any
              | $the_out_param_Numeric is (greater | higher | bigger | more | at least | not less than) $constant_Numeric
              | $the_out_param_Numeric is (smaller | lower | less | at most  | no more than) $constant_Numeric 
              | $the_out_param_Date is (after | later than) $constant_Date
              | $the_out_param_Date is (before | earlier than) $constant_Date

              | $the_out_param_Array (contain | include) $constant_Any
              | $the_out_param_Array do not (contain | include) $constant_Any

              | $the_out_param_String (contains | includes) $constant_String
              | $constant_String is in $the_out_param_String

$edge_filter := the $out_param_Any (becomes | becomes equal to) $constant_Any
              | $the_out_param_Numeric (is now greater than | becomes greater than | becomes higher than | goes above | increases above | rises above ) $constant_Numeric
              | $the_out_param_Numeric (is now smaller than | becomes smaller than | becomes lower than | goes below | decreases below | goes under ) $constant_Numeric

$either_filter := the $out_param_Any (is | is equal to | is one of | is either) $constant_Any or $constant_Any
               | the $out_param_Any is (not | neither) $constant_Any nor $constant_Any

$range_filter := $the_out_param_Numeric is $range

$with_filter := $out_param_Any equal to $constant_Any
             | $out_param_Numeric (higher | larger | bigger) than $constant_Numeric
             | $out_param_Numeric (smaller | lower) than $constant_Numeric
             | (higher | larger | bigger) $out_param_Numeric than $constant_Numeric 
             | (smaller | lower) $out_param_Numeric than $constant_Numeric
             | $out_param_Numeric ${range}
             | (no | zero) $out_param_Number
~~~


## Queries
- `$thingpedia_table`: the utterance of a `get` function in Thingpedia which is a noun phrase, e.g. `my latest emails`
- `$thingpedia_get_command`: `the utterance of a get` function in Thingpedia which is a verb phrase, e.g, `translate $text to $target_langauge`

~~~bash
$complete_table := $thingpedia_table | $table_join_replace_placeholder
$complete_get_command := $thingpedia_get_command
$projection_<Type> := the $out_param_<Type> of $complete_table
                    | new $complete_table # if $complete_table only has one output parameter


$if_filtered_table := $complete_table | $one_filter_table | $two_filter_table

$one_filter_table := $complete_table if $atom_filter
$two_filter_table := $one_filter_table and $atom_filter

$with_filter_table := $complete_table | $complete_table (with | having) $with_filter

~~~ 

## Triggers
~~~bash
$timer := every $constant_Measuse(ms)
       | once in $constant_Measure(ms)
       | (every day | everyday | daily | once a day)
       | once a week
       | once a month 
       | once an hour 
       | (every day | everyday | daily) at $constant_Time

$edge_stream := (when | if) the $projection_Any (becomes | becomes equal to) $constant_Any
              | (when | if) the $projection_Numeric (becomes greater than | becomes higher than | goes above | increase above) $constant_Number
              | (when | if) the $projection_Numeric (becomes smaller than | becomes lower than | goes below | decreases below) $constant_Number

$stream := (when | if | in case | whenever | anytime | should | any time) $with_filtered_table (change | update)
         | (in case of changes | in case of variations | in case of updates | if something changes | when somethings changes | if there are changes | if there are updates) in $with_filtered_table
         | (when | if | in case | whenever | anytime) $projection_Any changes
         | (when | if | in case | whenever | anytime) $complete_table change and $edge_filter
         | (when | if | in case | whenever | anytime) $complete_table change and $atom_filter
         | $edge_stream
         | $timer

~~~

## Actions
- `$thingpedia_action`: the utterance of a `do` function in Thingpedia


## Compounds
- `$action_replace_param_with_table`: the utterance of a `do` function in Thingpedia where one of the input parameter is replaced by a table, e.g., `tweet my latest email`
- `$action_replace_param_with_stream`: the utterance of a `do` function in Thingpedia where one of the input parameter is replaced by a stream

~~~bash
# get => do
$forward_get_do_command := (get | take | retrieve) $if_filtered_table (and then | then | ,) $thingpedia_action
                         | $complete_get_command (and then | then | ,) $thingpedia_action
                         | after (you get | taking | getting | retrieving ) $with_filtered_table $thingpedia_action

                         | $forward_get_do_command (with the same | with identical | using the same) $out_param_Any

$backward_get_do_command := $thingpedia_action after (you get | taking | getting | retrieving ) $with_filtered_table 

$complete_get_do_command := $forward_get_do_command
                          | $backward_get_do_command
                          | $action_replace_param_with_table                    

# when => do
$forward_when_do_rule := $stream $thingpedia_action
                       | (monitor | watch) $with_filtered_table (and then | then) thingpedia_action
                       | (monitor | watch) $projection_Any (and then | then) thingpedia_action
                       | check for new $complete_table (and then | then) thingpedia_action
                       | $forward_when_do_rule (with the same | with identical | using the same) $out_param_Any

$backward_when_do_rule := $thingpedia_action $stream
                        | $thingpedia_action after checking for new $complete_table

$complete_when_do_rule := forward_when_do_rule
                        | backward_when_do_rule
                        | (auto | automatically | continuously) $action_replace_param_with_stream


# when => get
$when_get_stream := $stream $thingpedia_get_command
                  | $stream (get | show me | give me | tell me | retrieve) $thingpedia_table
                  | $stream (get | show me | give me | tell me | retrieve) $projection_Any
                  | $thingpedia_get_command $stream
                  | (get | show me | give me | tell me | retrieve) $thingpedia_table $stream 
                  | (get | show me | give me | tell me | retrieve) $projection_Any $stream 
$complete_when_get_stream: = $when_get_stream

# when => get => rule
$when_get_do_rule := $stream $complete_get_do_command
                   | $complete_get_do_command $stream
~~~

## Root
~~~bash
root := 
      # when => notify
        (notify me | alert me | inform me | let me know | i get notified | i get alerted) $stream 
      | send me (a message | an alert | a notification | a popup notification |) $stream
      | send me a reminder ${timer}
      | send me (a message | an alert | a notification | a popup notification |) $timer (saying | with the text) $constant_String
      | alert me $stream (saying | with the text) $constant_String
      | show (the notification | the message | a popup notification that says) $constant_String $stream
      | (monitor | watch) $with_filtered_table
      | (monitor | watch) $projection_Any
      | (let me know | notify me) (of | about) (changes | updates) in $if_filtered_table
      | (monitor | watch) $complete_table and (alert me | notify me | inform me | warn me) (if | when) $atom_filter
      | (let me know | notify me) (of | about) (changes | updates) in $projection_Any
      | (alert me | tell me | notify me | let me know) (if | when) $atom_filter in $complete_table
      | (alert me | tell me | notify me | let me know) (if | when) $edge_filter in $complete_table

      # when => get => notify
      | $complete_get_command
      | (tell me | give me | show me | get | present | retrieve | pull up) $complete_table
      | (list | enumerate) $with_filtered_table
      | (search | find | i want | i need) $with_filtered_table
      | what are $with_filtered_table ?  

      | (tell me | give me | show me | get | present | retrieve | pull up | ) $project_Any
      | (show me | tell me | say | ) what is $project_Any ?  
      | who is ($project_Entity(tt:username) | $project_Entity(tt:email_address)) ? 

      # now => do 
      | (please | i need you to | i want to | i\'d like to | ) $thingpedia_action

      # now => get => do
      | $complete_get_do_command

      # when => get => notify
      | $complete_when_get_stream

      # when => get => do
      | $when_get_do_rule 

      # remote requests
      | (tell | command | order | request | ask) $constant_Entity(tt:username) to $thingpedia_action
      | (tell | command | order | request | inform) $constant_Entity(tt:username) that (he needs | she needs | i need him | i need her) to $thingpedia_action
      | (request | ask) $constant_Entity(tt:username) to get $complete_table (and send it to me | )
      | (show me | get) $complete_table from $constant_Entity(tt:username) 
      | (show me | get | what is) $constant_Entity(tt:username) \'s $complete_table
      | (tell | command | order | request | ask) $constant_Entity(tt:username) to send me $complete_table
      | (tell | command | order | request | ask) $constant_Entity(tt:username) to (let me know | inform me | notify me | alert me) $stream

      # policies 
      | (anyone | anybody | everyone | everybody) (can | is allowed | is permitted to | has permission to) (get | see | access | monitor | read) $if_filtered_table
      | $constant_Entity(tt:username) (can | is allowed | is permitted to | has permission to) (get | see | access | monitor | read) $if_filtered_table
      | $constant_Entity(tt:username) (can | is allowed | is permitted to | has permission to) $thingpedia_action
      | $constant_Entity(tt:username) (can | is allowed | is permitted to | has permission to) $thingpedia_action if $atom_filter
~~~
