import { Client } from "ssh2";
import * as fs from "fs";

const conn = new Client();

const SSH_CONFIG = {
  host: process.env.DEPLOY_HOST || "89.125.60.153",
  port: parseInt(process.env.DEPLOY_PORT || "22", 10),
  username: process.env.DEPLOY_USER || "root",
  password: process.env.DEPLOY_PASSWORD || "Jp6ka7ZMjX5uC"
};

const REMOTE_FILE_PATH = "/home/docker/lebedev-git-tools/image-service-data/accounts.json";
const localContent = fs.readFileSync("image-service-data/accounts.json", "utf8");

conn.on("ready", () => {
  console.log("🔌 Connected to remote server.");
  
  conn.sftp((err, sftp) => {
    if (err) {
      console.error("SFTP Error:", err);
      conn.end();
      return;
    }
    
    const stream = sftp.createWriteStream(REMOTE_FILE_PATH);
    stream.on("close", () => {
      console.log("✅ accounts.json successfully transferred to remote server!");
      
      conn.exec(`chmod 666 ${REMOTE_FILE_PATH}`, (err, cmdStream) => {
        if (err) {
          console.error("Exec chmod error:", err);
          conn.end();
          return;
        }
        cmdStream.on("close", () => {
          console.log("✅ File permissions set to 666.");
          conn.end();
        });
      });
    });
    
    stream.write(localContent);
    stream.end();
  });
}).on("error", (err) => {
  console.error("Connection error:", err);
}).connect(SSH_CONFIG);
