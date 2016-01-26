import {assign} from "lodash";
import * as log from "../utils/log.js";
import parseArgs from "../utils/parse-args.js";

export default function pack(argv, sf) {
	let args = parseArgs(argv, sf, {
		string: [ "ignore" ],
		alias: {
			i: "ignore"
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

	c.pack().then(function() {
		log.log("Packaged successfully.");
	}).catch(log.panic);
}
