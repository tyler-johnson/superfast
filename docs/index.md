# SUPERFAST 1 "JANUARY 2016" "Single-page, isomorphic web app framework."

## NAME

superfast - A single-page, isomorphic web app framework.

## SYNOPSIS

`superfast` [`-h`|`-H`|`--help`] [`-v`|`-V`|`--version`]
          [[`-i`|`--ignore` *pattern*] *...*]
          \<command\> \<args\>

## DESCRIPTION

Superfast a JavaScript framework for rapidly creating single-page, isomorphic web applications.

This is the CLI tool for managing a local Superfast application. With this you can:

- Create new Superfast application.
- Run a local development server out of the working directory.
- Produce a production ready application bundle.

## OPTIONS

These options must be specified before the command. Any flags after the command are handled by the command itself and may do something different than what is listed below.

`-h` or `-H` or `--help`
  Prints the help guide and exits.

`-v` or `-V` or `--version`
  Prints the Superfast CLI version and exits.

`-i` *pattern* or `--ignore` *pattern*
  Files to be ignored while compiling the application. This can be a single file name, a folder, or a glob pattern. You can add several of these tags to ignore more than one item.

## COMMANDS

These are the names of the corresponding man entry for all Superfast commands. To view an individual entry, run `superfast help <command>`.

`superfast-create`(1)
  Creates a new Superfast application at a desired path. This also installs a small working example.

`superfast-start`(1)
  Launches a local development server out of the current working directory. This is the default command used when no command is provided.

`superfast-compile`(1)
  Compiles the application for local development work.

`superfast-pack`(1)
  Bundles the application into a production-ready package.

`superfast-clear`(1)
  Deletes cached build files created with `superfast-compile`(1).
