import confusedAsync from "./utils/confused-async.js";
import {EventEmitter} from "events";
import defaultOutputs from "./outputs/index.js";
import flatten from "lodash/array/flatten";

export default class Output extends EventEmitter {
	constructor(options) {
		super();
		options = options || {};

		// internal state
		this.s = {
			// holds output methods
			outputs: []
		};

		// user options
		this.options = options;

		//  add default outputs
		this.use(defaultOutputs);
	}

	use(...fns) {
		fns.forEach((t) => {
			if (Array.isArray(t)) {
				return this.use.apply(this, t);
			}

			if (typeof t !== "function") {
				throw new Error("Expecting function for transform.");
			}

			this.s.outputs.push(t);
		});

		return this;
	}

	run(ctx, ...args) {
		return Promise.all(this.s.outputs.map(o => {
			return confusedAsync(o, ctx, args);
		})).then((r) => flatten(r).filter((r) => {
			return r && r.path && r.source != null;
		}));
	}
}
