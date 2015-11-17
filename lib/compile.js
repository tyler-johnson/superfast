import {resolve,join,extname,basename,dirname,relative} from "path";
import fs from "fs-promise";
import {map as mapSeries,each as eachSeries} from "./utils/promise-series.js";
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
import findWhere from "lodash/collection/findWhere";
import uuid from "uuid";
import {spawn} from "child_process";
import _latest from "npm-latest";
import browserify from "browserify";
import cacheify from "./utils/cacheify";
import pick from "lodash/object/pick";
import {EventEmitter} from "events";
import gitignore from "./gitignore.txt";
import tar from "tar-stream";
import {createGzip} from "zlib";
import CleanCSS from "clean-css";
import UglifyJS from "uglify-js";

const RUNTIME = "superfast-runtime";
const RUNTIME_VERSION = "0.0.6";

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

let ignore_keys = ["_patterns", "_rules", "_ignoreFiles"];
ignore.Ignore.prototype.clone = function() {
	return assign(ignore(), pick(this, ["options"].concat(ignore_keys)));
};
ignore.merge = function(a, b) {
	let ign = a.clone();
	ignore_keys.forEach((k) => {
		ign[k] = a[k].concat(b[k]);
	});
	return ign;
};

var serverEntry = template(entryTpl, { variable: "$" });

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
			// compiles files by extension
			transforms: { ".js": js, ".css": css },
			// holds build information
			meta: {},
			// hold current build number
			seq: 0,
			// holds files to be build
			file_queue: [],
			// browserify cache
			bundle_cache: {},
			// browserify package cache
			bundle_packageCache: {}
		};

		// apply transforms from options
		if (options.transform) this.transform(options.transform);

		// user options
		this.options = options;
	}

	get id() { return this.s.meta.id; }
	get seq() { return this.s.seq; }
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
		return Boolean(this.ignore()._filter(f) && this.s.transforms[extname(f)]);
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

	_defer_build() {
		if (this.s.build_defer) return this.s.build_defer.promise;

		let def = this.s.build_defer = {};
		let clean = () => {
			if (this.s.build_defer === def) {
				delete this.s.build_defer;
			}
		};

		def.promise = new Promise((resolve, reject) => {
			def.resolve = resolve;
			def.reject = reject;
		}).then((r) => {
			clean();
			return r;
		}, (e) => {
			clean();
			throw e;
		});

		return def.promise;
	}

	invalidate(files) {
		this.s.file_queue.push.apply(this.s.file_queue, [].concat(files).filter(Boolean));
		if (this.s.build_timeout) clearTimeout(this.s.build_timeout);
		this.s.build_timeout = setTimeout(() => this.build(this.s.file_queue), 500);
		return this._defer_build();
	}

	build(files) {
		if (this.s.building) return this.invalidate(files);
		this.s.building = true;

		files = [].concat(files).filter(Boolean);
		let full = !this.s.meta.id || !files.length;

		// clear invalidate timeout
		if (this.s.build_timeout) {
			clearTimeout(this.s.build_timeout);
			delete this.s.build_timeout;
		}

		// clear out the file queue
		this.s.file_queue.splice(0, this.s.file_queue.length);

		// notify of build start
		this.emit("prebuild", full, !full ? files : null);

		// build the files
		let p;
		if (full) p = this._load_metadata().then(() => this._build_source());
		else p = this._update_files(files);

		// resolve deferred promise
		p.then((r) => {
			delete this.s.building;
			if (this.s.build_defer) {
				this.s.build_defer.resolve(r);
				delete this.s.build_defer;
			}
		}, (e) => {
			delete this.s.building;
			if (this.listenerCount("error")) this.emit("error", e);
			if (this.s.build_defer) {
				this.s.build_defer.reject(e);
				delete this.s.build_defer;
			}
		});

		// return a deferred promise
		return this._defer_build();
	}

	init() {
		return this._load_metadata().then(() => false, e => {
			if (!e.bad_superfast) throw e;

			// make the build directory
			return mkdirp(this.buildDir)

			// write to metadata file
			.then(() => this._write_metadata())

			// build source files
			.then(() => this._build_source())

			// return true signaling that this is a fresh install
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
				}, options.package), null, 2)
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

		watcher.on("all", (type, full) => {
			let file = relative(this.cwd, full);

			if (contains(["add","change","unlink"], type)) {
				if (this.test(file)) this.invalidate(file);
				if (file === ".sfignore") this.build();
			}
		});

		return watcher;
	}

	clear() {
		return Promise.all([
			rimraf(this.resolve("build")),
			rimraf(this.resolve("node_modules")),
			rimraf(this.resolve("*.js")),
			rimraf(this.resolve("*.css"))
		]);
	}

	add() {
		let add = [];
		forEach(arguments, (pkg) => {
			if (pkg) add.push(latest(pkg).catch(()=>{}));
		});

		return this._load_metadata()
		.then(() => Promise.all(add))
		.then((pkgs) => {
			let out = {};

			pkgs.forEach((pkg) => {
				if (pkg) {
					out[pkg.name] = this.s.meta.dependencies[pkg.name] = pkg.version;
				}
			});

			return this._write_metadata()
			.then(() => this._npm_install())
			.then(() => out);
		});
	}

	remove() {
		let rm = {};

		return this._load_metadata().then(() => {
			forEach(arguments, (pkg) => {
				if (pkg && pkg !== RUNTIME && this.s.meta.dependencies[pkg]) {
					rm[pkg] = this.s.meta.dependencies[pkg];
					delete this.s.meta.dependencies[pkg];
				}
			});

			return this._write_metadata().then(() => rm);
		});
	}

	pack() {
		let bundle;
		let finish = () => bundle && bundle.finalize();

		return Promise.all([
			this.build(),
			readJSON(this.source("package.json"))
		]).then((r) => {
			let pkg = r[1];
			bundle = tar.pack();
			let name = "superfast-application";
			if (pkg.name) name = pkg.name;
			if (pkg.version) name += "-" + pkg.version;
			let w = fs.createWriteStream(name + ".tar.gz");
			bundle.pipe(createGzip()).pipe(w);

			function ship(name, src) {
				bundle.entry({ name: 'package/' + name }, src);
			}

			// pack the package.json
			assign(pkg, pick(this.s.meta, "dependencies", "id"));
			pkg.main = "server.js";
			pkg.scripts = assign({
				start: "NODE_ENV=production node server.js"
			}, pkg.scripts);
			ship("package.json", JSON.stringify(pkg, null, 2));

			return Promise.all([
				this._concat_styles().then((s) => {
					ship("client.css", new CleanCSS({
						keepSpecialComments: false
					}).minify(s).styles);
				}),
				this._browserify(true).then((s) => {
					ship("client.js", UglifyJS.minify(s.toString("utf8"), {
						fromString: true
					}).code);
				}),
				this._concat_server_scripts().then((s) => {
					ship("server.js", UglifyJS.minify(s, {
						fromString: true
					}).code);
				})
			]);
		}).then((r) => {
			finish();
			return r;
		}, (e) => {
			finish();
			throw e;
		});
	}

	_runtime_version() {
		return latest(RUNTIME).then((i) => i.version, () => RUNTIME_VERSION);
	}

	_build_gitignore() {
		return fs.writeFile(this.resolve(".gitignore"), gitignore);
	}

	_clear_cache() {
		this.s.files = [];
		this.s.bundle_cache = {};
		this.s.bundle_packageCache = {};
		this.emit("reset");
	}

	_build_source() {
		this._clear_cache();

		return Promise.all([
			this._build_gitignore(),
			this._update_ignore_file(),
			this._npm_install()
		]).then(() => {
			return Compile.scandir(this.cwd, this.ignore());
		}).then((files) => {
			return this._update_files(files, true);
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

	_npm_install() {
		return new Promise((resolve, reject) => {
			spawn("npm", [ "install", "--loglevel", "error" ], {
				cwd: this.buildDir,
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

	_update_files(files, force) {
		return mapSeries(files, (file) => {
			return fs.stat(this.source(file)).then((stat) => {
				if (stat.isFile()) return this._build_file(file);
			}, (e) => {
				if (e.code === "ENOENT" || e.code === "ENOTDIR") {
					return this._remove_file(file);
				}

				throw e;
			});
		}).then((res) => {
			res = res.filter(Boolean);

			let server = false;
			let client_styles = false;
			let client_scripts = false;
			let p = [];

			if (!force) res.some((r) => {
				if (contains(r.targets, "server")) server = true;
				if (contains(r.targets, "client")) {
					if (r.type === "script") client_scripts = true;
					else if (r.type === "style") client_styles = true;
				}

				return server && client_styles && client_scripts;
			});

			if (force || server) {
				p.push(fs.writeFile(this.resolve("server.js"), serverEntry({
					packages: Object.keys(this.s.meta.dependencies),
					files: this.s.files.filter(f => contains(f.targets, "server"))
				})));
			}

			if (force || client_styles) {
				p.push(this._concat_styles().then((s) => {
					return fs.writeFile(this.resolve("client.css"), s);
				}));
			}

			if (force || client_scripts) {
				p.push(this._browserify().then((s) => {
					return fs.writeFile(this.resolve("client.js"), s);
				}));
			}

			return Promise.all(p).then(() => {
				if (res.length) {
					this.s.seq++;
					this.emit("build", this.s.seq, res, force);
				}

				return res;
			});
		});
	}

	_concat_server_scripts() {
		let files = this.s.files.filter((f) => {
			return contains(f.targets, "server") && f.type === "script";
		});

		let buf = new Buffer(serverEntry({
			packages: Object.keys(this.s.meta.dependencies)
		}), "utf-8");

		return eachSeries(files, (f) => {
			return fs.readFile(this.resolve("build", f.out)).then((src) => {
				buf = Buffer.concat([buf, new Buffer(`// ${f.path}\n`), src]);
			});
		}).then(() => buf.toString("utf-8"));
	}

	_concat_styles() {
		let buf = new Buffer(0);
		let files = this.s.files.filter((f) => {
			return contains(f.targets, "client") && f.type === "style";
		});

		return eachSeries(files, (f) => {
			return fs.readFile(this.resolve("build", f.out)).then((src) => {
				buf = Buffer.concat([buf, new Buffer(`/* ${f.path} */\n`), src]);
			});
		}).then(() => buf.toString("utf-8"));
	}

	_browserify(disable_cache) {
		let opts = {
			basedir: this.resolve("build")
		};

		if (!disable_cache) {
			opts.cache = this.s.bundle_cache;
			opts.packageCache = this.s.bundle_packageCache;
			opts.fullPaths = true;
			opts.debug = true;
		}

		let b = browserify(opts);
		if (!disable_cache) b = cacheify(b);

		// add the runtime
		b.require({ file: RUNTIME, entry: true });

		// add every file
		let files = this.s.files.filter(f => contains(f.targets, "client") && f.type === "script");
		b.require(files.map((f) => "./" + f.out), { entry: true });

		// return bundle
		return promisify(b.bundle.bind(b))();
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
				this.emit("add", res);
			}

			// invalidate browserify cache
			delete this.s.bundle_cache[out];
			delete this.s.bundle_packageCache[out];

			// write the contents
			return mkdirp(dirname(out)).then(function() {
				if (f.source.length) res.size = f.source.length;
				return fs.writeFile(out, f.source);
			}).then(() => res);
		});
	}

	_remove_file(file) {
		let f = findWhere(this.s.files, { path: file });
		if (!f) return Promise.resolve();

		let root = this.resolve("build");
		let full = join(root, f.out);

		// remove from file cache
		this.s.files.splice(this.s.files.indexOf(f), 1);
		f.removed = true;
		this.emit("remove", f);

		// drop from browserify cache
		delete this.s.bundle_cache[full];
		delete this.s.bundle_packageCache[full];

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
