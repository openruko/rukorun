var Path = require('path');
var child_process = require('child_process');
var chai = require('chai-stack');
var expect = chai.expect;
var Assertion = chai.Assertion;
var _ = require('underscore');
var dynohostMock = require('./mock/dynohost');

describe('rukorun', function(){
  var command;
  var io;
  var child;
  var pathTest = '/tmp/rukoru-test';

  before(function(){
    if(process.getgid() !== 0) {
      throw new Error('Test need to be executed as root');
    }
  });

  beforeEach(function(done){
    dynohostMock.buildSocketServers(pathTest, function(err, arr){
      if(err) return done(err);
      command = arr[0];
      io = arr[1];
      done();
    });

    setTimeout(function(){
      child = child_process.spawn('node', [
        Path.join(__dirname, '../rukorun/run.js'),
        pathTest,
        __dirname,
        200
      ]);
      child.stdout.pipe(process.stdout);
      child.stderr.pipe(process.stderr);
    }, 20);
  });

  afterEach(function(done){
    child.kill('SIGTERM');
    setTimeout(done, 200);
  });

  _({
   'git action': {
      type: 'do',
      attached: true,
      pty: false
    },
   'rendezvous': {
      type: 'do',
      attached: true,
      pty: true
    },
   'normal dyno running': {
      type: 'do',
      attached: false,
      pty: false
    }
  }).forEach(function(payload, desc){

    describe(desc, function(){
      it('should launch process', function(done){
        command.write(JSON.stringify(_({
          command: 'echo',
          args: ['"hello $KEY1"'],
          env_vars: {
            KEY1: 'VALUE1'
          }
        }).defaults(payload)));

        var commands = "";
        command.on('data', function(data){ commands+= data; });

        io.once('data', function(data){
          expect(data.toString()).to.include('hello VALUE1');
          child.on('exit', function(code){
            expect(code).to.be.equal(0);

            setTimeout(function(){
              expect(commands).to.include('Starting process with command `echo \\"hello $KEY1\\"`');
              expect(commands).to.include('Process exited with status 0');
              done();
            }, 20);
          });
        });
      });

      it('should write error on io socket', function(done){
        command.write(JSON.stringify(_({
          command: 'balbalabl',
          args: [123],
          env_vars: {
            C_LANG: 'EN'
          }
        }).defaults(payload)));

        var commands = "";
        command.on('data', function(data){ commands+= data; });

        io.once('data', function(data){
          try{
            expect(data.toString()).to.include('exec: balbalabl: not found');
          }catch(e){
            // pty.js use execvp to launch processes
            expect(data.toString()).to.include('execvp(): No such file or directory');
          }
          child.on('exit', function(code){
            // pty.js does not forward the exit code
            // https://github.com/chjj/pty.js/issues/28
            //
            // remove this comment if the issue is resolved.
            //expect(code).to.be.not.equal(0);

            setTimeout(function(){
              expect(commands).to.include('Starting process with command `balbalabl 123`');
              expect(commands).to.include('Process exited with status');
              done();
            }, 20);
          });
        });
      });

      describe('when launching long running process', function(done){
        var commands = "";
        var heartbeats = 0;
        beforeEach(function(done){
          command.write(JSON.stringify(_({
            command: 'node',
            args: ['fixture/server.js'],
            env_vars: {
              PORT: 1234,
              PATH: process.env.PATH
            }
          }).defaults(payload)));

          command.on('data', function(data){ commands+= data; });
          io.pipe(process.stdout, {end: false});

          io.once('data', function(data){
            done();
          });
        });

        it('should kill process with SIGTERM when sending `stop`', function(done){
          command.write(JSON.stringify({
            type: 'stop'
          }));

          child.on('exit', function(code){
            expect(commands).to.include('Stopping all processes with SIGTERM');
            expect(commands).to.include('Process exited with status ');
            done();
          });
        });

        it('should send heartbeats', function(done){
          expect(commands).to.include('heartbeat');
          command.write(JSON.stringify({
            type: 'stop'
          }));
          done();
        });

      });

      describe('when launching catching signals processes', function(done){
        var commands ="";
        beforeEach(function(done){
          command.write(JSON.stringify(_({
            command: 'node',
            args: ['fixture/chuck-norris.js'],
            env_vars: {
              PORT: 1234,
              PATH: process.env.PATH
            }
          }).defaults(payload)));

          command.on('data', function(data){ commands+= data; });

          io.pipe(process.stdout, {end: false});

          io.once('data', function(data){
            done();
          });
        });

        it('should kill process with SIGKILL when sending `exit`', function(done){
          command.write(JSON.stringify({
            type: 'stop'
          }));

          child.on('exit', function(code){
            expect(commands).to.include('Stopping all processes with SIGKILL');
            done();
          });
        });
      });
    });
  });
});
