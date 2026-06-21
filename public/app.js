const tools = document.querySelectorAll(".tool");
const form = document.querySelector("#pdfForm");
const operationInput = document.querySelector("#operation");
const operationTitle = document.querySelector("#operationTitle");
const operationHint = document.querySelector("#operationHint");
const options = document.querySelector("#options");
const files = document.querySelector("#files");
const fileRequirement = document.querySelector("#fileRequirement");
const fileList = document.querySelector("#fileList");
const statusNode = document.querySelector("#status");
const resultTitle = document.querySelector("#resultTitle");
const submitBtn = document.querySelector("#submitBtn");
const primaryLabel = document.querySelector("#primaryLabel");
const download = document.querySelector("#download");
const copyLog = document.querySelector("#copyLog");
const dropzone = document.querySelector("#dropzone");
const engineState = document.querySelector("#engineState");

const apiBase = location.protocol === "chrome-extension:" ? "http://127.0.0.1:5174" : "";

const configs = {
  "convert-docx": {
    title: "Word to PDF",
    hint: "Convert Word documents into portable PDFs using the local helper engine.",
    accept: ".doc,.docx",
    requirement: "Accepts .doc and .docx",
    multiple: false,
    cta: "Convert",
    fields: []
  },
  merge: {
    title: "Merge PDFs",
    hint: "Join multiple PDFs in the exact order shown below.",
    accept: ".pdf",
    requirement: "Select two or more PDFs",
    multiple: true,
    cta: "Merge",
    fields: []
  },
  rotate: {
    title: "Rotate Pages",
    hint: "Rotate every page, or target one-based page ranges such as 1,3-5.",
    accept: ".pdf",
    requirement: "Select one PDF",
    multiple: false,
    cta: "Rotate",
    fields: [
      { name: "degrees", label: "Degrees", type: "select", options: ["90", "180", "270"] },
      { name: "pages", label: "Pages", placeholder: "blank, 1, 2-4" }
    ]
  },
  "delete-pages": {
    title: "Delete Pages",
    hint: "Remove selected pages from a PDF using page numbers or ranges.",
    accept: ".pdf",
    requirement: "Select one PDF",
    multiple: false,
    cta: "Delete",
    fields: [
      { name: "pages", label: "Pages to delete", placeholder: "2,4-6", full: true }
    ]
  },
  watermark: {
    title: "Watermark",
    hint: "Apply a diagonal text watermark to every page in the document.",
    accept: ".pdf",
    requirement: "Select one PDF",
    multiple: false,
    cta: "Watermark",
    fields: [
      { name: "text", label: "Watermark text", placeholder: "DRAFT", full: true }
    ]
  },
  metadata: {
    title: "Metadata",
    hint: "Update document properties for cleaner sharing and archival.",
    accept: ".pdf",
    requirement: "Select one PDF",
    multiple: false,
    cta: "Update",
    fields: [
      { name: "title", label: "Title", placeholder: "Document title" },
      { name: "author", label: "Author", placeholder: "Author" },
      { name: "subject", label: "Subject", placeholder: "Subject", full: true }
    ]
  },
  "extract-text": {
    title: "Extract Text",
    hint: "Export detected PDF text into a plain text file.",
    accept: ".pdf",
    requirement: "Select one PDF",
    multiple: false,
    cta: "Extract",
    fields: []
  }
};

function renderFields(config) {
  options.innerHTML = "";
  config.fields.forEach((field) => {
    const wrapper = document.createElement("div");
    wrapper.className = `field${field.full ? " full" : ""}`;
    const label = document.createElement("label");
    label.htmlFor = field.name;
    label.textContent = field.label;
    wrapper.appendChild(label);

    if (field.type === "select") {
      const select = document.createElement("select");
      select.name = field.name;
      select.id = field.name;
      field.options.forEach((value) => {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = value;
        select.appendChild(option);
      });
      wrapper.appendChild(select);
    } else {
      const input = document.createElement("input");
      input.name = field.name;
      input.id = field.name;
      input.placeholder = field.placeholder || "";
      wrapper.appendChild(input);
    }
    options.appendChild(wrapper);
  });
}

function updateFileList() {
  fileList.innerHTML = "";
  Array.from(files.files).forEach((file) => {
    const chip = document.createElement("span");
    chip.className = "file-chip";
    chip.textContent = `${file.name} - ${formatBytes(file.size)}`;
    fileList.appendChild(chip);
  });
}

function formatBytes(size) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

async function rememberOperation(operation) {
  if (!globalThis.chrome || !chrome.storage) return;
  const stored = await chrome.storage.local.get("pdfHelper");
  await chrome.storage.local.set({
    pdfHelper: {
      ...(stored.pdfHelper || {}),
      lastOperation: operation
    }
  });
}

async function incrementRuns() {
  if (!globalThis.chrome || !chrome.storage) return;
  const stored = await chrome.storage.local.get("pdfHelper");
  const current = stored.pdfHelper || {};
  await chrome.storage.local.set({
    pdfHelper: {
      ...current,
      runs: (current.runs || 0) + 1
    }
  });
}

function setOperation(operation) {
  const config = configs[operation];
  operationInput.value = operation;
  operationTitle.textContent = config.title;
  operationHint.textContent = config.hint;
  fileRequirement.textContent = config.requirement;
  primaryLabel.textContent = config.cta;
  files.accept = config.accept;
  files.multiple = config.multiple;
  files.value = "";
  updateFileList();
  resultTitle.textContent = "Ready";
  statusNode.textContent = "Choose files and run the selected tool.";
  download.classList.add("hidden");
  renderFields(config);
  tools.forEach((tool) => tool.classList.toggle("active", tool.dataset.operation === operation));
  rememberOperation(operation);
}

async function checkEngine() {
  try {
    const response = await fetch(`${apiBase}/api/health`, { cache: "no-store" });
    if (!response.ok) throw new Error("offline");
    engineState.className = "engine online";
    engineState.querySelector("strong").textContent = "Engine ready";
  } catch (_error) {
    engineState.className = "engine offline";
    engineState.querySelector("strong").textContent = "Start engine";
    if (location.protocol === "chrome-extension:") {
      statusNode.textContent = "Start the local PDF Helper engine first:\n\ncd pdf-helper\nnpm start";
    }
  }
}

tools.forEach((tool) => {
  tool.addEventListener("click", () => setOperation(tool.dataset.operation));
});

files.addEventListener("change", updateFileList);

["dragenter", "dragover"].forEach((eventName) => {
  dropzone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropzone.classList.add("dragging");
  });
});

["dragleave", "drop"].forEach((eventName) => {
  dropzone.addEventListener(eventName, () => {
    dropzone.classList.remove("dragging");
  });
});

dropzone.addEventListener("drop", (event) => {
  event.preventDefault();
  if (event.dataTransfer.files.length) {
    files.files = event.dataTransfer.files;
    updateFileList();
  }
});

copyLog.addEventListener("click", async () => {
  await navigator.clipboard.writeText(statusNode.textContent);
  const previous = copyLog.textContent;
  copyLog.textContent = "Copied";
  setTimeout(() => {
    copyLog.textContent = previous;
  }, 1200);
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  download.classList.add("hidden");
  submitBtn.disabled = true;
  resultTitle.textContent = "Processing";
  statusNode.textContent = "Uploading files to the local helper engine...";

  try {
    const data = new FormData(form);
    const response = await fetch(`${apiBase}/api/process`, {
      method: "POST",
      body: data
    });
    const payload = await response.json();
    if (!payload.ok) {
      throw new Error(payload.error || "Operation failed.");
    }
    resultTitle.textContent = "Complete";
    statusNode.textContent = [
      "Done.",
      payload.pages ? `Pages processed: ${payload.pages}` : "",
      `Output file: ${payload.filename}`
    ].filter(Boolean).join("\n");
    download.href = `${apiBase}${payload.download}`;
    download.textContent = `Download ${payload.filename}`;
    download.classList.remove("hidden");
    incrementRuns();
  } catch (error) {
    resultTitle.textContent = "Needs attention";
    statusNode.textContent = error.message;
    checkEngine();
  } finally {
    submitBtn.disabled = false;
  }
});

async function boot() {
  let initial = "convert-docx";
  if (globalThis.chrome && chrome.storage) {
    const stored = await chrome.storage.local.get("pdfHelper");
    initial = stored.pdfHelper && stored.pdfHelper.lastOperation ? stored.pdfHelper.lastOperation : initial;
  }
  setOperation(initial);
  checkEngine();
}

boot();
