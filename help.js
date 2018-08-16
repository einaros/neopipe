module.exports = `
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

      Simulate adding an entity 'a' with id='az', which is the result of splitting the third entry
      three times with different delimiters. Show verbose output (repeat 'v' multiple times for more verbose):

        $ echo 'foo bar "b-az,bax"' | neopipe -vt 'a:"{3/,:1/\\-:2}"'

      As above, but make the entity id a sha1 hash of the interpolated value:

        $ echo 'foo bar "b-az,bax"' | neopipe -vt 'a:"{#3/,:1/\\-:2}"'

      As above, but make the entity id a sha1 hash of the uppercase'd interpolated value:

        $ echo 'foo bar "b-az,bax"' | neopipe -vt 'a:"{##3/,:1/\\-:2}"'

      Add an entity 'a', but try to interpolate id from a missing field, so fall back to a default value 'ugh':

        $ echo 'foo bar "b-az,bax"' | neopipe 'a:"{4?ugh}"'

      Add an entity 'a', but try to interpolate id from a missing field, fall back to the result of 'uptime':

        $ echo 'foo bar "b-az,bax"' | neopipe 'a:"{4?{!uptime}}"'
`;
