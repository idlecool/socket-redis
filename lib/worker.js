var http = require('http'),
	redis = require('socket.io/node_modules/redis');

/**
 * @param {Integer} port
 * @constructor
 */
function Worker(port) {
	this.port = port;
	this.channels = {};

	var serverSubscribe = http.createServer();
	serverSubscribe.listen(port);

	var RedisStore = require('socket.io/lib/stores/redis'),
		pub    = redis.createClient(),
		sub    = redis.createClient(),
		client = redis.createClient();

	this.io = require('socket.io').listen(serverSubscribe, {
		'store': new RedisStore({
			redisPub: pub,
			redisSub: sub,
			redisClient: client
		})
	});

	this.io.set('log level', 1);
	this.io.set('transports', ['websocket', 'flashsocket', 'htmlfile', 'xhr-polling', 'jsonp-polling']);
	this.bindSocketEvents();
}

Worker.prototype.bindSocketEvents = function() {
	var self = this;
	this.io.sockets.on('connection', function(socket) {
		var channelId;
		socket.on('subscribe', function(data) {
			if (!channelId && data.channel && data.start) {
				var msgStartTime = data.start;
				channelId = data.channel;
				if (!self.channels[channelId]) {
					self.channels[channelId] = {sockets: [], msgs: [], closeTimeout: null};
				}
				var channel = self.channels[channelId];
				clearTimeout(channel.closeTimeout);
				channel.sockets.push(socket);
				for (var i in channel.msgs) {
					if (channel.msgs[i][0] > msgStartTime) {
						socket.json.send(channel.msgs[i][1]);
					}
				}
			}
		});
		socket.on('disconnect', function() {
			var ch = self.channels[channelId];
			if (!ch) {
				return;
			}
			for (var i in ch.sockets) {
				if (ch.sockets[i] == socket) {
					ch.sockets.splice(i, 1);
				}
			}
			if (ch.sockets.length == 0) {
				ch.closeTimeout = setTimeout(function() {
					delete self.channels[channelId];
				}, 10000);
			}
		});
	});
};

/**
 * @param {String} channelId
 * @param {String} message
 */
Worker.prototype.publish = function (channelId, message) {
	if (!channelId || !message) {
		return;
	}
	var channel = this.channels[channelId]
	if (!channel) {
		return;
	}
	channel.msgs.push([new Date().getTime(), message]);
	if (channel.msgs.length > 10) {
		channel.msgs.splice(0, channel.msgs.length - 10)
	}
	for (var index in channel.sockets) {
		channel.sockets[index].json.send(message);
	}
};

module.exports = Worker;