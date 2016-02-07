import {assign} from "lodash";
import * as log from "../utils/log.js";
import parseArgs from "../utils/parse-args.js";
import fs from "fs-promise";
import inquirer from "inquirer";

export default function pack(argv, sf) {
	let args = parseArgs(argv, sf, {
		boolean: [ "yes" ],
		string: [ "ignore" ],
		alias: {
			i: "ignore",
			y: "yes"
		}
	});
	let c = new sf.Compiler(".", assign({}, args, {
		production: true
	}));

	c.on("step0", () => log.spinner("Preparing..."));
	c.on("step1", () => log.spinner("Loading Plugins..."));
	c.on("step2", () => log.spinner("Collecting Files..."));
	c.on("step3", () => log.spinner("Transforming..."));
	c.on("step4", () => log.spinner("Generating Bundles..."));

	let out = args._[0];
	let promise;

	if (out && !args.yes) {
		out = c.resolve(out);
		promise = fs.stat(out).catch((e) => {
			if (e.code !== "ENOENT" && e.code !== "ENOTDIR") throw e;
		}).then((stat) => {
			if (!stat) return;

			return new Promise((resolve, reject) => {
				inquirer.prompt([{
					type: "confirm",
					name: "confirm",
					message: `Something already exists at '${out}'. Are you sure you want to overwrite it?`,
					default: false
				}], function(r) {
					if (r.confirm) return resolve();

					let err = new Error("Stopping to prevent overwrite.");
					err.human = true;
					reject(err);
				});
			});
		});
	}

	Promise.resolve(promise).then(() => {
		return c.pack(out, args);
	}).then((o) => {
		log.log(`Packaged successfully to '${o}'.`);
	}).catch(log.panic);
}
