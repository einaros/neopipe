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
const neo4j = require('neo4j-driver').v1;
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

program
  .version(require('./package.json').version)
  .description(require('./package.json').description)
  .option('-b, --keep-blank', 'Keep expressions with blank ids')
  .option('-s, --separator [separator]', 'Custom field separator for stdin interpolation.', ' ')
  .option('-q, --quote [quote]', 'Custom quote char for stdin interpolation.', '"')
  .option('-p, --pipe', 'Pipe input to output.')
  .option('-j, --jobs [jobs]', 'Limit number of concurrent jobs.', cpuCount)
  .option('-i, --pipe-interpolated', 'Pipe interpolated input to output.')
  .option('-t, --testonly', 'Simulate insertion.')
  .option('-v, --verbose', 'Increase verbosity.', (v, total) => total + 1, 0)
  .option('--neohost [host]', 'Neo4j hostname', 'localhost')
  .option('--neouser [user]', 'Neo4j username', null)
  .option('--neopasswd [passwd]', 'Neo4j password', null)
  .on('--help', function(){ console.log(require('./help.js')); })
  .parse(process.argv);

const instructionTemplate = program.args.join(' ').trim();
if (instructionTemplate == '') {
  program.help();
  process.exit(1);
}

if (program.testonly) console.error('* Simulation starting - will not commit to Neo4j'.cyan);
const [driver, session, tx] = establishConnection();

function establishConnection() {
  if (program.verbose > 0) console.error(`* Connecting to Neo4j @ ${program.neohost}`.cyan);
  let auth;
  if (program.neouser) {
    auth = neo4j.auth.basic(program.neouser, program.neopasswd);
  }
  const driver = neo4j.driver(`bolt://${program.neohost}`, auth);
  const session = driver.session();
  const tx = session.beginTransaction();
  return [driver, session, tx];
}

function unesc(s) {
  return s.replace(/\\(.)/g, '$1');
}

function trimLines(s) {
  return s.split('\n').map(l => l.trim()).join('\n');
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

function processInstruction(session, instructionLine) {
  if (instructionLine == null) return null;
  if (program.verbose > 0) {
    console.error(`! ${instructionLine}`.magenta);
  }
  
  const parser = new nearley.Parser(compiledGrammar);
  parser.feed(instructionLine);
  let instruction = parser.results[0];

  if (!instruction) {
    throw new Error(`Expression parsing failed: ${instructionLine}`);
  }

  let leftName = instruction.left.name;
  let leftMergeOn = instruction.left.mergeOn || 'id';
  let leftId = instruction.left.id || null;
  let leftMergeProperties = [];
  let leftSetProperties = '';

  if (!leftId && !program.keepBlank) {
    console.warn(`* Skipping expression with empty id: ${instructionLine}`.yellow);
    return null;
  }
  else if (leftId) {
    // We've got an id, so bump all other properties to set props
    leftSetProperties = []
    leftMergeProperties = `{ \`${leftMergeOn}\`: "${leftId}" }`;
    if (instruction.left.properties) {
      for (let tuple of Object.entries(instruction.left.properties)) {
        leftSetProperties.push(`SET a.\`${tuple[0]}\` = "${tuple[1]}"`);
      }
      leftSetProperties = '\n' + leftSetProperties.join('\n');
    }
  }
  else if (instruction.left.properties) {
    // No id, handle the full property set as unique
    for (let tuple of Object.entries(instruction.left.properties)) {
      leftMergeProperties.push(`\`${tuple[0]}\`: "${tuple[1]}"`);
    }
    leftMergeProperties = leftMergeProperties.join(',');
    if (leftMergeProperties.length > 0) leftMergeProperties = `{ ${leftMergeProperties} }`;
  }

  if (instruction.type == 'connect') {
    let rightName = instruction.right.name;
    let rightMergeOn = instruction.right.mergeOn || 'id';
    let rightId = instruction.right.id || null;
    let rightMergeProperties = [];
    let rightSetProperties = '';

    if (!rightId && !program.keepBlank) {
      console.warn(`* Skipping expression with empty id: ${instructionLine}`.yellow);
      return null;
    }
    else if (rightId) {
      // We've got an id, so bump all other properties to set props
      rightSetProperties = []
      rightMergeProperties = `{ \`${rightMergeOn}\`: "${rightId}" }`;
      if (instruction.right.properties) {
        for (let tuple of Object.entries(instruction.right.properties)) {
          rightSetProperties.push(`SET b.\`${tuple[0]}\` = "${tuple[1]}"`);
        }
        rightSetProperties = '\n' + rightSetProperties.join('\n');
      }
    }
    else if (instruction.right.properties) {
      // No id, handle the full property set as unique
      for (let tuple of Object.entries(instruction.right.properties)) {
        rightMergeProperties.push(`\`${tuple[0]}\`: "${tuple[1]}"`);
      }
      rightMergeProperties = rightMergeProperties.join(',');
      if (rightMergeProperties.length > 0) rightMergeProperties = `{ ${rightMergeProperties} }`;
    }

    let relationship = instruction.relationship;
    let cypher = `
      MERGE (a:\`${leftName}\` ${leftMergeProperties}) ${leftSetProperties}
      MERGE (b:\`${rightName}\` ${rightMergeProperties}) ${rightSetProperties}
      CREATE UNIQUE (a)-[ab:\`${relationship}\`]-(b)
      RETURN ab
    `;
    if (program.verbose > 1) console.error(indentLines(trimLines(cypher), 2).green);
    if (!program.testonly) return session.run(cypher);
  }
  else if (instruction.type == 'insert') {
    let cypher = `
      MERGE (a:\`${leftName}\` ${leftMergeProperties}) ${leftSetProperties}
      RETURN a
    `;
    if (program.verbose > 1) console.error(indentLines(trimLines(cypher), 2));
    if (!program.testonly) return session.run(cypher);
  }
  return null;
}

async function processStdinLine(line) {
  const interpolateExp = /(?<!\\)\{(?=[^!]).*/g;
  const executeExp = /(?<!\\)\{!.*/g;
  const escapeExp = /\\([-{}])/g;
  return new Promise(async (accept, reject) => {
    if (program.pipe && !program.pipeInterpolated) console.log(line);
    if (program.verbose > 0) {
      console.error(`> ${line}`.white);
    }
    line = parse(line, { delimiter: program.separator, quote: program.quote })[0];
    // interpolate stdin lines
    let lineInstruction = instructionTemplate;
    while (interpolateExp.test(lineInstruction)) {
      lineInstruction = lineInstruction.replace(interpolateExp, (m, index, original) => { 
        let [start, end] = grabUntilEndBrace(original, index);
        let expression = original.slice(start, end).trim();
        if (program.verbose > 2) console.error('Interpolate:', expression);
        const interpolateParser = new nearley.Parser(compiledSubgrammar);
        interpolateParser.feed(expression);
        let res = interpolateParser.results[0];
        if (program.verbose > 2) console.error('Interpolate result:', JSON.stringify(res));
        let value = line.slice(res.field.start-1, res.field.end == -1 ? line.length : res.field.end).join(program.separator);
        if (value.length == 0) return res.optional + original.slice(end+1);
        for (let sub of res.field.sub || []) {
          let split = parse(value, { delimiter: sub.subdelim })[0];
          let subStart = sub.start-1;
          let subEnd = sub.end == -1 ? split.length : sub.end;
          if (subStart >= split.length) return res.optional + original.slice(end + 1);
          value = split.slice(subStart, subEnd).join(sub.subdelim);
        }
        if (res.upcase) value = value.toUpperCase();
        if (res.hashed) value = sha1(value);
        return  value + original.slice(end+1);
      });
    }
    // execute script instructions
    while (executeExp.test(lineInstruction)) {
      lineInstruction = await stringReplaceAsync(lineInstruction, executeExp, async (m, index, original) => { 
        let [start, end] = grabUntilEndBrace(original, index);
        let shellScript = unesc(original.slice(start+1, end).trim());
        if (program.verbose > 2) console.error('Inline script:', shellScript);
        const { stdout, stderr } = await exec(shellScript); 
        if (program.verbose > 2) {
          console.error('Stdout:', stdout.toString().trim());
          console.error('Stderr:', stderr.toString().trim());
        }
        const stdoutLine = stdout.toString().trim().replace(/\n/g, ' ');
        return  stdoutLine + original.slice(end+1);
      });
    }
    // unescape
    lineInstruction = lineInstruction.replace(escapeExp, '$1');
    // process the fully interpolated instruction
    if (program.pipeInterpolated) console.log(lineInstruction);
    accept(lineInstruction);
  });
}


function processPendingInserts(pendingNeoPromises) {
  let exitCode = 0;
  Promise.all(pendingNeoPromises)
    .then((results) => {
      results = results.filter(r => r);
      // Detect errors
      for (let result of results) {
        if (result.error || result.message) throw result; 
      }
      // Presumably no errors, try commiting
      return tx.commit()
        .then(() => {
          const timeDiff = process.hrtime(timeStarted);
          const timeElapsed = (timeDiff[0] * NS_PER_SEC + timeDiff[1]) / NS_PER_SEC;
          if (program.testonly) console.error(`* ${results.length} expressions simulated (${timeElapsed.toFixed(2)} sec).`.cyan);
          else console.error(`* ${results.length} expressions inserted into Neo4j (${timeElapsed.toFixed(2)} sec).`.cyan);
        });
    })
    .catch((e) => {
      console.log(`* Error(s) during Neo4j operation: ${e.message || e.error}`.red)
      console.log(`* In the case of dubious errors, check that the database is running and that connection details are correct.`.yellow)
      exitCode = 1;
    })
    .finally(() => {
      session.close();
      driver.close();
      process.exit(exitCode);
    });
}

if (!process.stdin.isTTY) {
  // Process lines from stdin interpolated with an instruction from the command line
  let readline = require('readline');
  let rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false
  });
  if (program.verbose > 0) console.error(`* Collecting input from stdin.`.cyan);
  const limit = promiseLimit(program.jobs);
  let pendingNeoPromises = [];
  rl.on('line', async (line) => {
    pendingNeoPromises.push(
      limit(() => processStdinLine(line))
        .then(v => processInstruction(tx, v))
        .catch(e => e)
    );
  });
  rl.on('close', () => processPendingInserts(pendingNeoPromises));
}
else {
  // Process single instruction from the command line
  processPendingInserts([Promise.resolve().then(() => processInstruction(tx, instructionTemplate))]);
}

