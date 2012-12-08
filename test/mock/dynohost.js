var EventEmitter = require('events').EventEmitter;
var Path = require('path');
var fs = require('fs');
var net = require('net');
var rimraf = require('rimraf');
var mkdirp = require('mkdirp');

exports.buildSocketServers = function(path, cb){
  var em = new EventEmitter();

  rimraf(path, function(err){
    if(err) return cb(err);
    mkdirp(path, function(err){
      if(err) return cb(err);

      var commandServer = buildSocketServer('command');
      em.emit('commandServer', ioServer);
      var ioServer = buildSocketServer('io');
      em.emit('ioServer', ioServer);

      [commandServer, ioServer].forEach(function(server){
        server.on('connection', handleConnection);
        server.on('error', cb);
      });

      function buildSocketServer(prefix) {
        var socketDir=Path.join(path);
        var socketPath=Path.join(socketDir,prefix + '.sock');
        if(!fs.existsSync(socketDir)) {
          fs.mkdirSync(socketDir);
        }
        var server = net.createServer();
        server.listen(socketPath);
        return server;
      }

      var connCount = 0;
      function handleConnection(socketName) {
        connCount++;
        if(connCount === 2) {
          cb(null, commandServer, ioServer);
        }
      }
    });
  });

  return em;
};
