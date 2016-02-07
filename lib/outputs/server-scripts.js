import path from "path";

function printRequire(n) {
	return `require(${JSON.stringify(n)});\n`;
}

function isServerScript(f) {
	return f.isTarget("server") && f.type === "script";
}

export default function serverScripts(files) {
	let str = "";

	this.requires.forEach(f => {
		if (isServerScript(f)) str += printRequire(f.path);
	});

	let p = files.filter(isServerScript).map(f => {
		let p = path.normalize(f.path);
		str += printRequire((!/^\.{0,2}\//.test(p) ? "../" : "") + p);

		if (this.production) return f.getSource().then(s => {
			return { path: p, source: s };
		});
	});

	return Promise.all(p).then(res => {
		res.push({
			path: (this.production ? ".superfast/" : "") + "server.js",
			source: str
		});

		return res;
	});
}
