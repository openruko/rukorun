var net = require('net');
var cp = require('child_process');
var pty = require('pty.js');
var async = require('async');
var ioSocket = net.createConnection('/root/sockets/io.sock');
var commandSocket = net.createConnection('/root/sockets/command.sock');

commandSocket.on('error', function(err) {
  console.dir(err);
  throw err;
});

ioSocket.on('error', function(err) {
  console.dir(err);
  throw err;
});

connectToServer();

function connectToServer() {

  async.series([
    function(cb) {
      var connected = 0;
      ioSocket.on('connect', function() {
        connected++;
        if(connected == 2) {
          cb();
        }
      });
      commandSocket.on('connect', function() {
        connected++;
        if(connected == 2) {
          cb();
        }
      });
    },
    processCommands]
  );

}

function processCommands() {

  commandSocket.on('data', function(data) {
    var payload = JSON.parse(data);
    var inst;

    // handling git push and receive
    if(payload.type === 'do' && payload.attached && !payload.pty) {
      commandSocket.write('status: spawning\n');
      inst = spawn(payload, ioSocket, commandSocket);
    }

    // executing something via rendezvous 
    if(payload.type === 'do' && payload.attached && payload.pty) {
      commandSocket.write('status: spawning\n');
      inst = spawnPty(payload, ioSocket, commandSocket);
    } 

    // normal dyno running
    if(payload.type === 'do' && !payload.attached) {
      commandSocket.write('status: spawning');
      inst = spawn(payload, ioSocket, commandSocket);
    } 

    if(payload.type === 'exit') {
      if(inst) {
        inst.kill('SIGKILL');
        process.exit(0);
      }
    }
    
  });
}

function spawnPty(payload, outputSocket, commandSocket) {

  // pty.js doesnt support uid/gid - for running as less priv user
  // so we launch a pty and inherit the tty for normal cp spawn
  payload.args.unshift(payload.command);
  payload.args.unshift('/root/ps-run/runas.js');
  var realCommand = '/root/ps-run/node';


  // TODO pass over TERM, cols, rows etc..
  var term = pty.spawn(realCommand, payload.args || [], {
    cols: 80,
    rows: 30,
    cwd: '/app',
    env: {
      TERM: 'xterm'
    }
  });


  term.on('data', function(data) {
    outputSocket.write(data);
  });

  outputSocket.on('data', function(data) {
    term.write(data);
  });

  term.on('exit', function(code) {
    commandSocket.write('status: exit - ' + code + '\n');
    outputSocket.destroySoon();
  });

  return term;
}

function spawn(payload, outputSocket, commandSocket, bashIt) {

  // Use bash to bootstrap for PATH population and PORT interpolation
  if(true) {
    var origArgs = payload.args;
    origArgs.unshift(payload.command);
    origArgs.unshift('exec');

    payload.command = '/bin/bash';
    payload.args = ['-c', origArgs.join(' ')];
  }
   
  if(!payload.attached) {
    outputSocket.write(JSON.stringify(payload.env_vars));
  }

  var inst = cp.spawn(payload.command, payload.args, 
                      {
                        env: payload.env_vars,
                        cwd: '/app',
                        uid: 1666,
                        gid: 666
                      });

  inst.stdout.on('data', function(data) {
    outputSocket.write(data);
  });
  inst.stderr.on('data', function(data) {
    outputSocket.write(data);
  });

  outputSocket.on('data', function(data) {
    inst.stdin.write(data);
  });

  inst.on('close', function(code) {
    commandSocket.write('status: exit - ' + code + '\n');
    outputSocket.destroySoon();
  });

  return inst;
}
