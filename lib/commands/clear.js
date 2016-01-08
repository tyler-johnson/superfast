import * as log from "../utils/log.js";
import chalk from "chalk";

export default function clear(argv, sf) {
	new sf.Compile(".", argv).clear().then(function() {
		log.log("Removed cached build files.");
		log.log(`Run ${chalk.green("superfast")} to rebuild and start a local dev server.`);
	}).catch(log.panic);
}
