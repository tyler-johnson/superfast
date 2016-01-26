import {relative} from "path";
import * as log from "../utils/log.js";
import chalk from "chalk";
import parseArgs from "../utils/parse-args.js";

export default function create(argv, sf) {
	let args = parseArgs(argv, sf);
	if (!args._.length) {
		return sf.panic("Expecting relative path to create an application at.");
	}

	let d = args._.shift();
	console.log();
	log.spinner(`Creating Superfast application in '${chalk.blue(d)}' ...`);

	sf.Compiler.create(d, args).then(function(c) {
		let d = relative(process.cwd(), c.cwd);
		let l = ["Created Superfast application"];
		if (args.name) l.push(chalk.bold(`${args.name}`));
		l.push(`in '${chalk.blue(d)}'`);
		log.log(l.join(" "));
		log.log("To Use:\n\n" + chalk.green("   $ cd %s\n   $ npm install\n   $ superfast\n"), d);
	}).catch(log.panic);
}
