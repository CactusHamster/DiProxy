import { DiServer } from "./diserver";
const di = new DiServer();
di.listen();
di.on("error", (e) => console.info(`ERROR:\n` + e))
console.log("Server started.")