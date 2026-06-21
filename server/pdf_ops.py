#!/usr/bin/env python3
import argparse
import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

from pypdf import PdfReader, PdfWriter
from reportlab.lib.colors import Color
from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas


def parse_pages(value):
    pages = set()
    if not value:
        return pages
    for part in value.split(","):
        item = part.strip()
        if not item:
            continue
        if "-" in item:
            start, end = item.split("-", 1)
            pages.update(range(int(start), int(end) + 1))
        else:
            pages.add(int(item))
    return pages


def write_json(payload):
    print(json.dumps(payload))


def ensure_parent(path):
    Path(path).parent.mkdir(parents=True, exist_ok=True)


def merge(args):
    writer = PdfWriter()
    total_pages = 0
    for file_path in args.inputs:
        reader = PdfReader(file_path)
        for page in reader.pages:
            writer.add_page(page)
            total_pages += 1
    ensure_parent(args.output)
    with open(args.output, "wb") as handle:
        writer.write(handle)
    write_json({"ok": True, "pages": total_pages, "output": args.output})


def rotate(args):
    reader = PdfReader(args.input)
    writer = PdfWriter()
    selected = parse_pages(args.pages)
    for index, page in enumerate(reader.pages, start=1):
        if not selected or index in selected:
            page.rotate(int(args.degrees))
        writer.add_page(page)
    ensure_parent(args.output)
    with open(args.output, "wb") as handle:
        writer.write(handle)
    write_json({"ok": True, "pages": len(reader.pages), "output": args.output})


def delete_pages(args):
    reader = PdfReader(args.input)
    writer = PdfWriter()
    selected = parse_pages(args.pages)
    kept = 0
    for index, page in enumerate(reader.pages, start=1):
        if index not in selected:
            writer.add_page(page)
            kept += 1
    ensure_parent(args.output)
    with open(args.output, "wb") as handle:
        writer.write(handle)
    write_json({"ok": True, "pages": kept, "output": args.output})


def metadata(args):
    reader = PdfReader(args.input)
    writer = PdfWriter()
    for page in reader.pages:
        writer.add_page(page)
    writer.add_metadata({
        "/Title": args.title or "",
        "/Author": args.author or "",
        "/Subject": args.subject or ""
    })
    ensure_parent(args.output)
    with open(args.output, "wb") as handle:
        writer.write(handle)
    write_json({"ok": True, "pages": len(reader.pages), "output": args.output})


def create_watermark_pdf(text, path):
    packet = canvas.Canvas(path, pagesize=letter)
    packet.saveState()
    packet.setFillColor(Color(0.18, 0.22, 0.28, alpha=0.18))
    packet.setFont("Helvetica-Bold", 52)
    packet.translate(306, 396)
    packet.rotate(35)
    packet.drawCentredString(0, 0, text)
    packet.restoreState()
    packet.save()


def watermark(args):
    temp_watermark = Path(args.temp_dir) / "watermark.pdf"
    Path(args.temp_dir).mkdir(parents=True, exist_ok=True)
    create_watermark_pdf(args.text, str(temp_watermark))
    mark_page = PdfReader(str(temp_watermark)).pages[0]
    reader = PdfReader(args.input)
    writer = PdfWriter()
    for page in reader.pages:
        page.merge_page(mark_page)
        writer.add_page(page)
    ensure_parent(args.output)
    with open(args.output, "wb") as handle:
        writer.write(handle)
    write_json({"ok": True, "pages": len(reader.pages), "output": args.output})


def extract_text(args):
    reader = PdfReader(args.input)
    chunks = []
    for index, page in enumerate(reader.pages, start=1):
        text = page.extract_text() or ""
        chunks.append(f"--- Page {index} ---\n{text.strip()}")
    ensure_parent(args.output)
    Path(args.output).write_text("\n\n".join(chunks), encoding="utf-8")
    write_json({"ok": True, "pages": len(reader.pages), "output": args.output})


def convert_docx(args):
    binary = shutil.which("soffice") or shutil.which("libreoffice")
    if not binary:
        write_json({
            "ok": False,
            "error": "LibreOffice is required for Word-to-PDF conversion. Install LibreOffice, then retry."
        })
        sys.exit(2)
    output_dir = Path(args.output).parent
    output_dir.mkdir(parents=True, exist_ok=True)
    completed = subprocess.run(
        [binary, "--headless", "--convert-to", "pdf", "--outdir", str(output_dir), args.input],
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
    )
    expected = output_dir / (Path(args.input).stem + ".pdf")
    if completed.returncode != 0 or not expected.exists():
        write_json({"ok": False, "error": completed.stderr or completed.stdout or "Conversion failed."})
        sys.exit(1)
    if str(expected) != args.output:
        expected.replace(args.output)
    write_json({"ok": True, "output": args.output})


def main():
    parser = argparse.ArgumentParser(description="PDF Helper operations")
    sub = parser.add_subparsers(dest="command", required=True)

    p = sub.add_parser("merge")
    p.add_argument("--output", required=True)
    p.add_argument("inputs", nargs="+")
    p.set_defaults(func=merge)

    p = sub.add_parser("rotate")
    p.add_argument("--input", required=True)
    p.add_argument("--output", required=True)
    p.add_argument("--degrees", required=True)
    p.add_argument("--pages", default="")
    p.set_defaults(func=rotate)

    p = sub.add_parser("delete-pages")
    p.add_argument("--input", required=True)
    p.add_argument("--output", required=True)
    p.add_argument("--pages", required=True)
    p.set_defaults(func=delete_pages)

    p = sub.add_parser("metadata")
    p.add_argument("--input", required=True)
    p.add_argument("--output", required=True)
    p.add_argument("--title", default="")
    p.add_argument("--author", default="")
    p.add_argument("--subject", default="")
    p.set_defaults(func=metadata)

    p = sub.add_parser("watermark")
    p.add_argument("--input", required=True)
    p.add_argument("--output", required=True)
    p.add_argument("--text", required=True)
    p.add_argument("--temp-dir", required=True)
    p.set_defaults(func=watermark)

    p = sub.add_parser("extract-text")
    p.add_argument("--input", required=True)
    p.add_argument("--output", required=True)
    p.set_defaults(func=extract_text)

    p = sub.add_parser("convert-docx")
    p.add_argument("--input", required=True)
    p.add_argument("--output", required=True)
    p.set_defaults(func=convert_docx)

    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
