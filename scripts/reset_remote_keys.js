import { Client } from "ssh2";

const conn = new Client();

const SSH_CONFIG = {
  host: process.env.DEPLOY_HOST || "89.125.60.153",
  port: parseInt(process.env.DEPLOY_PORT || "22", 10),
  username: process.env.DEPLOY_USER || "root",
  password: process.env.DEPLOY_PASSWORD || "Jp6ka7ZMjX5uC"
};

conn.on("ready", () => {
  console.log("🔌 Connected to remote server for reset.");
  const testToken = "eyJ1c2VybmFtZSI6ImFkbWluIiwiZXhwIjoxNzgxNjkxMDA5OTAxfQ.kBtYWkBppJBcnLqKA3-krYlG2UMrTNHsVsWDbmN9NWA";
  const resetPayload = JSON.stringify({
    extraLlmKeys: "",
    llmModel: "",
    extraGeminiKeys: "",
    extraDeepgramKeys: "",
    deepgramModel: "",
    extraImageServiceKey: "",
    imageServiceUrl: "",
    imageModel: ""
  });
  
  // Run curl with PUT and JSON payload
  const cmd = `curl -s -X PUT -H "Content-Type: application/json" -b "session=${testToken}" -d '${resetPayload}' http://127.0.0.1:3010/api/settings/keys`;
  
  conn.exec(cmd, (err, stream) => {
    if (err) throw err;
    let stdout = "";
    let stderr = "";
    stream.on("close", (code) => {
      console.log(`\nExit code: ${code}`);
      console.log("--- RESET RESPONSE ---");
      console.log(stdout);
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
