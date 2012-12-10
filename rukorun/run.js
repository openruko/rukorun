var net = require('net');
var Path = require('path');
var cp = require('child_process');
var pty = require('pty.js');
var async = require('async');
var _ = require('underscore');

var socketPath = process.argv[2];
var cwd = process.argv[3];
var killTimeout = process.argv[4];

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
      commandSocket.write('Starting process with command `' + cmd + '`\n');

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

      inst.on('exit', function(code) {
        // pty.js does not forward the exit code
        // https://github.com/chjj/pty.js/issues/28
        code = code || 0;
        commandSocket.write('Process exited with status ' + code + '\n');
        process.exit(code);
      });
    } else if(payload.type === 'exit') {

      if(!inst) {
        throw new Error('WTF try to exit a non existing inst');
      }

      commandSocket.write('Stopping all processes with SIGTERM\n');
      inst.kill('SIGTERM');

      setTimeout(function(){
        commandSocket.write('Error R12 (Exit timeout) -> At least one process failed to exit within 10 seconds of SIGTERM\n');
        commandSocket.write('Stopping all processes with SIGKILL\n');
        inst.kill('SIGKILL');
      }, killTimeout || 10000);
    }
  });
}

function spawnPty(payload, outputSocket, commandSocket) {

  // TODO pass over TERM, cols, rows etc..
  var term = pty.spawn(payload.command, payload.args || [], {
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

function spawn(payload, outputSocket, commandSocket, bashIt) {

  var inst = cp.spawn(payload.command, payload.args, 
                      {
                        env: payload.env_vars,
                        cwd: cwd,
                        uid: 1666,
                        gid: 666
                      });

  inst.stdout.pipe(outputSocket, { end: false });
  inst.stderr.pipe(outputSocket, { end: false });
  outputSocket.pipe(inst.stdin, { end: false });

  return inst;
}
