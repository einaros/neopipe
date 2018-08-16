# neopipe #

A simple(ish) tool to pipe stuff into Neo4j.

### Installing ###

`npm install -g neopipe`

## Usage ##

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
	-s, --separator [separator]  Custom field separator for stdin interpolation. (default:  )
	-q, --quote [quote]          Custom quote char for stdin interpolation. (default: ")
	-p, --pipe                   Pipe input to output.
	-j, --jobs [jobs]            Limit number of concurrent jobs. (default: 8)
	-i, --pipe-interpolated      Pipe interpolated input to output.
	-t, --testonly               Simulate insertion.
	-v, --verbose                Increase verbosity.
	--neohost [host]             Neo4j hostname. (default: localhost)
	--neouser [user]             Neo4j username. (default: null)
	--neopasswd [passwd]         Neo4j password. (default: null)
	--stream                     Stream insertion to Neo4j. Disable transaction logic, that is.
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
$ echo foo bar baz | neopipe -p 'Thing:{1} is_not_a Thing:{3}' | something_else.sh
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

## License ##

ISC

## Author ##

Einar Otto Stangvik (https://twitter.com/einaros)
