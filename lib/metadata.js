import {resolve} from "path";
import {read as readJSON,write as writeJSON} from "./utils/json-file.js";
import uuid from "uuid";
import assign from "lodash/object/assign";
import pick from "lodash/object/pick";
import npa from "npm-package-arg";
import _latest from "npm-latest";
import promisify from "es6-promisify";
import map from "lodash/collection/map";
import {spawn} from "child_process";

var latest = promisify(_latest);

const RUNTIME = "superfast-runtime";

export default class Metadata {
	constructor(dir, options) {
		options = options || {};

		// internal state
		this.s = {
			// the root folder of the app to compile
			cwd: resolve(dir || "."),
			// the unique id
			id: null,
			// list of dependencies
			dependencies: {},
			// list of build dependencies
			devDependencies: {}
		};

		// user options
		this.options = options;
	}

	get cwd() { return this.s.cwd; }
	get loaded() { return Boolean(this.s.id); }
	get dependencies() { return this.s.dependencies; }
	get devDependencies() { return this.s.devDependencies; }

	load() {
		return readJSON(resolve(this.cwd, "package.json")).then((meta) => {
			if (!meta.id) {
				let err = new Error("Superfast metadata is missing an ID.");
				err.bad_superfast = true;
				throw err;
			}

			this.s.id = meta.id;
			assign(this.s.dependencies, meta.dependencies);
			assign(this.s.devDependencies, meta.devDependencies);
		});
	}

	save() {
		let meta = { id: this.id, private: true };
		if (!meta.id) meta.id = uuid.v4();

		// always add the runtime
		if (!this.s.dependencies[RUNTIME]) {
			this.s.dependencies[RUNTIME] = null;
		}

		return Promise.all([
			this._resolve_versions(this.s.dependencies),
			this._resolve_versions(this.s.devDependencies)
		]).then(() => {
			assign(meta, pick(this.s, "dependencies", "devDependencies"));
			return writeJSON(resolve(this.cwd, "package.json"), meta, null, 2);
		});
	}

	install() {
		return new Promise((resolve, reject) => {
			spawn("npm", [ "install", "--loglevel", "error" ], {
				cwd: this.cwd,
				stdio: "inherit"
			})
			.once("exit", function(code) {
				if (!code) resolve();
				let err = new Error("NPM install failed.");
				err.human = true;
				reject(err);
			})
			.once("error", reject);
		});
	}

	add() {

	}

	remove() {

	}

	_resolve_versions(deps) {
		return Promise.all(map(deps, (v, n) => {
			if (!v) return latest(n).then(res => {
				deps[n] = "~" + res.version;
			}, () => {
				deps[n] = "*";
			});
		})).then(() => deps);
	}
}
