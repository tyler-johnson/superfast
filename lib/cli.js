import minimist from "minimist";
import {format} from "util";
import has from "lodash/object/has";
import size from "lodash/collection/size";
import toArray from "lodash/lang/toArray";
import forEach from "lodash/collection/forEach";
import logUpdate from "log-update";
import spinner from "elegant-spinner";
import inquirer from "inquirer";
import {relative} from "path";
import chalk from "chalk";

var superfast = require("./");
var Compile = superfast.Compile;
var Runner = superfast.Runner;

let commands;
let argv = minimist(process.argv.slice(2), {
	string: [ "ignore" ],
	boolean: [ "help", "version"],
	alias: {
		h: "help", H: "help",
		v: "version", V: "version",
		i: "ignore"
	},
	stopEarly: true
});

var spinnerInterval;
var spinnerFrame = (function(frame) {
	return function() {
		return chalk.red(frame());
	};
}(spinner()));

function stopSpinner() {
	if (!spinnerInterval) return;
	clearTimeout(spinnerInterval);
	spinnerInterval = null;
}

function log() {
	stopSpinner();
	logUpdate.clear();
	console.log(chalk.dim("=>") + " %s", format.apply(null, arguments));
}

function logover() {
	stopSpinner();
	logUpdate(chalk.dim("=>") + " " + format.apply(null, arguments));
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

function badsuperfast(e) {
	if (e.bad_superfast) {
		log(`This is not a Superfast directory.`);
		log(`Use ${chalk.green("superfast init")} to set up this directory for Superfast.`);
		log(`Use ${chalk.green("superfast help")} for more information on available commands.`);
		return true;
	}

	return false;
}

function error(e) {
	if (!badsuperfast(e)) logerror(e);
	process.exit(1);
}

commands = {
	start: function() {
		let runner = new Runner(".", argv);
		let restarting = false;
		let rebootCount = 0;

		process.stdin.setEncoding("utf-8");
		process.stdin.on("data", function(v) {
			stopSpinner();
			logUpdate.done();

			switch (v.trim()) {
				case "q":
				case "quit":
				case "exit":
					process.exit(0);
					break;

				case "rs":
				case "restart":
					runner.restart();
					break;
			}
		});

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
			if (badsuperfast(e)) {
				process.exit(1);
				return;
			}

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
				if (d.port) l.push(`View it locally at ${chalk.blue("http://localhost:" + d.port)}`);
				log(l.join(" "));
				log(`Type ${chalk.green("q<enter>")} or use ${chalk.yellow("Ctrl-C")} to stop the server.`);
			}
		});

		runner.on("restart", function() {
			restarting = true;
		});

		runner.start().catch(error);
	},
	init: function() {
		logspinner(`Initializing Superfast application ...`);

		let compile = new Compile(".", argv);
		compile.init().then(function(r) {
			if (r) log("Initialized new Superfast application at '%s'", compile.cwd);
			else log("Superfast application already exists at '%s'", compile.cwd);
			log(`Run ${chalk.green("superfast")} to start a local dev server.`);
		}).catch(error);
	},
	create: function() {
		let args = minimist(argv._);

		if (!args._.length) {
			return error("Expecting relative path to create an application at.");
		}

		let d = args._.shift();
		console.log();
		logspinner(`Creating Superfast application in '${chalk.blue(d)}' ...`);

		Compile.create(d, args).then(function(c) {
			let d = relative(process.cwd(), c.source());
			let l = ["Created Superfast application"];
			if (args.name) l.push(chalk.bold(`${args.name}`));
			l.push(`in '${chalk.blue(d)}'`);
			log(l.join(" "));
			log("To Use:\n\n" + chalk.green("   $ cd %s\n   $ superfast\n"), d);
		}).catch(error);
	},
	clear: function() {
		new Compile(".", argv).clear().then(function() {
			log("Removed cached build files.");
			log(`Run ${chalk.green("superfast")} to rebuild and start a local dev server.`);
		}).catch(function(e) {
			error(e);
		});
	},
	destroy: function() {
		inquirer.prompt([{
			type: "confirm",
			name: "confirm",
			message: "Are you sure want to destroy this Superfast application?",
			default: false
		}], function(r) {
			if (!r.confirm) return;
			new Compile(".", argv).destroy().then(function() {
				log("Completely destroyed Superfast data.");
				log(`Run ${chalk.green("superfast init")} to recreate the application.`);
			}).catch(function(e) {
				error(e);
			});
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
		let args = minimist(argv._);

		if (!args._.length) {
			console.log(`
	$ superfast <command> <options>

	Commands:
		create <name>      Creates a new Superfast application at <name>.
		init               Initiates a new Superfast application in this directory.
		start              Starts a local development server in this directory.
		compile            Prepares the Superfast application to be run.
		add <name>...      Add a plugin to this application.
		remove <name>...   Remove a plugin from this application.
		clear              Deletes cached build files for the application.
		destroy            Removes all Superfast files in this directory.
		help [command]     Prints help information for a specific command.
		version            Prints the current version of the Superfast CLI.
`.replace(/\t/g,"  "));
		}

		process.exit(0);
	}
};

// command aliases
commands.run = commands.start;
commands.rm = commands.remove;
commands.clean = commands.clear;

let cmd;
if (argv.help) cmd = "help";
else if (argv.version) cmd = "version";
else if (!argv._.length) cmd = "start";
else cmd = argv._.shift();

if (has(commands, cmd)) commands[cmd]();
else commands.help();
