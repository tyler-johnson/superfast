import * as log from "../utils/log.js";
import chalk from "chalk";

export default function init(argv, sf) {
	log.spinner(`Initializing Superfast application ...`);

	let compile = new sf.Compiler(".", argv);
	compile.init().then(function(r) {
		if (r) log.log("Initialized new Superfast application at '%s'", compile.cwd);
		else log.log("Superfast application already exists at '%s'", compile.cwd);
		log.log(`Run ${chalk.green("superfast")} to start a local dev server.`);
	}).catch(log.panic);
}
