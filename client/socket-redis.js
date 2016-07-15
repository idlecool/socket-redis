/**
 * @class SocketRedis
 */
var SocketRedis = (function() {

  /**
   * @type {SockJS}
   */
  var sockJS;

  /**
   * @type {Object}
   *
   */
  var subscribes = (function () {
    this.subscribers = {};
    this.get = function(channel) {
      if (!this.subscribers.hasOwnProperty(channel)) {
        return [];
      } else {
        return this.subscribers[channel];
      }
    };

    this.has_channel = function (channel) {
      return this.subscribers.hasOwnProperty(channel);
    };

    this.delete_channel = function (channel) {
      if (this.has_channel(channel)) {
        delete subscribes[channel];
      }
    };

    this.set = function(channel, start, data, onmessage) {
      if (!this.subscribers.hasOwnProperty(channel)) {
        this.subscribers[channel] = [];
      }

      this.subscribers[channel].push({event: {channel: channel, start: start, data: data}, callback: onmessage});
    };

    return this;
  })();

  var messageBuffer = [];

  /**
   * @type {Number|Null}
   */
  var closeStamp = null;

  /**
   * @param {String} url
   * @constructor
   */
  function Client(url, _options) {
    var options = _options || {};
    var handler = this;
    var retryLimit = options.retryLimit || -1;
    retryDelayed(100, 5000, function(retry, resetDelay, _retryCount) {
      var retryCount = _retryCount || 0;
      sockJS = new SockJS(url);
      sockJS.onopen = function() {
        resetDelay();
        for (var channel in subscribes) {
          if (subscribes.has_channel(channel)) {
            subscribe(channel, closeStamp);
          }
        }
        while (messageBuffer.length > 0) {
          sockjs_send(messageBuffer.shift());
        }
        closeStamp = null;
        handler._onopen.call(handler)
      };
      sockJS.onmessage = function(event) {
        var data = JSON.parse(event.data);
        if (subscribes.has_channel(data.channel)) {
          var subscribers = subscribes.get(data.channel);
          for (var idx in subscribers) {
            subscribers[idx].callback.call(handler, data.event, data.data);
          }
        }
      };
      sockJS.onclose = function() {
        closeStamp = new Date().getTime();
        if (retryLimit < 0 || retryCount < retryLimit) {
          retryCount += 1;
          retry(retryCount);
        }
        handler._onclose.call(handler);
      };
    });

    // https://github.com/sockjs/sockjs-client/issues/18
    if (window.addEventListener) {
      window.addEventListener('keydown', function(event) {
        if (event.keyCode == 27) {
          event.preventDefault();
        }
      })
    }
  }

  /**
   * @param {String} channel
   * @param {Number} [start]
   * @param {Object} [data]
   * @param {Function} [onmessage] fn(data)
   */
  Client.prototype.subscribe = function(channel, start, data, onmessage) {
    subscribes.set(channel, start, data, onmessage);
    if (sockJS.readyState === SockJS.OPEN) {
      subscribe(channel);
    }
  };

  Client.prototype.get_subscribes = function() {
    return subscribes;
  };

  /**
   * @param {String} channel
   */
  Client.prototype.unsubscribe = function(channel) {
    if (subscribes.has_channel(channel)) {
      subscribes.delete_channel(channel);
    }
    if (sockJS.readyState === SockJS.OPEN) {
      sockjs_send(JSON.stringify({event: 'unsubscribe', data: {channel: channel}}));
    }
  };

  /**
   * @param {Object} data
   */
  Client.prototype.send = function(data) {
    sockjs_send(JSON.stringify({event: 'message', data: {data: data}}));
  };

  /**
   * @param {String} channel
   * @param {String} event
   * @param {Object} data
   */
  Client.prototype.publish = function(channel, event, data) {
    sockjs_send(JSON.stringify({event: 'publish', data: {channel: channel, event: event, data: data}}));
  };

  Client.prototype.onopen = function() {
  };

  Client.prototype.onclose = function() {
  };

  Client.prototype._onopen = function() {
    this._startHeartbeat();
    this.onopen.call(this);
  };

  Client.prototype._onclose = function() {
    this.onclose.call(this);
    this._stopHeartbeat();
  };

  Client.prototype._startHeartbeat = function() {
    this._heartbeatTimeout = setTimeout(function() {
      sockjs_send(JSON.stringify({event: 'heartbeat'}));
      this._startHeartbeat();
    }.bind(this), 25 * 1000);
  };

  Client.prototype._stopHeartbeat = function() {
    clearTimeout(this._heartbeatTimeout);
  };

  var sockjs_send = function (data) {
    if (sockJS.readyState === SockJS.OPEN) {
      sockJS.send(data);
    } else {
      messageBuffer.push(data);
    }
  };

  /**
   * @param {String} channel
   * @param {Number} [startStamp]
   */
  var subscribe = function(channel, startStamp) {
    var subscribers = subscribes.get(channel);
    for (var idx in subscribers) {
      var subscriber = subscribers[idx];
      var event = subscriber.event;
      if (!startStamp) {
        startStamp = event.start || new Date().getTime();
      }
      sockjs_send(JSON.stringify({event: 'subscribe', data: {channel: event.channel, data: event.data, start: startStamp}}));
    }
  };

  /**
   * @param {Number} delayMin
   * @param {Number} delayMax
   * @param {Function} execution fn({Function} retry, {Function} resetDelay)
   */
  var retryDelayed = function(delayMin, delayMax, execution) {
    var delay = delayMin;
    var timeout;
    var resetDelay = function() {
      delay = delayMin;
      window.clearTimeout(timeout);
    };
    var retry = function(_retryCount) {
      var retryCount = _retryCount || 0;
      var self = this;
      window.clearTimeout(timeout);
      timeout = window.setTimeout(function() {
        execution.call(self, retry, resetDelay, retryCount);
        delay = Math.min(Math.max(delayMin, delay * 2), delayMax);
      }, delay);
    };
    execution.call(this, retry, resetDelay);
  };

  return Client;
})();
