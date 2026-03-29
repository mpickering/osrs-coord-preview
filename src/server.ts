import fs from "node:fs/promises";
import http, { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";
import { handleRenderRequest } from "./service.js";

const DEFAULT_PORT = 8080;

async function requestListener(req: IncomingMessage, res: ServerResponse) {
  try {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");

    if (req.method === "GET" && url.pathname === "/health") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
      return;
    }

    if (req.method === "GET" && url.pathname.startsWith("/static/")) {
      await serveStatic(url.pathname.replace("/static/", ""), res);
      return;
    }

    if (req.method === "POST" && url.pathname === "/render") {
      const body = await readBody(req);
      const response = await handleRenderRequest(body);
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(response));
      return;
    }

    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "Not found" }));
  } catch (error) {
    res.writeHead(500, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: (error as Error).message }));
  }
}

async function serveStatic(relativePath: string, res: ServerResponse) {
  const publishDir = process.env.LOCAL_PUBLISH_DIR;
  if (!publishDir) {
    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "LOCAL_PUBLISH_DIR is not configured" }));
    return;
  }

  const filePath = path.resolve(publishDir, relativePath);
  const file = await fs.readFile(filePath);
  res.writeHead(200, { "content-type": "image/png", "cache-control": "public, max-age=31536000, immutable" });
  res.end(file);
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

export function startServer(port = DEFAULT_PORT) {
  const server = http.createServer((req, res) => {
    void requestListener(req, res);
  });
  server.listen(port);
  return server;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const port = Number.parseInt(process.env.PORT ?? `${DEFAULT_PORT}`, 10);
  startServer(port);
  process.stdout.write(`Renderer listening on ${port}\n`);
}
