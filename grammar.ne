@builtin "whitespace.ne"
@builtin "string.ne"

instruction -> 
  entity {% ([a]) => ({ type: 'insert', left: a }) %}
  | entity __ entity __ entity {% ([a,,b,,c]) =>  ({ type: 'connect', left: a, relationship: b, right: c }) %} 

entity ->
  entity_name {% ([d]) => ({ name: d }) %}
  | entity_name _ ":" _ entity_id {% ([a,,,,b]) => ({ name: a, mergeOn: 'id', id: b }) %}
  | entity_name _ ":" _ field_name "=" entity_id {% ([a,,,,b,,c]) => ({ name: a, mergeOn: b, id: c }) %}
  | entity_name _ properties {% ([a,,b]) => ({ name: a, properties: b }) %}
  | entity_name _ ":" _ entity_id _ properties {% ([a,,,,b,,c]) => ({ name: a, mergeOn: 'id', id: b, properties: c }) %}
  | entity_name _ ":" _ field_name "=" entity_id _ properties {% ([a,,,,b,,c,,d]) => ({ name: a, mergeOn: b, id: c, properties: d }) %}

field_name ->
  sqstring {% id %}
  | dqstring {% id %}
  | alnum_word {% id %}

entity_id ->
  sqstring {% id %}
  | dqstring {% id %}
  | alnum_word {% id %}

entity_name ->
  sqstring {% id %}
  | dqstring {% id %}
  | alnum_word {% id %}

properties ->
  "(" _ property_list _ ")" {% ([,,p]) => p.reduce((a, cv) => { a[cv[0]] = [cv[1], cv[2], cv[3]]; return a; }, {}) %}

property_list ->
  property
  | property _ "," _ property_list {% ([a,,,,b]) => [a].concat(b) %}

property ->
  property_name _ ":" _ property_value {% ([a,,,,b]) => [a, '=', b] %}
  | property_name _ property_operator _ property_value {% ([a,,b,,c]) => [a, b, c, 0] %}
  | property_name _ "(" _ property_default _ ")" _ property_operator _ property_value {% ([a,,,,b,,,,c,,d]) => [a, c, d, b] %}

property_operator ->
  [-+/*] "=" {% v => v.join('') %}

property_name ->
  alnum_word {% id %}
  | dqstring {% id %}
  | sqstring {% id %}

property_value ->
  alnum_word {% id %}
  | dqstring {% id %}
  | sqstring {% id %}

property_default ->
  alnum_word {% id %}
  | dqstring {% id %}
  | sqstring {% id %}

word ->
  [^ \t]:+ {% function(d) {return d[0].join(""); } %}

alnum_word ->
  [-_A-Za-z0-9.,]:+ {% function(d) {return d[0].join(""); } %}
