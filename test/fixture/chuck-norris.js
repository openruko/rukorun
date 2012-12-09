var http = require('http');
var port = process.env.PORT;
http.createServer(function (req, res) {
  res.writeHead(200, {'Content-Type': 'text/plain'});
  res.end('Hello World\n');
}).listen(port);
console.log('Server running at http://127.0.0.1:' + port + '/');

process.on('SIGTERM', function(){
  console.log('sigterm received');
});
process.on('SIGINT', function(){
  console.log('sigint received');
});
