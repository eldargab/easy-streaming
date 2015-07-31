'use strict'

var go = require('go-async')
var StringDecoder = require('string_decoder').StringDecoder

module.exports = Stream

function Stream(block) {
  this.block = block
  this.started = false
  this.closed = false
}

Stream.prototype.read = function() {
  var ret = new go.Future

  if (this.closed) {
    ret.done(new Error('The stream was closed'))
    return ret
  }

  if (this.req) {
    ret.done(new Error('Only one pending read is allowed'))
    return ret
  }

  this.req = ret

  if (this.started) {
    this.lock && this.lock.done()
  } else {
    this.start()
  }

  return ret
}

Stream.prototype.close = function() {
  this.closed = true
  this.done && this.done.abort()
}

Stream.prototype.start = function() {
  this.started = true

  var self = this

  function write(data) {
    var req = self.req
    if (!req) throw new Error('Backpressure protocol was violated by the source')
    self.req = null
    self.lock = null
    req.done(null, data == null ? null : data)
    if (self.req) return
    return self.lock = new go.Future
  }

  this.done = go.run(this.block(write))

  this.done.get(function(err) {
    self.closed = true
    self.req && self.req.done(err)
  })
}

/**
 * Sink stream to native writable
 *
 * @param  {Stream}
 * @param  {Writable}
 * @return {Future}
 */

Stream.sink = function(s, writable) {
  var error
    , resume
    , finished = new go.Future

  writable.on('error', function(err) {
    error = err
  })

  writable.on('close', function() {
    finished.done(new Error('Writable was closed'))
  })

  writable.on('drain', function() {
    resume.done()
  })

  writable.on('finish', function() {
    finished.done()
  })

  return go(function*() {
    try {
      var chunk
      while(chunk = yield s.read()) {
        if (error) throw error
        var drain = writable.write(chunk)
        if (drain) continue
        yield resume = new go.Future
      }
      if (error) throw error
      writable.end()
      yield finished
    } catch(e) {
      s.close()
      writable.destroy && writable.destroy()
      throw e
    }
  })
}

/**
 * Convert native Readable to Stream
 *
 * @param  {Readable}
 * @return {Stream}
 */

Stream.sanitize = function(readable) {
  return new Stream(function*(write) {
    var end = false
      , received = new go.Future
      , chunk

    readable.on('error', function(err) {
      received.done(err)
    })

    readable.on('close', function() {
      received.done(new Error('readable source was closed'))
    })

    readable.on('end', function() {
      received.done()
    })

    readable.on('data', function(data) {
      readable.pause()
      received.done(null, data)
    })

    try {
      while(chunk = yield received) {
        yield write(chunk)
        received = new go.Future
        readable.resume()
      }
    } catch(e) {
      // The intent is to destroy only when error/abortion occured
      received.destroy && received.destroy()
      throw e
    }
  })
}

/**
 * Pipe native readable to native writable
 *
 * @param  {Readable}
 * @param  {Writable}
 * @return {Future}
 */

Stream.pipe = function(readable, writable) {
  var ret = new go.Future

  writable.on('finish', function() {
    ret.done()
  })

  writable.on('error', error)
  readable.on('error', error)

  writable.on('close', function() {
    error(new Error('Writable target was closed'))
  })
  readable.on('close', function() {
    error(new Error('Readable source was closed'))
  })

  function error(err) {
    readable.destroy && readable.destroy()
    writable.destroy && writable.destroy()
    ret.done(err)
  }

  // and finally
  readable.pipe(writable)

  return ret
}


/**
 * Sink the given stream to `write`.
 *
 * Example:
 *    new Stream(function(write) {
 *      Stream.paste(write, header)
 *      Stream.paste(write, body)
 *    })
 *
 *
 * @param  {Function}
 * @param  {Stream}
 * @return {Future}
 */

Stream.paste = function(write, s) {
  return go(function*() {
    try {
      var chunk
      while(undefined !== (chunk = yield s.read())) {
        chunk = yield chunk
        yield write(chunk)
      }
    } finally {
      s.close()
    }
  })
}

/**
 * Consume and buffer the entire contents of given stream
 *
 * @param  {Stream} s
 * @param  {String} [opts.encoding] - When given, will buffer to a string instead of Buffer
 * @param {Number} [opts.limit] - Maximum number of bytes allowed to buffer
 * @return {Buffer|String}
 */

Stream.buffer = function(s, opts) {
  opts = opts || {}

  var binary = !opts.encoding
  var length = 0
  var push, end

  if (binary) {
    var chunks = []

    push = function(chunk) {
      chunks.push(chunk)
    }

    end = function() {
      return Buffer.concat(chunks, length)
    }
  } else {
    var decoder = new StringDecoder(opts.encoding)
    var str = ''

    push = function(chunk) {
      str += decoder.write(chunk)
    }

    end = function() {
      return str + decoder.end()
    }
  }

  return go(function*() {
    try {
      var chunk
      while(chunk = yield s.read()) {
        chunk = yield chunk
        length += chunk.length
        if (opts.limit < length) {
          var err = new Error('The stream size exceeded the allowed limit')
          err.limit = opts.limit
          throw err
        }
        push(chunk)
      }
      return end()
    } finally {
      s.close()
    }
  })
}
