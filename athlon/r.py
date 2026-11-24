#!/usr/bin/env python3
# Recibir texto o archivos desde el celu en el Athlon (misma red Wi-Fi/cable).
# Uso: python3 r.py   -> muestra una dirección; abrila en el celu.
import http.server, os, socket, html
from email.parser import BytesParser
from email.policy import default
DEST = os.path.expanduser("~/Recibido"); os.makedirs(DEST, exist_ok=True)
PAG = """<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1">
<title>Al Athlon</title><body style="font:18px sans-serif;max-width:600px;margin:16px auto;padding:0 12px">
<h2>Mandar al Athlon</h2>{msg}<form method=post enctype=multipart/form-data>
<textarea name=t rows=6 style="width:100%;font-size:18px" placeholder="Pegá texto o un código"></textarea>
<p><input type=file name=f multiple></p><button style="font-size:20px;padding:10px 24px">Mandar</button></form>"""
class H(http.server.BaseHTTPRequestHandler):
    def _ok(self, msg=""):
        b = PAG.format(msg=msg).encode(); self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8"); self.end_headers(); self.wfile.write(b)
    def do_GET(self): self._ok()
    def do_POST(self):
        n = int(self.headers.get("Content-Length", 0)); body = self.rfile.read(n)
        msg = BytesParser(policy=default).parsebytes(b"Content-Type: " + self.headers["Content-Type"].encode() + b"\r\n\r\n" + body)
        out = []
        for p in msg.iter_parts():
            name = p.get_param("name", header="content-disposition"); fn = p.get_filename()
            data = p.get_payload(decode=True) or b""
            if name == "t" and data.strip():
                t = data.decode("utf-8", "replace").strip()
                open(os.path.join(DEST, "texto.txt"), "w").write(t + "\n")
                print("\n===== TEXTO RECIBIDO (también en ~/Recibido/texto.txt) =====\n" + t + "\n=====", flush=True)
                out.append("texto")
            elif fn:
                fn = os.path.basename(fn); open(os.path.join(DEST, fn), "wb").write(data)
                print("Archivo recibido: ~/Recibido/" + fn, flush=True); out.append(html.escape(fn))
        self._ok("<p style='color:green'>Recibido: " + ", ".join(out or ["nada"]) + "</p>")
    def log_message(self, *a): pass
s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
try: s.connect(("8.8.8.8", 80)); ip = s.getsockname()[0]
except Exception: ip = "IP-DEL-ATHLON"
print("En el celu (misma red) abrí:  http://%s:8000   | Ctrl+C para cerrar" % ip, flush=True)
http.server.HTTPServer(("0.0.0.0", 8000), H).serve_forever()
