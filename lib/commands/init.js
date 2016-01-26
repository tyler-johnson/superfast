import * as log from "../utils/log.js";
import chalk from "chalk";
import parseArgs from "../utils/parse-args.js";

export default function init(argv, sf) {
	log.spinner(`Initializing Superfast application ...`);

	let args = parseArgs(argv, sf);
	let compile = new sf.Compiler(".", args);

	compile.init().then(function() {
		log.log("Initialized new Superfast application at '%s'", compile.cwd);
		log.log(`Run ${chalk.green("superfast")} to start a local dev server.`);
	}).catch(log.panic);
}
