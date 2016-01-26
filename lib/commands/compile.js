import * as log from "../utils/log.js";

export default function compile(argv, sf) {
	let c = new sf.Compiler(".", argv);

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

	c.run().then(function() {
		log.log("Compiled successfully.");
	}).catch(log.panic);
}
