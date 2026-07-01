// Electron main process — serves the static Next export from `out/` over a
// local loopback server and shows it in a native window. This is the desktop
// build you upload to Steam (via electron-builder installers).
const { app, BrowserWindow, Menu } = require("electron");
const path = require("path");
const http = require("http");
const fs = require("fs");

const OUT = path.join(__dirname, "..", "out");
const MIME = {
  ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript",
  ".css": "text/css", ".json": "application/json", ".png": "image/png",
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif",
  ".svg": "image/svg+xml", ".ico": "image/x-icon", ".mp4": "video/mp4",
  ".webm": "video/webm", ".woff2": "font/woff2", ".woff": "font/woff",
  ".ttf": "font/ttf", ".txt": "text/plain", ".map": "application/json",
};

function startServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let p = decodeURIComponent((req.url || "/").split("?")[0]);
      if (p === "/") p = "/index.html";
      let file = path.join(OUT, p);
      try {
        if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
          if (fs.existsSync(file + ".html")) file = file + ".html";
          else if (fs.existsSync(path.join(file, "index.html"))) file = path.join(file, "index.html");
          else file = path.join(OUT, "index.html"); // SPA fallback
        }
      } catch {
        file = path.join(OUT, "index.html");
      }
      fs.readFile(file, (err, data) => {
        if (err) { res.writeHead(404); res.end("Not found"); return; }
        res.writeHead(200, { "Content-Type": MIME[path.extname(file)] || "application/octet-stream" });
        res.end(data);
      });
    });
    server.listen(0, "127.0.0.1", () => resolve(server.address().port));
  });
}

async function createWindow() {
  const port = await startServer();
  const win = new BrowserWindow({
    width: 1280,
    height: 720,
    minWidth: 900,
    minHeight: 560,
    backgroundColor: "#05060a",
    title: "STRIKEZONE",
    autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, backgroundThrottling: false },
  });
  Menu.setApplicationMenu(null);
  win.loadURL(`http://127.0.0.1:${port}`);
  // Press F11 to toggle fullscreen
  win.webContents.on("before-input-event", (e, input) => {
    if (input.key === "F11" && input.type === "keyDown") { win.setFullScreen(!win.isFullScreen()); e.preventDefault(); }
  });
}

app.whenReady().then(createWindow);
app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
