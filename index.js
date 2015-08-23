if( typeof Promise === 'undefined' ) {
    var Promise = require('bluebird'); Promise.longStackTraces();
}
var fs = Promise.promisifyAll(require('fs'));
var path = require('path');
var glob = Promise.promisify(require('glob'));

module.exports = function(expectations, cli_args){

    // format/normalize input
    cli_args = format_args(cli_args);
    expectations = format_expectations(expectations);

    return (

        // search for files according to expectations and CLI arguments
        Promise.resolve(
            search_files(expectations.files, cli_args)
        )
        // validate found files according to expectations
        .then(function(found_files){
            return validate(expectations.files, found_files);
        })
        // format found files
        .then(function(found_files){
            return format_files(found_files, expectations.files);
        })
        // add options
        .then(function(found_files){
            var processed_cli_args = found_files;
            processed_cli_args = add_options(processed_cli_args, expectations.options, cli_args);
            return processed_cli_args;
        })

    );

};

function format_files(found_files, expected_files){
    expected_files
    .forEach(function(expected_file){
        if( ! expected_file.multiples ) {
            found_files[expected_file.filename_extension] =
                (found_files[expected_file.filename_extension]||[]).pop();
        }
    })
    return found_files;
}


function format_args(cli_args){
    var ret = cli_args || process.argv.slice(2);
    if( ret.length === 0 ) { cli_args.push('.'); }
    return ret;
}

function format_expectations(expectations) {
    var options = [];
    var files = [];

    expectations
    .forEach(function(arg){
        var ret;

        if( arg.constructor === Object ) {
            ret = arg;
        }
        else {
            ret = {};
            if( is_option(arg) ) {
                ret.option = arg;
            }
            else {
                ret.filename_extension = arg;
            }
        }

        if( ret.option ) {
            options.push(ret);
        }
        if( ret.filename_extension){
            files.push(ret);
        }
    });

    return {
        options: options,
        files: files
    };
}

function search_files(expected_extensions, cli_args){
    var found_files = {};
    return Promise.all(
        cli_args
        .filter(function(arg){

            return ! is_option(arg);
        })
        .map(function(arg){

            var arg__path = path.resolve(arg);

            return fs
                .statAsync(arg__path)
                .catch(function(err){
                    throw "can't find file/directory "+arg;
                })
                .then(function(stat){
                    if( stat.isFile() ) {
                        var filename_extension = arg.split('.').pop();
                        found_files[filename_extension] = found_files[filename_extension] || [];
                        found_files[filename_extension].push(arg__path);
                    }
                    return stat;
                })
                .then(function(stat){
                    if( expected_extensions && stat.isDirectory() ) {
                        return Promise
                            .all(
                                expected_extensions
                                .map(function(expected_ext){
                                    var filename_extension = expected_ext.filename_extension;
                                    return glob(
                                        '**/*.'+filename_extension,
                                        {
                                            cwd: arg__path,
                                            realpath: true,
                                            nocase: true,
                                            nodir: true
                                        })
                                        .then(function(found){
                                            found_files[filename_extension] =
                                                (found_files[filename_extension]||[])
                                                .concat(found);
                                        });
                                }))
                    }
                });
        })
    )
    .then(function(){
        return found_files;
    });
}

function validate(expected_extensions, found_files){

    if( !expected_extensions ) return found_files;

    return Promise.resolve(function(){

        expected_extensions
        .forEach(function(expected_ext){

            if( ! expected_ext.optional && !found_files[expected_ext.filename_extension]){
                throw "couldn't find any *."+expected_ext.filename_extension+" file";
            }

            if( ! expected_ext.multiple && (found_files[expected_ext.filename_extension]||[]).length>1 ){
                throw "found multiple *." + expected_ext.filename_extension +
                      " files; " + found_files[expected_ext.filename_extension].join(', ');
            }
        });

        for(var filename_extension in found_files){
            if( expected_extensions
                .every(function(expected_ext){
                    return expected_ext.filename_extension !==  filename_extension})
                ) {
                throw 'found file ' + found_files[filename_extension].join(', ') +
                      ' with unexpected filename extension ' + filename_extension;
            }
        }

    })
    .then(function(){
        return found_files;
    })
}

function add_options(processed_cli_args, options, cli_args){
    options.forEach(function(option){
        processed_cli_args[option.option] = cli_args.indexOf(option.option)!==-1;
    });

    return processed_cli_args;
}

function is_option(arg){
    return /^--/.test(arg);
}
