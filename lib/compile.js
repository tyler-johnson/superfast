import {isArray,toArray,contains,assign} from "lodash";
import {EventEmitter} from "events";
import {join,resolve,extname,dirname,basename} from "path";
import fs from "fs-promise";
import {map as mapSeries} from "./utils/promise-series.js";
import ignore from "./utils/ignore.js";
import promisify from "es6-promisify";
import _mkdirp from "mkdirp";
import Metadata from "./metadata.js";
import Transform from "./transform.js";
import Output from "./output.js";
import slug from "./utils/slug";
import hash from "./utils/hash.js";
import {Collection,Model} from "backbone-lodash";
import del from "del";
import _cpr from "cpr";
import {read as readJSON,write as writeJSON} from "./utils/json-file.js";
import tar from "tar-stream";
import {createGzip} from "zlib";
import _resolve from "resolve";
import confusedAsync from "./utils/confused-async.js";

var mkdirp = promisify(_mkdirp);
var cpr = promisify(_cpr);
var resolveModule = promisify(_resolve);

var keepServer = ignore().addPattern([ "client/", "*.client.*", "client.*" ]).createFilter();
var keepClient = ignore().addPattern([ "server/", "*.server.*", "server.*" ]).createFilter();

export default class Compile extends EventEmitter {
	constructor(dir, options) {
		super();
		options = options || {};

		// internal state
		this.s = {
			// the root folder of the app to compile
			cwd: resolve(dir || "."),
			// paths to ignore while compiling
			ignore: ignore().addPattern(Compile.ignore.concat(options.ignore).filter(Boolean)),
			// raw source files to add before actual files
			includes: [],
			// holds transformed file results
			files: new Collection(null, { model: Model.extend({ idAttribute: "path" }) }),
			// transforms files before ouput
			transform: new Transform(options),
			// plugins run by the system
			plugins: []
		};

		// other parts
		this.s.metadata = new Metadata(this.buildDir, options);
		this.s.output = new Output({ baseDir: this.buildDir });

		// user options
		this.options = options;
	}

	get id() { return this.s.meta.id; }
	get metadata() { return this.s.metadata; }
	get transform() { return this.s.transform; }
	get output() { return this.s.output; }
	get files() { return this.s.files; }
	get includes() { return this.s.includes; }
	get cwd() { return this.s.cwd; }
	get buildDir() { return this.resolve(); }

	source() {
		let args = [this.cwd].concat(toArray(arguments));
		return resolve.apply(null, args);
	}

	resolve() {
		let args = [".superfast"].concat(toArray(arguments));
		return this.source.apply(this, args);
	}

	ignore() {
		return ignore.merge(this.s.ignore, this.s.ignore_file);
	}

	test(f) {
		return Boolean(this.ignore()._filter(f));
	}

	// creates the .superfast directory and creates metadata files
	init() {
		return this.metadata.load().then(() => false, e => {
			if (!e.bad_superfast) throw e;

			// make the build directory
			return mkdirp(this.buildDir)

			// write to metadata file
			.then(() => this.metadata.save())

			// return true signaling that this is a fresh install
			.then(() => true);
		});
	}

	reset() {
		this.files.reset();
		this.emit("reset");
	}

	// preps instance for use
	load() {
		this.reset();

		return this.metadata.load()
		.then(() => this._install())
		.then(() => this.emit("load"));
	}

	// full build
	run(options) {
		return (this.metadata.loaded ? Promise.resolve() : this.load())
		.then(() => this._update_ignore_file())
		.then(() => Compile.scandir(this.cwd, this.ignore()))
		.then((files) => this.update(this.s.includes.concat(files), options));
	}

	// transform + output on individual files
	update(files, options) {
		if (!this.metadata.loaded) {
			throw new Error("Metadata has not been loaded yet.");
		}

		files = [].concat(files).filter(Boolean);
		return this._update_files(files).then((res) => {
			return this._output(options).then((o) => {
				this.emit("update", res, o, options);
				return res;
			});
		});
	}

	include(file, targets) {
		if (!isArray(targets)) targets = targets ? [targets] : [];
		this.s.includes.push([ file, targets ]);
		return this;
	}

	// similar to run, but outputs to a tar archive
	pack(options) {
		let bundle;
		let finish = () => bundle && bundle.finalize();

		return Promise.all([
			this.load()
			.then(() => Compile.scandir(this.cwd, this.ignore()))
			.then((f) => this._update_files(f)),
			readJSON(this.source("package.json"))
		]).then((r) => {
			let pkg = r[1];

			bundle = tar.pack();
			let name = "superfast-application";
			if (pkg.name) name = pkg.name;
			if (pkg.version) name += " " + pkg.version;
			let tarfile = slug(name) + ".tar.gz";
			bundle.pipe(createGzip()).pipe(fs.createWriteStream(tarfile));

			function ship(name, src) {
				bundle.entry({ name: 'package/' + name }, src);
			}

			return this.output.run(this, this.files.toJSON(), assign({
				production: true,
				package: pkg
			}, options)).then(res => {
				res.forEach(f => ship(f.path, f.source));
			});
		}).then((r) => {
			finish();
			return r;
		}, (e) => {
			finish();
			throw e;
		});
	}

	// removes files created with build, but not metadata
	clear() {
		return del([ "*", "!package.json" ], {
			cwd: this.buildDir
		});
	}

	// similar to init but also creates the cwd if it doesn't exist and copies in example
	static create(d, options) {
		if (!d || d.indexOf("/") > -1) {
			let err = new Error("Invalid directory name.");
			err.human = true;
			return Promise.reject(err);
		}

		options = options || {};
		let full = resolve(d);
		let compiler = new Compile(full, options);

		return fs.stat(full).catch(function(e) {
			if (e.code !== "ENOENT" && e.code !== "ENOTDIR") throw e;
		}).then(function(stat) {
			if (stat) {
				let err = new Error("Something already exists called '"+ d +"'.");
				err.human = true;
				throw err;
			}

			return fs.mkdir(full);
		}).then(function() {
			return Promise.all([
				cpr(resolve(__dirname, "example"), full, {
					overwrite: true
				}),
				writeJSON(resolve(full, "package.json"), assign({
					name: d,
					version: "0.0.0"
				}, options.package), null, 2)
			]);
		}).then(function() {
			return compiler.init();
		}).then(function() {
			return compiler;
		});
	}

	// finds all files in a directory recursively
	// pass ignore to avoid entire subtrees
	static scandir(baseDir, toIgnore, dir, out) {
		if (!dir) dir = ".";
		if (!out) out = [];
		let fulldir = join(baseDir, dir);

		let ign = toIgnore;
		if (!(ign instanceof ignore.Ignore)) {
			ign = ignore();
			if (toIgnore) ign.addPattern(toIgnore);
		}

		return fs.readdir(fulldir).then(mapSeries(function(file) {
			let full = join(baseDir, dir, file);

			return fs.stat(full).then(function(stat) {
				if (stat.isFile()) return file;
				if (stat.isDirectory()) {
					file += "/";
					return file;
				}
			});
		})).then(function(files) {
			files = ign.filter(files.filter(Boolean)).reduce(function(memo, file) {
				// lib files are always first
				if (/^lib\.|\.lib\.|^lib\/$/i.test(file)) {
					memo[0].push(file);
				}

				// main files are always last
				else if (/^main\.|\.main\.|^main\/$/i.test(file)) {
					memo[2].push(file);
				}

				else {
					memo[1].push(file);
				}

				return memo;
			}, [[],[],[]]).reduce(function(memo, group) {
				memo.push.apply(memo, group.sort());
				return memo;
			}, []).map(f => join(dir, f));

			return mapSeries(files, function(file) {
				if (file.substr(-1) === "/") {
					return Compile.scandir(baseDir, toIgnore, file, out);
				}

				out.push(file);
			});
		}).then(function() {
			return out;
		});
	}

	_update_ignore_file() {
		return fs.readFile(this.source(".sfignore"), {
			encoding: "utf-8"
		}).catch(e => {
			if (e.code !== "ENOENT" && e.code !== "ENOTDIR") throw e;
		}).then((src) => {
			this.s.ignore_file = ignore().addPattern((src || "").split(/\r?\n/g));
		});
	}

	_filename(file, type) {
		let base = join(dirname(file), slug(basename(file, extname(file))));
		base += "-" + hash(file).toString(16);
		base += type === "style" ? ".css" : ".js";
		return base;
	}

	// generates file objects and transforms them
	_update_files(files) {
		let p = [];

		return mapSeries(files, (file) => {
			let targets;
			if (isArray(file)) [file,targets] = file;

			let full = this.source(file);
			return fs.stat(full).then((stat) => {
				if (!stat.isFile()) return;
				return fs.readFile(full, { encoding: "utf-8" }).then((src) => {
					p.push(this._transform(file, targets, src, stat));
					return true;
				});
			}, (e) => {
				if (e.code === "ENOENT" || e.code === "ENOTDIR") {
					p.push(this._remove_file(file));
					return true;
				}

				throw e;
			}).then(r => {
				if (!r) p.push(void 0);
			});
		}).then(() => {
			return Promise.all(p);
		});
	}

	// runs the transform pipeline on a single file
	_transform(file, targets, src, stat) {
		return this.transform.add({
			path: file,
			fullpath: this.source(file),
			stat: stat,
			source: src
		}).then(f => {
			if (!f || f.source == null || !contains(["style","script"], f.type)) return;

			let res = {};
			res.type = f.type;
			res.originalPath = file;
			res.path = join("build", this._filename(file, f.type));
			res.fullPath = this.resolve(res.path);
			res.size = f.source.length;

			// resolve true targets
			res.targets = [];
			let t = isArray(f.targets) ? f.targets : isArray(targets) ? targets : [ "client", "server" ];
			if (contains(t, "server") && f.type !== "style" && keepServer(file)) res.targets.push("server");
			if (contains(t, "client") && keepClient(file)) res.targets.push("client");

			// write the contents
			return mkdirp(dirname(res.fullPath)).then(function() {
				return fs.writeFile(res.fullPath, f.source);
			}).then(() => {
				this.files.set(res, { remove: false });
				return res;
			});
		});
	}

	_remove_file(file) {
		let f = this.files.findWhere({ originalPath: file });
		if (!f) return Promise.resolve();

		// remove from file cache
		this.s.files.remove(f);

		// remove from the filesystem
		return fs.unlink(f.get("fullPath")).catch((e) => {
			if (e.code !== "ENOENT") throw e;
		}).then(() => {
			let cleanEmpty = (f) => {
				let dir = dirname(f);
				if (dir === this.buildDir) return;
				return fs.readdir(dir).catch((e) => {
					if (e.code !== "ENOENT" && e.code !== "ENOTDIR") throw e;
				}).then((c) => {
					if (!c || c.length) return;
					return fs.rmdir(dir).then(() => cleanEmpty(dir));
				});
			};

			return cleanEmpty(f.get("fullPath"));
		}).then(() => {
			let res = f.toJSON();
			res.removed = true;
			return res;
		});
	}

	_output(options) {
		// run output on all files
		return this.output.run(this, this.files.toJSON(), options || {}).then(res => {
			return Promise.all(res.map(f => {
				return fs.writeFile(this.resolve(f.path), f.source).then(() => f.path);
			}));
		});
	}

	_install(bid) {
		if (bid == null) bid = this.metadata.dephash();

		return this.metadata.install()
		.then(() => this._load_plugins())
		.then(() => {
			let nid = this.metadata.dephash();

			if (bid !== nid) {
				return this.metadata.save()
				.then(() => this._install(nid));
			}
		});
	}

	_load_plugins() {
		return Promise.all(["../"].concat(
			Object.keys(this.metadata.dependencies),
			Object.keys(this.metadata.devDependencies)
		).map(name => {
			return resolveModule(name, {
				basedir: this.buildDir,
				packageFilter: function(pkg, file) {
					pkg.__filename = file;
					pkg.__dirname = dirname(file);

					if (pkg.superfast && typeof pkg.superfast === "string") {
						pkg._originalMain = pkg.main;
						pkg.main = pkg.superfast;
					}

					return pkg;
				}
			}).catch(e => {
				if (!/cannot find module/i.test(e.toString())) throw e;
			}).then((r) => {
				if (isArray(r) && r.length >= 2) {
					return this._load_plugin(r[0], r[1]);
				}
			});
		}));
	}

	_load_plugin(file, pkg) {
		if (pkg.superfast) {
			if (contains(this.s.plugins, pkg.name)) return;
			this.s.plugins.push(pkg.name);
			let plugin = require(file);
			if (typeof plugin === "function") {
				return confusedAsync(plugin, null, [ this ]);
			}
		}
	}
}

Compile.ignore = [ ".*", "node_modules/", "public/" ];
