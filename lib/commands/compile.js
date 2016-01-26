import * as log from "../utils/log.js";
import parseArgs from "../utils/parse-args.js";

export default function compile(argv, sf) {
	let args = parseArgs(argv, sf, {
		string: [ "ignore" ],
		boolean: [ "watch" ],
		alias: {
			i: "ignore",
			w: "watch"
		}
	});
	let c = new sf.Compiler(".", args);

	c.on("step0", () => log.spinner("Preparing..."));
	c.on("step1", () => log.spinner("Loading Plugins..."));
	c.on("step2", () => log.spinner("Collecting Files..."));
	c.on("step3", () => log.spinner("Transforming..."));
	c.on("step4", () => log.spinner("Generating Bundles..."));

	c.on("error", log.error);
	c.on("compile", () => {
		log.log("Compiled successfully.");
	});

	if (args.watch)	c.watch().catch(log.error);
	else c.flush().catch(log.panic);
}
