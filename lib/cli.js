import minimist from "minimist";
import {format} from "util";
import has from "lodash/object/has";
import size from "lodash/collection/size";
import toArray from "lodash/lang/toArray";
import forEach from "lodash/collection/forEach";
import logUpdate from "log-update";
import spinner from "elegant-spinner";

var superfast = require("./");
var Compile = superfast.Compile;
var Runner = superfast.Runner;

let commands;
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

var spinnerInterval;
var spinnerFrame = spinner();

function stopSpinner() {
	if (!spinnerInterval) return;
	clearTimeout(spinnerInterval);
	spinnerInterval = null;
}

function log() {
	stopSpinner();
	logUpdate.clear();
	console.log("=> %s", format.apply(null, arguments));
}

function logover() {
	stopSpinner();
	logUpdate("=> " + format.apply(null, arguments));
}

function logspinner() {
	stopSpinner();
	let args = arguments;
	spinnerInterval = setInterval(function() {
		logUpdate(spinnerFrame() + "  " + format.apply(null, args));
	}, 50);
}

function logerror(e) {
	if (typeof e === "string") return log(e);
	if (e && e.human) return log(e.toString());
	console.error(e.stack || e);
}

function error(e) {
	if (e.bad_superfast) {
		log("This is not a superfast directory. Call 'superfast init' to set up this directory for superfast.");
		commands.help();
		return;
	}

	logerror(e);
	process.exit(1);
}

commands = {
	start: function() {
		let runner = new Runner();
		let restarting = false;
		let rebootCount = 0;

		runner.on("start", function(p) {
			if (runner.firstRun) {
				logover("Starting application server...");
			}

			let clean = function() {
				rebootCount = 0;
				stopSpinner();
				logUpdate.done();
			};

			if (p.stdout.listenerCount("data") === 1) {
				p.stdout._events.data = [p.stdout._events.data];
			}
			p.stdout._events.data.unshift(clean);

			if (p.stderr.listenerCount("data") === 1) {
				p.stderr._events.data = [p.stderr._events.data];
			}
			p.stderr._events.data.unshift(clean);

			p.once("exit", function() {
				p.stdout.removeListener("data", clean);
				p.stderr.removeListener("data", clean);
			});
		});

		runner.compile.once("load:before", function() {
			log("Installing NPM dependencies. This may take a moment.");
		});

		runner.compile.once("load", function() {
			logspinner("Compiling...");
		});

		runner.compile.once("update", function() {
			stopSpinner();
			logUpdate.clear();
		});

		runner.compile.on("error", function handleError(e) {
			logUpdate.clear();
			logerror(e);
			log("App failed to build. Waiting for changes...");
		});

		runner.on("exit", function(code) {
			if (restarting) {
				restarting = false;
				return;
			}

			let l = [];
			let waiting = false;

			if (code) {
				if (!runner.ready) waiting = true;
				l.push("App exited with an error.");
			} else {
				waiting = true;
				l.push("App exited cleanly.");
			}

			if (waiting) l.push("Waiting for changes before restarting...");
			log(l.join(" "));
		});

		runner.on("ready", function(d) {
			if (!runner.firstRun) {
				rebootCount++;
				let reboot = rebootCount > 1 ? ` (x${rebootCount})` : "";
				logover(`Restarted server${reboot}`);
			} else {
				let l = [ "Application has started." ];
				if (d.port) l.push("View it locally at http://localhost:" + d.port);
				log(l.join(" "));
			}
		});

		runner.on("restart", function() {
			restarting = true;
		});

		runner.start().catch(error);
	},
	init: function() {
		let compile = new Compile(".", argv);
		compile.init().then(function(r) {
			if (r) log("Initialized new superfast application at '%s'", compile.cwd);
			else log("Superfast application already exists at '%s'", compile.cwd);
			log("Run 'superfast' to start a local dev server.");
		}).catch(error);
	},
	create: function(d) {
		Compile.create(d, argv).then(function() {
			log("Created superfast application '%s'", d);
			log("To Use:\n\n   $ cd %s\n   $ superfast\n", d);
		}).catch(error);
	},
	clear: function() {
		new Compile(".", argv).clear().then(function() {
			log("Removed cached build files.");
			log("Run 'superfast' to rebuild and start a local dev server.");
		}).catch(function(e) {
			error(e);
		});
	},
	compile: function() {
		let compile = new Compile(".", argv);
		compile.run().then(function() {
			log("Compiled");
		}).catch(error);
	},
	add: function() {
		let compile = new Compile(".", argv);
		let meta = compile.metadata;
		let result;

		meta.load().then(() => {
			return meta.add(toArray(arguments));
		}).then(function(r) {
			result = r;
			return meta.save();
		}).then(function() {
			return meta.install();
		}).then(function() {
			let len = size(result);
			if (!len) return console.log("\n  Added no packages.\n");
			console.log("\n  Added %s package%s:", len, len !== 1 ? "s" : "");
			forEach(result, function(v, n) {
				console.log("    + %s@%s", n, v);
			});
			console.log("");
		}).catch(error);
	},
	remove: function() {
		let compile = new Compile(".", argv);
		let meta = compile.metadata;
		let result;

		meta.load().then(() => {
			result = meta.remove(toArray(arguments));
			return meta.save();
		}).then(function() {
			let len = size(result);
			if (!len) return console.log("\n  Removed no packages.\n");
			console.log("\n  Removed %s package%s:", len, len !== 1 ? "s" : "");
			forEach(result, function(v, n) {
				console.log("    - %s (%s)", n, v);
			});
			console.log("");
		}).catch(error);
	},
	pack: function() {
		new Compile(".", argv).pack().then(function() {
			log("Packed");
		}).catch(error);
	},
	version: function() {
		var pkg = require("./package.json");
		console.log("%s v%s", pkg.name, pkg.version);
		process.exit(0);
	},
	help: function() {
		console.log("help!");
		process.exit(0);
	}
};

// command aliases
commands.run = commands.start;
commands.rm = commands.remove;

let cmd = argv._[0];
if (argv.help) cmd = "help";
else if (argv.version) cmd = "version";
else if (!argv._.length) cmd = "start";

if (has(commands, cmd)) commands[cmd].apply(null, argv._.slice(1));
else commands.help();
