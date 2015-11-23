import browserify from "browserify";
import contains from "lodash/collection/contains";
import promisify from "es6-promisify";
import cacheify from "../utils/cacheify.js";
import UglifyJS from "uglify-js";

export default function(files, options) {
	let opts = {
		basedir: this.buildDir
	};

	if (!this._browserify) {
		this._browserify = { cache: {}, packageCache: {} };
		this.files.on("change remove add", (model) => {
			if (this._browserify) {
				delete this._browserify.cache[model.get("fullPath")];
				delete this._browserify.packageCache[model.get("fullPath")];
			}
		});
		this.files.once("reset", () => {
			delete this._browserify;
		});
	}

	if (!options.production) {
		opts.cache = this._browserify.cache;
		opts.packageCache = this._browserify.packageCache;
		opts.fullPaths = true;
		opts.debug = true;
	}

	let b = browserify(opts);
	if (opts.cache) b = cacheify(b);

	// add every file
	files.filter((f) => {
		return contains(f.targets, "client") && f.type === "script";
	}).forEach((f) => {
		b.require({ file: (f.fullPath ? "./" : "") + f.path, entry: true });
	});

	return promisify(b.bundle.bind(b))().then(src => {
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
