cp = require('child_process');

var args = process.argv.slice(3);
var command = process.argv[2];

var inst = cp.spawn(command, args, { 
  uid: 1666,
  gid: 666,
  stdio: 'inherit'
});


inst.on('close', function(code) {
  process.exit(code);
});
