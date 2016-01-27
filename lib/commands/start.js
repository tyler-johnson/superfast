import * as log from "../utils/log.js";
import chalk from "chalk";

export default function start(argv, sf) {
	let c = new sf.Compiler(".", argv);
	let runner = c.runner();
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

	c.on("plugin", (n) => log.verbose("plugin : '%s'", n));
	c.on("file", (f) => log.verbose("file : '%s'", f.path));

	c.on("step0", () => log.spinner("Preparing..."));
	c.on("step1", () => log.spinner("Loading Plugins..."));
	c.on("step2", () => log.spinner("Collecting Files..."));
	c.on("step3", () => log.spinner("Transforming..."));
	c.on("step4", () => log.spinner("Generating Bundles..."));

	c.on("error", (e) => {
		log.clear();
		if (log.badsuperfast(e)) {
			process.exit(1);
			return;
		}

		log.error(e);
		log.log("App failed to build. Waiting for changes...");
	});

	c.on("compile", () => {
		log.clear();
		if (!runner.running) runner.start();
	});

	c.watch().catch(log.panic);
}
