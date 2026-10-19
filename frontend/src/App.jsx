import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft, Award, BookOpenCheck, Check, Download,
  Eye, FileDown, FilePenLine, FilePlus2, FileSearch2, FileSpreadsheet, FolderOpen,
  GraduationCap, ImagePlus, LoaderCircle, Search, ShieldCheck,
  Sparkles, Trash2, UploadCloud, X,
} from "lucide-react";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { createWorker } from "tesseract.js";
import CertificateEditor from "./components/CertificateEditor.jsx";
import {
  deleteCertificate, getCertificateFileUrl, getCertificates, saveCertificate,
} from "./lib/certificates.js";
import { createCertificatesWorkbook } from "./lib/exports.js";

const acceptedTypes = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
const initialCertificate = () => ({
  name: "", certificationName: "", certificateNumber: "", issuingOrganization: "",
  issueDate: "", expirationDate: "", duration: "", skills: [], description: "",
  credentialUrl: "",
});

function App() {
  const [page, setPage] = useState("upload");
  const [uploads, setUploads] = useState([]);
  const [extracting, setExtracting] = useState(false);
  const [error, setError] = useState("");
  const [batchSaving, setBatchSaving] = useState(false);
  const [savedCertificates, setSavedCertificates] = useState([]);
  const [editing, setEditing] = useState(false);
  const [search, setSearch] = useState("");
  const [activeCertificate, setActiveCertificate] = useState(null);
  const [toast, setToast] = useState("");
  const [libraryLoading, setLibraryLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    let mounted = true;
    getCertificates()
      .then((records) => { if (mounted) setSavedCertificates(records); })
      .catch((loadError) => { if (mounted) setError(loadError.message || "Could not load saved certificates."); })
      .finally(() => { if (mounted) setLibraryLoading(false); });
    return () => { mounted = false; };
  }, []);

  const filteredCertificates = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return savedCertificates;
    return savedCertificates.filter((item) =>
      [item.name, item.certificationName, item.issuingOrganization, item.certificateNumber, item.issueDate, item.duration]
        .some((value) => value?.toLowerCase().includes(query)),
    );
  }, [savedCertificates, search]);

  function notify(message) {
    setToast(message);
    window.setTimeout(() => setToast(""), 2800);
  }

  function chooseFiles(selectedFiles) {
    setError("");
    const picked = Array.from(selectedFiles || []);
    if (!picked.length) return;
    const added = [];
    const messages = [];
    const existing = new Set(uploads.map((item) => fileFingerprint(item.file)));
    for (const selected of picked) {
      const extension = selected.name.split(".").pop()?.toLowerCase();
      const acceptedExtensions = ["jpg", "jpeg", "png", "webp", "pdf"];
      if (!acceptedTypes.includes(selected.type) && !acceptedExtensions.includes(extension)) {
        messages.push(`${selected.name}: choose a JPG, PNG, WEBP, or PDF file.`); continue;
      }
      if (!selected.size) { messages.push(`${selected.name}: the file is empty.`); continue; }
      if (selected.size > 10 * 1024 * 1024) { messages.push(`${selected.name}: exceeds the 10 MB limit.`); continue; }
      const fingerprint = fileFingerprint(selected);
      if (existing.has(fingerprint)) { messages.push(`${selected.name}: already added.`); continue; }
      if (uploads.length + added.length >= 20) { messages.push("You can add up to 20 files."); break; }
      existing.add(fingerprint);
      added.push({ key: crypto.randomUUID(), file: selected, status: "ready", certificate: null, extractedText: "", progress: 0, error: "" });
    }
    if (added.length) setUploads((current) => [...current, ...added]);
    if (messages.length) setError(messages.join(" "));
  }

  function removeUpload(key) {
    setUploads((current) => current.filter((item) => item.key !== key));
  }

  async function extractAll() {
    const pending = uploads.filter((item) => item.status === "ready" || item.status === "error");
    if (!pending.length) return;
    setError(""); setExtracting(true);
    for (const item of pending) {
      setUploads((current) => current.map((entry) => entry.key === item.key ? { ...entry, status: "reading", error: "", progress: 0 } : entry));
      try {
        const worker = await createWorker("eng", 1, { logger: (message) => {
          if (message.status === "recognizing text") setUploads((current) => current.map((entry) => entry.key === item.key ? { ...entry, progress: Math.round(message.progress * 100) } : entry));
        } });
        let text;
        try {
          const source = isPdfFile(item.file) ? await renderPdfPage(item.file) : item.file;
          try { text = (await worker.recognize(source)).data.text.trim(); }
          finally { if (isPdfFile(item.file)) { source.width = 0; source.height = 0; } }
        } finally { await worker.terminate(); }
        if (text.length < 10) throw new Error("Not enough text found. Try a clearer image or PDF.");
        setUploads((current) => current.map((entry) => entry.key === item.key ? { ...entry, extractedText: text } : entry));
        setUploads((current) => current.map((entry) => entry.key === item.key ? { ...entry, status: "extracting", progress: 100 } : entry));
        const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL || "").trim().replace(/\/+$/, "");
        const response = await fetch(`${apiBaseUrl}/api/extract`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) });
        const body = await response.json().catch(() => null);
        if (!response.ok || !body?.certificate) throw new Error(body?.error || "Could not extract certificate details. Check that the extraction service is running.");
        setUploads((current) => current.map((entry) => entry.key === item.key ? { ...entry, status: "review", certificate: { ...initialCertificate(), ...body.certificate, id: crypto.randomUUID(), fileName: item.file.name }, error: "" } : entry));
      } catch (failure) {
        const message = failure instanceof TypeError ? "Could not connect to the extraction service. Check that the app and Express server are running." : (failure.message || (isPdfFile(item.file) ? "Could not read this PDF." : "Text recognition failed."));
        setUploads((current) => current.map((entry) => entry.key === item.key ? { ...entry, status: "error", error: message } : entry));
      }
    }
    setExtracting(false);
  }

  async function saveAll() {
    const pending = uploads.filter((item) => item.certificate && item.status !== "saved");
    if (!pending.length) return;
    const invalid = pending.filter((item) => !item.certificate.certificationName.trim() && !item.certificate.name.trim());
    if (invalid.length) { setError(`Add a recipient or certification name for: ${invalid.map((item) => item.file.name).join(", ")}.`); return; }
    setError(""); setBatchSaving(true);
    const failures = [];
    for (const item of pending) {
      setUploads((current) => current.map((entry) => entry.key === item.key ? { ...entry, status: "saving", error: "" } : entry));
      try {
        const saved = await saveCertificate({ ...item.certificate, fileName: item.file.name }, item.certificate.filePath ? null : item.file);
        setSavedCertificates((records) => addOrUpdateCertificate(records, saved));
        setUploads((current) => current.map((entry) => entry.key === item.key ? { ...entry, status: "saved", certificate: saved } : entry));
      } catch (failure) {
        failures.push(`${item.file.name}: ${failure.message || "Save failed."}`);
        setUploads((current) => current.map((entry) => entry.key === item.key ? { ...entry, status: "review", error: failure.message || "Save failed." } : entry));
      }
    }
    setBatchSaving(false);
    if (failures.length) setError(`Some files could not be saved. Retry Save all to continue. ${failures.join(" ")}`);
    else notify(`${pending.length} certificate${pending.length === 1 ? "" : "s"} saved to your library`);
  }

  function openSaved(item, startEditing = false) {
    setActiveCertificate(item);
    setEditing(startEditing);
  }

  function updateSaved(value) {
    setActiveCertificate(value);
  }

  async function saveEditedSaved() {
    if (!activeCertificate) return;
    if (!activeCertificate.certificationName.trim() && !activeCertificate.name.trim()) {
      setError("Add a recipient or certification name before saving.");
      return;
    }
    setSaving(true);
    try {
      const saved = await saveCertificate(activeCertificate);
      setSavedCertificates((records) => addOrUpdateCertificate(records, saved));
      setActiveCertificate(saved);
      setEditing(false);
      setError("");
      notify(saved.cleanupWarning || "Certificate changes saved");
    } catch (saveError) {
      console.error("Could not update certificate:", saveError);
      setError(saveError.message || "Could not update this certificate.");
    } finally {
      setSaving(false);
    }
  }

  async function removeSaved(id) {
    if (!window.confirm("Delete this certificate from your library? This cannot be undone.")) return;
    try {
      const result = await deleteCertificate(id);
      setSavedCertificates((records) => records.filter((record) => record.id !== id));
      if (activeCertificate?.id === id) setActiveCertificate(null);
      notify(result.cleanupWarning || "Certificate deleted");
    } catch (deleteError) {
      console.error("Could not delete certificate:", deleteError);
      setError(deleteError.message || "Could not delete this certificate.");
    }
  }

  async function openCertificateFile(item, download = false) {
    const previewWindow = download ? null : window.open("about:blank", "_blank");
    if (previewWindow) previewWindow.opener = null;
    try {
      const url = await getCertificateFileUrl(item, download);
      if (previewWindow) {
        previewWindow.location.href = url;
        return;
      }
      const link = document.createElement("a");
      link.href = url;
      if (!download) {
        link.target = "_blank";
        link.rel = "noopener noreferrer";
      }
      if (download) link.download = item.fileName || "certificate";
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (fileError) {
      previewWindow?.close();
      setError(fileError.message || "Could not access the certificate file.");
    }
  }

  async function exportExcel() {
    setExporting(true);
    try {
      const exportRecords = await getCertificatesForExport();
      const buffer = createCertificatesWorkbook(exportRecords);
      downloadBlob(new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), "my-certificates.xlsx");
    } catch (exportError) {
      console.error("Could not export certificate spreadsheet:", exportError);
      setError(exportError.message || "Could not export certificate records to Excel.");
    } finally {
      setExporting(false);
    }
  }

  async function exportPdf() {
    setExporting(true);
    try {
      const [{ jsPDF }, { default: autoTable }] = await Promise.all([
        import("jspdf"),
        import("jspdf-autotable"),
      ]);
      const pdf = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
      pdf.setFontSize(16);
      pdf.text("My Certificates", 40, 38);
      const exportRecords = await getCertificatesForExport();
      autoTable(pdf, {
        startY: 54,
        head: [["S.No.", "Name", "Certification", "No.", "Organization", "Link"]],
        body: exportRecords.map((record, index) => [
          index + 1,
          record.name,
          record.certificationName,
          record.certificateNumber,
          record.issuingOrganization,
          record.fileUrl ? "Open certificate" : record.fileUnavailable ? "File unavailable" : "",
        ]),
        styles: { fontSize: 8, cellPadding: 5, overflow: "linebreak" },
        headStyles: { fillColor: [103, 86, 216] },
        margin: { left: 40, right: 40 },
        didDrawCell: (data) => {
          if (data.section === "body" && data.column.index === 5) {
            const url = exportRecords[data.row.index]?.fileUrl;
            if (url) pdf.link(data.cell.x, data.cell.y, data.cell.width, data.cell.height, { url });
          }
        },
      });
      pdf.save("my-certificates.pdf");
    } catch (exportError) {
      console.error("Could not export certificate report:", exportError);
      setError(exportError.message || "Could not generate the PDF report.");
    } finally {
      setExporting(false);
    }
  }

  async function getCertificatesForExport() {
    return Promise.all(savedCertificates.map(async (record) => {
      if (!record.filePath) return { ...record, fileUrl: "", fileUnavailable: false };
      try {
        return { ...record, fileUrl: await getCertificateFileUrl(record, false, 604800), fileUnavailable: false };
      } catch (fileError) {
        console.warn(`Could not include a link for ${record.fileName || "a certificate"} in the export:`, fileError);
        return { ...record, fileUrl: "", fileUnavailable: true };
      }
    }));
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <button className="brand" onClick={() => { setPage("upload"); setActiveCertificate(null); }} aria-label="Certify home">
          <span className="brand-icon"><Award size={21} /></span>
          <span>certify<span className="brand-period">.</span></span>
        </button>
        <nav className="main-nav" aria-label="Main navigation">
          <button className={page === "upload" ? "nav-link active" : "nav-link"} onClick={() => { setPage("upload"); setActiveCertificate(null); }}><FilePlus2 size={16} /> New certificate</button>
          <button className={page === "library" ? "nav-link active" : "nav-link"} onClick={() => { setPage("library"); setActiveCertificate(null); }}><FolderOpen size={16} /> My certificates <span className="nav-count">{savedCertificates.length}</span></button>
        </nav>
        <div className="secure-note"><ShieldCheck size={15} /> Shared certificate library</div>
      </header>

      <main className="main-content">
        {page === "upload" ? (
          <>
            <section className="hero">
              <div className="hero-copy">
                <span className="eyebrow"><Sparkles size={14} /> YOUR CREDENTIALS, ORGANIZED</span>
                <h1>Every achievement,<br /><span>beautifully captured.</span></h1>
                <p>Turn certificate images or PDFs into polished, searchable records in just a few clicks.</p>
              </div>
              <div className="hero-art" aria-hidden="true">
                <div className="hero-orbit orbit-one" /><div className="hero-orbit orbit-two" />
                <div className="hero-certificate"><span className="mini-seal"><Award size={28} /></span><span className="mini-line wide" /><span className="mini-line" /><span className="mini-line short" /><span className="mini-sign" /></div>
                <span className="sparkle sparkle-one">âœ³</span><span className="sparkle sparkle-two">âœ¦</span>
              </div>
            </section>

            <div className="steps">
              <Step number="01" label="Upload" active={!uploads.some((item) => item.certificate)} done={uploads.length > 0} />
              <span className="step-line" />
              <Step number="02" label="Extract details" active={extracting} done={uploads.some((item) => item.certificate)} />
              <span className="step-line" />
              <Step number="03" label="Save details" active={uploads.some((item) => item.status === "review")} done={uploads.length > 0 && uploads.every((item) => item.status === "saved")} />
            </div>
            <section className="workspace-card">
              <div className="section-title"><div className="section-icon"><ImagePlus size={19} /></div><div><h2>Upload your certificates</h2><p>Select up to 20 images or PDFs. Add files now or later.</p></div></div>
              <button className="dropzone" onClick={() => inputRef.current?.click()} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); chooseFiles(event.dataTransfer.files); }}>
                <span className="upload-icon"><UploadCloud size={25} /></span><strong>Drop certificates here</strong><span>or <span className="browse-text">browse files</span> from your device</span><small>JPG, PNG, WEBP or PDF <i /> Up to 10 MB each <i /> {uploads.length}/20 selected</small>
              </button>
              <input ref={inputRef} className="visually-hidden" type="file" multiple accept=".jpg,.jpeg,.png,.webp,.pdf,image/jpeg,image/png,image/webp,application/pdf" onChange={(event) => { chooseFiles(event.target.files); event.currentTarget.value = ""; }} />
              {!!uploads.length && <div className="batch-file-list">{uploads.map((item) => <div className="batch-file" key={item.key}>
                <div className="batch-file-heading"><FileSearch2 size={17} /><strong title={item.file.name}>{item.file.name}</strong><span>{(item.file.size / 1024 / 1024).toFixed(2)} MB</span><button className="icon-button" aria-label={`Remove ${item.file.name}`} disabled={extracting || batchSaving} onClick={() => removeUpload(item.key)}><X size={16} /></button></div>
                {item.status === "reading" && <div className="progress-panel"><div className="progress-label"><span><LoaderCircle className="spin" size={16} /> Reading text…</span><strong>{item.progress}%</strong></div><div className="progress-track"><span style={{ width: `${item.progress}%` }} /></div></div>}
                {item.status === "extracting" && <p className="batch-status"><LoaderCircle className="spin" size={15} /> Extracting structured details…</p>}
                {item.error && <p className="batch-error">{item.error}</p>}
                {item.status === "saved" && <p className="batch-status"><Check size={15} /> Saved and linked to this file</p>}
                {item.certificate && <div className="batch-result"><div className="result-kicker"><span className="result-icon"><BookOpenCheck size={17} /></span><div><span className="eyebrow">{item.status === "saved" ? "SAVED" : "REVIEW DETAILS"}</span><h2>{item.certificate.certificationName || item.file.name}</h2></div></div><details className="extracted-text"><summary>View extracted text</summary><p>{item.extractedText}</p></details><CertificateEditor certificate={item.certificate} onChange={(value) => setUploads((current) => current.map((entry) => entry.key === item.key ? { ...entry, certificate: value } : entry))} editing={item.status !== "saved"} setEditing={() => {}} saving={batchSaving} hideEditToggle />{item.status !== "saved" && <p className="privacy-hint">Review the extracted fields. This record will be saved with {item.file.name}.</p>}</div>}
              </div>)}</div>}
              <div className="batch-actions"><button className="button button-quiet" onClick={extractAll} disabled={extracting || batchSaving || !uploads.some((item) => item.status === "ready" || item.status === "error")}><FileSearch2 size={16} /> {extracting ? "Extracting…" : "Extract all"}</button><button className="button button-primary" onClick={saveAll} disabled={batchSaving || extracting || !uploads.some((item) => item.certificate && item.status !== "saved")}><Check size={16} /> {batchSaving ? "Saving…" : "Save all"}</button></div>
            </section>
            {error && <ErrorMessage message={error} onClose={() => setError("")} />}          </>
        ) : (
          <section className="library-page">
            <div className="library-heading">
              <div><span className="eyebrow"><GraduationCap size={14} /> SHARED CERTIFICATE LIBRARY</span><h1>My certificates<span className="brand-period">.</span></h1><p>All saved certificates, together in one place.</p></div>
              <div className="library-actions">
                <button className="button button-quiet" onClick={exportExcel} disabled={exporting || !savedCertificates.length}><FileSpreadsheet size={16} /> Export as Excel</button>
                <button className="button button-quiet" onClick={exportPdf} disabled={exporting || !savedCertificates.length}><FileDown size={16} /> Download as PDF</button>
                <button className="button button-primary" onClick={() => { setPage("upload"); setActiveCertificate(null); }}><FilePlus2 size={16} /> Add certificate</button>
              </div>
            </div>
            {error && <ErrorMessage message={error} onClose={() => setError("")} />}
            {savedCertificates.length > 0 && (
              <label className="search-box"><Search size={18} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by name, certificate, or organizationâ€¦" /></label>
            )}
            {activeCertificate ? (
              <div className="saved-detail">
                <button className="back-link" onClick={() => { setActiveCertificate(null); setEditing(false); setError(""); }}><ArrowLeft size={16} /> Back to all certificates</button>
                {error && <ErrorMessage message={error} onClose={() => setError("")} />}
                <CertificateEditor certificate={activeCertificate} onChange={updateSaved} editing={editing} setEditing={setEditing} onSave={saveEditedSaved} savingLabel="Save changes" saving={saving} />
                {!editing && <div className="detail-meta"><Clock3 size={14} /> Added {formatDate(activeCertificate.createdAt)}</div>}
              </div>
            ) : filteredCertificates.length ? (
              <div className="certificates-table-wrap">
                <table className="certificates-table">
                  <thead><tr><th>S.No.</th><th>Name</th><th>Certification</th><th>Certificate No.</th><th>Organization</th><th>Issue Date</th><th>Duration</th><th>Certificate</th><th>Actions</th></tr></thead>
                  <tbody>{filteredCertificates.map((item, index) => (
                    <tr key={item.id}>
                      <td>{index + 1}</td>
                      <td>{item.name || "â€”"}</td>
                      <td>{item.certificationName || "â€”"}</td>
                      <td>{item.certificateNumber || "â€”"}</td>
                      <td>{item.issuingOrganization || "â€”"}</td>
                      <td>{item.issueDate || "â€”"}</td>
                      <td>{item.duration || "â€”"}</td>
                      <td>{item.fileName ? <span className="table-file-name" title={item.fileName}>{item.fileName}</span> : "â€”"}</td>
                      <td><div className="table-actions">
                        <button className="icon-button" aria-label={`View ${item.fileName || "certificate"}`} title="View certificate" disabled={!item.filePath} onClick={() => openCertificateFile(item)}><Eye size={16} /></button>
                        <button className="icon-button" aria-label={`Download ${item.fileName || "certificate"}`} title="Download certificate" disabled={!item.filePath} onClick={() => openCertificateFile(item, true)}><Download size={16} /></button>
                        <button className="icon-button" aria-label="Edit certificate information" title="Edit certificate information" onClick={() => openSaved(item, true)}><FilePenLine size={16} /></button>
                        <button className="icon-button delete-button" aria-label="Delete certificate" title="Delete certificate" onClick={() => removeSaved(item.id)}><Trash2 size={16} /></button>
                      </div></td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            ) : savedCertificates.length ? (
              <div className="empty-state compact"><span className="empty-icon"><Search size={24} /></span><h2>No matches found</h2><p>Try a different name, certificate, or organization.</p><button className="text-button" onClick={() => setSearch("")}>Clear search</button></div>
            ) : libraryLoading ? (
              <div className="empty-state"><LoaderCircle className="spin" size={24} /><p>Loading your certificatesâ€¦</p></div>
            ) : (
              <div className="empty-state"><span className="empty-icon"><Award size={27} /></span><span className="eyebrow">A LITTLE SPACE FOR BIG THINGS</span><h2>Your achievements will live here.</h2><p>Save your first certificate and it will be ready whenever you need it.</p><button className="button button-primary" onClick={() => setPage("upload")}><FilePlus2 size={16} /> Add your first certificate</button></div>
            )}
          </section>
        )}
      </main>

      <footer className="footer"><span>certify<span className="brand-period">.</span></span><span>Made for the milestones that matter.</span><span><ShieldCheck size={14} /> Shared in Supabase</span></footer>
      {toast && <div className="toast"><Check size={16} /> {toast}</div>}
    </div>
  );
}

function Step({ number, label, active, done }) {
  return <div className={`step ${active ? "step-active" : ""} ${done ? "step-done" : ""}`}><span className="step-number">{done ? <Check size={13} /> : number}</span><span>{label}</span></div>;
}

function addOrUpdateCertificate(records, saved) {
  const existingIndex = records.findIndex((record) => record.id === saved.id);
  if (existingIndex < 0) return [saved, ...records];
  return records.map((record) => record.id === saved.id ? saved : record);
}

function fileFingerprint(file) {
  return `${file.name}:${file.size}:${file.lastModified}`;
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function isPdfFile(file) {
  return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
}

async function renderPdfPage(file) {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
  const pdfDocument = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  try {
    const page = await pdfDocument.getPage(1);
    const baseViewport = page.getViewport({ scale: 1 });
    const scale = Math.min(2, 4000 / Math.max(baseViewport.width, baseViewport.height));
    const viewport = page.getViewport({ scale });
    const canvas = globalThis.document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const canvasContext = canvas.getContext("2d");
    if (!canvasContext) throw new Error("Could not create a canvas for the PDF page.");
    await page.render({ canvasContext, viewport }).promise;
    return canvas;
  } finally {
    await pdfDocument.destroy();
  }
}

function ErrorMessage({ message, onClose }) {
  return <div className="error-message" role="alert"><span>{message}</span><button aria-label="Dismiss error" onClick={onClose}><X size={16} /></button></div>;
}

function formatDate(value) {
  if (!value) return "recently";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "recently" : date.toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" });
}

export default App;
