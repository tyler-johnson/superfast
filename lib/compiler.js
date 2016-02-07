import {omit,debounce,isArray,map,flatten,assign,toArray,includes} from "lodash";
import {EventEmitter} from "events";
import ignore from "./utils/ignore.js";
import path from "path";
import {traverse,test as testTraverse} from "./utils/traverse-fs.js";
import {File,Module} from "./file";
import defaultTransforms from "./transforms/index.js";
import PouchDB from "pouchdb";
import confusedAsync from "./utils/confused-async";
import defaultOutputs from "./outputs/index.js";
import promisify from "es6-promisify";
import _mkdirp from "mkdirp";
import fs from "fs-promise";
import _resolve from "resolve";
import chokidar from "chokidar";
import Runner from "./runner";
import del from "del";
import {read as readJSON,write as writeJSON} from "./utils/json-file.js";
import tar from "tar-stream";
import {createGzip} from "zlib";
import slug from "./utils/slug";
import _cpr from "cpr";
import latest from "latest-versions";
import sortFiles from "./utils/sort-files";

var mkdirp = promisify(_mkdirp);
var resolveModule = promisify(_resolve);
var cpr = promisify(_cpr);

export default class Compiler extends EventEmitter {
	constructor(dir, options) {
		super();
		options = assign({}, Compiler.defaults, options);

		// internal state
		this.s = {
			// the root folder to build from
			cwd: path.resolve(dir || "."),
			// whether or not in production build mode
			production: Boolean(options.production),
			// paths to ignore while compiling
			ignore: ignore().addPattern(options.ignore),
			// names of plugins that have loaded
			plugins: [],
			// holds file objects
			files: new Map(),
			// additional NPM modules to require
			requires: new Map(),
			// will hold a database for caching files
			database: null,
			// holds all the transform functions
			transforms: [],
			// holds all the output functions
			outputs: {},
			// dir where build files go
			build_dir: options.buildDir || ".superfast",
			// whether or not setup has run
			setup: false
		};

		// user options
		this.options = options;

		// add default transforms
		this.transform(defaultTransforms);

		//  add default outputs
		this.output(defaultOutputs);
	}

	get cwd() { return this.s.cwd; }
	get production() { return this.s.production; }
	get ignore() { return this.s.ignore; }
	get database() { return this.s.database; }
	get transforms() { return this.s.transforms; }
	get outputs() { return this.s.outputs; }
	get buildDir() { return this.resolve(this.s.build_dir); }
	get files() { return this.s.files; }
	get requires() { return this.s.requires; }
	get watcher() { return this.s.watcher; }
	get hasSetup() { return this.s.setup; }

	// returns a path resolved to the compiler's cwd
	resolve() {
		let args = [this.cwd].concat(toArray(arguments));
		return path.resolve.apply(null, args);
	}

	// looks through the directory to find all matching files
	// sorts the files based on Meteor's sort rules
	scan(dir) {
		return traverse(this.resolve(dir || "."), ".sfignore").then(files => {
			return sortFiles(this.ignore.filter(files));
		});
	}

	test(file) {
		file = path.relative(this.cwd, path.resolve(this.cwd, file));
		return testTraverse(file, this.cwd, ".sfignore") && this.ignore._filter(file);
	}

	// extra files in the pipeline, added by plugins
	include(f, type, targets) {
		f = path.relative(this.cwd, path.resolve(this.cwd, f));
		let file = this._add_file(f);
		file.setType(type);
		file.target(targets);
		file.include = true;
		return file;
	}

	require(f, type, targets) {
		let file = this.s.requires.get(f);
		if (!file) {
			file = new Module(this, f);
			this.s.requires.set(f, file);
		}
		file.setType(type);
		file.target(targets);
		return file;
	}

	transform(...fns) {
		fns.forEach((t) => {
			if (Array.isArray(t)) {
				return this.transform.apply(this, t);
			}

			if (typeof t !== "function") {
				throw new Error("Expecting function for transform.");
			}

			this.s.transforms.push(t);
		});

		return this;
	}

	output(name, fn) {
		if (typeof name === "object" && name != null) {
			map(name, (f, n) => this.output(n, f));
			return this;
		}

		if (typeof name !== "string" || !name) {
			throw new Error("Expecting non-empty string for output name.");
		}

		if (typeof fn !== "function") {
			throw new Error("Expecting function for output.");
		}

		this.s.outputs[name] = fn;
		return this;
	}

	depend(plugins) {
		plugins = flatten([].concat(plugins)).filter(Boolean);

		let next = () => {
			if (!plugins.length) return Promise.resolve();
			let name = plugins.shift();

			if (!name || includes(this.s.plugins, name)) return next();

			return resolveModule(name, {
				basedir: this.cwd,
				packageFilter: function(pkg, file) {
					pkg.__filename = file;
					pkg.__dirname = path.dirname(file);

					if (pkg.superfast && typeof pkg.superfast === "string") {
						pkg._originalMain = pkg.main;
						pkg.main = pkg.superfast;
					}

					return pkg;
				}
			}).catch(e => {
				if (!/cannot find module/i.test(e.toString())) throw e;
			}).then((r) => {
				if (!isArray(r) || !r.length) return;
				this.s.plugins.push(name);

				let [file,pkg] = r;
				if (!pkg.superfast) return;

				return Promise.resolve().then(() => {
					let plugin = require(file);
					if (typeof plugin === "function") {
						return confusedAsync(plugin, null, [ this ]);
					}
				}).then(() => {
					this.emit("plugin", name);
				});
			}).then(next);
		};

		return next();
	}

	// creates the cwd if it doesn't exist and copies in example
	static create(d, options) {
		options = options || {};
		let compiler = new Compiler(d, options);

		return fs.stat(compiler.cwd).catch((e) => {
			if (e.code !== "ENOENT" && e.code !== "ENOTDIR") throw e;
		}).then((stat) => {
			if (stat) {
				let err = new Error("Something already exists at the path '"+ d +"'.");
				err.human = true;
				throw err;
			}

			return mkdirp(compiler.cwd);
		}).then(() => {
			return latest([ "superfast", "superfast-runtime" ]);
		}).then((r) => {
			return Promise.all([
				cpr(path.join(__dirname, "example"), compiler.cwd, {
					overwrite: true
				}),
				writeJSON(path.join(compiler.cwd, "package.json"), assign({
					name: options.name || path.basename(compiler.cwd),
					version: "0.0.0",
					scripts: { start: "superfast start" },
					dependencies: { "superfast-runtime": "~" + r["superfast-runtime"] },
					devDependencies: { superfast: "~" + r.superfast }
				}, options.package), null, 2)
			]);
		}).then(() => {
			return compiler;
		});
	}

	setup() {
		return Promise.resolve().then(() => {
			if (this.hasSetup) return;
			this.s.setup = true;

			return this._step0()
			.then(() => this._step1())
			.then(() => this.emit("setup"));
		}).catch((e) => {
			this.s.setup = false;
			throw e;
		});
	}

	compile(options, handle) {
		if (!this.hasSetup) {
			throw new Error("Hasn't setup yet.");
		}

		return this._step3(options)
		.then(() => this._step4(handle))
		.then(() => this.emit("compile"));
	}

	flush(options, handle) {
		return this.setup()
		.then(() => this._step2())
		.then(() => this.compile(assign({ force: true }, options), handle));
	}

	watch() {
		return this.setup().then(() => {
			let watcher = chokidar.watch(this.cwd, {
				ignoreInitial: true,
				persistent: true
			});

			let hasChanged = false;
			let change = () => hasChanged = true;

			watcher.on("all", (type, file) => {
				let rel = path.relative(this.cwd, file);
				let isadd = type === "add";
				if ((isadd || type === "unlink" || type === "change") && this.test(rel)) {
					this.emit("change", type, rel);
					if (isadd) this._add_file(rel);
					change();
				}
			});

			return this.flush().then(() => {
				let compiling = false;
				let reset = () => compiling = false;
				change = debounce(() => {
					if (compiling) return change();
					compiling = true;
					this.compile().then(reset).catch((e) => {
						reset();
						this.emit("error", e);
					});
				}, 500);

				if (hasChanged) change();
				return watcher;
			});
		});
	}

	pack(out, options) {
		if (typeof out === "object" && out != null) {
			[options,out] = [out,null];
		}

		let archive = !out || /\.tar\.gz$|\.tgz$/i.test(out);

		let bundle;
		let finish = () => bundle && bundle.finalize();

		return readJSON(this.resolve("package.json")).then((pkg) => {
			if (!out) {
				let name = "superfast-application";
				if (pkg.name) name = pkg.name;
				if (pkg.version) name += " " + pkg.version;
				out = slug(name) + (archive ? ".tar.gz" : "");
			}

			out = this.resolve(out);
			let p = [];

			function ship(f, src) {
				if (archive) {
					bundle.entry({ name: 'package/' + f }, src);
				} else {
					let fname = path.join(out, f);
					p.push(mkdirp(path.dirname(fname)).then(() => {
						return fs.writeFile(fname, src);
					}));
				}
			}

			return this.flush(options, (outputs) => {
				if (archive) {
					bundle = tar.pack();
					bundle.pipe(createGzip()).pipe(fs.createWriteStream(out));
				}

				let base = [];
				outputs.map(f => {
					let b = f.path.split("/").filter(Boolean)[0];
					if (b && !includes(base, b)) base.push(b);
					ship(f.path, f.source);
				});

				let pkgout = omit(pkg, "devDependencies", "superfast", "directories", "bin");
				pkgout.scripts = { start: "node .superfast/server.js" };
				pkgout.scripts.clean = "rm -rf " + base.concat("package.json").map((b) => JSON.stringify(b)).join(" ");
				ship("package.json", JSON.stringify(pkgout, null, 2));
			}).then(() => {
				return Promise.all(p);
			});
		}).then(() => {
			finish();
			return out;
		}, (e) => {
			finish();
			throw e;
		});
	}

	runner(options) {
		return new Runner(this, options);
	}

	clear() {
		return del(this.buildDir).then(() => {
			this.s.setup = false;
		});
	}

	// Step 0: create the superfast directory
	_step0() {
		this.emit("step0");
		return mkdirp(this.buildDir).then(() => {
			if (this.s.database) return;
			return new Promise((resolve, reject) => {
				this.s.database = new PouchDB(path.join(this.buildDir, "cache"), (err) => {
					if (err) reject(err);
					else resolve();
				});
			});
		});
	}

	// Step 1: load plugins
	_step1() {
		this.emit("step1");
		return fs.readFile(this.resolve("package.json"), {
			encoding: "utf-8"
		}).catch(e => {
			if (e.code !== "ENOENT" && e.code !== "ENOTDIR") throw e;
		}).then((src) => {
			let data = src ? JSON.parse(src) : {};
			let plugins = flatten([
				"./",
				data.dependencies ? Object.keys(data.dependencies) : [],
				data.devDependencies ? Object.keys(data.devDependencies) : []
			]);

			return this.depend(plugins);
		});
	}

	// Step 2: collect files
	_step2() {
		this.emit("step2");

		// scan dir for files and add files
		return this.scan().then(files => {
			files.forEach(f => this._add_file(f));
		});
	}

	// Step 3: transform files
	_step3(options) {
		this.emit("step3");

		let it = this.s.files.values();
		let removed = [];
		let transformed = [];

		let next = () => {
			let r = it.next();
			if (r.done) return Promise.resolve();

			let file = r.value;
			return file.transform(options).then((res) => {
				if (res) transformed.push(file);
				if (file.removed) removed.push(file.path);
				return next();
			});
		};

		return next().then(() => {
			this.emit("transform", transformed);
			this.emit("removed", removed.map(fp => {
				let f = this.files.get(fp);
				this.files.delete(fp);
				return f;
			}));
		});
	}

	// Step 4: output
	_step4(handle) {
		this.emit("step4");
		if (handle == null) handle = this._write_outputs;

		// get file paths
		let it = this.s.files.keys();
		let filepaths = [], i;
		while (true) {
			i = it.next();
			if (i.done) break;
			filepaths.push(i.value);
		}

		// sort file paths and get files in order
		filepaths = sortFiles(filepaths);
		let files = filepaths.map(fp => {
			return this.s.files.get(fp);
		});

		// run outputs
		return Promise.all(map(this.s.outputs, (o, name) => {
			return confusedAsync(o, this, [ files, this.options[name] || {} ]);
		})).then(res => {
			res = flatten(res).filter((r) => {
				return r && r.path && r.source != null;
			});

			return Promise.resolve(handle.call(this, res)).then(() => {
				this.emit("output", map(res, "path"));
			});
		});
	}

	_write_outputs(res) {
		return Promise.all(res.map(f => {
			let full = this.resolve(".superfast", f.path);
			return mkdirp(path.dirname(full)).then(() => {
				return fs.writeFile(full, f.source);
			}).then(() => {
				this.emit("output", f.path);
			});
		}));
	}

	_add_file(fpath) {
		let file = this.s.files.get(fpath);
		if (!file) {
			file = new File(this, fpath);
			this.s.files.set(fpath, file);
			this.emit("file", file);
		}
		return file;
	}
}

Compiler.defaults = {
	ignore: [ ".superfast", ".sfignore", "node_modules/", "public/" ]
};
