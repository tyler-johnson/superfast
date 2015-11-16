import minimist from "minimist";
import {fork} from "child_process";
import {format} from "util";
import contains from "lodash/collection/contains";
import isArray from "lodash/lang/isArray";
var Compile = require("./").Compile;

let argv = minimist(process.argv.slice(2), {
	string: [ "ignore", "port", "config" ],
	boolean: [ "help", "version", "dev" ],
	alias: {
		h: "help", H: "help",
		v: "version", V: "version",
		i: "ignore",
		p: "port",
		c: "config"
	},
	default: {
		dev: true
	},
	"--": true
});

if (argv.help || argv._[0] === "help") {
	showHelp();
}

if (argv.version === true || argv._[0] === "version") {
	var pkg = require("./package.json");
	console.log("%s v%s", pkg.name, pkg.version);
	process.exit(0);
}

let compile;

let log = function() {
	console.log("=> %s", format.apply(null, arguments));
};

let error = function(e) {
	if (e.bad_superfast) {
		log("This is not a superfast directory. Call 'sf init' to set up this directory for superfast.");
		showHelp();
		return;
	}

	if (typeof e === "string") return log(e);
	if (e && e.human) return log(e.toString());

	console.error(e.stack || e);
	process.exit(1);
};

if (!argv._.length) {
	start(argv, log, error).catch(error);
} else {
	switch (argv._[0]) {
		case "start":
		case "run":
			start(argv, log, error).catch(error);
			break;

		case "init":
			compile = new Compile(".", argv);
			compile.init().then(function(r) {
				if (r) log("Initialized new superfast application at '%s'.", compile.cwd);
				else log("Reinitialized superfast application at '%s'.", compile.cwd);
			}).catch(error);
			break;

		case "destroy":
			new Compile(".", argv).destroy().then(function() {
				log("Destroyed superfast build directory. Call 'sf init' to reinitialize.");
			}).catch(error);
			break;

		case "create":
			let d = argv._[1];
			Compile.create(d, argv).then(function() {
				log("Created superfast application '%s'.", d);
				log("To Use:\n\n   $ cd %s\n   $ sf start\n", d);
			}).catch(error);
			break;

		case "compile":
			new Compile(".", argv).build().then(function() {
				log("Compiled.");
			}).catch(function(e) {
				error(e);
			});
			break;

		default:
			break;

	}
}

function showHelp() {
	console.log("help!");
	process.exit(0);
}

function start(argv, log, error) {
	let compile = new Compile(".", argv);
	return compile.build().then(function() {
		log("Compiled");
		let watcher = compile.watch();
		let proc, ready;

		function start(cb) {
			ready = false;
			let onClean, onExit, onMessage, p;

			let args = [];
			if (argv.port) {
				args.push("--port", isArray(argv.port) ? argv.port[0] : argv.port);
			}
			[].concat(argv.config).filter(Boolean).forEach(function(c) {
				args.push("--config", c);
			});
			args = args.concat(argv["--"]);

			p = proc = fork(compile.resolve("server"), args);

			p.on("clean", onClean = function() {
				p.removeListener("exit", onExit);
				p.removeListener("message", onMessage);
				p.removeListener("clean", onClean);
				if (proc === p) proc = null;
			});

			p.on("exit", onExit = function(code) {
				p.emit("clean");

				if (code) {
					let l = [];
					l.push("App exited with an error.");
					if (!ready) l.push("Waiting for changes before restarting...");
					log(l.join(" "));
					if (ready) restart();
				} else {
					log("App exited cleanly. Waiting for changes before restarting...");
				}
			});

			p.on("message", onMessage = function(msg) {
				if (msg === "READY") {
					ready = true;
					p.removeListener("message", onMessage);
					if (typeof cb === "function") cb();
				}
			});
		}

		function kill(cb) {
			if (typeof cb !== "function") cb = ()=>{};
			if (proc) {
				let p = proc;
				p.emit("clean");
				p.once("exit", cb);
				p.kill();
			} else {
				cb();
			}
		}

		function restart(cb) {
			log("Restarting...");
			kill(function() {
				start(cb);
			});
		}

		watcher.on("rebuild", function(f) {
			log("Rebuilding changed files: %s", f.join(" "));
		});

		watcher.on("build", function(files, full) {
			if (full || files.some(f => contains(f.targets, "server"))) restart();
		});

		watcher.on("error", function(e) {
			error(e);
			process.exit(1);
		});

		watcher.on("ready", function() {
			log("Watching for file changes...");
			start();
		});
	});
}
