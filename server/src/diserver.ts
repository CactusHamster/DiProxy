import { Server as HTTPServer, IncomingMessage } from "http";
import { RawData, RawData as WSRawData, WebSocket, WebSocketServer } from "ws";
import { Buffer } from "node:buffer";
import { Socket, createConnection } from "node:net";
import { EventEmitter } from "stream";
let fb64 = (str: string) => Buffer.from(str, "base64").toString("ascii");
let reverse = (str: string) => str.split("").reverse().join("");
export class DiServer extends EventEmitter {
    log (str: string) { this.emit("log", str) }
    error (str: string) { this.emit("error", str) }
    async #onconnection (ws: WebSocket, req: IncomingMessage) {
        let headers: { [key: string]: string } = {};
        for (let hname in req.headers) {
            let value = req.headers[hname]
            if (value == undefined || !hname.startsWith("__") || Array.isArray(value)) continue;
            hname = reverse(hname.slice(2));
            value = fb64(value);
            headers[hname] = value;
        }
        let isTLS: boolean = headers["istls"] !== "false";
        let keepAlive: boolean = headers[isTLS ? "proxy-connection" : "connection"] === "keep-alive";

        let port: number;
        let hostname: string = "";
        if (isTLS) {
            let hsplit: string[] = headers["host"]?.split(":");
            hostname = hsplit[0];
            port = +(hsplit[1] ?? (isTLS ? 443 : 80));
        } else {
            let surl = headers["requrl"] ?? ("http://" + headers["host"]);
            let url = new URL(surl);
            port = +url.port;
            if (port == 0) port = 80;
            hostname = url.hostname;
        }
        if (isNaN(port) || port < 0) this.error("Invalid port " + port.toString() + ".");
        this.log(`Making ${isTLS ? "TLS" : "non-TLS"} connection to ${hostname}:${port}.`)
        const econnection = createConnection( { "host": hostname, "port": port, keepAlive }, () => this.log(`Connection to ${hostname}:${port} created.`));
        econnection.on("data", (data: Buffer) => ws.send(data));
        econnection.on("error", (e) => {
            this.error("External connection error: " + e.message)
            ws.close();
        })
        if (isTLS) ws.send("HTTP/1.1 200 OK\r\n\r\n")
        ws.on("message", (data: RawData, isBinary: boolean) => {
            if (!(econnection instanceof Socket)) return this.error("Invalid connection.")
            if (Array.isArray(data)) data = Buffer.concat(data)
            if (data instanceof ArrayBuffer) data = Buffer.from(data)
            // dumb typescript:
            if (data instanceof ArrayBuffer) return this.error("Invalid data. Got ArrayBuffer.")
            econnection.write(data);
        })
        ws.on("close", () => econnection.end());
        econnection.on("close", () => ws.close());
    }
    listen (port: number, host: string = "0.0.0.0"): WebSocketServer {
        port = +(port ?? process.env.PORT ?? 80);
        const server = new HTTPServer();
        const wss = new WebSocketServer({ server });
        wss.on("connection", this.#onconnection.bind(this))
        server.listen(port, host);
        wss.on("listening", () => {
            let address = wss.address();
            if (typeof address !== "string") address = `${address.address}:${address.port}`;
            this.log(`Listening on ${address}.`);
        })
        return wss;
    }
}