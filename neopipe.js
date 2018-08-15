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

const NS_PER_SEC = 1e9;
const compiledGrammar = nearley.Grammar.fromCompiled(grammar);
const compiledSubgrammar = nearley.Grammar.fromCompiled(subgrammar);
const exec = util.promisify(require('child_process').exec);
const cpuCount = os.cpus().length;

function establishConnection() {
  const driver = neo4j.driver('bolt://localhost');
  const session = driver.session();
  return [driver, session]
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
  if (program.verbose > 0) {
    console.error(`! ${instructionLine}`.magenta);
  }
  
  const parser = new nearley.Parser(compiledGrammar);
  parser.feed(instructionLine);
  let instruction = parser.results[0];

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
  .on('--help', function(){
    console.log(`
  Author: Einar Otto Stangvik (twitter.com/einaros)

  License: ISC

  Examples:

    Adding entities, properties and connections:
    ============================================

      Add entity 'Dog' with id='Fido', set age=10: 

        $ neopipe 'Dog:Fido (age:10)'

      Add entity 'Dog' with id='Fido Boy', set age='very old', add connection 'OWNED_BY' to Man with id='Roy': 

        $ neopipe 'Dog:"Fido Boy" (age:"very old") OWNED_BY Man:Roy'

      Add property 'Likes dog'='yes' to existing entity Man with id='Roy': 

        $ neopipe 'Man:Roy ("Likes dog":yes)'
    
    Process lines from standard input:
    ============================================

      Add Thing with id='foo' connected via 'is_not_a' to Thing with id 'baz':

        $ echo foo bar baz | neopipe 'Thing:{1} is_not_a Thing:{3}'

      Add the same things as above, and pass all stdin along to the next piped command:

        $ echo foo bar baz | neopipe -p 'Thing:{1} is_not_a Thing:{3}' | something_else.sh

      Find files in a folder hierarchy, add FILE entities with the filenames as id,
      set a property 'size' on the FILE with the result of a shell executed command (stat) with
      the filename interpolated ({1}), add a connection to a HASH with id set to the result of
      another command (md5):

        $ find node_modules -type f | neopipe 'FILE:"{1}" (size:"{!stat -f %z {1}}") HAS HASH:{!md5 -q {1}}'

      Simulate adding an object 'a' with id='az', which is the result of splitting the third entry
      three times with different delimiters. Show verbose output (repeat 'v' multiple times for more verbose):

        $ echo 'foo bar "b-az,bax"' | neopipe -vt 'a:"{3/,:1/\\-:2}"'

      Add an object 'a', but try to interpolate id from a missing field, so fall back to a default value 'ugh':

        $ echo 'foo bar "b-az,bax"' | neopipe 'a:"{4?ugh}"'

      Add an object 'a', but try to interpolate id from a missing field, fall back to the result of 'uptime':

        $ echo 'foo bar "b-az,bax"' | neopipe 'a:"{4?{!uptime}}"'
    `);
  })
  .parse(process.argv);

const instructionTemplate = program.args.join(' ').trim();
if (instructionTemplate == '') {
  program.help();
  process.exit(1);
}

const limit = promiseLimit(program.jobs);

const timeStarted = process.hrtime();
if (program.testonly) {
  console.error('* Simulation starting - will not commit to Neo4j'.cyan);
}
if (process.stdin.isTTY) {
  // Process single instruction from the command line
  const [driver, session] = establishConnection();
  let inserted = processInstruction(session, instructionTemplate);
  if (!inserted) {
    session.close();
    driver.close();
    process.exit();
  }
  inserted.then(() => {
    session.close();
    driver.close();
    const timeDiff = process.hrtime(timeStarted);
    const timeElapsed = (timeDiff[0] * NS_PER_SEC + timeDiff[1]) / NS_PER_SEC;
    if (program.testonly) console.error(`* Single expression simulated (${timeElapsed.toFixed(2)} sec).`.cyan);
    else console.error(`* Single expression inserted into Neo4j (${timeElapsed.toFixed(2)} sec).`.cyan);
  });
}
else {
  // Process lines from stdin interpolated with an instruction from the command line
  const timeout = ms => new Promise(res => setTimeout(res, ms))
  let readline = require('readline');
  let rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false
  });

  async function processStdinLine(line) {
    const interpolateExp = /(?<!\\)\{(?=[^!]).*/g;
    const executeExp = /(?<!\\)\{!.*/g;
    const escapeExp = /\\([-{}])/g;
    return new Promise(async (accept, reject) => {
      if (program.pipe && !program.pipeInterpolated) console.log(line);
      if (program.verbose > 0) {
        console.error(`> ${line}`.yellow);
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
  
  if (program.verbose > 0) console.error(`* Collecting input from stdin.`.cyan);
  let pendingInput = [];
  rl.on('line', async (line) => {
    pendingInput.push(limit(() => processStdinLine(line)));
  });
  rl.on('close', () => {
    Promise.all(pendingInput).then((pendingInstructions) => {
      const [driver, session] = establishConnection();
      // send all prebuilt linstructions to neo
      if (program.verbose > 0) {
        if (program.testonly) console.error(`* Building expressions.`.cyan);
        else console.error(`* Building expressions and inserting to Neo4j.`.cyan);
      }
      let neoPromises = pendingInstructions.map(instruction => processInstruction(session, instruction));
      neoPromises = neoPromises.filter(i => i);
      Promise.all(neoPromises).then(() => {
        session.close();
        driver.close();
        const timeDiff = process.hrtime(timeStarted);
        const timeElapsed = (timeDiff[0] * NS_PER_SEC + timeDiff[1]) / NS_PER_SEC;
        if (program.testonly) console.error(`* ${neoPromises.length} expressions simulated (${timeElapsed.toFixed(2)} sec).`.cyan);
        else console.error(`* ${neoPromises.length} expressions inserted into Neo4j (${timeElapsed.toFixed(2)} sec).`.cyan);
      });
    });
  });
}

