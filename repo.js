var scripts = require(__dirname + '/lib/scripts.js');

scripts.init(function (sources) {
    if (process.argv[2]) {
        scripts.update(process.argv[2], function () {
            process.exit();
        }, sources);
    }
});