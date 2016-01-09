import chalk from "chalk";

export default function shortHelp() {
	console.log(`
	$ ${chalk.bold("superfast")} <command> <args>

	Commands:
		${chalk.green("create")} <name>      Creates a new Superfast application at <name>.
		${chalk.green("init")}               Initiates a new Superfast application in this directory.
		${chalk.green("start")}              Starts a local development server in this directory.
		${chalk.green("compile")}            Prepares the Superfast application to be run locally.
		${chalk.green("add")} <pkg>...       Add a plugin to this application.
		${chalk.green("remove")} <pkg>...    Remove a plugin from this application.
		${chalk.green("clear")}              Deletes cached build files for the application.
		${chalk.green("destroy")}            Removes all Superfast files in this directory.
		${chalk.green("pack")}               Bundles the application into a production-ready package.
		${chalk.green("help")} [command]     Output additional information for a specific command.
		${chalk.green("version")}            Prints the current version of the Superfast CLI.

	If no command is provided, Superfast will use ${chalk.green("start")} and launch a local development server.

	Use ${chalk.green("help")} to get more information on Superfast and the CLI.
`.replace(/\t/g,"  "));
}