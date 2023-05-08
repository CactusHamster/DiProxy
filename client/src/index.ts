import { DiClient } from "./diclient";
const client = new DiClient("127.0.0.1");
client.listen(8080, "127.0.0.1");