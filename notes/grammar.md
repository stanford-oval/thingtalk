#  Grammar of ThingTalk


## Concrete Formal Grammar
- add `let_program_def`
- add `$action := $query => $action`, and change `rule` to `now => $action` instead of `now => $query => $action`
- add `type_ref` (add map)

```bash

$program := $statement*

$statement := $block | $empty_stmt | $mixin_def | $class_def | $let_def | $rule

$block := '{' $statement* '}'
$empty_stmt := ';'

$mixin_def := 'mixin' $fully_qualified_name 'provides' $ident ';'
$class_def := 'class' $fully_qualified_name ['extends' $fully_qualified_name]? '{' $class_member* '}'

$class_member := $import_stmt | $class_query_def | $class_action_def | $entity_def

$import_stmt := 'import' 'class' $fully_qualified_name 'as' $ident ';' |
    'import' $ident 'from' $fully_qualified_name '(' $input_param* ')' ';'

$class_query_def := 'monitorable'? ['list' | 'maybe']? 'query' $ident '(' $param_def* ')'
    [':=' $query]? $annotation* ';'
$class_action_def := 'action' $ident '(' $param_def* ')'
    [':=' $action]? $annotation* ';'

$let_def := $let_stream_def | $let_query_def | $let_action_def | $let_program_def

$let_query_def := 'let' ['query' | 'table'] ['_' | $ident] '(' $param_def* ')' ':=' $query |
    'let' ['query' | 'table'] ['_' | $ident] ':=' '\' '(' $param_def* ')' '->' $query |
    'let' ['query' | 'table'] ['_' | $ident] ':=' $query
$let_stream_def := 'let' 'stream' ['_' | $ident] '(' $param_def* ')' ':=' $stream |
    'let' 'stream' ['_' | $ident] ':=' '\' '(' $param_def* ')' '->' $stream |
    'let' 'stream' ['_' | $ident] ':=' $stream
$let_action_def := 'let' 'action' ['_' | $ident] '(' $param_def* ')' ':=' $action |
    'let' 'action' ['_' | $ident] ':=' '\' '(' $param_def* ')' '->' $action |
    'let' 'action' ['_' | $ident] ':=' $action
$let_program_def := 'let' 'program' ['_' | $indent] ':=' $program
    
$param_def := ['in' 'req' | 'in' 'opt' | 'out'] $ident ':' $type_ref $annotation*
    
$rule := 'now' '=>' $action | '$stream' '=>' $action

$function_call := $ident '(' $input_param* ')'
$extern_function_call :=
    $fully_qualified_name '(' $input_param* ')' '.' $ident '(' $input_param* ')' |
    $fully_qualified_name '(' $input_param* ')'

$query := $filter_query ['join' $filter_query ['on' '(' $input_param* ')']? ]*
$filter_query := $alias_query [',' $filter]?
$alias_query := $primary_query ['as' $ident]?

$primary_query := '(' $query ')' | $function_call | $extern_function_call |
    '[' [$qualified_name ['as' $ident]? ]+ ']' 'of' $primary_query |
    'aggregate' ['argmin' | 'argmax'] $value ',' $value $ident 'of' $alias_query |
    'aggregate' 'count' '*' 'of' $alias_query
    'aggregate' ['sum' | 'avg' | 'min' | 'max'] $ident 'of' $alias_query |

$stream := $filter_stream ['join' $filter_stream ['on' '(' $input_param* ')']? ]*

$filter_stream := $alias_stream [',' $filter]?
$alias_stream := $primary_stream ['as' $ident]?

$primary_stream := '(' $stream ')' | $function_call |
    'timer' '(' 'base' '=' $value ',' 'interval' '=' $value ')' |
    'edge' $alias_stream 'on' 'new' |
    'edge' $alias_stream 'on' $filter | 
    'monitor' $alias_table ['on' 'new' '[' $ident+ ']' ]?
    '[' [$qualified_name ['as' $ident]? ]+ ']' 'of' $primary_stream

$action := $single_action | '{' [ $single_action ';']+ '}'

$single_action := 'notify' | 'return' |
    $function_call | $extern_function_call | $query '=>' $single_action
    
$input_param := $ident '=' $value

$filter := $and_expr ['||' $and_expr]*
$and_expr := $bool_expr ['&&' $bool_expr]*
$bool_expr := '(' $filter ')' | 'true' | 'false' | $infix_predicate | $prefix_predicate | $get_predicate

$infix_predicate := $ident ['==' | '>=' | '<=' | '=~' | '~='] $value
$prefix_predicate := $ident '(' $ident ',' $value ')'
$get_predicate := $extern_function_call '{' $filter '}'

$prim_type_ref := 
    'Boolean' | 
    'String' | 
    'Number' | 
    'Enum' ['(' $ident [',' $ident]* ')']? |
    'Entity' ['(' $string_value ')']? |
    'Measure' ['(' $ident ')'] ? |
    'Currency' |
    'Date' |
    'Time' |
    'Location' |
    'Type'
$comp_type_ref :=    
    'Array' '(' $prim_type_ref ')' |
    'Map' '<' $prim_type_ref ',' $type_ref '>' |
    '(' $type_ref [',' $type_ref]* ')' 
$type_ref :=
    'Any' | $prim_type_ref | $comp_type_ref

$value := 
    '(' $value ')' |
    '$undefined' |
    '$context' '.' $qualified_name |
    '$event' ['.' $ident]? |
    $date_value |
    $bool_value |
    $measure_value |
    $number_value |
    $currency_value |
    $time_value |
    $location_value |
    $enum_value |
    $entity_value | 
    $var_ref_value |
    $string_value |
    $array_value
    
$date_value := $date_base [['+' | '-'] $measure_value]?
$date_base := 'makeDate' '(' ')' | 'makeDate' '(' $number_value ')' |
    'makeDate' '(' $number_value ',' $number_value ',' $number_value ')' |
    'makeDate' '(' $number_value ',' $number_value ',' $number_value ',' $number_value ',' $number_value ',' $number_value ')'

$bool_value := 'true' | 'false'

$measure_value := $number_value $ident ['+' $number_value $ident]*

$currency_value := 'makeCurrency' '(' $number_value ',' $ident ')'

$number_value := /[0-9]*\.[0-9]+(e[0-9]+)?/ | /[0-9]+(e[0-9]+)?/

$string_value := /"([^"\\]|\\"||\\'|\\\\|\\n)*"/ | /'([^"\\]|\\"||\\'|\\\\|\\n)*'/'

$time_value := 'makeTime' '(' $number_value ',' $number_value [',' $number_value]? ')'

$location_value := 'makeLocation' '(' $number_value ',' $number_value [',' $string_value]? ')'

$enum_value := 'enum' '(' $ident ')'

$entity_value := $string_value '^^' $qualified_name ':' $ident ['(' $string_value ')']?

$var_ref_value := $qualified_name

$array_value := '[' $value* ']'

$map_value := '{' $ident '=' $value [',' $ident '=' $value]* '}'


$qualified_name := $ident ['.' $ident]*
$fully_qualified_name := '@' $classident ['.' $classident]*

// identifiers are C-style identifiers: alphanumeric characters or _, but not starting
// with a number
$ident := /[_a-zA-Z][_a-zA-Z0-9]*/
/*

// class identifiers are more lenient: - is also allowed, but not at the beginning
// or at the end
// (this is to let people use DNS names, which allow -, as Thingpedia class names,
// and also because we ourselves messed up and used @security-camera already)
$classident := /[_a-zA-Z]|[_a-zA-Z][_a-zA-Z0-9-]*[_a-zA-Z0-9]/


```