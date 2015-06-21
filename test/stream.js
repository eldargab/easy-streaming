var fs = require('fs')
var join = require('path').join
var should = require('should')
var Stream = require('../stream')

describe('Easy streaming', function() {
  it('Integration test', function(done) {
    var file = fs.createReadStream(join(__dirname, 'stream.js'))
    var stream = Stream.sanitize(file)
    Stream.buffer(stream, {encoding: 'utf8'}).get(function(err, str) {
      if (err) return done(err)
      str.should.match(/Integration test/)
      done()
    })
  })
})