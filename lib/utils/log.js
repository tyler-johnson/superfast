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
	logUpdate(chalk.dim("=>") + " " + format.apply(null, arguments));
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

export function badsuperfast(e) {
	if (e.bad_superfast) {
		log(`This is not a Superfast directory.`);
		log(`Use ${chalk.green("superfast init")} to set up this directory for Superfast.`);
		log(`Use ${chalk.green("superfast help")} for more information on available commands.`);
		return true;
	}

	return false;
}

export function panic(e) {
	if (!badsuperfast(e)) error(e);
	process.exit(1);
}
