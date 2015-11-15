import {resolve,join,extname,basename,dirname,relative} from "path";
import fs from "fs-promise";
import {map as mapSeries} from "./utils/promise-series.js";
import ignore from "ignore";
import {read as readJSON,write as writeJSON} from "./utils/json-file";
import toArray from "lodash/lang/toArray";
import assign from "lodash/object/assign";
import forEach from "lodash/collection/forEach";
import isArray from "lodash/lang/isArray";
import contains from "lodash/collection/contains";
import Promise from "any-promise";
import promisify from "es6-promisify";
import _rimraf from "rimraf";
import _cpr from "cpr";
import _mkdirp from "mkdirp";
import hash from "./utils/hash";
import slug from "slug";
import template from "lodash/string/template";
import entryTpl from "./entry.jst";
import chokidar from "chokidar";
import debounce from "lodash/function/debounce";
import findWhere from "lodash/collection/findWhere";
import uuid from "uuid";
import {spawn} from "child_process";
import _latest from "npm-latest";
import browserify from "browserify";
import cacheify from "./utils/cacheify";
import pick from "lodash/object/pick";

const RUNTIME = "superfast-runtime";
const RUNTIME_VERSION = "0.0.2";

var rimraf = promisify(_rimraf);
var cpr = promisify(_cpr);
var mkdirp = promisify(_mkdirp);
var latest = promisify(_latest);

var keepServer = ignore().addPattern([ "client/", "*.client.*", "client.*" ]).createFilter();
var keepClient = ignore().addPattern([ "server/", "*.server.*", "server.*" ]).createFilter();

function js(file) {
	file.type = "script";
	return file;
}

function css(file) {
	file.type = "style";
	return file;
}

var serverEntry = template(entryTpl, { variable: "$" });

export default class Compile {
	constructor(dir, options) {
		options = options || {};

		// internal state
		this.s = {
			// the root folder of the app to compile
			cwd: resolve(dir || "."),
			// paths to ignore while compiling
			ignore: ignore().addPattern(Compile.ignore.concat(options.ignore).filter(Boolean)),
			// compiles files by extension
			transforms: { ".js": js, ".css": css },
			// holds build information
			meta: {},
			// dev mode
			dev: Boolean(options.dev)
		};

		// apply transforms from options
		if (options.transform) this.transform(options.transform);

		// user options
		this.options = options;
	}

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

	test(f) {
		return Boolean(this.s.ignore._filter(f) && this.s.transforms[extname(f)]);
	}

	transform(ext, fn) {
		if (typeof ext === "object") {
			forEach(ext, (f, e) => this.transform(e, f));
			return this;
		}

		if (typeof ext !== "string" ||
			ext.length < 2 ||
			ext[0] !== ".") throw new Error("Invalid extension.");

		if (typeof fn !== "function") {
			throw new Error("Invalid transform function");
		}

		this.s.transforms[ext] = fn;

		return this;
	}

	build(files) {
		if (!files) return this._load_metadata().then(() => this._build_source());
		return this._update_files([].concat(files).filter(Boolean));
	}

	destroy() {
		return rimraf(this.buildDir);
	}

	init() {
		return this.build().then(() => false, e => {
			if (!e.bad_superfast) throw e;

			// make the build directory
			return mkdirp(this.buildDir)

			// write to metadata file
			.then(() => this._write_metadata())

			// install runtime
			.then(() => {
				return new Promise((resolve, reject) => {
					spawn("npm", [ "install", "--loglevel", "error" ], { cwd: this.buildDir, stdio: "inherit" })
					.once("exit", function(code) {
						if (!code) resolve();
						let err = new Error("NPM install failed.");
						err.human = true;
						reject(err);
					})
					.once("error", reject);
				});
			})

			// build source files
			.then(() => this._build_source())

			// return true signalling that this is a fresh install
			.then(() => true);
		});
	}

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
				}, options.package))
			]);
		}).then(function() {
			return compiler.init();
		}).then(function() {
			return compiler;
		});
	}

	watch() {
		let watcher = chokidar.watch(this.cwd, {
			ignoreInitial: true,
			persistent: true
		});

		let files = [];
		let rebuild = debounce(() => {
			let f = files.splice(0, files.length);
			this._update_files(f).then((r) => {
				watcher.emit("build", r);
			}).catch((e) => {
				watcher.emit("error", e);
			});
		}, 500);

		watcher.on("all", (type, full) => {
			let file = relative(this.cwd, full);

			if (contains(["add","change","unlink"], type) && this.test(file)) {
				if (!contains(files, file)) files.push(file);
				rebuild();
			}
		});

		return watcher;
	}

	_runtime_version() {
		return latest(RUNTIME).then((i) => i.version, () => RUNTIME_VERSION);
	}

	_build_package() {
		return readJSON(this.source("package.json")).then((pkg) => {
			pkg.main = "server/index.js";
			pkg.scripts = assign({
				start: "node server/index.js"
			}, pkg.scripts);

			return writeJSON(this.resolve("package.json"), pkg, null, 2);
		});
	}

	_build_gitignore() {
		return fs.writeFile(this.resolve(".gitignore"), "/*\n");
	}

	_clear_cache() {
		this.s.files = [];
		if (this.s.bundle) {
			this.s.bundle.reset();
			delete this.s.bundle;
			delete this.s.bundle_cache;
		}
	}

	_build_source() {
		this._clear_cache();

		return Promise.all([
			this._build_gitignore(),
			Compile.scandir(this.cwd, this.s.ignore).then(this._update_files.bind(this))
		]);
	}

	_load_metadata() {
		return readJSON(this.resolve("package.json")).then((meta) => {
			if (!meta.id) {
				let err = new Error("Not a superfast directory.");
				err.bad_superfast = true;
				throw err;
			}

			this.s.meta = meta;
		});
	}

	_write_metadata() {
		let meta = this.s.meta = this.s.meta || {};
		if (!meta.id) meta.id = uuid.v4();
		meta.private = true;

		let p;
		if (!meta.dependencies) meta.dependencies = {};
		if (meta.dependencies[RUNTIME]) p = Promise.resolve();
		else p = this._runtime_version().then((v) => {
			meta.dependencies[RUNTIME] = v;
		});

		return p.then(() => writeJSON(this.resolve("package.json"), meta, null, 2));
	}

	_update_files(files) {
		return mapSeries(files, (file) => {
			return fs.stat(file).then((stat) => {
				if (stat.isFile()) return this._build_file(file);
			}, (e) => {
				if (e.code === "ENOENT" || e.code === "ENOTDIR") {
					return this._remove_file(file);
				}

				throw e;
			});
		}).then((res) => {
			let server = false,
				client_styles = false,
				client_scripts = false;

			res.some((r) => {
				if (r) {
					if (contains(r.targets, "server")) server = true;
					if (contains(r.targets, "client")) {
						if (r.type === "script") client_scripts = true;
						else if (r.type === "style") client_styles = true;
					}
				}

				return server && client_styles && client_scripts;
			});

			return Promise.all([
				server ? this._build_server_entry() : null,
				client_styles ? this._concat_styles() : null,
				client_scripts ? this._browserify() : null
			]).then(() => res);
		});
	}

	_build_server_entry() {
		return fs.writeFile(this.resolve("server.js"), serverEntry({
			runtime: RUNTIME,
			files: this.s.files.filter(f => contains(f.targets, "server"))
		}));
	}

	_concat_styles() {
		let files = this.s.files.filter(f => contains(f.targets, "client") && f.type === "style");
		let bundle = fs.createWriteStream(this.resolve("client.css"));

		return mapSeries(files, (f) => {
			return new Promise((resolve, reject) => {
				let r = fs.createReadStream(this.resolve("build", f.out));
				r.on("error", reject);
				r.on("end", resolve);
				r.pipe(bundle, { end: false });
			});
		}).then(() => {
			bundle.end();
		}, e => {
			if (bundle.writable) bundle.end();
			throw e;
		});
	}

	_browserify() {
		if (!this.s.bundle) {
			let opts = {
				basedir: this.resolve("build")
			};

			if (this.s.dev) {
				opts.cache = this.s.bundle_cache = {};
				opts.packageCache = {};
				opts.fullPaths = true;
				opts.debug = true;
			}

			let b = this.s.bundle = browserify(opts);
			if (this.s.dev) b = cacheify(b);
		}

		let b = this.s.bundle;

		// browserify's reset does this, but after the new pipeline is created
		// this leads to the globals never being defined on the next run
		b._bundled = false;
		b.reset();

		// add the runtime
		b.require({ file: RUNTIME, entry: true });

		// add every file
		let files = this.s.files.filter(f => contains(f.targets, "client") && f.type === "script");
		b.require(files.map((f) => "./" + f.out), { entry: true });

		// bundle directly to the fs
		return new Promise((resolve, reject) => {
			let w = fs.createWriteStream(this.resolve("client.js"));
			let r = b.bundle();
			w.on("finish", resolve);
			function error(e) {
				reject(e);
				w.end();
			}
			w.on("error", error);
			r.on("error", error);
			r.pipe(w);
		});
	}

	_filename(file, type) {
		let base = join(dirname(file), slug(basename(file, extname(file)), { mode: "rfc3986" }));
		base += "-" + hash(file).toString(16);
		base += type === "style" ? ".css" : ".js";
		return base;
	}

	_build_file(file) {
		let transform = this.s.transforms[extname(file)];
		if (!transform) return Promise.resolve();

		return fs.readFile(this.source(file), { encoding: "utf-8" }).then((src) => {
			let f = { path: file };
			f.source = src;
			return transform.call(this, f);
		}).then((f) => {
			if (!f || f.source == null || !contains(["style","script"], f.type)) return;

			let res = pick(f, "type", "path");
			let t = isArray(f.targets) ? f.targets : [ "server", "client" ];
			let base = this._filename(file, f.type);
			let out = this.resolve("build", base);

			res.targets = [];
			res.out = base;

			// resolve true targets
			if (contains(t, "server") && f.type !== "style" && keepServer(file)) res.targets.push("server");
			if (contains(t, "client") && keepClient(file)) res.targets.push("client");

			// add to internal file cache
			if (!findWhere(this.s.files, { path: file })) {
				this.s.files.push(res);
			}

			// invalidate browserify cache
			if (this.s.bundle && this.s.bundle.invalidate) {
				this.s.bundle.invalidate(out);
			}

			// write the contents
			return mkdirp(dirname(out)).then(function() {
				return fs.writeFile(out, f.source);
			}).then(() => res);
		});
	}

	_remove_file(file) {
		let f = findWhere(this.s.files, { path: file });
		if (!f) return Promise.resolve();

		let root = this.resolve("build");
		let full = join(root, f.path);

		if (this.s.bundle && this.s.bundle.invalidate) {
			this.s.bundle.invalidate(full);
		}

		return fs.unlink(full).catch((e) => {
			if (e.code !== "ENOENT") throw e;
		}).then(() => {
			let cleanEmpty = function(f) {
				let dir = dirname(f);
				if (dir === root) return;
				return fs.readdir(dir).catch((e) => {
					if (e.code !== "ENOENT" && e.code !== "ENOTDIR") throw e;
				}).then((c) => {
					if (!c || c.length) return;
					return fs.rmdir(dir).then(() => cleanEmpty(dir));
				});
			};

			return cleanEmpty(full);
		}).then(() => f);
	}

	_copy_public() {
		return cpr(this.source("public"), this.resolve("public"), {
			overwrite: true
		});
	}

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
}

Compile.ignore = [ ".*", "node_modules/", "public/" ];
