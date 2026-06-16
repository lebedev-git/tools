import { Client } from "ssh2";
import * as fs from "fs";
import * as path from "path";

const conn = new Client();

const SSH_CONFIG = {
  host: process.env.DEPLOY_HOST || "89.125.60.153",
  port: parseInt(process.env.DEPLOY_PORT || "22", 10),
  username: process.env.DEPLOY_USER || "root",
  password: process.env.DEPLOY_PASSWORD || "Jp6ka7ZMjX5uC"
};

console.log("🔌 Connecting with config:", {
  host: SSH_CONFIG.host,
  port: SSH_CONFIG.port,
  username: SSH_CONFIG.username,
  passwordMasked: SSH_CONFIG.password ? `${SSH_CONFIG.password.slice(0, 2)}...${SSH_CONFIG.password.slice(-2)} (length: ${SSH_CONFIG.password.length})` : "none"
});

const REMOTE_APP_DIR = process.env.DEPLOY_PATH || "/home/docker/lebedev-git-tools";
const REPO_URL = "https://github.com/lebedev-git/tools.git";

function executeCommand(conn, cmd, cwd = null) {
  return new Promise((resolve, reject) => {
    const fullCmd = cwd ? `cd ${cwd} && ${cmd}` : cmd;
    console.log(`🏃 Running: ${fullCmd}`);
    
    conn.exec(fullCmd, (err, stream) => {
      if (err) {
        return reject(err);
      }
      
      let stdout = "";
      let stderr = "";
      
      stream.on("close", (code, signal) => {
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
  console.log("🔌 SSH Connection Established successfully!");
  
  try {
    // 1. Check if git, docker, docker-compose are installed on the server
    console.log("\n🔍 Checking server environment (git, docker)...");
    await executeCommand(conn, "git --version");
    await executeCommand(conn, "docker --version");
    await executeCommand(conn, "docker compose version || docker-compose version");
    
    // Cleanup temporary failed containers in /root/tools to release port 3010
    console.log("\n🧹 Cleaning up temporary containers in /root/tools...");
    await executeCommand(conn, "docker compose down || docker-compose down", "/root/tools").catch((e) => {
      console.log("No previous container to clean in /root/tools or folder missing.");
    });
    
    // 2. Check if the project folder exists
    console.log(`\n📂 Checking project directory at ${REMOTE_APP_DIR}...`);
    const checkDir = await executeCommand(conn, `[ -d "${REMOTE_APP_DIR}" ] && echo "exists" || echo "missing"`);
    const isMissing = checkDir.stdout.trim() !== "exists";
    
    if (isMissing) {
      console.log(`\n✨ Project folder is missing. Cloning repository ${REPO_URL} into ${REMOTE_APP_DIR}...`);
      // Clone the repository
      const cloneRes = await executeCommand(conn, `git clone ${REPO_URL} ${REMOTE_APP_DIR}`);
      if (cloneRes.code !== 0) {
        throw new Error(`Failed to clone repository: ${cloneRes.stderr}`);
      }
    } else {
      // 3. Folder exists, perform git pull
      console.log(`\n📥 Pulling latest changes from git in ${REMOTE_APP_DIR}...`);
      const pullRes = await executeCommand(conn, "git pull", REMOTE_APP_DIR);
      if (pullRes.code !== 0) {
        throw new Error(`Failed to run git pull: ${pullRes.stderr}`);
      }
    }

    // 4. Ensure .env file exists on the server
    console.log(`\n📝 Checking .env file at ${REMOTE_APP_DIR}/.env...`);
    const envCheck = await executeCommand(conn, `[ -f "${REMOTE_APP_DIR}/.env" ] && echo "exists" || echo "missing"`);
    if (envCheck.stdout.trim() === "missing") {
      console.log("⚠️ Production .env file is missing on the server!");
      console.log(`Please create it at ${REMOTE_APP_DIR}/.env on the server with your production keys.`);
      console.log("Falling back to copying .env.example as .env...");
      await executeCommand(conn, `cp .env.example .env`, REMOTE_APP_DIR);
    }
    
    // 5. Build and run containers
    console.log("\n🚀 Rebuilding and restarting Docker containers...");
    // We run docker compose with --build and -d
    const composeRes = await executeCommand(conn, "docker compose up --build -d || docker-compose up --build -d", REMOTE_APP_DIR);
    if (composeRes.code !== 0) {
      throw new Error(`Failed to run docker compose: ${composeRes.stderr}`);
    }
    
    console.log("\n✅ Deployment completed successfully!");
  } catch (error) {
    console.error("\n❌ Deployment failed:", error);
  } finally {
    conn.end();
  }
}).on("error", (err) => {
  console.error("🔌 SSH Connection error:", err);
}).connect(SSH_CONFIG);
