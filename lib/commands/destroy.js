import inquirer from "inquirer";
import * as log from "../utils/log.js";
import chalk from "chalk";

export default function destroy(argv, sf) {
	inquirer.prompt([{
		type: "confirm",
		name: "confirm",
		message: "Are you sure want to destroy this Superfast application?",
		default: false
	}], function(r) {
		if (!r.confirm) return;
		new sf.Compile(".", argv).destroy().then(function() {
			log.log("Completely destroyed Superfast data.");
			log.log(`Run ${chalk.green("superfast init")} to recreate the application.`);
		}).catch(function(e) {
			sf.panic(e);
		});
	});
}
