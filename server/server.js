const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { spawn, spawnSync } = require("child_process");

const root = path.resolve(__dirname, "..");
const publicDir = path.join(root, "public");
const inputDir = path.join(root, "work", "input");
const outputDir = path.join(root, "work", "output");
const tempDir = path.join(root, "work", "tmp");
const python = process.env.PDF_HELPER_PYTHON || "python3";

for (const dir of [inputDir, outputDir, tempDir]) {
  fs.mkdirSync(dir, { recursive: true });
}

function safeName(name) {
  return path.basename(name || "upload.bin").replace(/[^a-zA-Z0-9._-]/g, "_");
}

function contentType(filePath) {
  const ext = path.extname(filePath);
  return {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".pdf": "application/pdf",
    ".txt": "text/plain; charset=utf-8"
  }[ext] || "application/octet-stream";
}

function parseMultipart(req) {
  return new Promise((resolve, reject) => {
    const type = req.headers["content-type"] || "";
    const match = type.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
    if (!match) {
      reject(new Error("Expected multipart form data."));
      return;
    }
    const boundary = Buffer.from(`--${match[1] || match[2]}`);
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("error", reject);
    req.on("end", () => {
      const body = Buffer.concat(chunks);
      const fields = {};
      const files = [];
      let cursor = body.indexOf(boundary);
      while (cursor !== -1) {
        const next = body.indexOf(boundary, cursor + boundary.length);
        if (next === -1) break;
        let part = body.subarray(cursor + boundary.length + 2, next - 2);
        cursor = next;
        if (!part.length || part.equals(Buffer.from("--"))) continue;
        const headerEnd = part.indexOf(Buffer.from("\r\n\r\n"));
        if (headerEnd === -1) continue;
        const rawHeaders = part.subarray(0, headerEnd).toString("utf8");
        const data = part.subarray(headerEnd + 4);
        const name = (rawHeaders.match(/name="([^"]+)"/) || [])[1];
        const filename = (rawHeaders.match(/filename="([^"]*)"/) || [])[1];
        if (!name) continue;
        if (filename) {
          const id = crypto.randomUUID();
          const stored = `${id}-${safeName(filename)}`;
          const filePath = path.join(inputDir, stored);
          fs.writeFileSync(filePath, data);
          files.push({ field: name, filename, path: filePath, size: data.length });
        } else {
          fields[name] = data.toString("utf8");
        }
      }
      resolve({ fields, files });
    });
  });
}

function runPython(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(python, [path.join(__dirname, "pdf_ops.py"), ...args], {
      cwd: root,
      env: process.env
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (data) => { stdout += data; });
    child.stderr.on("data", (data) => { stderr += data; });
    child.on("error", reject);
    child.on("close", (code) => {
      let parsed = null;
      try {
        parsed = JSON.parse(stdout.trim() || "{}");
      } catch (_error) {
        parsed = { ok: false, error: stdout || stderr || `Python exited with code ${code}` };
      }
      if (code !== 0 || parsed.ok === false) {
        reject(new Error(parsed.error || stderr || `Operation failed with code ${code}`));
      } else {
        resolve(parsed);
      }
    });
  });
}

function hasCommand(command) {
  const result = spawnSync("sh", ["-lc", `command -v ${command}`], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"]
  });
  return result.status === 0 && Boolean(result.stdout.trim());
}

function json(res, status, payload) {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-headers": "content-type"
  });
  res.end(JSON.stringify(payload));
}

function sendFile(res, filePath, downloadName) {
  res.writeHead(200, {
    "content-type": contentType(filePath),
    "content-disposition": downloadName ? `attachment; filename="${downloadName}"` : "inline",
    "access-control-allow-origin": "*"
  });
  fs.createReadStream(filePath).pipe(res);
}

async function handleApi(req, res) {
  try {
    const { fields, files } = await parseMultipart(req);
    const operation = fields.operation;
    const id = crypto.randomUUID();
    const ext = operation === "extract-text" ? ".txt" : ".pdf";
    const outName = `${operation || "output"}-${id}${ext}`;
    const outPath = path.join(outputDir, outName);
    let result;

    if (operation === "merge") {
      const pdfs = files.filter((file) => file.field === "files");
      if (pdfs.length < 2) throw new Error("Upload at least two PDFs to merge.");
      result = await runPython(["merge", "--output", outPath, ...pdfs.map((file) => file.path)]);
    } else if (operation === "convert-docx") {
      const file = files[0];
      if (!file) throw new Error("Upload a Word document.");
      result = await runPython(["convert-docx", "--input", file.path, "--output", outPath]);
    } else if (operation === "rotate") {
      const file = files[0];
      if (!file) throw new Error("Upload a PDF.");
      result = await runPython(["rotate", "--input", file.path, "--output", outPath, "--degrees", fields.degrees || "90", "--pages", fields.pages || ""]);
    } else if (operation === "delete-pages") {
      const file = files[0];
      if (!file) throw new Error("Upload a PDF.");
      result = await runPython(["delete-pages", "--input", file.path, "--output", outPath, "--pages", fields.pages || ""]);
    } else if (operation === "watermark") {
      const file = files[0];
      if (!file) throw new Error("Upload a PDF.");
      result = await runPython(["watermark", "--input", file.path, "--output", outPath, "--text", fields.text || "DRAFT", "--temp-dir", tempDir]);
    } else if (operation === "metadata") {
      const file = files[0];
      if (!file) throw new Error("Upload a PDF.");
      result = await runPython([
        "metadata", "--input", file.path, "--output", outPath,
        "--title", fields.title || "", "--author", fields.author || "", "--subject", fields.subject || ""
      ]);
    } else if (operation === "extract-text") {
      const file = files[0];
      if (!file) throw new Error("Upload a PDF.");
      result = await runPython(["extract-text", "--input", file.path, "--output", outPath]);
    } else {
      throw new Error("Unknown operation.");
    }

    json(res, 200, {
      ok: true,
      pages: result.pages,
      download: `/download/${path.basename(result.output)}`,
      filename: path.basename(result.output)
    });
  } catch (error) {
    json(res, 400, { ok: false, error: error.message });
  }
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://localhost");
  if (req.method === "OPTIONS") {
    json(res, 204, {});
    return;
  }
  if (req.method === "GET" && url.pathname === "/api/health") {
    json(res, 200, {
      ok: true,
      python,
      libreOffice: hasCommand("soffice") || hasCommand("libreoffice")
    });
    return;
  }
  if (req.method === "POST" && url.pathname === "/api/process") {
    handleApi(req, res);
    return;
  }
  if (req.method === "GET" && url.pathname.startsWith("/download/")) {
    const name = safeName(decodeURIComponent(url.pathname.replace("/download/", "")));
    const filePath = path.join(outputDir, name);
    if (!fs.existsSync(filePath)) {
      json(res, 404, { ok: false, error: "File not found." });
      return;
    }
    sendFile(res, filePath, name);
    return;
  }

  const relative = url.pathname === "/" ? "index.html" : safeName(url.pathname.slice(1));
  const filePath = path.join(publicDir, relative);
  if (!filePath.startsWith(publicDir) || !fs.existsSync(filePath)) {
    json(res, 404, { ok: false, error: "Not found." });
    return;
  }
  sendFile(res, filePath);
});

const port = Number(process.env.PORT || 5174);
const host = process.env.HOST || "127.0.0.1";
server.listen(port, host, () => {
  console.log(`PDF Helper running at http://${host}:${port}`);
});
