import Compile from "./compile";
import {EventEmitter} from "events";
import {fork} from "child_process";
import assign from "lodash/object/assign";
import contains from "lodash/collection/contains";

export default class Runner extends EventEmitter {
	constructor(dir, options) {
		super();

		options = options || {};

		// internal state
		this.s = {
			// compile instance
			compile: new Compile(dir, assign({
				browserify_cache: true
			}, options)),
			// whether or not the server is ready
			ready: false,
			// is this the firstrun
			firstRun: true
		};

		this.compile.on("error", this.emit.bind(this, "error"));

		this.options = options;
	}

	get compile() { return this.s.compile; }
	get ready() { return this.s.ready; }
	get firstRun() { return this.s.firstRun; }
	get running() { return Boolean(this.s.process); }
	get process() { return this.s.process; }
	get watcher() { return this.s.watcher; }

	start() {
		return this.compile.build().then(() => {
			this.s.watcher = this.compile.watch();

			this.compile.on("build", (seq, res, force) => {
				let server, client;
				if (!force) res.some(f => {
					server = server || contains(f.targets, "server");
					client = client || contains(f.targets, "client");
					return server && client;
				});

				if (force || server) this._restart();
				else if (client && this.running) {
					this.process.send({ type: "client_update" });
				}
			});

			this.s.watcher.on("error", (e) => this.emit("error", e));
			this.s.watcher.on("ready", () => {
				this.emit("watching", this.s.watcher);
				this._start();
			});
		});
	}

	_start(cb) {
		if (this.s.running) {
			if (typeof cb === "function") cb();
			return;
		}

		let onExit, onMessage, p;

		let args = [];
		if (this.options.port) args.push("--port", this.options.port);
		[].concat(this.options.config).filter(Boolean).forEach(function(c) {
			args.push("--config", c);
		});
		args = args.concat(this.options["--"]);

		p = this.s.process = fork(this.s.compile.resolve("server"), args);

		p.on("exit", onExit = (code) => {
			p.removeListener("exit", onExit);
			p.removeListener("message", onMessage);

			if (this.s.process === p) delete this.s.process;
			this.s.ready = false;
			this.emit("exit", code);
			this.s.firstRun = false;

			// restart if it exited with an error
			if (code && this.ready) this._restart();
		});

		p.on("message", onMessage = (msg) => {
			if (typeof msg !== "object" || msg == null) return;

			switch(msg.type) {
				case "ping": {
					p.send({ type: "pong", value: msg.value });
					break;
				}

				case "ready": {
					if (this.s.ready) break;
					this.s.ready = true;
					this.emit("ready", msg.address);
					if (typeof cb === "function") cb();
					break;
				}
			}
		});

		this.emit("start", p);
	}

	_kill(cb) {
		if (typeof cb !== "function") cb = ()=>{};
		if (this.s.process) {
			this.emit("kill");
			let p = this.s.process;
			this.once("exit", cb);
			p.kill();
		} else {
			cb();
		}
	}

	_restart(cb) {
		this.emit("restart");
		this._kill(() => this._start(cb));
	}
}
