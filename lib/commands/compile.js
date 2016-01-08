import * as log from "../utils/log.js";

export default function compile(argv, sf) {
	let c = new sf.Compile(".", argv);

	c.once("install", function() {
		log.log("Installing NPM dependencies. This may take a moment.");
	});

	c.once("load", function() {
		log.spinner("Compiling...");
	});

	c.run().then(function() {
		log.log("Compiled successfully.");
	}).catch(log.panic);
}
