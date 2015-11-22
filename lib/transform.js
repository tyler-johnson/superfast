import confusedAsync from "./utils/confused-async.js";
import {EventEmitter} from "events";
import Promise from "any-promise";
import once from "lodash/function/once";
import defaultTransforms from "./transforms/index.js";

export default class Transform extends EventEmitter {
	constructor(options) {
		super();

		options = options || {};

		// internal state
		this.s = {
			// holds transform functions
			transforms: [],
			// file queue
			queue: [],
			// current files being transformed
			current: 0,
			// max number of files to be transforming at a time
			concurrency: options.concurrency || 1
		};

		// user options
		this.options = options;

		// add default transforms
		this.use(defaultTransforms);
	}

	get length() { return this.s.queue.length; }

	use(...fns) {
		fns.forEach((t) => {
			if (Array.isArray(t)) {
				return this.use.apply(this, t);
			}

			if (typeof t !== "function") {
				throw new Error("Expecting function for transform.");
			}

			this.s.transforms.push(t);
		});

		return this;
	}

	add(...files) {
		let p = this._add(files.length === 1 ? files[0] : files);
		this.flush();
		return p;
	}

	_add(f) {
		if (!f || typeof f !== "object") {
			throw new Error("Expecting object for file.");
		}

		if (Array.isArray(f)) return Promise.all(f.map(this._add, this));

		let c = { file: f };
		c.promise = new Promise((resolve, reject) => {
			c.resolve = resolve;
			c.reject = reject;
		});

		this.s.queue.push(c);
		return c.promise;
	}

	flush() {
		while (this.s.queue.length && this.s.current.length !== this.s.concurrency) {
			let cur = this.s.queue.shift();
			this.s.current++;
			this.emit("start", cur.file);

			let fns = this.s.transforms.slice(0);
			let next = () => {
				if (!fns.length) return Promise.resolve();
				return confusedAsync(fns.shift(), this, [ cur.file ]).then(next);
			};

			let finish = once((e) => {
				this.s.current--;
				if (e) cur.reject(e);
				else cur.resolve(cur.file);
				this.emit("finish", cur.file);
				if (!this.s.queue.length) this.emit("drain");
				else this.flush();
			});

			next().then(finish, finish);
		}

		return this;
	}
}
