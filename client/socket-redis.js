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
  function Client(url) {
    var handler = this;
    retryDelayed(100, 5000, function(retry, resetDelay) {
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
        handler.onopen.call(handler)
      };
      sockJS.onmessage = function(event) {
        var data = JSON.parse(event.data);
        if (subscribes.has_channel(data.channel)) {
          for (var subscriber in subscribes.get(data.channel)) {
            subscriber.callback.call(handler, data.event, data.data);
          }
        }
      };
      sockJS.onclose = function() {
        closeStamp = new Date().getTime();
        retry();
        handler.onclose.call(handler);
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
    for (var subscriber in subscribes.get(channel)) {
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
    var retry = function() {
      var self = this;
      window.clearTimeout(timeout);
      timeout = window.setTimeout(function() {
        execution.call(self, retry, resetDelay);
        delay = Math.min(Math.max(delayMin, delay * 2), delayMax);
      }, delay);
    };
    execution.call(this, retry, resetDelay);
  };

  return Client;
})();
