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

// Shorter heartbeats are useful for testing
var heartbeat_interval = process.env.HEARTBEAT_INTERVAL || 60 * 1000;

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

      // If the spawned child process exits.
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

    // If Rukorun is told to stop by Dynohost.
    } else if(payload.type === 'stop') {

      if(!inst) {
        throw new Error('WTF try to exit a non existing inst');
      }

      sendToDynohost({
        message: 'Stopping all processes with SIGTERM'
      });
      inst.kill('SIGTERM');

      setTimeout(function(){
        sendToDynohost({
          message: ['Error R12 (Exit timeout) -> At least one process failed to exit within 10 seconds of SIGTERM',
            'Stopping all processes with SIGKILL'].join('\n')
        });
        inst.kill('SIGKILL');
      }, killTimeout || 10000);
    }
  });

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

  startHeartbeats();

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

  startHeartbeats();

  return inst;
}

// Send data to the Dynohost
function sendToDynohost(object){
  commandSocket.write(JSON.stringify(object) + '\n');
}

// Keep track of the app's accumulated uptime in minutes
function startHeartbeats(){
  setInterval(function() {
    sendToDynohost({
      heartbeat: true
    });
  }, heartbeat_interval);
}
