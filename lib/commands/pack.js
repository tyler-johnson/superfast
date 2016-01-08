import * as log from "../utils/log.js";

export default function pack(argv, sf) {
	let c = new sf.Compile(".", argv);

	c.once("install", function() {
		log.log("Installing NPM dependencies. This may take a moment.");
	});

	c.once("load", function() {
		log.spinner("Packaging application for production...");
	});

	c.pack().then(function() {
		log.log("Packed");
	}).catch(log.panic);
}
