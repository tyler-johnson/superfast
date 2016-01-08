import Compile from "./compile";
import {EventEmitter} from "events";
import {fork} from "child_process";
import {debounce,contains,flatten} from "lodash";
import chokidar from "chokidar";
import {relative} from "path";

export default class Runner extends EventEmitter {
	constructor(dir, options) {
		super();

		options = options || {};

		// internal state
		this.s = {
			// compile instance
			compile: new Compile(dir, options),
			// whether or not the server is ready
			ready: false,
			// is this the firstrun
			firstRun: true
		};

		this.options = options;
	}

	get compile() { return this.s.compile; }
	get ready() { return this.s.ready; }
	get firstRun() { return this.s.firstRun; }
	get running() { return Boolean(this.s.process); }
	get process() { return this.s.process; }
	get watcher() { return this.s.watcher; }

	start() {
		let built = false;
		let files = [];
		let watcher = this.s.watcher = chokidar.watch(".", {
			cwd: this.compile.cwd,
			ignoreInitial: true,
			persistent: true
		});

		let emitBuildError = (e) => {
			built = true;
			this.compile.emit("error", e);
		};

		let invalidate = debounce(() => {
			let force = !Array.isArray(files);
			let f = force ? null : files.slice(0);
			files = [];

			if (!force && !f.length) {
				if (!this.running) this._start();
				return;
			}

			this.emit("rebuild", force, f);

			return (force ? this.compile.run() : this.compile.update(f)).then((res) => {
				let server, client;
				if (!force) flatten(res).filter(Boolean).some(f => {
					server = server || contains(f.targets, "server");
					client = client || contains(f.targets, "client");
					return server && client;
				});

				if (!this.running) this._start();
				else if (force || server) this.restart();
				else if (client && this.running) {
					this.process.send({ type: "client_update" });
				}
			}).catch(emitBuildError);
		}, 500);

		let rebuild = (file) => {
			if (file && Array.isArray(files)) files.push(file);
			else files = true;
			if (built) invalidate();
		};

		watcher.on("all", (type, full) => {
			if (!contains(["add","change","unlink"], type)) return;
			let file = relative(this.compile.cwd, full);
			if (file === ".sfignore") rebuild();
			if (this.compile.test(file) && Array.isArray(files)) rebuild(file);
		});

		return Promise.all([
			this.compile.run().then(() => {
				built = true;
				invalidate();
			}).catch(emitBuildError),
			new Promise((resolve, reject) => {
				let onError, onReady;
				let clean = () => {
					watcher.removeListener("error", onError);
					watcher.removeListener("ready", onReady);
				};

				watcher.on("error", onError = (e) => {
					clean();
					reject(e);
				});

				watcher.on("ready", onReady = () => {
					clean();
					resolve();
				});
			}).then(() => {
				this.emit("watching", watcher);
			})
		]);
	}

	_start(cb) {
		if (this.s.running) {
			if (typeof cb === "function") cb();
			return;
		}

		let onExit, onMessage, onParentExit, p;

		let args = [];
		args.push("--cwd", this.compile.buildDir);
		args = args.concat(this.options._);

		p = this.s.process = fork(this.s.compile.resolve("server"), args, {
			silent: true
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
		this.kill(() => this._start(cb));
	}
}
