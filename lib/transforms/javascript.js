import {extname} from "path";

export default function javascript(file) {
	if (extname(file.path) !== ".js") return;
	file.type = "script";
}
