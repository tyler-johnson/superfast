import chalk from "chalk";

export default function shortHelp() {
	console.log(`
	$ ${chalk.bold("superfast")} <command> <args>

	Commands:
		${chalk.green("create")} <name>      Creates a new Superfast application at <name>.
		${chalk.green("init")}               Initiates a new Superfast application in this directory.
		${chalk.green("start")}              Starts a local development server in this directory.
		${chalk.green("compile")}            Prepares the Superfast application to be run.
		${chalk.green("add")} <name>...      Add a plugin to this application.
		${chalk.green("remove")} <name>...   Remove a plugin from this application.
		${chalk.green("clear")}              Deletes cached build files for the application.
		${chalk.green("destroy")}            Removes all Superfast files in this directory.
		${chalk.green("help")} [command]     Output additional information for a specific command.
		${chalk.green("version")}            Prints the current version of the Superfast CLI.

	If no command is provided, superfast will use ${chalk.green("start")} to launch a local development server.

	Use ${chalk.green("help")} to get more information on the superfast command.
`.replace(/\t/g,"  "));
}
