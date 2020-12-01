const dgram = require('dgram');
const net = require("net");
const sample = require("./dataSample");

const DISCOVERY_GROUP = "233.255.255.253";
const DISCOVERY_PORT = 4000;
const TRANSFER_RATE = 1; // ms between packets send

class Client {
    constructor() {
        this.discoveredServers = [];
        this.isRunning = false;

        // UDP client init
        this.udp = dgram.createSocket({ type: 'udp4'});
        this.udp.on("error", (err) => {
            console.log("UDP: error");
            console.log(err);
        });
        this.udp.bind(() => {
            this.udp.addMembership(DISCOVERY_GROUP);
        })
        this.udp.on("message", (buff, rinfo) => {
            if (/OFFER:/.test(buff)) {
                this.discoveredServers.push({
                    address: rinfo.address,
                    port: buff.toString().split(":")[1]
                });
                console.log("Server discovered, available servers:");
                console.log(this.discoveredServers)
            }
        });

        
    };

    connect(server) {
        this.ip = this.discoveredServers[server].address;
        this.port = this.discoveredServers[server].port;
        // TCP client init
        this.tcp = new net.Socket();
        this.tcp.connect({
            address: this.ip, 
            port: this.port,
            family: 4
        }, () => {
            console.log("TCP: connected");
        });
        this.tcp.on("error", (err) => {
            console.log("TCP: error");
            console.log(err);
        });
        this.tcp.on("close", () => {
            console.log("TCP: connection closed");
        });
    }

    startTransmission() {
        if (this.dataBuffer === undefined) {
            throw new Error("Data buffer not initialized before transmission.");
        }

        this.udpTransmission = setInterval(() => {
            this.udp.send(this.dataBuffer, this.port, this.ip);
            console.log("UDP: sent");
        }, TRANSFER_RATE);

        this.tcpTransmission = setInterval(() => {
            this.tcp.write(this.dataBuffer);
            console.log("TCP: sent");
        }, TRANSFER_RATE);
        console.log("Transmission started.");
    };

    stopTransmission() {
        clearInterval(this.udpTransmission);
        clearInterval(this.tcpTransmission);
        this.tcp.write("FINE");
        this.udp.send("FINE", this.port, this.ip);
        console.log("Transmission stopped.");
    }

    setDataBuffer(size) {
        if (size < 0 || size > 1000) {
            throw new Error("Data buffer size is wrong.");
        }
        this.tcp.write(`SIZE:${size}`);
        this.dataBuffer = Buffer.from(sample.slice(0, size - 1) + "\n");
    }

    discover() {
        this.udp.send("DISCOVERY", DISCOVERY_PORT, DISCOVERY_GROUP);
        console.log("DISCOVERY SENT");
    }

    setNagle(option) {
        this.tcp.setNoDelay(!option);
    }
};

module.exports = {
    Client
}

const client = new Client();
client.discover();
setTimeout(() => {
    client.connect(0);
    //client.setNagle(true);
    client.setDataBuffer(5);
    client.startTransmission();
    setTimeout(() => client.stopTransmission(), 2000);
}, 1000);
