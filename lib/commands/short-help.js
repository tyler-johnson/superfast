import chalk from "chalk";

export default function shortHelp() {
	console.log(`
	$ ${chalk.bold("superfast")} <command> <args>

	Commands:
		${chalk.green("create")} <name>      Creates a new Superfast application at <name>.
		${chalk.green("start")}              Starts a local development server in this directory.
		${chalk.green("compile")}            Prepares the Superfast application to be run locally.
		${chalk.green("clear")}              Deletes cached build files for the application.
		${chalk.green("pack")}               Bundles the application into a production-ready package.
		${chalk.green("help")} [command]     Output additional information for a specific command.
		${chalk.green("version")}            Prints the current version of the Superfast CLI.

	If no command is provided, Superfast will use ${chalk.green("start")} and launch a local development server.

	Use ${chalk.green("help")} to get more information on Superfast and the CLI.
`.replace(/\t/g,"  "));
}
