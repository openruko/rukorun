var EventEmitter = require('events').EventEmitter;
var Path = require('path');
var fs = require('fs');
var net = require('net');
var rimraf = require('rimraf');
var mkdirp = require('mkdirp');
var async = require('async');
var _ = require('underscore');

exports.buildSocketServers = function(path, cb){
  var em = new EventEmitter();

  rimraf(path, function(err){
    if(err) return cb(err);
    mkdirp(path, function(err){
      if(err) return cb(err);

      var servers = {
        command: buildSocketServer('command'),
        io: buildSocketServer('io')
      };

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

      _(servers).forEach(function(server, name){
        em.emit(name, server);
        server.on('error', cb);
      });

      async.parallel([
        function(cb){
          servers.command.on('connection', function(socket){
            cb(null, socket);
          });
        },
        function(cb){
          servers.io.on('connection', function(socket){
            cb(null, socket);
          });
        }
      ], cb);
    });
  });

  return em;
};
