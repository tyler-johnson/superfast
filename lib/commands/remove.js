import {size,forEach} from "lodash";
import * as log from "../utils/log.js";
import chalk from "chalk";
import minimist from "minimist";
import {defaults} from "plain-merge";

export default function remove(argv, sf) {
	let args = minimist(argv._);
	let compile = new sf.Compile(".", defaults(args, argv));
	let meta = compile.metadata;
	let result;

	meta.load().then(() => {
		result = meta.remove(args._);
		return meta.save();
	}).then(function() {
		let len = size(result);
		if (!len) return console.log("\n  Removed no packages.\n");
		console.log("\n  Removed %s package%s:", len, len !== 1 ? "s" : "");
		forEach(result, function(v, n) {
			console.log("    - %s%s%s", chalk.bold(n), chalk.dim("@"), v);
		});
		console.log("");
	}).catch(log.panic);
}
