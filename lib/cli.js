import minimist from "minimist";
import {has} from "lodash";

var superfast = require("./");

import shortHelp from "./commands/short-help";
import help from "./commands/help";
import version from "./commands/version";
import start from "./commands/start";
import init from "./commands/init";
import create from "./commands/create";
import destroy from "./commands/destroy";
import clear from "./commands/clear";
import compile from "./commands/compile";
import pack from "./commands/pack";

var commands = {
	shortHelp, help, version,
	start, init, create,
	clear, destroy,
	compile, pack
};

var argv = minimist(process.argv.slice(2), {
	string: [ "ignore" ],
	boolean: [ "help", "version"],
	alias: {
		h: "help", H: "help",
		v: "version", V: "version",
		i: "ignore"
	},
	stopEarly: true
});

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
