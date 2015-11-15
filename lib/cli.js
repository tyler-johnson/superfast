import minimist from "minimist";
import Compile from "./compile";
import {fork} from "child_process";
import {format} from "util";
import contains from "lodash/collection/contains";
import unique from "lodash/array/unique";
import flatten from "lodash/array/flatten";

if (require.main === module) {
	let argv = minimist(process.argv.slice(2), {
		string: [ "ignore" ],
		boolean: [ "help", "version" ],
		alias: {
			h: "help", H: "help",
			v: "version", V: "version",
			i: "ignore"
		}
	});

	if (argv.help || !argv._.length || argv._[0] === "help") {
		showHelp();
	}

	if (argv.version === true || argv._[0] === "version") {
		var pkg = require("../package.json");
		console.log("%s v%s", pkg.name, pkg.version);
		process.exit(0);
	}

	let log = function() {
		console.log("=> %s", format.apply(null, arguments));
	};

	let error = function(e) {
		if (e.bad_superfast) {
			log("This is not a superfast directory. Call 'sf init' to set up this directory for superfast.");
			return;
		}

		if (typeof e === "string") return log(e);
		if (e && e.human) return log(e.toString());

		console.error(e.stack);
	};

	switch (argv._[0]) {
		case "start":
		case "run":
			let compile = new Compile(".", argv);
			compile.build().then(function() {
				log("Compiled");
				let watcher = compile.watch();
				let proc, ready;

				function start(cb) {
					ready = false;
					let onClean, onExit, onMessage, p;
					p = proc = fork(compile.resolve("server"));

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
							log("Server started");
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

				watcher.on("build", function(f, t) {
					t = unique(flatten(t));
					log("Rebuilt changed files: %s", f.join(" "));
					if (contains(t, "server")) restart();
				});

				watcher.on("error", function(e) {
					error(e);
					process.exit(1);
				});

				watcher.on("ready", function() {
					log("Watching for file changes...");
					start();
				});
			}).catch(function(e) {
				error(e);
			});
			break;

		case "init":
			new Compile(".", argv).init().then(function() {
				log("Compiled.");
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
