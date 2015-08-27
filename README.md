### Usage

```shell
$ npm install auto-cli
```

```shell
$ cat cli.js 
var auto_cli = require('auto-cli');

auto_cli(['html', '--verbose'])
.then(function( input ){
    console.log( input );
});
```

```shell
$ node cli.js 404.html --verbose
{ html: '404.html', '--verbose': true }
```

Arguments are determined base on ".html" filename extension and option name "--verbose".<br>
Argument order does not matter.
```shell
$ node cli.js --verbose 404.html  
{ html: '404.html', '--verbose': true }
```
