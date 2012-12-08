var Path = require('path');
var chai = require('chai-stack');
var expect = chai.expect;
var Assertion = chai.Assertion;
var _ = require('underscore');
var dynohostMock = require('./mock/dynohost');
var exec = require('child_process').exec;

var pathTest = '/tmp/rukoru-test';
describe('rukorun', function(){
  var command;
  var io;
  var child;

  beforeEach(function(done){
    dynohostMock.buildSocketServers(pathTest, function(err, commandServer, ioServer){
      if(err) return done(err);
      command = commandServer;
      io = ioServer;
      done();
    });

    setTimeout(function(){
      var cmd = 'node ' + Path.join(__dirname, '../rukorun/run.js') + ' ' + pathTest;
      child = exec(cmd, function (err, stdout, stderr) {
        if(err) return done(err);
        console.log(stdout.toString());
        console.log(stderr.toString());
      });
    }, 20);
  });
  afterEach(function(done){
    child.kill('SIGTERM');
    done();
  });

  describe('in a test case', function(){
    it('should test something', function(done){
      done();
    });
  });
});
