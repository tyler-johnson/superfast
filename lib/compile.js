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
import isEqual from "lodash/lang/isEqual";
import findWhere from "lodash/collection/findWhere";
import pluck from "lodash/collection/pluck";
import uuid from "uuid";
import {spawn} from "child_process";

var sfpkg = require("./package.json");

var rimraf = promisify(_rimraf);
var cpr = promisify(_cpr);
var mkdirp = promisify(_mkdirp);

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

var entry = template(entryTpl, { variable: "$" });

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
			meta: {}
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

	init() {
		return rimraf(this.buildDir).then(() => mkdirp(this.buildDir)).then(() => {
			let pkgfile = this.source("package.json");

			return Promise.all([
				this._write_metadata(),
				this._build_source(),
				readJSON(pkgfile).then((pkg) => {
					if (!pkg.dependencies) pkg.dependencies = {};
					if (!pkg.dependencies.superfast) pkg.dependencies.superfast = sfpkg.version;
					return writeJSON(pkgfile, pkg, null, 2);
				})
			]);
		}).then(() => {
			return new Promise((resolve, reject) => {
				spawn("npm", [ "install" ], { cwd: this.cwd, stdio: "inherit" })
				.once("exit", function(code) {
					if (!code) resolve();
					let err = new Error("NPM install failed.");
					err.human = true;
					reject(err);
				})
				.once("error", reject);
			});
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
			this._update_files(f).then((t) => {
				watcher.emit("build", f, t);
			}).catch((e) => {
				watcher.emit("error", e, f);
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

	// _build_metadata() {
	// 	return readJSON(this.source("package.json")).then((pkg) => {
	// 		pkg.main = "server/index.js";
	// 		pkg.scripts = assign({
	// 			start: "node server/index.js"
	// 		}, pkg.scripts);
	//
	// 		return writeJSON(this.resolve("package.json"), pkg, null, 2);
	// 	});
	// }

	_build_gitignore() {
		return fs.writeFile(this.resolve(".gitignore"), "/*\n");
	}

	_build_source() {
		this.s.server_files = [];
		this.s.client_files = [];

		return Promise.all([
			this._build_gitignore(),
			Compile.scandir(this.cwd, this.s.ignore).then(this._update_files.bind(this))
		]);
	}

	_load_metadata() {
		return readJSON(this.resolve("meta.json")).then((meta) => {
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
		return writeJSON(this.resolve("meta.json"), meta, null, 2);
	}

	_update_files(files) {
		let oldServer = this.s.server_files.slice(0);
		let oldClient = this.s.client_files.slice(0);

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
			let server = !isEqual(oldServer, this.s.server_files);
			let client = !isEqual(oldClient, this.s.client_files);

			return Promise.all([
				server ? fs.writeFile(this.resolve("server", "index.js"), entry({
					type: "server",
					files: pluck(this.s.server_files, "out")
				})) : null,
				client ? fs.writeFile(this.resolve("client", "index.js"), entry({
					type: "client",
					files: pluck(this.s.client_files, "out")
				})) : null
			]).then(() => res);
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
		if (!transform) return Promise.resolve([]);

		return fs.readFile(this.source(file), { encoding: "utf-8" }).then((src) => {
			let f = { path: file };
			f.source = src;
			return transform.call(this, f);
		}).then((f) => {
			if (!f || f.source == null || !contains(["style","script"], f.type)) return;

			let p = [];
			let t = isArray(f.target) ? f.target : [ "server", "client" ];
			let target = [];
			let base = this._filename(file, f.type);

			if (contains(t, "server") && keepServer(file)) {
				let out = this.resolve("server", base);
				target.push("server");
				if (!findWhere(this.s.server_files, { path: file })) {
					this.s.server_files.push({
						path: file,
						out: base
					});
				}
				p.push(mkdirp(dirname(out)).then(function() {
					return fs.writeFile(out, f.source);
				}));
			}

			if (contains(t, "client") && keepClient(file)) {
				let out = this.resolve("client", base);
				target.push("client");
				if (!findWhere(this.s.client_files, { path: file })) {
					this.s.client_files.push({
						path: file,
						out: base
					});
				}
				p.push(mkdirp(dirname(out)).then(function() {
					return fs.writeFile(out, f.source);
				}));
			}

			return Promise.all(p).then(() => target);
		});
	}

	_remove_file(file) {
		return Promise.all([
			[ findWhere(this.s.server_files, { path: file }), "server" ],
			[ findWhere(this.s.client_files, { path: file }), "client" ]
		].filter((f) => f[0])).then(mapSeries((f) => {
			let file = f[0].out;
			let root = this.resolve(f[1]);
			let full = join(root, file);

			return fs.unlink(full).catch((e) => {
				if (e.code !== "ENOENT") throw e;
			}).then(() => {
				let cleanEmpty = function(f) {
					let dir = dirname(f);
					if (dir === root) return;
					return fs.readdir(dir).then((c) => {
						if (c.length) return;
						return fs.rmdir(dir).then(() => cleanEmpty(dir));
					});
				};

				return cleanEmpty(full);
			}).then(() => f[1]);
		}));
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
