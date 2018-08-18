# neopipe #

A simple(ish) tool to pipe stuff into Neo4j.

### Installing ###

`npm install -g neopipe`

## Changelog ##

#### 0.1.7

- Started changelog.
- Removed `-p` and `-i` arguments to piping and interpolated output. Replaced with `-o` option.
- Added -o option to output JSON from both raw Cypher queries and from individual inserts.
- Streamed inserts (`--stream`) will yield write JSON to stdout on the fly. Can be piped to jq (https://stedolan.github.io/jq/) or whatever.
- The end query mode can now be used to make rar cypher queries, if the main expression is skipped. See examples in `--help` / README.

## Usage ##

__Note:__ This file (and --help) will be the only updated sources on how to use Neopipe. Any example video can and will be outdated.

First you need Neo4j running locally with no password. Yes, that should be fixed in the future. Yes, it should be configurable from the command line.

For now, if you don't have Neo4j, getting the required stuff up and running with Docker will look something like:

```
mkdir -p neo4j/data
docker run \
    --publish=7474:7474 --publish=7687:7687 \
    --volume=$PWD/neo4j/data:/data \
    --env=NEO4J_AUTH=none \
    neo4j
```

.. at which point a web interface should be available at http://localhost:7474/. Also any data for that specific Neo4j instance will be put in the current folder's newly created subfolder `neo4j/`. If you're coming back to a pre-existing forensic project directory, you'll find that you can continue where you left off. Neat and contained.

See also this thread for examples I slapped together while feverishly developing the tool: https://twitter.com/einaros/status/1029385058078076928

As for how to use `neopipe` yourseelf: Here's the output from `neopipe -h`:

```
Usage: neopipe [options]

Pipe stuff to Neo4j

Options:

	-V, --version                output the version number
	-b, --keep-blank             Keep expressions with blank ids.
	-s, --separator <separator>  Custom field separator for stdin interpolation. (default:  )
	-q, --quote <quote>          Custom quote char for stdin interpolation. (default: ")
	-j, --jobs <jobs>            Limit number of concurrent jobs. (default: 8)
	-o, --output <output type>   Output type:
		| none: No output
		| pipe: Pipe input to output
		| interpolated: Print completed expressions
		| json: Return JSON output from Neo4j inserts
		| (default: No output)
	-t, --testonly               Simulate insertion.
	-v, --verbose                Increase verbosity.
	-e, --end-query <query>      Raw CYPHER query to run after the sequence has finished. (default: )
	-r, --show-results           Write query results to stdout (as JSON).
	--neohost <host>             Neo4j hostname. (default: localhost)
	--neouser <user>             Neo4j username. (default: null)
	--neopasswd <passwd>         Neo4j password. (default: null)
	--stream                     Stream insertion to Neo4j. Disable transaction logic, that is.
	--shell <shell>              Shell for interpolated execution. (default: /bin/sh)
	-h, --help                   output usage information
```

## Examples ##

###	Adding entities, properties and connections:

Add entity 'Dog' with id='Fido', set age=10:

```
$ neopipe 'Dog:Fido (age:10)'
```

Add entity 'Dog' with id='Fido Boy', set age='very old', add connection 'OWNED_BY' to Man with id='Roy':

```
$ neopipe 'Dog:"Fido Boy" (age:"very old") OWNED_BY Man:Roy'
```

Add property 'Likes dog'='yes' to existing entity Man with id='Roy':

```
$ neopipe 'Man:Roy ("Likes dog":yes)'
```

### Process lines from standard input ###

Add Thing with id='foo' connected via 'is_not_a' to Thing with id 'baz':

```
$ echo foo bar baz | neopipe 'Thing:{1} is_not_a Thing:{3}'
```

Add the same things as above, and pass all stdin along to the next piped command:

```
$ echo foo bar baz | neopipe -o pipe 'Thing:{1} is_not_a Thing:{3}' | something_else.sh
```

Find files in a folder hierarchy, add FILE entities with the filenames as id,
set a property 'size' on the FILE with the result of a shell executed command (stat) with
the filename interpolated ({1}), add a connection to a HASH with id set to the result of
another command (md5):

```
$ find node_modules -type f | neopipe 'FILE:"{1}" (size:"{!stat -f %z {1}}") HAS HASH:{!md5 -q {1}}'
```

Simulate adding an entity 'a' with id='az', which is the result of splitting the third entry
three times with different delimiters. Show verbose output (repeat 'v' multiple times for more verbose):

```
$ echo 'foo bar "b-az,bax"' | neopipe -vt 'a:"{3/,:1/\-:2}"'
```

As above, but make the entity id a sha1 hash of the interpolated value:

```
$ echo 'foo bar "b-az,bax"' | neopipe -vt 'a:"{#3/,:1/\\-:2}"'
```

As above, but make the entity id a sha1 hash of the uppercase'd interpolated value:

```
$ echo 'foo bar "b-az,bax"' | neopipe -vt 'a:"{##3/,:1/\\-:2}"'
```

Add an entity 'a', but try to interpolate id from a missing field, so fall back to a default value 'ugh':

```
$ echo 'foo bar "b-az,bax"' | neopipe 'a:"{4?ugh}"'
```

Add an entity 'a', but try to interpolate id from a missing field, fall back to the result of 'uptime':

```
$ echo 'foo bar "b-az,bax"' | neopipe 'a:"{4?{!uptime}}"'
```

### Executing raw Cypher queries:

Detach and delete all entities:

```
$ neopipe -e 'MATCH (n) DETACH DELETE (n)'
```

Use the JSON output mode, no input expression and an end query to extract existing entity relationships (based on the hamming distance example below) and parse the output with jq (https://stedolan.github.io/jq/):

```
$ neopipe -o json -e 'MATCH p=()-[r:LOOKS_LIKE]->() RETURN p' | jq .
```

### Other / advanced examples:

Add entities for all images in a hierarchy, calculating perceptual hashes for each one, storing
bitwise pHash as an entity property, finally run raw Cypher query to find images with low
Hamming distance, based on the hashes, and create relationships between them:

```
$ find *.jpg | neopipe -v 'Image:"{}" (phash:{!imagehash -b "{}"})' -r -e '
MATCH (a:Image)
MATCH (b:Image)
WITH a, b, apoc.text.hammingDistance(a.phash, b.phash) AS c
WHERE id(a) < id(b) AND c <= 10
MERGE (a)-[r:LOOKS_LIKE]-(b)
SET r.distance = c
RETURN a, b, r'
```
Re: above example, see also https://vimeo.com/285498808/8e5eb49ffd and find the simple imagehash tool at 
https://gist.github.com/einaros/a9f4d0d5f0f7f69cb70b0f005fc9ae29.

## License ##

ISC

## Author ##

Einar Otto Stangvik (https://twitter.com/einaros)
