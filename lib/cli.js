
var Compiler = require("./").Compiler;

var com = new Compiler(process.cwd());
com.run().then((res) => {
	console.log(res);
}).catch((e) => {
	console.error(e.stack || e);
});
