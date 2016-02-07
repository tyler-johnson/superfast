import {assign} from "lodash";
import browserify from "browserify";
import promisify from "es6-promisify";
import cacheify from "../utils/cacheify.js";
import UglifyJS from "uglify-js";

function isClientScript(f) {
	return f.isTarget("client") && f.type === "script";
}

export default function(files, options) {
	let opts = assign({
		basedir: this.cwd
	}, options);

	if (!this._browserify) {
		this._browserify = { cache: {}, packageCache: {} };
		this.on("transform", this._browserify.onTransform = (t) => {
			if (this._browserify) t.forEach(f => {
				delete this._browserify.cache[f.path];
				delete this._browserify.packageCache[f.path];
			});
		});
	}

	if (!this.production) {
		opts.cache = this._browserify.cache;
		opts.packageCache = this._browserify.packageCache;
		opts.fullPaths = true;
		opts.debug = true;
	}

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
	return Promise.all(files.filter(isClientScript).map(f => {
		return f.getSource().then(src => {
			b.require({
				source: src,
				entry: true,
				file: f.fullpath,
				id: f.fullpath
			});
		});
	})).then(() => {
		return promisify(b.bundle.bind(b))();
	}).then(src => {
		src = src.toString("utf-8");

		if (this.production) {
			src = UglifyJS.minify(src, {
				fromString: true
			}).code;
		}

		return {
			path: (this.production ? ".superfast/" : "") + "client.js",
			source: src
		};
	});
}
