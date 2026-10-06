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
  const [file, setFile] = useState(null);
  const [imageUrl, setImageUrl] = useState("");
  const [ocrProgress, setOcrProgress] = useState(0);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [extractLoading, setExtractLoading] = useState(false);
  const [error, setError] = useState("");
  const [certificate, setCertificate] = useState(null);
  const [editing, setEditing] = useState(false);
  const [savedCertificates, setSavedCertificates] = useState([]);
  const [search, setSearch] = useState("");
  const [activeCertificate, setActiveCertificate] = useState(null);
  const [toast, setToast] = useState("");
  const [libraryLoading, setLibraryLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => () => {
    if (imageUrl) URL.revokeObjectURL(imageUrl);
  }, [imageUrl]);

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

  function chooseFile(selected) {
    setError("");
    if (!selected) return;
    const extension = selected.name.split(".").pop()?.toLowerCase();
    const acceptedExtensions = ["jpg", "jpeg", "png", "webp", "pdf"];
    if (!acceptedTypes.includes(selected.type) && !acceptedExtensions.includes(extension)) {
      setError("Please choose a JPG, PNG, WEBP, or PDF certificate.");
      return;
    }
    if (!selected.size) {
      setError("This file is empty. Please choose another file.");
      return;
    }
    if (selected.size > 10 * 1024 * 1024) {
      setError("This file is larger than 10 MB. Choose a smaller file to continue.");
      return;
    }
    setFile(selected);
    setImageUrl(isPdfFile(selected) ? "" : URL.createObjectURL(selected));
    setCertificate(null);
    setEditing(false);
  }

  async function runOcr() {
    if (!file) {
      setError("Upload a certificate image or PDF first.");
      return;
    }
    setError("");
    setOcrLoading(true);
    setOcrProgress(0);
    try {
      const worker = await createWorker("eng", 1, {
        logger: (message) => {
          if (message.status === "recognizing text") setOcrProgress(Math.round(message.progress * 100));
        },
      });
      try {
        const source = isPdfFile(file) ? await renderPdfPage(file) : file;
        let result;
        try {
          result = await worker.recognize(source);
        } finally {
          if (isPdfFile(file)) {
            source.width = 0;
            source.height = 0;
          }
        }
        const text = result.data.text.trim();
        if (text.length < 10) {
          setError("Not enough text was found. Try a clearer image or PDF with better lighting.");
          return;
        }
        await extractInformation(text);
      } finally {
        await worker.terminate();
      }
    } catch (ocrError) {
      console.error("OCR failed:", ocrError);
      setError(isPdfFile(file)
        ? "Could not read this PDF. Make sure it is not password-protected, then try again."
        : "Text recognition failed. Please try another image.");
    } finally {
      setOcrLoading(false);
    }
  }

  async function extractInformation(text) {
    setError("");
    setExtractLoading(true);
    try {
      const response = await fetch("/api/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const responseText = await response.text();
      let result;
      try {
        result = responseText ? JSON.parse(responseText) : null;
      } catch {
        throw new Error(
          response.ok
            ? "The extraction service returned an unreadable response. Please try again."
            : "The extraction service is unavailable. Make sure the Express server is running, then try again.",
        );
      }
      if (!result || typeof result !== "object") {
        throw new Error("The extraction service returned an empty response. Make sure the Express server is running, then try again.");
      }
      if (!response.ok) throw new Error(result.error || "Could not extract certificate details.");
      if (!result.certificate || typeof result.certificate !== "object") {
        throw new Error("The extraction service response did not include certificate details. Please try again.");
      }
      setCertificate({ ...initialCertificate(), ...result.certificate });
      setEditing(false);
    } catch (extractError) {
      setError(extractError instanceof TypeError
        ? "Could not connect to the extraction service. Make sure both the React app and Express server are running."
        : extractError.message || "Could not connect to the extraction service.");
    } finally {
      setExtractLoading(false);
    }
  }

  async function saveCurrentCertificate(value = certificate) {
    if (!value) return;
    if (!value.certificationName.trim() && !value.name.trim()) {
      setError("Add a recipient or certification name before saving.");
      return;
    }
    setSaving(true);
    try {
      const saved = await saveCertificate({
        ...value,
        filePath: value.filePath || "",
        fileName: value.fileName || file?.name || "",
        sourceImageName: value.sourceImageName || file?.name || "",
        id: value.id,
        createdAt: value.createdAt,
      }, file);
      setCertificate(saved);
      setActiveCertificate(saved);
      setSavedCertificates((records) => addOrUpdateCertificate(records, saved));
      setFile(null);
      setImageUrl("");
      setEditing(false);
      setError("");
      notify(saved.cleanupWarning || "Certificate saved to your library");
    } catch (saveError) {
      console.error("Could not save certificate:", saveError);
      setError(saveError.message || "Could not save this certificate.");
    } finally {
      setSaving(false);
    }
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
          record.fileUrl ? "Open certificate" : "",
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
    return Promise.all(savedCertificates.map(async (record) => ({
      ...record,
      fileUrl: record.filePath ? await getCertificateFileUrl(record, false, 604800) : "",
    })));
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
                <p>Turn a certificate image or PDF into a polished, searchable record in just a few clicks.</p>
              </div>
              <div className="hero-art" aria-hidden="true">
                <div className="hero-orbit orbit-one" /><div className="hero-orbit orbit-two" />
                <div className="hero-certificate"><span className="mini-seal"><Award size={28} /></span><span className="mini-line wide" /><span className="mini-line" /><span className="mini-line short" /><span className="mini-sign" /></div>
                <span className="sparkle sparkle-one">✳</span><span className="sparkle sparkle-two">✦</span>
              </div>
            </section>

            <div className="steps">
              <Step number="01" label="Upload" active={!ocrLoading && !extractLoading && !certificate} done={ocrLoading || extractLoading || !!certificate} />
              <span className="step-line" />
              <Step number="02" label="Extract details" active={ocrLoading || extractLoading} done={!!certificate} />
              <span className="step-line" />
              <Step number="03" label="Save details" active={!!certificate} done={false} />
            </div>

            <section className="workspace-card">
              <div className="section-title">
                <div className="section-icon"><ImagePlus size={19} /></div>
                <div><h2>Upload your certificate</h2><p>Start with a clear image, scan, or PDF.</p></div>
              </div>
              {!file ? (
                <button className="dropzone" onClick={() => inputRef.current?.click()} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); chooseFile(event.dataTransfer.files[0]); }}>
                  <span className="upload-icon"><UploadCloud size={25} /></span>
                  <strong>Drop your certificate here</strong>
                  <span>or <span className="browse-text">browse files</span> from your device</span>
                  <small>JPG, PNG, WEBP or PDF <i /> Up to 10 MB</small>
                </button>
              ) : (
                <div className="uploaded-file">
                  <div className="preview-wrap">{isPdfFile(file) ? <FileSearch2 size={26} aria-label="PDF certificate" /> : <img src={imageUrl} alt="Uploaded certificate preview" />}</div>
                  <div className="uploaded-info"><strong>{file.name}</strong><span>{(file.size / 1024 / 1024).toFixed(2)} MB · Ready to read</span><button className="text-button" onClick={() => { setFile(null); setImageUrl(""); setCertificate(null); }}>Remove file</button></div>
                  {!ocrLoading && !extractLoading && !certificate && <button className="button button-primary" onClick={runOcr}><FileSearch2 size={16} /> Read certificate</button>}
                </div>
              )}
              <input ref={inputRef} className="visually-hidden" type="file" accept=".jpg,.jpeg,.png,.webp,.pdf,image/jpeg,image/png,image/webp,application/pdf" onChange={(event) => { chooseFile(event.target.files?.[0]); event.currentTarget.value = ""; }} />

              {ocrLoading && <div className="progress-panel"><div className="progress-label"><span><LoaderCircle className="spin" size={17} /> Reading certificate text…</span><strong>{ocrProgress}%</strong></div><div className="progress-track"><span style={{ width: `${ocrProgress}%` }} /></div><p>Text recognition runs privately in your browser. Only the extracted text is sent to Gemini.</p></div>}
            </section>

            {error && <ErrorMessage message={error} onClose={() => setError("")} />}
            {extractLoading && <div className="ai-loading"><span className="ai-loading-icon"><Sparkles size={20} /></span><div><strong>Finding the important details</strong><p>Gemini is organizing the certificate text into a neat profile.</p></div><LoaderCircle className="spin loading-trailing" size={19} /></div>}
            {certificate && !extractLoading && (
              <div className="result-section">
                <div className="result-kicker"><span className="result-icon"><BookOpenCheck size={18} /></span><div><span className="eyebrow">STEP 03 · READY TO REVIEW</span><h2>Your certificate details</h2></div></div>
                <CertificateEditor certificate={certificate} onChange={setCertificate} editing={editing} setEditing={setEditing} onSave={() => saveCurrentCertificate()} savingLabel="Save certificate" saveAlways saving={saving} />
                {!editing && <p className="privacy-hint"><ShieldCheck size={15} /> Your certificate is saved to the shared Supabase library when you choose Save certificate.</p>}
              </div>
            )}
          </>
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
              <label className="search-box"><Search size={18} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by name, certificate, or organization…" /></label>
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
                      <td>{item.name || "—"}</td>
                      <td>{item.certificationName || "—"}</td>
                      <td>{item.certificateNumber || "—"}</td>
                      <td>{item.issuingOrganization || "—"}</td>
                      <td>{item.issueDate || "—"}</td>
                      <td>{item.duration || "—"}</td>
                      <td>{item.fileName ? <span className="table-file-name" title={item.fileName}>{item.fileName}</span> : "—"}</td>
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
              <div className="empty-state"><LoaderCircle className="spin" size={24} /><p>Loading your certificates…</p></div>
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
