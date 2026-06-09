const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const root = path.join(__dirname, "..");
const logsDirectory = path.join(root, "logs");
const restartDelay = Math.max(1000, Number(process.env.SERVER_RESTART_DELAY_MS || 3000));
fs.mkdirSync(logsDirectory, { recursive: true });

const outputLog = fs.createWriteStream(path.join(logsDirectory, "server.log"), { flags: "a" });
const errorLog = fs.createWriteStream(path.join(logsDirectory, "server-error.log"), { flags: "a" });
let child;
let stopping = false;
let restartTimer;

function timestamp() {
  return new Date().toISOString();
}

function writeStatus(message, isError = false) {
  const line = `[${timestamp()}] [Watchdog] ${message}\n`;
  (isError ? process.stderr : process.stdout).write(line);
  (isError ? errorLog : outputLog).write(line);
}

function startServer() {
  writeStatus("Starting server...");
  child = spawn(process.execPath, [path.join("server", "index.js")], {
    cwd: root,
    env: process.env,
    windowsHide: true,
    stdio: ["inherit", "pipe", "pipe"]
  });

  child.stdout.on("data", chunk => {
    process.stdout.write(chunk);
    outputLog.write(chunk);
  });
  child.stderr.on("data", chunk => {
    process.stderr.write(chunk);
    errorLog.write(chunk);
  });
  child.on("error", error => writeStatus(`Could not start server: ${error.message}`, true));
  child.on("close", (code, signal) => {
    child = null;
    if (stopping) {
      writeStatus("Server stopped.");
      closeLogs(code || 0);
      return;
    }
    if (code === 98) {
      writeStatus("Port is already in use. Another server instance is probably running; automatic restart stopped.", true);
      closeLogs(0);
      return;
    }
    writeStatus(`Server exited (code ${code ?? "none"}, signal ${signal ?? "none"}). Restarting in ${restartDelay} ms.`, true);
    restartTimer = setTimeout(startServer, restartDelay);
  });
}

function closeLogs(exitCode) {
  outputLog.end();
  errorLog.end(() => process.exit(exitCode));
}

function stop() {
  if (stopping) return;
  stopping = true;
  clearTimeout(restartTimer);
  writeStatus("Stopping server...");
  if (!child) return closeLogs(0);
  child.kill("SIGTERM");
  setTimeout(() => {
    if (child) child.kill();
  }, 8000).unref();
}

process.on("SIGINT", stop);
process.on("SIGTERM", stop);
process.on("uncaughtException", error => {
  writeStatus(`Watchdog error: ${error.stack || error.message}`, true);
  stop();
});

startServer();
