import {size,forEach} from "lodash";
import * as log from "../utils/log.js";
import chalk from "chalk";
import minimist from "minimist";
import {defaults} from "plain-merge";

export default function add(argv, sf) {
	let args = minimist(argv._, { alias: { "skip-install": "skipInstall" } });
	let compile = new sf.Compile(".", defaults(args, argv));
	let meta = compile.metadata;
	let result;

	meta.load().then(() => {
		return meta.add(args._);
	}).then(function(r) {
		result = r;
		return meta.save();
	}).then(function() {
		if (args.skipInstall) return;
		return meta.install();
	}).then(function() {
		let len = size(result);
		if (!len) return console.log("\n  Added no packages.\n");
		console.log("\n  Added %s package%s:", len, len !== 1 ? "s" : "");
		forEach(result, function(v, n) {
			console.log("    + %s%s%s", chalk.bold(n), chalk.dim("@"), v);
		});
		console.log("");
	}).catch(log.panic);
}
