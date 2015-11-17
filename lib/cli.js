import minimist from "minimist";
import {format} from "util";
import has from "lodash/object/has";
import forEach from "lodash/collection/forEach";
import size from "lodash/collection/size";

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

function log() {
	console.log("=> %s", format.apply(null, arguments));
}

function error(e) {
	if (e.bad_superfast) {
		log("This is not a superfast directory. Call 'superfast init' to set up this directory for superfast.");
		commands.help();
		return;
	}

	if (typeof e === "string") return log(e);
	if (e && e.human) return log(e.toString());

	console.error(e.stack || e);
	process.exit(1);
}

commands = {
	start: function() {
		let runner = new Runner();
		let restarting = false;

		runner.compile.once("build", function() {
			log("Compiled");
		});

		runner.compile.on("prebuild", function(full, f) {
			if (!full) log("Rebuilding changed files: %s", f.join(" "));
		});

		runner.on("exit", function(code) {
			if (restarting) {
				restarting = false;
				return;
			}

			if (code) {
				let l = [];
				l.push("App exited with an error.");
				if (!runner.ready) l.push("Waiting for changes before restarting...");
				log(l.join(" "));
			} else {
				log("App exited cleanly. Waiting for changes before restarting...");
			}
		});

		runner.on("ready", function(d) {
			if (!runner.firstRun) return;
			let l = [ "Application has started." ];
			if (d.port) l.push("View it locally at http://localhost:" + d.port);
			log(l.join(" "));
		});

		runner.on("error", function(e) {
			error(e);
			process.exit(1);
		});

		runner.on("watching", function() {
			log("Watching for file changes...");
		});

		runner.on("restart", function() {
			log("Restarting...");
			restarting = true;
		});

		runner.start().catch(error);
	},
	init: function() {
		let compile = new Compile(".", argv);
		compile.init().then(function(r) {
			if (r) log("Initialized new superfast application at '%s'", compile.cwd);
			else log("Superfast application already exists at '%s'", compile.cwd);
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
			log("Removed cached superfast build files");
		}).catch(function(e) {
			error(e);
		});
	},
	compile: function() {
		new Compile(".", argv).build().then(function() {
			log("Compiled");
		}).catch(function(e) {
			error(e);
		});
	},
	add: function() {
		let compile = new Compile(".", argv);
		compile.add.apply(compile, arguments).then(function(pkgs) {
			let len = size(pkgs);
			if (!len) return log("Added no packages.");
			log("Added %s package%s:", len, len !== 1 ? "s" : "");
			forEach(pkgs, function(v, n) {
				console.log("   + %s@%s", n, v);
			});
		}).catch(error);
	},
	remove: function() {
		let compile = new Compile(".", argv);
		compile.remove.apply(compile, arguments).then(function(pkgs) {
			let len = size(pkgs);
			if (!len) return log("Removed no packages.");
			log("Removed %s package%s:", len, len !== 1 ? "s" : "");
			forEach(pkgs, function(v, n) {
				console.log("   - %s@%s", n, v);
			});
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
