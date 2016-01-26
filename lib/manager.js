import {toArray,assign,result} from "lodash";
import Compiler from "./com";
import path from "path";
import {EventEmitter} from "events";

export default class Manager extends EventEmitter {
	constructor(dir, options) {
		super();
		options = assign({}, result(this, "defaults"), options);

		// internal state
		this.s = {
			// the root folder to build from
			cwd: path.resolve(dir || "."),
			// holds the compiler instance
			compiler: new Compiler(dir, options)
		};

		// user options
		this.options = options;
	}

	get cwd() { return this.s.cwd; }
	get compiler() { return this.s.compiler; }

	// returns a path resolved to the compiler's cwd
	resolve() {
		let args = [this.cwd].concat(toArray(arguments));
		return path.resolve.apply(null, args);
	}

	// runs the compilation pipeline
	compile() {

	}

	// starts a local development server
	start() {

	}
}
