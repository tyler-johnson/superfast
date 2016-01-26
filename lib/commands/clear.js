import * as log from "../utils/log.js";
import chalk from "chalk";
import parseArgs from "../utils/parse-args.js";

export default function clear(argv, sf) {
	let args = parseArgs(argv, sf);
	new sf.Compiler(".", args).clear().then(function() {
		log.log("Removed cached build files.");
		log.log(`Run ${chalk.green("superfast")} to rebuild and start a local dev server.`);
	}).catch(log.panic);
}
