var Bench = require('benchmark')
var assert = require('assert')
var fs = require('fs')
var Stream = require('../stream')

function makeArray(len) {
  var ret = []
  for(var i = 0; i < len; i++) {
    ret.push(1)
  }
  return ret
}

var suite = new Bench.Suite

var array_10 = makeArray(10)
var array_100 = makeArray(100)
var array_1000 = makeArray(1000)

function arrayStream(arr) {
  return new Stream(function*(write) {
    for(var i = 0; i < arr.length; i++) {
      yield write(arr[i])
    }
  })
}

suite.add('Sync streaming of 10 element array', function() {
  var stream = arrayStream(array_10)
  var x, sum = 0
  while (x = stream.read().value) {
    sum += x
  }
  assert.equal(sum, 10)
})

suite.add('Sync streaming of 100 element array', function() {
  var stream = arrayStream(array_100)
  var x, sum = 0
  while (x = stream.read().value) {
    sum += x
  }
  assert.equal(sum, 100)
})

// ;(function() {
//   var start = Date.now()
//   var buf = ''
//   var stream = fs.createReadStream(__filename)
//   stream.setEncoding('utf8')
//   stream.on('data', function(str) {
//     buf += str
//   }).on('close', function() {
//     var end = Date.now()
//     assert(/native/.test(buf))
//     console.log(end - start)
//   })
// })()

// suite.add('native stream consuming', function(deferred) {
//   var stream = fs.createReadStream(__filename)
//   var buf = ''
//   stream.setEncoding('utf8')
//   stream.on('data', function(str) {
//     buf += str
//   }).on('close', function() {
//     assert(/native/.test(buf))
//     deferred.resolve()
//   })
// }, {
//   defer: true
// })

// suite.add('easy stream overhead', function(deferred) {
//   var stream = fs.createReadStream(__filename)
//   Stream.buffer(Stream.sanitize(stream), {encoding: 'utf8'}).get(function(err, buf) {
//     if (err) return deferred.reject(err)
//     assert(/native/.test(buf))
//     deferred.resolve()
//   })
// }, {
//   defer: true
// })

// suite.add('read file', function(deferred) {
//   fs.readFile(__filename, 'utf8', function(err, buf) {
//     assert(/native/.test(buf))
//     deferred.resolve()
//   })
// }, {
//   defer: true
// })

suite.on('cycle', function(ev, bench) {
  console.log(String(ev.target))
})

suite.run({async: true})