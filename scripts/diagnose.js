import { Client } from "ssh2";
import * as fs from "fs";

const conn = new Client();

const SSH_CONFIG = {
  host: process.env.DEPLOY_HOST || "89.125.60.153",
  port: parseInt(process.env.DEPLOY_PORT || "22", 10),
  username: process.env.DEPLOY_USER || "root",
  password: process.env.DEPLOY_PASSWORD || "Jp6ka7ZMjX5uC"
};

function executeCommand(conn, cmd, cwd = null) {
  return new Promise((resolve, reject) => {
    const fullCmd = cwd ? `cd ${cwd} && ${cmd}` : cmd;
    console.log(`🏃 Running on server: ${fullCmd}`);
    conn.exec(fullCmd, (err, stream) => {
      if (err) return reject(err);
      let stdout = "";
      let stderr = "";
      stream.on("close", (code) => {
        resolve({ code, stdout, stderr });
      }).on("data", (data) => {
        stdout += data.toString();
        process.stdout.write(data);
      }).stderr.on("data", (data) => {
        stderr += data.toString();
        process.stderr.write(data);
      });
    });
  });
}

conn.on("ready", async () => {
  console.log("🔌 Connected for diagnostics.");
  try {
    console.log("\n--- Testing API availability with session cookie ---");
    const testToken = "eyJ1c2VybmFtZSI6ImFkbWluIiwiZXhwIjoxNzgxNjkxMDA5OTAxfQ.kBtYWkBppJBcnLqKA3-krYlG2UMrTNHsVsWDbmN9NWA";
    await executeCommand(conn, `curl -i -s -b "session=${testToken}" http://127.0.0.1:3010/api/analytics/availability?reportType=day1`);
  } catch (error) {
    console.error("Diagnostics failed:", error);
  } finally {
    conn.end();
  }
}).on("error", (err) => {
  console.error("Connection error:", err);
}).connect(SSH_CONFIG);
