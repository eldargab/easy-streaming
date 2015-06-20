'use strict'

module.exports = Stream

function Stream(block) {
  this.block = block
  this.started = false
  this.closed = false
}

Stream.prototype.read = function() {
  if (this.closed) return

  var ret = new go.Future

  this.read = ret

  if (!this.started) {
    this.start()
  } else if (this.lock) {
    if (this.lock.ready) throw new Error('Only one pending read is allowed')
    this.lock.done()
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
    var read = self.read
    if (!read) throw new Error('Backpressure protocol was violated by the source')
    self.read = null
    read.done(null, data == null ? null : data)
    if (self.read) return
    return self.lock = new go.Future
  }

  this.done = go.run(this.block(write))

  this.done.next(function(err) {
    self.closed = true
    self.read && self.read.done(err)
  })
}

Stream.prototype[Symbol.iterator] = function() {
  var self = this
  return {
    next: function() {
      return {value: self.read(), done: self.closed}
    }
  }
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
      for(var chunk of s) {
        chunk = yield chunk
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

  // and finally :)
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
      for(var chunk of s) {
        chunk = yield chunk
        yield write(chunk)
      }
    } finally {
      s.close()
    }
  })
}
