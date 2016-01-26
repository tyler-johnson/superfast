import {last,includes} from "lodash";

export default function target(file) {
	let parts = file.path.split("/");
	let targets = [];

	if (includes(parts, "client") || /^client\.|\.client\./i.test(last(parts))) {
		targets.push("client");
	}

	if (includes(parts, "server") || /^server\.|\.server\./i.test(last(parts))) {
		targets.push("server");
	}

	if (!targets.length) targets = ["client","server"];
	file.target(targets);
}
