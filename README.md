# PDF Helper

PDF Helper is a local-first browser plugin and companion helper engine for common document operations:

- Convert Word documents to PDF.
- Merge or join multiple PDFs.
- Rotate selected pages.
- Delete selected pages.
- Add a text watermark.
- Edit PDF metadata.
- Extract PDF text to TXT.

The extension provides the polished browser UI. A small local Node server handles uploads and downloads, while Python performs PDF operations with `pypdf` and `reportlab`.

## Load The Browser Plugin

1. Start the helper engine:

   ```bash
   cd pdf-helper
   npm start
   ```

2. Open `chrome://extensions/` or `edge://extensions/`.
3. Enable Developer mode.
4. Click **Load unpacked**.
5. Select the cloned `pdf-helper` project folder.

The extension popup connects to `http://127.0.0.1:5174` for document processing.

## Requirements

- Node.js 18 or newer.
- Python 3 with `pypdf` and `reportlab`.
- LibreOffice for Word-to-PDF conversion.

Install Python dependencies:

```bash
python3 -m pip install pypdf reportlab
```

The server uses `python3` by default. To use a different Python:

```bash
PDF_HELPER_PYTHON=/path/to/python npm start
```

## Run

```bash
cd pdf-helper
npm start
```

Open:

```text
http://localhost:5174
```

## Package Extension

```bash
npm run package:extension
```

The extension zip will be created at:

```text
dist/pdf-helper-extension.zip
```

## Word-to-PDF

Install LibreOffice if conversion fails:

```bash
brew install --cask libreoffice
```

PDF merge, rotate, delete pages, watermark, metadata, and text extraction work without LibreOffice.

## Page Ranges

Use one-based pages:

```text
2
1,3,5
2-4
1,3-5,8
```

## Repository Value

This app demonstrates:

- File-upload workflow in a dependency-free Node server.
- Practical PDF manipulation through Python.
- Local-first document processing.
- Clear operation-specific UI.
- Graceful dependency handling for external converters.
