@{%
const moo = require("moo");
const lexer = moo.compile({
  space: / /,
  hash: /#/,
  range: /-/,
  number: /[0-9]+/,
  letter: /[a-z]/,
  split: /\//,
  escape: /\\/,
  colon: /:/,
  questionmark: /\?/,
  lbrace: /{/,
  rbrace: /}/,
  any: /./,
});
%}
@lexer lexer

outer ->
  expr                          {% ([a]) => ({...a, optional: ''}) %}
  | expr %questionmark .:+      {% ([a,,b]) => ({...a, optional: b.join('')}) %}

expr ->
  field                         {% ([a]) => ({hashed: false, upcase: false, field: a}) %}
  | %hash field                 {% ([,a]) => ({hashed: true, upcase: false, field: a}) %}
  | %hash %hash field           {% ([,,a]) => ({hashed: true, upcase: true, field: a}) %}

field ->
  fieldnumber                   {% ([a]) => ({...a}) %}
  | fieldnumber splitexpression:+   {% ([a,b]) => ({...a, sub: b}) %}

fieldnumber ->
  %number                       {% ([a]) => ({start: parseInt(a), end: parseInt(a)}) %}
  | %range %number              {% ([a,b]) => ({start: 1, end: parseInt(b)}) %}
  | %number %range %number      {% ([a,,b]) => ({start: parseInt(a), end: parseInt(b)}) %}
  | %number %range              {% ([a,b]) => ({start: parseInt(a), end: -1}) %}

splitexpression ->
  %split (%escape %escape | %escape %colon | %escape %split | %escape %range | %escape %lbrace | %escape %rbrace | %space | %number | %hash | %letter | %any) %colon fieldnumber
                                {% ([a,b,c,d]) => ({subdelim: b[b.length-1].toString(), ...d}) %}
