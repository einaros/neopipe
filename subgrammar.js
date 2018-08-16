// Generated automatically by nearley, version 2.15.1
// http://github.com/Hardmath123/nearley
(function () {
function id(x) { return x[0]; }

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
var grammar = {
    Lexer: lexer,
    ParserRules: [
    {"name": "outer", "symbols": ["expr"], "postprocess": ([a]) => ({...a, optional: ''})},
    {"name": "outer$ebnf$1", "symbols": [/./]},
    {"name": "outer$ebnf$1", "symbols": ["outer$ebnf$1", /./], "postprocess": function arrpush(d) {return d[0].concat([d[1]]);}},
    {"name": "outer", "symbols": ["expr", (lexer.has("questionmark") ? {type: "questionmark"} : questionmark), "outer$ebnf$1"], "postprocess": ([a,,b]) => ({...a, optional: b.join('')})},
    {"name": "expr", "symbols": ["field"], "postprocess": ([a]) => ({hashed: false, upcase: false, field: a})},
    {"name": "expr", "symbols": [(lexer.has("hash") ? {type: "hash"} : hash), "field"], "postprocess": ([,a]) => ({hashed: true, upcase: false, field: a})},
    {"name": "expr", "symbols": [(lexer.has("hash") ? {type: "hash"} : hash), (lexer.has("hash") ? {type: "hash"} : hash), "field"], "postprocess": ([,,a]) => ({hashed: true, upcase: true, field: a})},
    {"name": "field", "symbols": ["fieldnumber"], "postprocess": ([a]) => ({...a})},
    {"name": "field$ebnf$1", "symbols": ["splitexpression"]},
    {"name": "field$ebnf$1", "symbols": ["field$ebnf$1", "splitexpression"], "postprocess": function arrpush(d) {return d[0].concat([d[1]]);}},
    {"name": "field", "symbols": ["fieldnumber", "field$ebnf$1"], "postprocess": ([a,b]) => ({...a, sub: b})},
    {"name": "fieldnumber", "symbols": [(lexer.has("number") ? {type: "number"} : number)], "postprocess": ([a]) => ({start: parseInt(a), end: parseInt(a)})},
    {"name": "fieldnumber", "symbols": [(lexer.has("range") ? {type: "range"} : range), (lexer.has("number") ? {type: "number"} : number)], "postprocess": ([a,b]) => ({start: 1, end: parseInt(b)})},
    {"name": "fieldnumber", "symbols": [(lexer.has("number") ? {type: "number"} : number), (lexer.has("range") ? {type: "range"} : range), (lexer.has("number") ? {type: "number"} : number)], "postprocess": ([a,,b]) => ({start: parseInt(a), end: parseInt(b)})},
    {"name": "fieldnumber", "symbols": [(lexer.has("number") ? {type: "number"} : number), (lexer.has("range") ? {type: "range"} : range)], "postprocess": ([a,b]) => ({start: parseInt(a), end: -1})},
    {"name": "splitexpression$subexpression$1", "symbols": [(lexer.has("escape") ? {type: "escape"} : escape), (lexer.has("escape") ? {type: "escape"} : escape)]},
    {"name": "splitexpression$subexpression$1", "symbols": [(lexer.has("escape") ? {type: "escape"} : escape), (lexer.has("colon") ? {type: "colon"} : colon)]},
    {"name": "splitexpression$subexpression$1", "symbols": [(lexer.has("escape") ? {type: "escape"} : escape), (lexer.has("split") ? {type: "split"} : split)]},
    {"name": "splitexpression$subexpression$1", "symbols": [(lexer.has("escape") ? {type: "escape"} : escape), (lexer.has("range") ? {type: "range"} : range)]},
    {"name": "splitexpression$subexpression$1", "symbols": [(lexer.has("escape") ? {type: "escape"} : escape), (lexer.has("lbrace") ? {type: "lbrace"} : lbrace)]},
    {"name": "splitexpression$subexpression$1", "symbols": [(lexer.has("escape") ? {type: "escape"} : escape), (lexer.has("rbrace") ? {type: "rbrace"} : rbrace)]},
    {"name": "splitexpression$subexpression$1", "symbols": [(lexer.has("space") ? {type: "space"} : space)]},
    {"name": "splitexpression$subexpression$1", "symbols": [(lexer.has("number") ? {type: "number"} : number)]},
    {"name": "splitexpression$subexpression$1", "symbols": [(lexer.has("hash") ? {type: "hash"} : hash)]},
    {"name": "splitexpression$subexpression$1", "symbols": [(lexer.has("letter") ? {type: "letter"} : letter)]},
    {"name": "splitexpression$subexpression$1", "symbols": [(lexer.has("any") ? {type: "any"} : any)]},
    {"name": "splitexpression", "symbols": [(lexer.has("split") ? {type: "split"} : split), "splitexpression$subexpression$1", (lexer.has("colon") ? {type: "colon"} : colon), "fieldnumber"], "postprocess": ([a,b,c,d]) => ({subdelim: b[b.length-1].toString(), ...d})}
]
  , ParserStart: "outer"
}
if (typeof module !== 'undefined'&& typeof module.exports !== 'undefined') {
   module.exports = grammar;
} else {
   window.grammar = grammar;
}
})();
