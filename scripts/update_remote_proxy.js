import { Client } from "ssh2";

const conn = new Client();

const SSH_CONFIG = {
  host: process.env.DEPLOY_HOST || "89.125.60.153",
  port: parseInt(process.env.DEPLOY_PORT || "22", 10),
  username: process.env.DEPLOY_USER || "root",
  password: process.env.DEPLOY_PASSWORD || "Jp6ka7ZMjX5uC"
};

const REMOTE_APP_DIR = "/home/docker/lebedev-git-tools";
const PROXY_URL = "https://gemini-proxy-pages-egm.pages.dev";

conn.on("ready", () => {
  console.log("🔌 Connected to remote server.");
  
  // Команда для записи прокси напрямую в sqlite файл через node встроенный sqlite модуль
  const cmd = `cd ${REMOTE_APP_DIR} && docker compose exec -T web node --experimental-sqlite -e "
    const { DatabaseSync } = require('node:sqlite');
    try {
      const db = new DatabaseSync('.data/storage/db.sqlite');
      
      const insert = db.prepare('INSERT OR REPLACE INTO prompt_settings (key, value) VALUES (?, ?)');
      insert.run('config.gemini_base_url_analytics', '${PROXY_URL}');
      insert.run('config.gemini_base_url_protocols', '${PROXY_URL}');
      
      console.log('✅ SQLite updated directly using node:sqlite!');
    } catch (err) {
      console.error('❌ Error updating SQLite directly:', err);
      process.exit(1);
    }
  "`;
  
  conn.exec(cmd, (err, stream) => {
    if (err) throw err;
    let stdout = "";
    let stderr = "";
    stream.on("close", (code) => {
      console.log(`\\nExit code: ${code}`);
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
