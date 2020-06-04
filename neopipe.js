#!/usr/bin/env node
/*
 * neopipe - Pipe stuff to Neo4j
 * Author: Einar Otto Stangvik (https://twitter.com/einaros)
 * License: ISC
 * Web: https://github.com/einaros/neopipe
 */

const program = require('commander');
const colors = require('colors');
const parse = require('csv-parse/lib/sync');
const nearley = require('nearley');
const grammar = require('./grammar.js');
const subgrammar = require('./subgrammar.js');
const neo4j = require('neo4j-driver');
const util = require('util');
const stringReplaceAsync = require('string-replace-async');
const promiseLimit = require('promise-limit');
const sha1 = require('sha1');
const os = require('os');
const EventEmitter = require('events');

const NS_PER_SEC = 1e9;
const compiledGrammar = nearley.Grammar.fromCompiled(grammar);
const compiledSubgrammar = nearley.Grammar.fromCompiled(subgrammar);
const exec = util.promisify(require('child_process').exec);
const cpuCount = os.cpus().length;
const timeStarted = process.hrtime();

const outputType = {
  none: 'No output',
  pipe: 'Pipe input to output',
  interpolated: 'Print completed expressions',
  json: 'Return JSON output from Neo4j inserts', 
};

program
  .version(require('./package.json').version)
  .description(require('./package.json').description)
  .option('-s, --separator <separator>', 'Custom field separator for stdin interpolation.', ' ')
  .option('-q, --quote <quote>', 'Custom quote char for stdin interpolation.', '"')
  .option('-j, --jobs <jobs>', 'Limit number of concurrent jobs.', cpuCount)
  .option('-o, --output <output type>', 
    `Output type:\n\t| ${Object.keys(outputType).map(o => o + ': ' + outputType[o]).join('\n\t| ')}\n\t|`, 
    new RegExp(`^(${Object.keys(outputType).join('|')})$`, 'i'), 
    outputType.none)
  .option('-t, --testonly', 'Simulate insertion.')
  .option('-v, --verbose', 'Increase verbosity.', (v, total) => total + 1, 0)
  .option('-e, --end-query <query>', 'Raw CYPHER query to run after the sequence has finished.', '')
  .option('-r, --show-results', 'Write end query results to stdout (as JSON).')
  .option('--neohost <host>', 'Neo4j hostname.', 'localhost')
  .option('--neouser <user>', 'Neo4j username.', null)
  .option('--neopasswd <passwd>', 'Neo4j password.', null)
  .option('--stream', 'Stream insertion to Neo4j. Disable transaction logic, that is.')
  .option('--stream-flush <count>', '(if --stream) Flush stream buffer every N expressions. Useful for fast-running pipes that hog the queue. 0 to disable.', 0, parseInt)
  .option('--shell <shell>', 'Shell for interpolated execution.', '/bin/sh')
  .on('--help', function(){ console.error(require('./help.js')); })
  .parse(process.argv);

for (let key in outputType) outputType[key] = key; // don't need the description, only the keys
const instructionTemplate = program.args.join(' ').trim();
const hasInstruction = instructionTemplate !== '';
const useTransaction = !program.stream;

if (program.verbose > 0) console.error(`* Input: ${!process.stdin.isTTY ? 'stdin' : 'command-line argument'}. Output: ${program.output}.`.cyan);
if (program.testonly) console.error('* Simulation starting - will not commit to Neo4j'.cyan);

function establishConnection() {
  if (program.testonly) return Promise.resolve([null, null, null]);
  return new Promise((accept, reject) => {
    if (program.verbose > 0) console.error(`* Connecting to Neo4j @ ${program.neohost}`.cyan);
    let auth;
    if (program.neouser) {
      auth = neo4j.auth.basic(program.neouser, program.neopasswd);
    }
    const driver = neo4j.driver(`bolt://${program.neohost}`, auth);
    const session = driver.session();
    const tx = useTransaction ? session.beginTransaction() : null;
    let interval = setInterval(() => {
      if (session._open) {
        clearInterval(interval);
        accept([driver, session, tx]);
      }
    }, 100);
  });
}

function unescapeSlashes(s) {
  if (!s) return s;
  return s.replace(/\\\\/g, '\\');
}

function escapeSlashes(s) {
  if (!s) return s;
  return s.replace(/\\/g, '\\\\');
}

function unescScript(s) {
  return s.replace(/\\(.)/g, '$1');
}

function trimLines(s) {
  return s.split('\n').map(l => l.trim()).filter(l => l.length > 0).join('\n');
}

function indentLines(s, n) {
  return s.split('\n').map(l => Array(n + 1).join(' ') + l).join('\n');
}

function grabUntilEndBrace(s, start) {
  let escaped = false;
  let balance = 1;
  let i, l;
  for (i = start+1, l = s.length; i < l; ++i) {
    let c = s[i];
    if (c == '\\') {
      escaped = !escaped;
      continue;
    }
    else if (c == '{' && !escaped) balance += 1;
    else if (c == '}' && !escaped) { 
      balance -= 1;
      if (balance == 0)  break;
    }
    escaped = false;
  }
  return [start+1, i];
}

function parseEntity(prefix, entity, preferSetProps, keepBlank) {
  let entityName = escapeSlashes(entity.name);
  let entityMergeOn = escapeSlashes(entity.mergeOn || 'id');
  let entityId = escapeSlashes(entity.id || null);
  let entityMergeProperties = [];
  let entitySetProperties = '';

  if (!entityId && !keepBlank) {
    return [null, null, null];
  }
  else if (entityId || preferSetProps) {
    // We've got an id, so bump all other properties to set props
    entitySetProperties = []
    if (entityId) entityMergeProperties = `{ \`${entityMergeOn}\`: "${entityId}" }`;
    if (entity.properties) {
      for (let tuple of Object.entries(entity.properties)) {
        // todo: this is really rather hairy, and would ideally be fully handled by the grammar instead.
        let [propertyName, [propertyOperator, propertyValue, propertyDefault]] = tuple;
        propertyName = escapeSlashes(propertyName);
        propertyOperator = propertyOperator.replace(/[^-\/+=*]/g, '');
        if (/[-+\/*]=/.test(propertyOperator)) {
          propertyValue = parseFloat(propertyValue);
          entitySetProperties.unshift(`ON CREATE SET ${prefix}.\`${propertyName}\` = ${propertyDefault}`);
          entitySetProperties.push(`SET ${prefix}.\`${propertyName}\` = ${prefix}.\`${propertyName}\` ${propertyOperator[0]} ${propertyValue}`);
        }
        else {
          propertyValue = `"${escapeSlashes(propertyValue.toString())}"`;
          entitySetProperties.push(`SET ${prefix}.\`${propertyName}\` ${propertyOperator} ${propertyValue}`);
        }
      }
      entitySetProperties = '\n' + entitySetProperties.join('\n');
    }
  }
  else if (entity.properties) {
    // No id, handle the full property set as unique
    for (let tuple of Object.entries(entity.properties)) {
      let [propertyName, [propertyOperator, propertyValue]] = tuple;
      propertyName = escapeSlashes(propertyName);
      propertyOperator = propertyOperator.replace(/[^\-+=*]/g, '');
      if (typeof propertyValue == 'string') propertyValue = escapeSlashes(propertyValue);
      entityMergeProperties.push(`\`${propertyName}\`: "${propertyValue}"`);
    }
    entityMergeProperties = entityMergeProperties.join(',');
    if (entityMergeProperties.length > 0) entityMergeProperties = `{ ${entityMergeProperties} }`;
  }

  return [entityName, entityMergeProperties, entitySetProperties];
}

function processInstruction(session, instructionLine) {
  if (instructionLine == null) return null;
  if (program.verbose > 0) console.error(`! ${instructionLine}`.magenta);
  
  const parser = new nearley.Parser(compiledGrammar);
  parser.feed(escapeSlashes(instructionLine));
  let instruction = parser.results[0];
  if (!instruction) {
    throw new Error(`Expression parsing failed: ${instructionLine}`);
  }

  let [leftName, leftMergeProperties, leftSetProperties] = parseEntity('a', instruction.left, false, false)
  if (!leftName) {
    console.warn(`* Skipping expression with empty id: ${instructionLine}`.yellow);
    return null;
  }

  let promise = null;
  if (instruction.type == 'connect') {
    let [rightName, rightMergeProperties, rightSetProperties] = parseEntity('b', instruction.right, false, false)
    if (!rightName) {
      console.warn(`* Skipping expression with empty id: ${instructionLine}`.yellow);
      return null;
    }
    let [relName, relMergeProperties, relSetProperties] = parseEntity('ab', instruction.relationship, true, true)
    let cypher = `
      MERGE (a:\`${leftName}\` ${leftMergeProperties}) ${leftSetProperties}
      MERGE (b:\`${rightName}\` ${rightMergeProperties}) ${rightSetProperties}
      MERGE (a)-[ab:\`${relName}\` ${relMergeProperties}]-(b) ${relSetProperties}
      RETURN a, b, ab
    `;
    if (program.verbose > 1) console.error(indentLines(trimLines(cypher), 2).green);
    if (!program.testonly) promise = session.run(cypher);
  }
  else if (instruction.type == 'insert') {
    let cypher = `
      MERGE (a:\`${leftName}\` ${leftMergeProperties}) ${leftSetProperties}
      RETURN a
    `;
    if (program.verbose > 1) console.error(indentLines(trimLines(cypher), 2).green);
    if (!program.testonly) promise = session.run(cypher);
  }
  if (!useTransaction && program.output == outputType.json) {
    // streaming (no transaction) json output happens here
    promise.then(r => { console.log(JSON.stringify(r.records)); });
  }
  return promise;
}

async function processStdinLine(line) {
  if (program.output == outputType.pipe) console.log(line);
  if (program.verbose > 0) console.error(`> ${line}`.white);
  
  // parse input as csvish
  line = parse(line, { delimiter: program.separator, quote: program.quote })[0];
  let lineInstruction = instructionTemplate;
  // output taint, to disable interpolation / execution of stdin stuff
  let taintArray = new Array(lineInstruction.length).fill(0);
  // interpolate stdin lines
  const interpolateExp = /(?<!\\)\{(?=[^!]).*/g;
  while (interpolateExp.test(lineInstruction)) {
    lineInstruction = lineInstruction.replace(interpolateExp, (m, index, original) => { 
      let [start, end] = grabUntilEndBrace(original, index);
      let expression = original.slice(start, end).trim();
      if (taintArray[index] > 0) {
        if (program.verbose > 3) console.error('Tainted interpolate:', expression);
        taintArray.splice(index, 0, 2); // add a single tainted escape char
        return '\\' + original.slice(index)
      }
      if (program.verbose > 2) console.error('Interpolate:', expression);
      const interpolateParser = new nearley.Parser(compiledSubgrammar);
      let res;
      if (end == start) {
        res = {optional: '', hashed: false, upcase: false, field: { start: 1, end: -1 }};
      }
      else {
        interpolateParser.feed(expression);
        res = interpolateParser.results[0];
        if (!res) {
          throw new Error(`Substitution expression parsing failed: ${expression}`);
        }
      }
      if (program.verbose > 2) console.error('Interpolate result:', JSON.stringify(res));
      let value = line.slice(res.field.start-1, res.field.end == -1 ? line.length : res.field.end).join(program.separator);
      if (value.length == 0) return res.optional + original.slice(end+1);
      for (let sub of res.field.sub || []) {
        let split = parse(value, { delimiter: sub.subdelim })[0];
        let subStart = sub.start-1;
        let subEnd = sub.end == -1 ? split.length : sub.end;
        if (subStart >= split.length) {
          taintArray.splice(index, end + 1 - index, ...new Array(res.optional.length).fill(1));
          return res.optional + original.slice(end + 1);
        }
        value = split.slice(subStart, subEnd).join(sub.subdelim);
      }
      if (res.upcase) value = value.toUpperCase();
      if (res.hashed) value = sha1(value);
      taintArray.splice(index, end + 1 - index, ...new Array(value.length).fill(1));
      return value + original.slice(end+1);
    });
    if (program.verbose > 3) {
      console.error('Taint status:', lineInstruction.split('').map((c, i) => {
        if (taintArray[i] == 0) return c.green;
        if (taintArray[i] == 1) return c.red;
        if (taintArray[i] == 2) return c.yellow;
      }).join(''));
    }
  }
  // execute script instructions
  const executeExp = /(?<!\\)\{!.*/g;
  let offset = 0;
  while (executeExp.test(lineInstruction)) {
    let nextOffset = 0;
    let substituted = await stringReplaceAsync(lineInstruction.slice(offset), executeExp, async (m, index, original) => { 
      nextOffset = offset + index;
      let [start, end] = grabUntilEndBrace(original, index);
      let shellScript = unescScript(original.slice(start+1, end).trim());
      if (taintArray[offset + index] > 0) {
        if (program.verbose > 3) console.error('Tainted inline script blocked:', shellScript);
        taintArray.splice(offset + index, 0, 2); // add a single tainted escape char
        return '\\' + original.slice(index)
      }
      if (program.verbose > 2) console.error('Inline script:', shellScript);
      const { stdout, stderr } = await exec(shellScript, {shell: program.shell}); 
      if (program.verbose > 2) {
        console.error('Stdout:', stdout.toString().trim());
        console.error('Stderr:', stderr.toString().trim());
      }
      const stdoutLine = stdout.toString().trim().replace(/\n/g, ' ');
      taintArray.splice(offset + index, end + 1 - (offset + index), ...new Array(stdoutLine.length).fill(1)); // adjust taint
      return stdoutLine + original.slice(end+1);
    });
    lineInstruction = lineInstruction.slice(0, offset) + substituted;
    if (program.verbose > 3) {
      console.error('Taint status:', lineInstruction.split('').map((c, i) => {
        if (taintArray[i] == 0) return c.green;
        if (taintArray[i] == 1) return c.red;
        if (taintArray[i] == 2) return c.yellow;
      }).join(''));
    }
    offset = nextOffset;
  }
  // remove chars added due to taint protection
  lineInstruction = lineInstruction.split('').filter((c, i) => taintArray[i] < 2).join('');
  // process the fully interpolated instruction
  if (program.output == outputType.interpolated) console.log(lineInstruction);
  return lineInstruction;
}

function processPendingInserts(driver, session, tx, pendingNeoPromises, flushedCount) {
  let exitCode = 0;
  Promise.all(pendingNeoPromises)
    .then((results) => {
      results = results.filter(r => r); // ignore empty results
      // Detect errors
      for (let result of results) {
        if (result.error || result.message) throw result; 
      }
      // Presumably no errors, try commiting
      return (tx ? tx.commit() : Promise.resolve())
        .then(() => {
          const timeDiff = process.hrtime(timeStarted);
          const timeElapsed = (timeDiff[0] * NS_PER_SEC + timeDiff[1]) / NS_PER_SEC;
          if (program.testonly) console.error(`* ${flushedCount + results.length} expressions simulated (${timeElapsed.toFixed(2)} sec).`.cyan);
          else console.error(`* ${flushedCount + results.length} expressions inserted into Neo4j (${timeElapsed.toFixed(2)} sec).`.cyan);
          return Promise.resolve();
        })
        .then(() => {
          if (useTransaction && program.output == outputType.json) {
            // non-streaming (transaction-based) json output happens here
            for (let r of results) {
              console.log(JSON.stringify(r.records));
            }
          }
          if (program.endQuery) {
            if (program.verbose > 0) console.error(`* Executing end query.`.cyan);
            if (program.verbose > 1) console.error(indentLines(trimLines(program.endQuery), 2).green);
            if (!program.testonly) {
              return session.run(program.endQuery).then(r => {
                if (program.showResults || program.output == outputType.json) {
                  console.log(JSON.stringify(r.records));
                }
              });
            }
          }
          return Promise.resolve();
        });
    })
    .catch((e) => {
      if (e.error) console.error(`* Error(s): ${e.error}`.red)
      console.error(`* Stack trace: ${e.stack}`.red)
      console.error(`* In the case of dubious 'transaction' errors, check that the database is running and that connection details are correct.`.yellow)
      exitCode = 1;
    })
    .finally(() => {
      session.close();
      driver.close();
      if (exitCode != 0) process.exit(exitCode);
    });
}

establishConnection().then(([driver, session, tx]) => {
  if (!process.stdin.isTTY) {
    // Process lines from stdin interpolated with an instruction from the command line
    let readline = require('readline');
    let rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: false
    });
    if (program.verbose > 0) console.error(`* Collecting input from stdin. ${useTransaction ? 'Using' : 'Not using'} transaction.`.cyan);
    const limit = promiseLimit(program.jobs);
    let flushedCount = 0;
    let pendingNeoPromises = [];
    rl.on('line', async (line) => {
      if (!hasInstruction) return;

      // Process new input line
      pendingNeoPromises.push(
        limit(() => processStdinLine(line))
          .then(v => processInstruction(tx || session, v))
          .catch(e => e)
      );

      // Streams from fast-running pipes may have to be flushed. Do that here.
      // todo: this code block is a near-duplicate of a block within processPendingInserts, which isn't very tidy
      if (!useTransaction && program.streamFlush > 0 && pendingNeoPromises.length == program.streamFlush) {
        rl.pause();  
        Promise.all(pendingNeoPromises)
          .then((results) => {
            results = results.filter(r => r); // ignore empty results
            // Detect errors
            for (let result of results) {
              if (result.error || result.message) throw result; 
            }
            flushedCount += pendingNeoPromises.length;
            pendingNeoPromises = [];
            rl.resume();
          })
          .catch((e) => {
            console.error(`* Error(s): ${e.stack || e.error}`.red)
            console.error(`* In the case of dubious 'transaction' errors, check that the database is running and that connection details are correct.`.yellow)
            // unlike processPendingInsert, this pre-flush will usually not cause the session and driver to shutdown,
            // but in the case of an error we can't do much else.
            // an option would be to add an argument to make a note of - but not terminate after - streamed inserts
            session.close();
            driver.close();
            process.exit(1);
          });
      }
    });
    rl.on('close', () => processPendingInserts(driver, session, tx, pendingNeoPromises, flushedCount));
  }
  else {
    // Process single instruction from the command line
    if (hasInstruction) processPendingInserts(driver, session, tx, [Promise.resolve().then(() => processInstruction(tx || session, instructionTemplate))], 0);
    else processPendingInserts(driver, session, tx, [], 0);
  }
});
