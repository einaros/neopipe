// Generated automatically by nearley, version 2.15.1
// http://github.com/Hardmath123/nearley
(function () {
function id(x) { return x[0]; }
var grammar = {
    Lexer: undefined,
    ParserRules: [
    {"name": "_$ebnf$1", "symbols": []},
    {"name": "_$ebnf$1", "symbols": ["_$ebnf$1", "wschar"], "postprocess": function arrpush(d) {return d[0].concat([d[1]]);}},
    {"name": "_", "symbols": ["_$ebnf$1"], "postprocess": function(d) {return null;}},
    {"name": "__$ebnf$1", "symbols": ["wschar"]},
    {"name": "__$ebnf$1", "symbols": ["__$ebnf$1", "wschar"], "postprocess": function arrpush(d) {return d[0].concat([d[1]]);}},
    {"name": "__", "symbols": ["__$ebnf$1"], "postprocess": function(d) {return null;}},
    {"name": "wschar", "symbols": [/[ \t\n\v\f]/], "postprocess": id},
    {"name": "dqstring$ebnf$1", "symbols": []},
    {"name": "dqstring$ebnf$1", "symbols": ["dqstring$ebnf$1", "dstrchar"], "postprocess": function arrpush(d) {return d[0].concat([d[1]]);}},
    {"name": "dqstring", "symbols": [{"literal":"\""}, "dqstring$ebnf$1", {"literal":"\""}], "postprocess": function(d) {return d[1].join(""); }},
    {"name": "sqstring$ebnf$1", "symbols": []},
    {"name": "sqstring$ebnf$1", "symbols": ["sqstring$ebnf$1", "sstrchar"], "postprocess": function arrpush(d) {return d[0].concat([d[1]]);}},
    {"name": "sqstring", "symbols": [{"literal":"'"}, "sqstring$ebnf$1", {"literal":"'"}], "postprocess": function(d) {return d[1].join(""); }},
    {"name": "btstring$ebnf$1", "symbols": []},
    {"name": "btstring$ebnf$1", "symbols": ["btstring$ebnf$1", /[^`]/], "postprocess": function arrpush(d) {return d[0].concat([d[1]]);}},
    {"name": "btstring", "symbols": [{"literal":"`"}, "btstring$ebnf$1", {"literal":"`"}], "postprocess": function(d) {return d[1].join(""); }},
    {"name": "dstrchar", "symbols": [/[^\\"\n]/], "postprocess": id},
    {"name": "dstrchar", "symbols": [{"literal":"\\"}, "strescape"], "postprocess": 
        function(d) {
            return JSON.parse("\""+d.join("")+"\"");
        }
        },
    {"name": "sstrchar", "symbols": [/[^\\'\n]/], "postprocess": id},
    {"name": "sstrchar", "symbols": [{"literal":"\\"}, "strescape"], "postprocess": function(d) { return JSON.parse("\""+d.join("")+"\""); }},
    {"name": "sstrchar$string$1", "symbols": [{"literal":"\\"}, {"literal":"'"}], "postprocess": function joiner(d) {return d.join('');}},
    {"name": "sstrchar", "symbols": ["sstrchar$string$1"], "postprocess": function(d) {return "'"; }},
    {"name": "strescape", "symbols": [/["\\\/bfnrt]/], "postprocess": id},
    {"name": "strescape", "symbols": [{"literal":"u"}, /[a-fA-F0-9]/, /[a-fA-F0-9]/, /[a-fA-F0-9]/, /[a-fA-F0-9]/], "postprocess": 
        function(d) {
            return d.join("");
        }
        },
    {"name": "instruction", "symbols": ["entity"], "postprocess": ([a]) => ({ type: 'insert', left: a })},
    {"name": "instruction", "symbols": ["entity", "__", "entity", "__", "entity"], "postprocess": ([a,,b,,c]) =>  ({ type: 'connect', left: a, relationship: b, right: c })},
    {"name": "entity", "symbols": ["entity_name"], "postprocess": ([d]) => ({ name: d })},
    {"name": "entity", "symbols": ["entity_name", "_", {"literal":":"}, "_", "entity_id"], "postprocess": ([a,,,,b]) => ({ name: a, mergeOn: 'id', id: b })},
    {"name": "entity", "symbols": ["entity_name", "_", {"literal":":"}, "_", "field_name", {"literal":"="}, "entity_id"], "postprocess": ([a,,,,b,,c]) => ({ name: a, mergeOn: b, id: c })},
    {"name": "entity", "symbols": ["entity_name", "_", "properties"], "postprocess": ([a,,b]) => ({ name: a, properties: b })},
    {"name": "entity", "symbols": ["entity_name", "_", {"literal":":"}, "_", "entity_id", "_", "properties"], "postprocess": ([a,,,,b,,c]) => ({ name: a, mergeOn: 'id', id: b, properties: c })},
    {"name": "entity", "symbols": ["entity_name", "_", {"literal":":"}, "_", "field_name", {"literal":"="}, "entity_id", "_", "properties"], "postprocess": ([a,,,,b,,c,,d]) => ({ name: a, mergeOn: b, id: c, properties: d })},
    {"name": "field_name", "symbols": ["sqstring"], "postprocess": id},
    {"name": "field_name", "symbols": ["dqstring"], "postprocess": id},
    {"name": "field_name", "symbols": ["alnum_word"], "postprocess": id},
    {"name": "entity_id", "symbols": ["sqstring"], "postprocess": id},
    {"name": "entity_id", "symbols": ["dqstring"], "postprocess": id},
    {"name": "entity_id", "symbols": ["alnum_word"], "postprocess": id},
    {"name": "entity_name", "symbols": ["sqstring"], "postprocess": id},
    {"name": "entity_name", "symbols": ["dqstring"], "postprocess": id},
    {"name": "entity_name", "symbols": ["alnum_word"], "postprocess": id},
    {"name": "properties", "symbols": [{"literal":"("}, "_", "property_list", "_", {"literal":")"}], "postprocess": ([,,p]) => p.reduce((a, cv) => { a[cv[0]] = [cv[1], cv[2], cv[3]]; return a; }, {})},
    {"name": "property_list", "symbols": ["property"]},
    {"name": "property_list", "symbols": ["property", "_", {"literal":","}, "_", "property_list"], "postprocess": ([a,,,,b]) => [a].concat(b)},
    {"name": "property", "symbols": ["property_name", "_", {"literal":":"}, "_", "property_value"], "postprocess": ([a,,,,b]) => [a, '=', b]},
    {"name": "property", "symbols": ["property_name", "_", "property_operator", "_", "property_value"], "postprocess": ([a,,b,,c]) => [a, b, c, 0]},
    {"name": "property", "symbols": ["property_name", "_", {"literal":"("}, "_", "property_default", "_", {"literal":")"}, "_", "property_operator", "_", "property_value"], "postprocess": ([a,,,,b,,,,c,,d]) => [a, c, d, b]},
    {"name": "property_operator", "symbols": [/[-+\/*]/, {"literal":"="}], "postprocess": v => v.join('')},
    {"name": "property_name", "symbols": ["alnum_word"], "postprocess": id},
    {"name": "property_name", "symbols": ["dqstring"], "postprocess": id},
    {"name": "property_name", "symbols": ["sqstring"], "postprocess": id},
    {"name": "property_value", "symbols": ["alnum_word"], "postprocess": id},
    {"name": "property_value", "symbols": ["dqstring"], "postprocess": id},
    {"name": "property_value", "symbols": ["sqstring"], "postprocess": id},
    {"name": "property_default", "symbols": ["alnum_word"], "postprocess": id},
    {"name": "property_default", "symbols": ["dqstring"], "postprocess": id},
    {"name": "property_default", "symbols": ["sqstring"], "postprocess": id},
    {"name": "word$ebnf$1", "symbols": [/[^ \t]/]},
    {"name": "word$ebnf$1", "symbols": ["word$ebnf$1", /[^ \t]/], "postprocess": function arrpush(d) {return d[0].concat([d[1]]);}},
    {"name": "word", "symbols": ["word$ebnf$1"], "postprocess": function(d) {return d[0].join(""); }},
    {"name": "alnum_word$ebnf$1", "symbols": [/[-_A-Za-z0-9.,]/]},
    {"name": "alnum_word$ebnf$1", "symbols": ["alnum_word$ebnf$1", /[-_A-Za-z0-9.,]/], "postprocess": function arrpush(d) {return d[0].concat([d[1]]);}},
    {"name": "alnum_word", "symbols": ["alnum_word$ebnf$1"], "postprocess": function(d) {return d[0].join(""); }}
]
  , ParserStart: "instruction"
}
if (typeof module !== 'undefined'&& typeof module.exports !== 'undefined') {
   module.exports = grammar;
} else {
   window.grammar = grammar;
}
})();
