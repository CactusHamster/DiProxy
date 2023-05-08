import { exit } from "process";
import { DiClient } from "./diclient";
import { readFileSync, existsSync } from "fs";
let hostfile = "../HOST.txt"
if (!existsSync(hostfile)) {
    console.error("Failed to find HOST.txt file. Please create one in the project directory and write the remote server url to it.");
    exit(1);
}
const host = readFileSync(hostfile).toString();
const client = new DiClient(host);
client.listen(8080, "127.0.0.1");