var fs = require('fs');
var _ = require('underscore');

module.exports = function(wantedPort, cb){

  // $ cat /proc/net/tcp
  // sl  local_address rem_address   st tx_queue rx_queue tr tm->when retrnsmt   uid  timeout inode
  // 0: 00000000:0016 00000000:0000 0A 00000000:00000000 00:00000000 00000000     0        0 78603 1 0000000000000000 100 0 0 10 -1
  fs.readFile('/proc/net/tcp', function(err, data){
    if(err){
      console.error(err);
      // swallow the error
      return cb();
    }
    var lines = data.toString().split('\n').splice(1);
    lines.forEach(function(line){
      var arr = _.compact(line.split(' '));
      if(arr[2] != "00000000:0000") return; // only looking for listening TCP sockets
      if(arr[7] != "1666") return; // only looking sockets created by ruko user

      var localAddress = arr[1].split(':');
      var host = humanizeHostname(localAddress[0]);
      var port = parseInt(localAddress[1], 16);
      if(host !== '0.0.0.0') {
        return cb(new Error('Error R11 (Bad bind) -> Process bound to host ' + host + ', should be 0.0.0.0'));
      }
      if(+port !== +wantedPort){
        return cb(new Error('Error R11 (Bad bind) -> Process bound to port ' + port + ', should be ' + wantedPort + ' (see environment variable PORT)'));
      }
      cb(null, {
        host: host, 
        port: port
      });
    });
    
    // if nothing is found return
    cb();
  });
};

// trasnform 00000000 into 0.0.0.0
function humanizeHostname(str){
  return str.match(/.{2}/g).map(function(hex){ return parseInt(hex, 16) }).join('.');
}
