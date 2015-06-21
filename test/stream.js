var fs = require('fs')
var go = require('go-async')
var should = require('should')
var Stream = require('../stream')

describe('Easy streaming', function() {
  it('Sync streaming', function() {
    var s = new Stream(function*(write) {
      yield write(1)
      yield write(2)
      yield write(3)
    })

    s.read().value.should.equal(1)
    s.read().value.should.equal(2)
    s.read().value.should.equal(3)
    should(s.read().value).equal(undefined)
  })

  it('Error handling', function(done) {
    var input = new Stream(function*(write) {
      yield write(yield Promise.resolve(1))
      yield write(2)
      yield write(3)
    })

    var output = new Stream(function*(write) {
      try {
        yield write(1 + (yield input.read()))
        yield write(1 + (yield input.read()))
        throw new Error('ups')
      } finally {
        input.close()
      }
    })

    go(function*() {
      var x = yield output.read()
      var y = yield output.read()

      x.should.equal(2)
      y.should.equal(3)

      // // This doesn't work, why?
      // (yield output.read()).should.equal(2)
      // (yield output.read()).should.equal(3)

      try {
        yield output.read()
        throw new Error('Should fail before')
      } catch(e) {
        e.should.match(/ups/)
        input.closed.should.be.true
      }
    }).get(done)
  })

  it('Integration test', function(done) {
    var file = fs.createReadStream(__filename)
    var stream = Stream.sanitize(file)
    Stream.buffer(stream, {encoding: 'utf8'}).get(function(err, str) {
      if (err) return done(err)
      str.should.match(/Integration test/)
      done()
    })
  })
})