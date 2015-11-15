'use strict';

var path = require('path');
var fs = require('fs-promise');
fs = 'default' in fs ? fs['default'] : fs;
var ignore = require('ignore');
ignore = 'default' in ignore ? ignore['default'] : ignore;
var toArray = require('lodash/lang/toArray');
toArray = 'default' in toArray ? toArray['default'] : toArray;
var assign = require('lodash/object/assign');
assign = 'default' in assign ? assign['default'] : assign;
var forEach = require('lodash/collection/forEach');
forEach = 'default' in forEach ? forEach['default'] : forEach;
var isArray = require('lodash/lang/isArray');
isArray = 'default' in isArray ? isArray['default'] : isArray;
var contains = require('lodash/collection/contains');
contains = 'default' in contains ? contains['default'] : contains;
var Promise = require('any-promise');
Promise = 'default' in Promise ? Promise['default'] : Promise;
var promisify = require('es6-promisify');
promisify = 'default' in promisify ? promisify['default'] : promisify;
var _rimraf = require('rimraf');
_rimraf = 'default' in _rimraf ? _rimraf['default'] : _rimraf;
var _cpr = require('cpr');
_cpr = 'default' in _cpr ? _cpr['default'] : _cpr;
var _mkdirp = require('mkdirp');
_mkdirp = 'default' in _mkdirp ? _mkdirp['default'] : _mkdirp;
var slug = require('slug');
slug = 'default' in slug ? slug['default'] : slug;
var template = require('lodash/string/template');
template = 'default' in template ? template['default'] : template;
var chokidar = require('chokidar');
chokidar = 'default' in chokidar ? chokidar['default'] : chokidar;
var debounce = require('lodash/function/debounce');
debounce = 'default' in debounce ? debounce['default'] : debounce;
var isEqual = require('lodash/lang/isEqual');
isEqual = 'default' in isEqual ? isEqual['default'] : isEqual;
var findWhere = require('lodash/collection/findWhere');
findWhere = 'default' in findWhere ? findWhere['default'] : findWhere;
var pluck = require('lodash/collection/pluck');
pluck = 'default' in pluck ? pluck['default'] : pluck;
var uuid = require('uuid');
uuid = 'default' in uuid ? uuid['default'] : uuid;
var child_process = require('child_process');
var minimist = require('minimist');
minimist = 'default' in minimist ? minimist['default'] : minimist;
var util = require('util');
var unique = require('lodash/array/unique');
unique = 'default' in unique ? unique['default'] : unique;
var flatten = require('lodash/array/flatten');
flatten = 'default' in flatten ? flatten['default'] : flatten;
var asyncWhile = require('async-while');
asyncWhile = 'default' in asyncWhile ? asyncWhile['default'] : asyncWhile;

var entryTpl = "require(\"superfast/<%= $.type %>\");\n<% if ($.files) $.files.forEach(function(f) { %>\nrequire(<%= JSON.stringify(\"./\" + f) %>);<% }); %>\n\nsetTimeout(function() {\n\tif (typeof process.send === \"function\") {\n\t\tprocess.send(\"READY\");\n\t}\n}, 5*1000);\n";

function each(list, onEach, ctx) {
    // return a thenable method if no list
    if (typeof list === "function") {
        return function(l) {
            return each(l, list, onEach);
        };
    }

	let len = list.length;
    let index = -1;

    // validate list
    if (typeof len !== "number" || len < 0 || isNaN(len)) {
        return Promise.reject(new Error("Expecting an array-like value for list."));
    }

    return asyncWhile(function() {
        // bump index before every loop
        index++;

        // synchronously checks if there are more
        return index < len;
    }, function() {
        return onEach.call(ctx, list[index], index, list);
    })().then(function() {
        return list;
    });
}

function map(list, onEach, ctx) {
    // return a thenable method if no list
    if (typeof list === "function") {
        return function(l) {
            return map(l, list, onEach);
        };
    }

    var res = new Array(list.length);

    return each(list, function(v, index) {
        var ctx = this, args = arguments;

        return Promise.resolve(onEach.apply(ctx, args)).then(function(val) {
            res[index] = val;
        });
    }, ctx).then(function() {
        return res;
    });
}

function read(file, reviver) {
	return fs.readFile(file, { encoding: "utf-8" }).catch(function(e) {
		if (e.code !== "ENOENT" && e.code !== "ENOTDIR") throw e;
	}).then(function(src) {
		return src ? JSON.parse(src, reviver) : {};
	});
}

function write(file, data, replacer, space) {
	let src = JSON.stringify(data, replacer, space);
	return fs.writeFile(file, src);
}

function hashString(str) {
	var hash = 0, i, chr, len;
	if (str.length === 0) return hash >>> 0;

	for (i = 0, len = str.length; i < len; i++) {
		chr	  = str.charCodeAt(i);
		hash  = ((hash << 5) - hash) + chr;
		hash |= 0; // Convert to 32bit integer
	}

	return hash >>> 0;
}

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

class Compile {
	constructor(dir, options) {
		options = options || {};

		// internal state
		this.s = {
			// the root folder of the app to compile
			cwd: path.resolve(dir || "."),
			// paths to ignore while compiling
			ignore: ignore().addPattern(Compile.ignore.concat(options.ignore).filter(Boolean)),
			// compiles files by extension
			transforms: { ".js": js, ".css": css },
			// holds build information
			build: {}
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
		return path.resolve.apply(null, args);
	}

	resolve() {
		let args = [".superfast"].concat(toArray(arguments));
		return this.source.apply(this, args);
	}

	test(f) {
		return Boolean(this.s.ignore._filter(f) && this.s.transforms[path.extname(f)]);
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
		if (!files) return this._load_build().then(() => this._build_source());
		return this._update_files([].concat(files).filter(Boolean));
	}

	init() {
		return rimraf(this.buildDir).then(() => mkdirp(this.buildDir)).then(() => {
			let pkgfile = this.source("package.json");
			return read(pkgfile).then((pkg) => {
				if (!pkg.dependencies) pkg.dependencies = {};
				if (!pkg.dependencies.superfast) pkg.dependencies.superfast = sfpkg.version;
				return write(pkgfile, pkg, null, 2);
			});
		}).then(() => {
			return this._build_source();
		}).then(() => {
			return new Promise((resolve, reject) => {
				child_process.spawn("npm", [ "install" ], { cwd: this.cwd, stdio: "inherit" })
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
		let full = path.resolve(d);
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
				cpr(path.resolve(__dirname, "example"), full, {
					overwrite: true
				}),
				write(path.resolve(full, "package.json"), assign({
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
			let file = path.relative(this.cwd, full);

			if (contains(["add","change","unlink"], type) && this.test(file)) {
				if (!contains(files, file)) files.push(file);
				rebuild();
			}
		});

		return watcher;
	}

	_build_metadata() {
		return read(this.source("package.json")).then((pkg) => {
			pkg.main = "server/index.js";
			pkg.scripts = assign({
				start: "node server/index.js"
			}, pkg.scripts);

			return write(this.resolve("package.json"), pkg, null, 2);
		});
	}

	_build_gitignore() {
		return fs.writeFile(this.resolve(".gitignore"), "/*\n");
	}

	_build_source() {
		this.s.build.server_files = [];
		this.s.build.client_files = [];

		return Promise.all([
			// this._build_metadata(),
			this._build_gitignore(),
			Compile.scandir(this.cwd, this.s.ignore).then(this._update_files.bind(this)),
			// this._copy_public()
		]);
	}

	_load_build() {
		return read(this.resolve("build.json")).then((build) => {
			if (!build.id) {
				let err = new Error("Not a superfast directory.");
				err.bad_superfast = true;
				throw err;
			}

			this.s.build = build;
		});
	}

	_update_build() {
		return write(this.resolve("build.json"), {
			id: uuid.v4(),
			server: this.s.build.server_files,
			client: this.s.build.client_files
		}, null, 2);
	}

	_update_files(files) {
		let oldServer = this.s.build.server_files.slice(0);
		let oldClient = this.s.build.client_files.slice(0);

		return map(files, (file) => {
			return fs.stat(file).then((stat) => {
				if (stat.isFile()) return this._build_file(file);
			}, (e) => {
				if (e.code === "ENOENT" || e.code === "ENOTDIR") {
					return this._remove_file(file);
				}

				throw e;
			});
		}).then((res) => {
			let server = !isEqual(oldServer, this.s.build.server_files);
			let client = !isEqual(oldClient, this.s.build.client_files);

			return Promise.all([
				server ? fs.writeFile(this.resolve("server", "index.js"), entry({
					type: "server",
					files: pluck(this.s.build.server_files, "out")
				})) : null,
				client ? fs.writeFile(this.resolve("client", "index.js"), entry({
					type: "client",
					files: pluck(this.s.build.client_files, "out")
				})) : null,
				server || client ? this._update_build() : null
			]).then(() => res);
		});
	}

	_filename(file, type) {
		let base = path.join(path.dirname(file), slug(path.basename(file, path.extname(file)), { mode: "rfc3986" }));
		base += "-" + hashString(file).toString(16);
		base += type === "style" ? ".css" : ".js";
		return base;
	}

	_build_file(file) {
		let transform = this.s.transforms[path.extname(file)];
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
				if (!findWhere(this.s.build.server_files, { path: file })) {
					this.s.build.server_files.push({
						path: file,
						out: base
					});
				}
				p.push(mkdirp(path.dirname(out)).then(function() {
					return fs.writeFile(out, f.source);
				}));
			}

			if (contains(t, "client") && keepClient(file)) {
				let out = this.resolve("client", base);
				target.push("client");
				if (!findWhere(this.s.build.client_files, { path: file })) {
					this.s.build.client_files.push({
						path: file,
						out: base
					});
				}
				p.push(mkdirp(path.dirname(out)).then(function() {
					return fs.writeFile(out, f.source);
				}));
			}

			return Promise.all(p).then(() => target);
		});
	}

	_remove_file(file) {
		return Promise.all([
			[ findWhere(this.s.build.server_files, { path: file }), "server" ],
			[ findWhere(this.s.build.client_files, { path: file }), "client" ]
		].filter((f) => f[0])).then(map((f) => {
			let file = f[0].out;
			let root = this.resolve(f[1]);
			let full = path.join(root, file);

			return fs.unlink(full).catch((e) => {
				if (e.code !== "ENOENT") throw e;
			}).then(() => {
				let cleanEmpty = function(f) {
					let dir = path.dirname(f);
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
		let fulldir = path.join(baseDir, dir);

		let ign = toIgnore;
		if (!(ign instanceof ignore.Ignore)) {
			ign = ignore();
			if (toIgnore) ign.addPattern(toIgnore);
		}

		return fs.readdir(fulldir).then(map(function(file) {
			let full = path.join(baseDir, dir, file);

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
			}, []).map(f => path.join(dir, f));

			return map(files, function(file) {
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

if (require.main === module) {
	let argv = minimist(process.argv.slice(2), {
		string: [ "ignore" ],
		boolean: [ "help", "version" ],
		alias: {
			h: "help", H: "help",
			v: "version", V: "version",
			i: "ignore"
		}
	});

	if (argv.help || !argv._.length || argv._[0] === "help") {
		showHelp();
	}

	if (argv.version === true || argv._[0] === "version") {
		var pkg = require("../package.json");
		console.log("%s v%s", pkg.name, pkg.version);
		process.exit(0);
	}

	let log = function() {
		console.log("=> %s", util.format.apply(null, arguments));
	};

	let error = function(e) {
		if (e.bad_superfast) {
			log("This is not a superfast directory. Call 'sf init' to set up this directory for superfast.");
			return;
		}

		if (typeof e === "string") return log(e);
		if (e && e.human) return log(e.toString());

		console.error(e.stack);
	};

	switch (argv._[0]) {
		case "start":
		case "run":
			let compile = new Compile(".", argv);
			compile.build().then(function() {
				log("Compiled");
				let watcher = compile.watch();
				let proc, ready;

				function start(cb) {
					ready = false;
					let onClean, onExit, onMessage, p;
					p = proc = child_process.fork(compile.resolve("server"));

					p.on("clean", onClean = function() {
						p.removeListener("exit", onExit);
						p.removeListener("message", onMessage);
						p.removeListener("clean", onClean);
						if (proc === p) proc = null;
					});

					p.on("exit", onExit = function(code) {
						p.emit("clean");

						if (code) {
							let l = [];
							l.push("App exited with an error.");
							if (!ready) l.push("Waiting for changes before restarting...");
							log(l.join(" "));
							if (ready) restart();
						} else {
							log("App exited cleanly. Waiting for changes before restarting...");
						}
					});

					p.on("message", onMessage = function(msg) {
						if (msg === "READY") {
							ready = true;
							p.removeListener("message", onMessage);
							log("Server started");
							if (typeof cb === "function") cb();
						}
					});
				}

				function kill(cb) {
					if (typeof cb !== "function") cb = ()=>{};
					if (proc) {
						let p = proc;
						p.emit("clean");
						p.once("exit", cb);
						p.kill();
					} else {
						cb();
					}
				}

				function restart(cb) {
					log("Restarting...");
					kill(function() {
						start(cb);
					});
				}

				watcher.on("build", function(f, t) {
					t = unique(flatten(t));
					log("Rebuilt changed files: %s", f.join(" "));
					if (contains(t, "server")) restart();
				});

				watcher.on("error", function(e) {
					error(e);
					process.exit(1);
				});

				watcher.on("ready", function() {
					log("Watching for file changes...");
					start();
				});
			}).catch(function(e) {
				error(e);
			});
			break;

		case "init":
			new Compile(".", argv).init().then(function() {
				log("Compiled.");
			}).catch(error);
			break;

		case "create":
			let d = argv._[1];
			Compile.create(d, argv).then(function() {
				log("Created superfast application '%s'.", d);
				log("To Use:\n\n   $ cd %s\n   $ sf start\n", d);
			}).catch(error);
			break;

		case "compile":
			new Compile(".", argv).build().then(function() {
				log("Compiled.");
			}).catch(function(e) {
				error(e);
			});
			break;

		default:
			break;

	}
}

function showHelp() {
	console.log("help!");
	process.exit(0);
}

exports.Compile = Compile;
