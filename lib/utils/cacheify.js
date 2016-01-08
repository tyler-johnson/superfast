import {assign} from "lodash";
import {join} from "path";
import through from "through2";

export default function(b) {
	let cache = b._options.cache;
    let pkgcache = b._options.packageCache;

	if (cache) {
		b.on('reset', collect);
		collect();
	}

	function collect() {
		b.pipeline.get('deps').push(through.obj(function(row, enc, next) {
			var file = row.expose ? b._expose[row.id] : row.file;
			cache[file] = {
				source: row.source,
				deps: assign({}, row.deps)
			};
			this.push(row);
			next();
		}));
	}

	b.on('package', function (pkg) {
		var file = join(pkg.__dirname, 'package.json');
		if (pkgcache) pkgcache[file] = pkg;
	});

	b.invalidate = function(id) {
		if (cache) delete cache[id];
        if (pkgcache) delete pkgcache[id];
	};

	return b;
}
