import inquirer from "inquirer";
import * as log from "../utils/log.js";
import chalk from "chalk";
import parseArgs from "../utils/parse-args.js";

export default function destroy(argv, sf) {
	let args = parseArgs(argv, {
		boolean: [ "yes" ],
		alias: { y: "yes", Y: "yes" }
	});

	let runDestroy = () => {
		new sf.Compiler(".", args).destroy().then(function() {
			log.log("Completely destroyed Superfast data.");
			log.log(`Run ${chalk.green("superfast init")} to recreate the application.`);
		}).catch(function(e) {
			sf.panic(e);
		});
	};

	if (args.yes) {
		runDestroy();
		return;
	}

	inquirer.prompt([{
		type: "confirm",
		name: "confirm",
		message: "Are you sure want to destroy this Superfast application?",
		default: false
	}], function(r) {
		if (!r.confirm) return;
		runDestroy();
	});
}
