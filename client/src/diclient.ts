import EventEmitter from "node:events";
import { IncomingMessage, Server, ServerResponse } from "node:http";
import { Duplex } from "node:stream";
import { exit, stdout } from "node:process";
import { URL } from "node:url";
import { RawData, WebSocket } from "ws";
let reverse = (str: string) => str.split("").reverse().join("");
let b64 = (str: string) => Buffer.from(str).toString("base64");

class ServerConnection {
     #socket: WebSocket | null = null;
     isTLS: boolean | null = null;
     logErrors: boolean = false;
    // Creates a connection to the remote server.
    initiate (remoteAddress: string | URL, request: IncomingMessage, isTLS: boolean): this {
        if (this.#socket !== null) throw new Error("WebSocket already initiated.");
        this.isTLS = isTLS;
        // Save headers in base64... with = in the names changed to _.
        let { headers: rheaders } = request;
        // Save host in header called requrl.
        rheaders["requrl"] = request.url;
        // Save if connection is HTTPS
        rheaders["istls"] = isTLS.toString();
        let headers: {[key: string]: string | string[]} = {};
        for (let hname in rheaders) {
            let value = rheaders[hname];
            if (value === undefined) continue;
            hname = "__" + reverse(hname)
            headers[hname] = Array.isArray(value) ? value.map(b64) : b64(value);
        }
        // Create new connection.
        this.#socket = new WebSocket(remoteAddress, { headers: headers });
        this.#socket.once("open", () => {
            if (this.#socket === null) throw new Error("Websocket not initiated.");
            if (isTLS) return;
            let headerstring = "";
            for (let headername in request.headersDistinct) headerstring += headername + ": " + request.headersDistinct[headername] + "\r\n"
            this.#socket.send(`${request.method} ${(new URL(request.url ?? "/", `http://${request.headers.host}`)).pathname} HTTP/${request.httpVersion}\r\n${headerstring}\r\n`)
        })
        this.#socket.once("error", (e) => { if (this.logErrors) console.error("Error in WebSocket to remote server: \n" + e) })
        return this;
    }
    // Sends data from the client to the remote server.
    pipeToServer (req: IncomingMessage, csocket: Duplex) {
        if (this.#socket === null) throw new Error("Websocket not initiated.");
        csocket.on("data", (data) => {
            if (this.#socket === null) throw new Error("Websocket not initiated.");
            if (!(data instanceof Buffer)) data = Buffer.from(data);
            // Send client data to server.
            this.#socket.send(data);
        });
        csocket.once("error", (e) => {
            if (this.logErrors) console.error("Error in client tcp socket: \n" + e)
        });
        csocket.on("close", () => this.#socket?.close());
    }
    // Sends data from the remote server to the client.
    pipeFromServer (req: IncomingMessage, csocket: Duplex) {
        if (this.#socket === null) throw new Error("Websocket not initiated.");
        this.#socket.on("message", (data) => {
            // Coerce data to buffer.
            if (!(data instanceof Buffer)) data = Array.isArray(data) ?  Buffer.concat(data) : data = Buffer.from(data);
            // Send server data to client.
            csocket.write(data);
        });
        this.#socket.on("close", () => csocket.end());
    }
    close () { this.#socket?.close() }
}


export class DiClient extends EventEmitter {
    remoteAddress: URL;
    log (message: string) { this.emit("log", message); };
    #onlistening (server: Server) {
        let address = server.address();
        if (typeof address !== "string") {
            if (address !== null) address = address.address + ":" + address.port;
            else address = "NULL";
        }
        this.log(`Server listening on \`${address}\`.`);
    };
    #makeconnection (req: IncomingMessage, socket: Duplex, isTLS: boolean) {
        try {
            let con = new ServerConnection().initiate(this.remoteAddress, req, isTLS);
            con.pipeToServer(req, req.socket);
            con.pipeFromServer(req, req.socket);
        } catch (e) {
            this.log("Server connection failed. \n" + e);
        }
    }
    #onrequest (req: IncomingMessage, res: ServerResponse) {
        this.#makeconnection(req, req.socket, false);
    };
    #onconnect (req: IncomingMessage, socket: Duplex, head: Buffer) {
        this.#makeconnection(req, socket, true);
    };
    #onerror (e: Error) { throw new Error(`There was an error starting local server.\n` + e); exit(1); };
    listen (port: number = 8080, host: string = "127.0.0.1"): Server {
        if (port == undefined) port = 80;
        if (host == undefined) host = "127.0.0.1";
        const server = new Server();
        server.listen(port, host);
        server.on("listening", () => this.#onlistening(server));
        server.on("request", this.#onrequest.bind(this));
        server.on("connect", this.#onconnect.bind(this));
        server.on("error", this.#onerror.bind(this));
        return server;
    };
    constructor (remoteAddress: string) {
        super({"captureRejections": true});
        if (remoteAddress.indexOf("://") == -1) remoteAddress = "ws://" + remoteAddress;
        this.remoteAddress = new URL(remoteAddress);
        if (!this.remoteAddress.port) this.remoteAddress.port = "24785";

    };
}

//const client = new DiClient("127.0.0.1");
//client.listen(8080, "127.0.0.1");