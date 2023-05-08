import { DiServer } from "./diserver";
const di = new DiServer();
di.listen(+(process.env.PORT ?? 80), "0.0.0.0");
di.on("error", (e) => console.info(`ERROR:\n` + e))
console.log("Server started.")