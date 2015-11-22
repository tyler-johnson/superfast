import styles from "./styles.js";
import clientScripts from "./client-scripts.js";
import serverEntry from "./server-entry.js";
import gitignore from "./gitignore.js";
import packageJson from "./package-json.js";

var outputs = [ styles, clientScripts, serverEntry, gitignore, packageJson ];
export default outputs;
export { outputs, styles, clientScripts, serverEntry, gitignore, packageJson };
