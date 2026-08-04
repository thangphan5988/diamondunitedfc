#!/usr/bin/env python3
"""Local static server with HTTP Range (progressive MP3)."""

from __future__ import annotations

import os
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer


class RangeRequestHandler(SimpleHTTPRequestHandler):
  protocol_version = "HTTP/1.1"

  def end_headers(self):
    self.send_header("Accept-Ranges", "bytes")
    self.send_header("Access-Control-Allow-Origin", "*")
    super().end_headers()

  def send_head(self):
    path = self.translate_path(self.path)
    if os.path.isdir(path):
      return super().send_head()
    if not os.path.isfile(path):
      self.send_error(404, "File not found")
      return None

    ctype = self.guess_type(path)
    try:
      fs = os.stat(path)
      file_size = fs.st_size
      f = open(path, "rb")
    except OSError:
      self.send_error(404, "File not found")
      return None

    range_header = self.headers.get("Range")
    if not range_header:
      self.send_response(200)
      self.send_header("Content-Type", ctype)
      self.send_header("Content-Length", str(file_size))
      self.send_header("Last-Modified", self.date_time_string(fs.st_mtime))
      self.end_headers()
      return f

    # bytes=START-END
    try:
      units, rng = range_header.strip().split("=", 1)
      if units != "bytes":
        raise ValueError("only bytes")
      start_s, end_s = (rng.split("-", 1) + [""])[:2]
      start = int(start_s) if start_s else 0
      end = int(end_s) if end_s else file_size - 1
      if end >= file_size:
        end = file_size - 1
      if start > end or start < 0:
        raise ValueError("bad range")
    except Exception:
      f.close()
      self.send_error(416, "Invalid Range")
      return None

    length = end - start + 1
    f.seek(start)
    self.send_response(206)
    self.send_header("Content-Type", ctype)
    self.send_header("Content-Range", f"bytes {start}-{end}/{file_size}")
    self.send_header("Content-Length", str(length))
    self.send_header("Last-Modified", self.date_time_string(fs.st_mtime))
    self.end_headers()

    # Wrap to only serve `length` bytes
    class _RangeFile:
      def __init__(self, fp, remaining):
        self.fp = fp
        self.remaining = remaining

      def read(self, size=-1):
        if self.remaining <= 0:
          return b""
        if size < 0 or size > self.remaining:
          size = self.remaining
        data = self.fp.read(size)
        self.remaining -= len(data)
        return data

      def close(self):
        self.fp.close()

    return _RangeFile(f, length)


def main():
  port = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
  root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
  os.chdir(root)
  server = ThreadingHTTPServer(("127.0.0.1", port), RangeRequestHandler)
  print(f"Serving {root} at http://127.0.0.1:{port}/ (Range enabled)")
  try:
    server.serve_forever()
  except KeyboardInterrupt:
    print("\nbye")


if __name__ == "__main__":
  main()
