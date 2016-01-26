import browserify from "browserify";
import promisify from "es6-promisify";
import cacheify from "../utils/cacheify.js";
import UglifyJS from "uglify-js";

function isClientScript(f) {
	return f.isTarget("client") && f.type === "script";
}

export default function(files, options) {
	let opts = {
		basedir: this.cwd
	};

	// if (!this._browserify) {
	// 	this._browserify = { cache: {}, packageCache: {} };
	// 	this.files.on("change remove add", (model) => {
	// 		if (this._browserify) {
	// 			delete this._browserify.cache[model.get("fullPath")];
	// 			delete this._browserify.packageCache[model.get("fullPath")];
	// 		}
	// 	});
	// 	this.files.once("reset", () => {
	// 		delete this._browserify;
	// 	});
	// }
	//
	// if (!options.production) {
	// 	opts.cache = this._browserify.cache;
	// 	opts.packageCache = this._browserify.packageCache;
	// 	opts.fullPaths = true;
	// 	opts.debug = true;
	// }

	let b = browserify(opts);
	if (opts.cache) b = cacheify(b);

	this.requires.forEach(f => {
		if (isClientScript(f)) b.require({
			entry: true,
			file: f.path,
			id: f.path
		});
	});

	// add every file
	return Promise.all(files.filter(isClientScript).map((f) => {
		return f.getSource().then(src => {
			b.require({
				source: src,
				entry: true,
				file: f.path,
				id: f.path
			});
		});
	})).then(() => {
		return promisify(b.bundle.bind(b))();
	}).then(src => {
		src = src.toString("utf-8");

		if (options.production) {
			src = UglifyJS.minify(src, {
				fromString: true
			}).code;
		}

		return {
			path: "client.js",
			source: src
		};
	});
}
