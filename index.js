if( typeof Promise === 'undefined' ) {
    var Promise = require('bluebird'); Promise.longStackTraces();
}
var fs = Promise.promisifyAll(require('fs'));
var path = require('path');
var glob = Promise.promisify(require('glob'));

module.exports = function(expected_args, argv){

    // format input
    argv = argv || process.argv.slice(2);
    if( argv.length === 0 ) { argv.push('.'); }
    expected_args =
        expected_args
        .map(function(file_type){
            return file_type.constructor === Object ? file_type : {filename_extension: file_type};
        });

    // find files
    return new Promise(function(resolve){
        var found_files = {};

        Promise.all(
            argv.map(function(arg){

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
                        if( expected_args && stat.isDirectory() ) {
                            return Promise
                                .all(
                                    expected_args.map(function(file_type){
                                        var filename_extension = file_type.filename_extension;
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
            resolve(found_files);
        });
    })

    // apply options to validate arguments
    .then(function(found_files){

        if( expected_args ) {

            expected_args.forEach(function(file_type){

                if( ! file_type.optional && !found_files[file_type.filename_extension]){
                    throw "couldn't find any *."+file_type.filename_extension+" file";
                }

                if( ! file_type.multiple && (found_files[file_type.filename_extension]||[]).length>1 ){
                    throw "found multiple *." + file_type.filename_extension +
                          " files; " + found_files[file_type.filename_extension].join(', ');
                }
            });

            for(var filename_extension in found_files){
                if( expected_args
                    .every(function(file_type){
                        return file_type.filename_extension !==  filename_extension})
                    ) {
                    throw 'found file ' + found_files[filename_extension].join(', ') +
                          ' with unexpected filename extension ' + filename_extension;
                }
            }

        }

        return found_files;
    })

};
