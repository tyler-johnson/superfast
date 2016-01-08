import * as log from "../utils/log.js";
import chalk from "chalk";

export default function start(argv, sf) {
	let runner = new sf.Runner(".", argv);
	let restarting = false;
	let rebootCount = 0;

	process.stdin.setEncoding("utf-8");
	process.stdin.on("data", function(v) {
		log.stopSpinner();
		log.done();

		switch (v.trim()) {
			case "q":
			case "quit":
			case "exit":
				process.exit(0);
				break;

			case "rs":
			case "restart":
				runner.restart();
				break;
		}
	});

	runner.on("start", function(p) {
		if (runner.firstRun) {
			log.update("Starting application server...");
		}

		let clean = function() {
			rebootCount = 0;
			log.stopSpinner();
			log.done();
		};

		if (p.stdout.listenerCount("data") === 1) {
			p.stdout._events.data = [p.stdout._events.data];
		}
		p.stdout._events.data.unshift(clean);

		if (p.stderr.listenerCount("data") === 1) {
			p.stderr._events.data = [p.stderr._events.data];
		}
		p.stderr._events.data.unshift(clean);

		p.once("exit", function() {
			p.stdout.removeListener("data", clean);
			p.stderr.removeListener("data", clean);
		});
	});

	runner.compile.once("install", function() {
		log.log("Installing NPM dependencies. This may take a moment.");
	});

	runner.compile.once("load", function() {
		log.spinner("Compiling...");
	});

	runner.compile.once("update", function() {
		log.stopSpinner();
		log.clear();
	});

	runner.compile.on("error", function handleError(e) {
		log.clear();
		if (log.badsuperfast(e)) {
			process.exit(1);
			return;
		}

		log.error(e);
		log.log("App failed to build. Waiting for changes...");
	});

	runner.on("exit", function(code) {
		if (restarting) {
			restarting = false;
			return;
		}

		let l = [];
		let waiting = false;

		if (code) {
			if (!runner.ready) waiting = true;
			l.push("App exited with an error.");
		} else {
			waiting = true;
			l.push("App exited cleanly.");
		}

		if (waiting) l.push("Waiting for changes before restarting...");
		log.log(l.join(" "));
	});

	runner.on("ready", function(d) {
		if (!runner.firstRun) {
			rebootCount++;
			let reboot = rebootCount > 1 ? ` (x${rebootCount})` : "";
			log.update(`Restarted server${reboot}`);
		} else {
			let l = [ "Application has started." ];
			if (d.port) l.push(`View it locally at ${chalk.blue("http://localhost:" + d.port)}`);
			log.log(l.join(" "));
			log.log(`Type ${chalk.yellow("q<enter>")} or ${chalk.yellow("Ctrl-C")} to stop the server.`);
		}
	});

	runner.on("restart", function() {
		restarting = true;
	});

	runner.start().catch(log.panic);
}
