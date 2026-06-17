import { Client } from "ssh2";

const conn = new Client();

const SSH_CONFIG = {
  host: process.env.DEPLOY_HOST || "89.125.60.153",
  port: parseInt(process.env.DEPLOY_PORT || "22", 10),
  username: process.env.DEPLOY_USER || "root",
  password: process.env.DEPLOY_PASSWORD || "Jp6ka7ZMjX5uC"
};

conn.on("ready", () => {
  console.log("🔌 Connected to remote server.");
  // Проверяем, что видит контейнер tools-image-service внутри себя в файле /app/data/accounts.json
  const cmd = `docker exec tools-image-service cat /app/data/accounts.json`;
  conn.exec(cmd, (err, stream) => {
    if (err) throw err;
    let stdout = "";
    let stderr = "";
    stream.on("close", (code) => {
      console.log(`\nExit code: ${code}`);
      console.log("--- OUTPUT ---");
      console.log(stdout);
      console.log("--- ERROR ---");
      console.log(stderr);
      conn.end();
    }).on("data", (data) => {
      stdout += data.toString();
    }).stderr.on("data", (data) => {
      stderr += data.toString();
    });
  });
}).on("error", (err) => {
  console.error("Connection error:", err);
}).connect(SSH_CONFIG);
