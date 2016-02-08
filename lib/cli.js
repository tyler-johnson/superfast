import minimist from "minimist";
import {has} from "lodash";
import * as log from "./utils/log.js";

var superfast = require("./");

import shortHelp from "./commands/short-help";
import help from "./commands/help";
import version from "./commands/version";
import start from "./commands/start";
import create from "./commands/create";
import clear from "./commands/clear";
import compile from "./commands/compile";
import pack from "./commands/pack";

var commands = {
	shortHelp, help, version,
	start, create, clear,
	compile, pack
};

var argv = minimist(process.argv.slice(2), {
	string: [ "ignore" ],
	boolean: [ "help", "version", "verbose", "boring" ],
	alias: {
		h: "help", H: "help",
		v: "version", V: "version",
		i: "ignore"
	},
	stopEarly: true
});

// set verbose logging
log.setVerbose(argv.verbose);
log.setStatic(argv.boring);

// command aliases
commands.run = commands.start;
commands.rm = commands.remove;
commands.clean = commands.clear;

let cmd;
if (argv.help) cmd = "shortHelp";
else if (argv.version) cmd = "version";
else if (!argv._.length) cmd = "start";
else cmd = argv._.shift();

if (has(commands, cmd)) commands[cmd](argv, superfast);
else commands.shortHelp();
