var net = require('net');
var Path = require('path');
var cp = require('child_process');
var pty = require('pty.js');
var async = require('async');
var _ = require('underscore');
var checkBind = require('./checkBind');

var socketPath = process.argv[2];
var cwd = process.argv[3];
var killTimeout = process.argv[4];
var checkBindInterval = process.argv[5];
var bootTimeout = process.argv[6];

var ioSocket = net.createConnection(Path.join(socketPath, 'io.sock'));
var commandSocket = net.createConnection(Path.join(socketPath, 'command.sock'));

[commandSocket, ioSocket].forEach(function(socket){
  socket.on('error', function(err) {
    console.dir(err);
    throw err;
  });
});

async.parallel([
  function(cb){
    ioSocket.on('connect', cb);
  },
  function(cb){
    commandSocket.on('connect', cb);
  }
], processCommands);

function processCommands() {

  var inst;
  commandSocket.on('data', function(data) {
    var payload = JSON.parse(data);
    payload.args = payload.args || [];

    if(payload.type === 'do') {
      var cmd = payload.command + ' ' + payload.args.join(' ');
      sendToDynohost({
        message: 'Starting process with command `' + cmd + '`'
      });

      // Use bash to bootstrap for PATH population and PORT interpolation
      var origArgs = payload.args;
      origArgs.unshift(payload.command);
      origArgs.unshift('exec');

      payload.command = '/bin/bash';
      payload.args = ['-c', origArgs.join(' ')];

      if(payload.pty) {
        inst = spawnPty(payload, ioSocket, commandSocket);
      }else{
        inst = spawn(payload, ioSocket, commandSocket);
      }

      if(payload.env_vars.PORT){
        var isBound = false;

        var bootTimeoutId = setTimeout(function(){
          if(isBound) return;

          sendToDynohost({
            message: 'Error R10 (Boot timeout) -> Web process failed to bind to $PORT within 60 seconds of launch'
          });
          return kill('SIGKILL');
        }, bootTimeout);

        async.until(function(){
          return isBound;
        }, function(cb){
          checkBind(payload.env_vars.PORT, function(err, host){
            if(err) return cb(err);

            if(host){
              return isBound = true;
            }

            // check every 1s
            setTimeout(cb, checkBindInterval)
          });
        }, function(err){
          if(err){
            sendToDynohost({
              message: err.message
            });
            return kill('SIGKILL');
          }

          sendToDynohost({
            type: 'bound'
          });

          clearTimeout(bootTimeoutId);
        });
      }

      inst.on('exit', function(code) {
        // pty.js does not forward the exit code
        // https://github.com/chjj/pty.js/issues/28
        code = code || 0;
        sendToDynohost({
          type: 'exit',
          code: code,
          message: 'Process exited with status ' + code
        });

        process.exit(code);
      });
    } else if(payload.type === 'stop') {

      if(!inst) {
        throw new Error('WTF try to exit a non existing inst');
      }

      kill('SIGTERM');

      setTimeout(function(){
        sendToDynohost({
          message: 'Error R12 (Exit timeout) -> At least one process failed to exit within 10 seconds of SIGTERM',
        });

        kill('SIGKILL');
      }, killTimeout || 10000);
    }
  });

  function sendToDynohost(object){
    commandSocket.write(JSON.stringify(object) + '\n');
  }

  function kill(signal){
    sendToDynohost({
      message: 'Stopping all processes with ' + signal
    });
    inst.kill(signal);
  }
}

// Used when `openruko run bash`
function spawnPty(payload, outputSocket, commandSocket) {

  // TODO pass over TERM, cols, rows etc..
  var term = pty.spawn(payload.command, payload.args, {
    cols: 80,
    rows: 30,
    cwd: cwd,
    uid: 1666,
    gid: 666,
    env: _({
      TERM: 'xterm'
    }).defaults(payload.env_vars)
  });

  term.pipe(outputSocket, { end: false });
  outputSocket.pipe(term, { end: false });

  return term;
}

// Used when running application dynos and build dynos
function spawn(payload, outputSocket, commandSocket) {

  var inst = cp.spawn(payload.command, payload.args, {
    cwd: cwd,
    uid: 1666,
    gid: 666,
    env: payload.env_vars
  });

  inst.stdout.pipe(outputSocket, { end: false });
  inst.stderr.pipe(outputSocket, { end: false });
  outputSocket.pipe(inst.stdin, { end: false });

  return inst;
}
