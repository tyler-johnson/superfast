import styles from "./styles.js";
import clientScripts from "./client-scripts.js";
import serverEntry from "./server-entry.js";
import gitignore from "./gitignore.js";

var outputs = [ styles, clientScripts, serverEntry, gitignore ];
export default outputs;
export { outputs, styles, clientScripts, serverEntry, gitignore };
