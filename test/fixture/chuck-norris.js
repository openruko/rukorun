require('./server');

process.on('SIGTERM', function(){
  console.log('sigterm received');
});
process.on('SIGINT', function(){
  console.log('sigint received');
});
