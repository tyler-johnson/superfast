import {resolve,join} from "path";
import {read as readJSON,write as writeJSON} from "./utils/json-file.js";
import uuid from "uuid";
import assign from "lodash/object/assign";
import pick from "lodash/object/pick";
import npa from "npm-package-arg";
import promisify from "es6-promisify";
import {spawn} from "child_process";
import has from "lodash/object/has";
import readPkg from "package-json";
import _request from "request";
import hash from "./utils/hash.js";
import {maxSatisfying} from "semver";

var request = promisify(_request);
var thispkg = require("./package.json");

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
	get id() { return this.s.id; }
	get dependencies() { return this.s.dependencies; }
	get devDependencies() { return this.s.devDependencies; }

	dephash() {
		return hash(["evD",""].map(p => {
			return JSON.stringify(this[`d${p}ependencies`]);
		}).join(""));
	}

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
		meta.superfast = { version: thispkg.version };

		// always add the runtime
		if (!this.s.dependencies[RUNTIME]) {
			this.s.dependencies[RUNTIME] = null;
		}

		assign(meta, pick(this.s, "dependencies", "devDependencies"));
		return writeJSON(resolve(this.cwd, "package.json"), meta, null, 2);
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

	add(name, options) {
		options = options || {};

		if (Array.isArray(name)) {
			return Promise.all(name.map(n => this.add(n, options))).then(r => {
				return assign.apply(null, r);
			});
		}

		let deps = this.s["d" + (options.dev ? "evD" : "") + "ependencies"];
		let info = npa(name);

		// don't modify existing entries if a version wasn't specified
		if (info.name && !info.rawSpec && has(deps, info.name)) {
			return Promise.resolve(null);
		}

		return this._resolve_package(info.raw).then((pkg) => {
			if (info.rawSpec) deps[pkg.name] = info.spec;
			else if (!has(deps, pkg.name)) deps[pkg.name] = "~" + pkg.version;
			else return null;
			return { [pkg.name]: pkg.version };
		});
	}

	remove(name) {
		if (Array.isArray(name)) {
			return assign.apply(null, name.map(n => this.remove(n)));
		}

		let pkg = npa(name);
		if (!pkg.name) {
			throw new Error("No package name provided.");
		}

		if (has(this.s.dependencies, pkg.name)) {
			let v = this.s.dependencies[pkg.name];
			delete this.s.dependencies[pkg.name];
			return { [pkg.name]: v };
		}

		if (has(this.s.devDependencies, pkg.name)) {
			let v = this.s.devDependencies[pkg.name];
			delete this.s.devDependencies[pkg.name];
			return { [pkg.name]: v };
		}

		return null;
	}

	_resolve_package(name, version) {
		if (version) name += "@" + version;
		let info = npa(name);

		if (info.type === "local") {
			return readJSON(join(info.spec, "package.json"));
		}

		if (info.type === "tag" || info.type === "version") {
			return readPkg(info.name, info.spec);
		}

		if (info.type ==="range") {
			return readPkg(info.name).then((pkg) => {
				var v = maxSatisfying(Object.keys(pkg.versions), info.spec);
				if (!v) throw new Error(`No version found for '${pkg.name}' that satisfies version range ${info.spec}.`);
				return pkg.versions[v];
			});
		}

		if (info.type === "hosted" && info.hosted.directUrl) {
			return request({
				method: "GET",
				url: info.hosted.directUrl,
				json: true
			}).then(r => r[1]);
		}

		throw new Error(`Superfast does not support ${info.type} package references.`);
	}
}
