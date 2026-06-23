import { Client } from "ssh2";

const conn = new Client();

const SSH_CONFIG = {
  host: process.env.DEPLOY_HOST || "89.125.60.153",
  port: parseInt(process.env.DEPLOY_PORT || "22", 10),
  username: process.env.DEPLOY_USER || "root",
  password: process.env.DEPLOY_PASSWORD || "Jp6ka7ZMjX5uC"
};

const REMOTE_APP_DIR = process.env.DEPLOY_PATH || "/home/docker/lebedev-git-tools";

const KEY_TO_ADD = `
DEEPGRAM_API_KEY=1afd20dc654a4528b978feadd6c40a81d1c70d9d
DEEPGRAM_MODEL=nova-3
`;

function executeCommand(conn, cmd) {
  return new Promise((resolve, reject) => {
    conn.exec(cmd, (err, stream) => {
      if (err) return reject(err);
      let stdout = "";
      let stderr = "";
      stream.on("close", (code) => {
        resolve({ code, stdout, stderr });
      }).on("data", (data) => {
        stdout += data.toString();
      }).stderr.on("data", (data) => {
        stderr += data.toString();
      });
    });
  });
}

conn.on("ready", async () => {
  console.log("🔌 Connected to remote server.");
  try {
    const envPath = `${REMOTE_APP_DIR}/.env`;
    
    // 1. Read existing .env
    console.log(`Reading remote .env file from ${envPath}...`);
    const readRes = await executeCommand(conn, `cat ${envPath}`);
    if (readRes.code !== 0) {
      console.error("Could not read remote .env file:", readRes.stderr);
      conn.end();
      return;
    }
    
    let content = readRes.stdout;
    let modified = false;
    
    // Check if DEEPGRAM_API_KEY is already present
    if (!content.includes("DEEPGRAM_API_KEY")) {
      console.log("Adding DEEPGRAM_API_KEY and DEEPGRAM_MODEL to remote .env...");
      content += KEY_TO_ADD;
      modified = true;
    } else {
      console.log("DEEPGRAM_API_KEY is already present in remote .env.");
    }
    
    if (modified) {
      // Write modified content back to the server.
      // We escape the content properly to write via SSH using cat << 'EOF'
      const writeCmd = `cat << 'EOF' > ${envPath}\n${content.trim()}\nEOF`;
      const writeRes = await executeCommand(conn, writeCmd);
      if (writeRes.code === 0) {
        console.log("Successfully updated remote .env file!");
      } else {
        console.error("Failed to write updated .env file:", writeRes.stderr);
      }
    }
    
  } catch (err) {
    console.error("Error during SSH operations:", err);
  } finally {
    conn.end();
  }
}).on("error", (err) => {
  console.error("Connection error:", err);
}).connect(SSH_CONFIG);
