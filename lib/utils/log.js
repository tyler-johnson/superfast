import {format} from "util";
import logUpdate from "log-update";
import elegantSpinner from "elegant-spinner";
import chalk from "chalk";

var spinnerInterval;
var spinnerFrame = (function(frame) {
	return function() {
		return chalk.red(frame());
	};
}(elegantSpinner()));

var isVerbose = false;
export function setVerbose(v) { isVerbose = Boolean(v); }
export function verbose() {
	if (isVerbose) log.apply(null, arguments);
}

var isStatic = false;
export function setStatic(v) { isStatic = Boolean(v); }

export function stopSpinner() {
	if (!spinnerInterval) return;
	clearInterval(spinnerInterval);
	spinnerInterval = null;
}

export function log() {
	clear();
	console.log(chalk.dim("=>") + " %s", format.apply(null, arguments));
}

export function update() {
	stopSpinner();
	if (isStatic) log.apply(null, arguments);
	else logUpdate(chalk.dim("=>") + " " + format.apply(null, arguments));
}

export function done() {
	stopSpinner();
	logUpdate.done();
}

export function clear() {
	stopSpinner();
	logUpdate.clear();
}

export function spinner() {
	if (isStatic) return update.apply(null, arguments);
	stopSpinner();
	let args = arguments;
	spinnerInterval = setInterval(function() {
		logUpdate(spinnerFrame() + "  " + format.apply(null, args));
	}, 50);
}

export function error(e) {
	if (typeof e === "string") return log(e);
	if (e && e.human) return log(e.toString());
	console.error(e.stack || e);
}

export function panic(e) {
	error(e);
	process.exit(1);
}
