import "dotenv/config";
import { createApp } from "./src/app.mjs";

const port = Number(process.env.PORT) || 3000;
const app = createApp();

const server = app.listen(port, "0.0.0.0", () => {
  console.log(`知路 MVP 已启动：http://localhost:${port}`);
});

function shutdown(signal) {
  console.log(`收到 ${signal}，正在关闭服务。`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5000).unref();
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
