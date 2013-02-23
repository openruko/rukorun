# Rukorun - Runner inside dyno  (lxc-init replacement)
[![Build Status](https://travis-ci.org/openruko/rukorun.png)](https://travis-ci.org/openruko/rukorun)

## Introduction

Rukorun handles the execution of the job command within the dyno, it sets up 
the appriorate environment, including environment variables, working directory
and less privileged account to launch the process. It monitors the state of 
process and reports back to dynohost via shared Unix sockets, that are mounted
in both the dyno and host.

## Requirements

Tested on Linux 3.2 using node.js 0.8

On a fresh Ubuntu 12.04 LTS instance:  

```
apt-get install nodejs
```

Please share experiences with CentOS, Fedora, OS X, FreeBSD etc... I am fairly confident it
will not work on Windows based machines however.

## Installation


Step 1:

```
git clone https://github.com/openruko/rukorun.git rukorun
cd rukorun

make init
```

Step 2:

Set RUKORUN_PATH env var in dynohost, so the correct path is mounted on the dyno.


## Help and Todo 

* Monitor port binding for 'up' status.

* can pty.js be modified to not need a runas.js proxy?

## License

rukorun and other openruko components are licensed under MIT.  
[http://opensource.org/licenses/mit-license.php](http://opensource.org/licenses/mit-license.php)

## Authors and Credits

Matt Freeman  
[email me - im looking for some remote work](mailto:matt@nonuby.com)  
[follow me on twitter](http://www.twitter.com/nonuby )
