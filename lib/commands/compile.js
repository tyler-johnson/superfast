import {assign} from "lodash";
import * as log from "../utils/log.js";
import minimist from "minimist";

export default function compile(argv, sf) {
	let args = assign({}, argv, minimist(argv._));
	let c = new sf.Compiler(".", args);

	c.on("step0", function() {
		log.spinner("Preparing...");
	});

	c.on("step1", function() {
		log.spinner("Loading Plugins...");
	});

	c.on("step2", function() {
		log.spinner("Collecting Files...");
	});

	c.on("step3", function() {
		log.spinner("Transforming...");
	});

	c.on("step4", function() {
		log.spinner("Generating Bundles...");
	});

	c.on("error", (e) => {
		log.error(e);
	});

	c.on("compile", () => {
		log.log("Compiled successfully.");
	});

	if (args.watch)	c.watch().catch(log.error);
	else c.flush().catch(log.panic);
}
