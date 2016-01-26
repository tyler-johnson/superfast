import path from "path";

function printRequire(n) {
	return `require(${JSON.stringify(n)});\n`;
}

function isServerScript(f) {
	return f.isTarget("server") && f.type === "script";
}

export default function serverScripts(files) {
	let str = "";
	files = files.filter(isServerScript);

	this.requires.forEach(f => {
		if (isServerScript(f)) str += printRequire(f.path);
	});

	let p = files.map(f => {
		let p = path.join("server_build", f.path);
		str += printRequire("./" + p);
		return f.getSource().then(s => {
			return { path: p, source: s };
		});
	});

	return Promise.all(p).then(res => {
		res.push({
			path: "server.js",
			source: str
		});

		return res;
	});
}
