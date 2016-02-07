import {EventEmitter} from "events";
import {fork} from "child_process";
import path from "path";

export default class Runner extends EventEmitter {
	constructor(compiler, options) {
		super();

		options = options || {};

		// internal state
		this.s = {
			// compiler instance
			compiler: compiler,
			// whether or not the server is ready
			ready: false,
			// is this the firstrun
			firstRun: true
		};

		// user options
		this.options = options;

		// attach to compiler
		this._attach();
	}

	get compiler() { return this.s.compiler; }
	get ready() { return this.s.ready; }
	get firstRun() { return this.s.firstRun; }
	get running() { return Boolean(this.s.process); }
	get process() { return this.s.process; }

	_attach() {
		let tserver = false;
		let tclient = false;

		this.compiler.on("transform", (t) => {
			t.forEach(f => {
				if (f.isTarget("client")) tclient = true;
				if (f.isTarget("server")) tserver = true;
			});
		});

		this.compiler.on("compile", () => {
			if (this.running) {
				if (tserver) this.restart();
				else if (tclient) this.process.send({ type: "client_update" });
			}
			tserver = tclient = false;
		});
	}

	start(cb) {
		if (this.running) {
			if (typeof cb === "function") cb();
			return;
		}

		let onExit, onMessage, onParentExit, p;

		let args = [];
		args = args.concat(this.options._);

		let server_start = path.resolve(this.compiler.buildDir, "server.js");
		p = this.s.process = fork(server_start, args, {
			silent: true,
			cwd: this.compiler.cwd
		});

		p.stdout.pipe(process.stdout);
		p.stderr.pipe(process.stderr);

		// ensure child dies when the parent process does
		process.on("exit", onParentExit = () =>	this.kill());

		p.on("exit", onExit = (code) => {
			process.removeListener("exit", onParentExit);
			p.removeListener("exit", onExit);
			p.removeListener("message", onMessage);

			if (this.s.process === p) delete this.s.process;
			this.s.ready = false;
			this.emit("exit", code);
			this.s.firstRun = false;

			// restart if it exited with an error
			if (code && this.ready) this.restart();
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

		p.on("error", e => this.emit("error", e));
		this.emit("start", p);
	}

	kill(cb) {
		if (typeof cb !== "function") cb = ()=>{};
		if (this.s.process) {
			this.emit("kill");
			let p = this.s.process;
			this.once("exit", () => process.nextTick(cb));
			p.kill();
		} else {
			cb();
		}
	}

	restart(cb) {
		this.emit("restart");
		this.kill(() => this.start(cb));
	}
}
