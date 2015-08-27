if( typeof Promise === 'undefined' ) {
    var Promise = require('bluebird'); Promise.longStackTraces();
}
var fs = Promise.promisifyAll(require('fs'));
var path = require('path');
var glob = Promise.promisify(require('glob'));

module.exports = function(expectations, cli_args){

    return (

        // format/normalize input
        Promise.resolve(
            format_cli_args(cli_args)
        )
        .then(function(cli_args){
            return {
                cli_args: cli_args,
                expectations: format_expectations(expectations)
            };
        })

        // add files referenced by CLI arguments
        .then(function(input){
            return get_cli_file_args(input);
        })

        // search for files according to expectations and CLI arguments
        .then(function(input){
            return search_directories(input);
        })

        // add options set by CLI arguments
        .then(function(input){
            return get_options(input);
        })

        // match CLI arguments with expectations
        .then(function(input){
            return match(input);
        })

        // validate found files and CLI arguments according to expectations
        .then(function(input){
            return validate(input);
        })

        // return processed CLI arguments
        .then(function(input){
            return format_output(input);
        })

    );

};


function format_expectations(expectations) {
    return (
        ( expectations || [] )
        .map(function(expectation_raw){

            var expectation;

            if( expectation_raw.constructor === Object ) {
                expectation = expectation_raw;
            }

            if( expectation_raw.constructor === String ) {
                expectation = {};
                if( is_option(expectation_raw) ) {
                    expectation.option = expectation_raw;
                }
                else {
                    expectation.filename_extension = expectation_raw;
                }
            }

            if( expectation.option ) {
                expectation.matches = expectation.matches || function( arg ) {
                    return arg === expectation.option;
                };
                expectation.description = expectation.description || ('option ' + expectation.option);
                expectation.name = expectation.name || expectation.option;
                expectation.optional = true;
            }

            if( expectation.filename_extension ) {
                expectation.matches = function( arg ) {
                    if( arg.split('.').pop() === expectation.filename_extension ){
                        return arg;
                    }
                    else {
                        return null;
                    }
                };
                expectation.description = 'file *.' + expectation.filename_extension;
                expectation.name = expectation.name || expectation.filename_extension;
            }

            expectation.raw = expectation_raw;

            if( !expectation.name ) throw "expectation needs a name";

            return expectation;

        })
    );

}

function format_cli_args(cli_args){
    cli_args = cli_args || process.argv.slice(2);

    if( cli_args.length === 0 ) { cli_args.push('.'); }

    return Promise.all(
        cli_args
        .map(function(cli_arg){
            return {
                raw: cli_arg,
                path: ! is_option(cli_arg) ? path.resolve(cli_arg) : null,
                option: is_option(cli_arg) ? cli_arg : null
            };
        })
        .map(function(cli_arg){
            return Promise.resolve(
                fs
                .statAsync(cli_arg.path)
            )
            .then(function(stat){
                cli_arg.fs_stat = stat;
                return cli_arg;
            })
            .catch(function(){
                cli_arg.fs_stat = null
                return cli_arg;
            });
        })
    );
}

function get_cli_file_args(input){
    input
    .cli_args
    .filter(function(cli_arg){
        return cli_arg.fs_stat && cli_arg.fs_stat.isFile();
    })
    .forEach(function(cli_arg){
        cli_arg.files =
            (cli_arg.files||[]).concat(cli_arg.path);
    });
    return input;
}

function search_directories(input){
    return Promise.all(
        input
        .expectations
        .filter(function(expectation){
            return !! expectation.filename_extension;
        })
        .map(function(expectation){
            return Promise.all(
                input
                .cli_args
                .filter(function(cli_arg){
                    return cli_arg.fs_stat && cli_arg.fs_stat.isDirectory();
                })
                .map(function(cli_arg){
                    return glob(
                        '**/*.'+expectation.filename_extension,
                        {
                            cwd: cli_arg.path,
                            realpath: true,
                            nocase: true,
                            nodir: true
                        })
                        .then(function(found){
                            cli_arg.files =
                                (cli_arg.files||[]).concat(found);
                        });
                })
            );
        })
    )
    .then(function(){
        return input;
    });
}

function get_options(input){
    input
    .cli_args
    .forEach(function(cli_arg){
        cli_arg.is_option =
            input
            .expectations
            .filter(function(expectation){
                return !! expectation.option;
            })
            .some(function(expectation){
                return cli_arg.option === expectation.option;
            });
    });
    return input;
}

function match(input) {
    input.not_matched = [];

    input
    .cli_args
    .forEach(function(cli_arg){
        (cli_arg.files || [cli_arg.raw])
        .forEach(match_single);
    });

    return input;

    function match_single(arg) {
        var matched = false;
        input
        .expectations
        .forEach(function(expectation) {
            var val = expectation.matches(arg);
            if( val ) {
                matched = true;
                expectation.matched_args =
                    ( expectation.matched_args || [] ).concat(
                        val );
            }
        });
        if( ! matched ) {
            input.not_matched.push( arg );
        }
    }
}

function validate(input){

    if( !input.expectations ) return input;

    var unexpectations = [];

    input
    .expectations
    .forEach(function(expectation){

        if( ! expectation.optional && ! expectation.matched_args ){
            unexpectations.push(
                "couldn't find any "+expectation.description );
        }

        if( ! expectation.multiple && (expectation.matched_args||[]).length>1 ){
            unexpectations.push(
                "found multiple " + expectation.description +
                "; " + expectation.matched_args.join(', ') );
        }

    });

    input.not_matched.forEach(function(arg){
        unexpectations.push(
            "unexpected argument " + arg );
    });

    if( unexpectations.length >= 1 ) {
        throw '\n'+unexpectations.join('\n');
    }

    return input;

}

function format_output(input){
    var output = {};

    input
    .expectations
    .forEach(function(expectation){
        output[expectation.name] =
            expectation.multiple ?
                expectation.matched_args :
                (expectation.matched_args||[]).pop() ;
    });

    return output;
}

function is_option(arg){
    return /^--/.test(arg);
}
