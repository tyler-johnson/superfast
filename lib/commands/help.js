import {spawn} from "child_process";
import * as log from "../utils/log";
import minimist from "minimist";

export default function help(argv) {
	let args = minimist(argv._);
	let name;
	if (args._.length) name = args._.shift();

	let p = spawn("man", [ `man/superfast${name != null ? "-" + name : ""}.1` ], {
		cwd: __dirname,
		stdio: "inherit"
	});

	p.on("error", log.panic);
	p.once("exit", function() {
		process.exit(0);
	});
}
