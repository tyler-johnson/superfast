import path from "path";

function printRequire(n) {
	return `require(${JSON.stringify(n)});\n`;
}

export default function serverScripts(files) {
	let str = "";

	files = files.filter((f) => {
		return f.isTarget("server") && f.type === "script";
	});

	let p = files.map(f => {
		if (f.module) {
			str += printRequire(f.path);
			return;
		}

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
