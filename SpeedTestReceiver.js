const dgram = require('dgram');
const net = require("net");
const sample = require("./dataSample");
const { performance } = require('perf_hooks');

const DISCOVERY_GROUP = "233.255.255.253";
const DISCOVERY_PORT = 4000;

class DataCounter {
    constructor() {
        this.dataSum = 0;
        this.errors = 0;
        this.startTime = null;
        this.endTime = null;
    }

    count(packet) {
        if (this.startTime === null) {
            this.startTime = performance.now();
        }

        this.dataSum += packet.byteLength;
        this.countErrors(packet);
    }
    
    reset() {
        this.startTime = null;
        this.endTime = null;
        this.dataSum = 0;
        this.errors = 0;
    }

    stop() {
        if (!this.endTime) {
            this.endTime = performance.now();
        }
    }

    countErrors(packet) {
        const sampleBytes = sample.split("");
        const many = packet.toString().split("\n");
        const packets = many.slice(0, many.length - 1);

        packets.forEach((p) => {
            const toCheck = p.toString().split("");
            toCheck.forEach((b, idx) => {
                if (idx === toCheck.length - 1) {
                    //pass
                }
                else if (b !== sampleBytes[idx]) {
                    this.errors++;
                }
            });
        });
    }

    getTransmissionTime() {
        // returns transmission time
        if (!this.startTime) {
            return 0;
        }

        return ((this.endTime || performance.now() - this.startTime) / 1000).toFixed(2);
    }

    getTransmissionError() {
        // returns percent of incorrect bytes to all the bytes received
        if (this.dataSum === 0) {
            return 0;
        }

        return (100.0 * this.errors / this.dataSum).toFixed(2);
    }

    getDataReceived() {
        // returns volume of data received since transmission started
        return this.dataSum;
    }


    getTransmissionSpeed() {
        // Returns kb/s
        const sec = this.getTransmissionTime() / 1000;
        return (this.dataSum / 1000 / sec).toFixed(3);
    }
}


class SpeedTestReceiver{
    constructor() {
        this.port = null;
        this.udpCounter = null;
        this.tcpCounter = null;
        this.udpSocket = null;
        this.tcpSocket = null;
        this.tcpServer = null;
        this.bufferSize = null;
        this.isRunning = false;
    };

    start(port) {
        this.port = port;
        this.udpCounter = new DataCounter();
        this.tcpCounter = new DataCounter();

        // UDP discovery
        this.discoverySocket = dgram.createSocket({type: "udp4", reuseAddr: true});
        this.discoverySocket.on("error", (err) => {
            console.log("Discovery: error");
            console.log(err);
        });
        this.discoverySocket.bind(DISCOVERY_PORT, () => {
            this.discoverySocket.addMembership(DISCOVERY_GROUP);
        });
        this.discoverySocket.on("message", (buff, rinfo) => {
            if (/DISCOVERY/.test(buff)) {
                this.discoverySocket.send(`OFFER:${this.port}`, rinfo.port, rinfo.address);
                console.log(`DISCOVERY received from ${rinfo.address}:${rinfo.port}`);
            }
        });

        // UDP server init
        this.udpSocket = dgram.createSocket({ type: 'udp4'});
        this.udpSocket.bind(port);
        this.udpSocket.on("error", (err) => {
            console.log("UDP: error");
            console.log(err);
        });
        this.udpSocket.on("message", (buff, rinfo) => {
            if (/FINE/.test(buff)) {
                this.udpCounter.stop();
                this.isRunning = false;
                console.log(`UDP: Transmission ended. Transmission time: ${this.udpCounter.getTransmissionTime()}`);
                console.log(`UDP: bytes received: ${this.udpCounter.getDataReceived()}`);
                console.log(`UDP: transmission speed ${this.udpCounter.getTransmissionSpeed()}kb/sec`);
                console.log(`UDP: transmission error ${this.udpCounter.getTransmissionError()}%`);
            }
            else {
                this.udpCounter.count(buff);
                this.isRunning = true;
                console.log(`UDP: packet of size ${buff.byteLength} received`);
            }
        });
        this.udpSocket.on("listening", () => {
            console.log(`UDP: listening on port ${port}`);
        });

        // TCP server init
        this.tcpServer = new net.createServer((socket) => {
            socket.on("data", (data) => {
                if (/SIZE:\d+/.test(data)) {
                    this.bufferSize = data.toString().split(":")[1];
                    this.tcpBuffer = new ArrayBuffer(this.bufferSize);
                    this.udpBuffer = new ArrayBuffer(this.bufferSize);
                    console.log(`bufferSize set to ${this.bufferSize}`);
                }
                else if (/FINE/.test(data)) {
                    this.tcpCounter.stop();
                    this.isRunning = false;
                    console.log(`TCP: Transmission ended. Transmission time: ${this.tcpCounter.getTransmissionTime()}`);
                    console.log(`TCP: bytes received: ${this.tcpCounter.getDataReceived()}`);
                    console.log(`TCP: transmission speed ${this.tcpCounter.getTransmissionSpeed()}kb/sec`);
                    console.log(`TCP: transmission error ${this.tcpCounter.getTransmissionError()}%`);
                }
                else if (this.bufferSize === undefined) {
                    console.error("Buffer not initialized.");
                }
                else {
                    this.tcpCounter.count(data);
                    this.isRunning = true;
                    console.log(`TCP: packet of size ${data.byteLength} received`);
                    // if (data.byteLength !== this.bufferSize) {
                    //     console.log(`Error: ${data}`);
                    // }
                }
            });

            socket.on("end", () => {
                console.log("TCP: client disconnected");
            });

            socket.on("close", () => {
                console.log("TCP: socket closed");
                this.tcpSocket = null;
            });
        });
        this.tcpServer.maxConnections = 1;
        this.tcpServer.on("connection", (socket) => {
            this.tcpSocket = socket;
            console.log("TCP: client connected");
        });
        this.tcpServer.on("error", (err) => {
            console.log("TCP: error");
            console.log(err);
        });
        this.tcpServer.listen(port, () => {
            console.log(`TCP: listening on port ${port}`);
        });


    }

    stop() {
        this.tcpCounter.reset();
        this.udpCounter.reset();

        if (this.tcpSocket != null) {
            this.tcpSocket.destroy();
        }

        this.udpSocket.close();
        this.tcpServer.close();

        this.port = null;
        this.udpCounter = null;
        this.tcpCounter = null;
        this.udpSocket = null;
        this.tcpSocket = null;
        this.tcpServer = null;
        this.bufferSize = null;

        console.log("Receiver stopped");
    }

    getBufferSize() {
        return this.bufferSize;
    }

    getTransmissionStats() {
        return (
            [
                {
                    name: "Time",
                    tcpValue: this.tcpCounter.getTransmissionTime(),
                    udpValue: this.udpCounter.getTransmissionTime()
                },
                {
                    name: "Bytes received",
                    tcpValue: this.tcpCounter.getDataReceived(),
                    udpValue: this.udpCounter.getDataReceived()
                },
                {
                    name: "Speed",
                    tcpValue: this.tcpCounter.getTransmissionSpeed(),
                    udpValue: this.udpCounter.getTransmissionSpeed()
                },
                {
                    name: "Error",
                    tcpValue: this.tcpCounter.getTransmissionError(),
                    udpValue: this.udpCounter.getTransmissionError()
                },
            ]
        )
    }
};

module.exports = {
    DataCounter,
    SpeedTestReceiver
}

const server = new SpeedTestReceiver();
server.start(5000);