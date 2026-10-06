import { useEffect, useRef, useState } from "react";
import { Check, LoaderCircle, Plus, X } from "lucide-react";

const fields = [
  ["name", "Recipient name", "e.g. Alex Morgan"],
  ["certificationName", "Certification name", "e.g. UX Design Professional"],
  ["issuingOrganization", "Issuing organization", "e.g. Google"],
  ["certificateNumber", "Certificate number", "e.g. CERT-2024-001"],
  ["issueDate", "Issue date", "e.g. March 2025"],
  ["expirationDate", "Expiration date", "e.g. March 2027"],
  ["duration", "Duration", "e.g. 8 weeks · 40 hours"],
  ["credentialUrl", "Credential URL", "https://"],
];

export default function CertificateEditor({ certificate, onChange, editing, setEditing, onSave, savingLabel, saveAlways = false, saving = false }) {
  const [skillInput, setSkillInput] = useState("");
  const originalCertificate = useRef(certificate);

  useEffect(() => setSkillInput(""), [certificate.id]);

  function toggleEditing() {
    if (editing) {
      onChange(originalCertificate.current);
      setEditing(false);
      return;
    }
    originalCertificate.current = certificate;
    setEditing(true);
  }

  function update(field, value) {
    onChange({ ...certificate, [field]: value });
  }

  function addSkill(event) {
    event.preventDefault();
    const skill = skillInput.trim();
    if (skill && !certificate.skills.includes(skill)) update("skills", [...certificate.skills, skill]);
    setSkillInput("");
  }

  return (
    <section className="details-card">
      <div className="details-heading">
        <div>
          <span className="eyebrow">CERTIFICATE PROFILE</span>
          <h2>{certificate.certificationName || "Your certificate details"}</h2>
          <p>Review the information below and make any corrections.</p>
        </div>
        <button className="button button-quiet" onClick={toggleEditing}>
          {editing ? <><X size={16} /> Cancel edit</> : "Edit details"}
        </button>
      </div>

      <div className="field-grid">
        {fields.map(([field, label, placeholder]) => (
          <label className="field" key={field}>
            <span>{label}</span>
            {editing ? (
              <input value={certificate[field] || ""} placeholder={placeholder} onChange={(event) => update(field, event.target.value)} />
            ) : (
              <strong className={certificate[field] ? "" : "muted-value"}>{certificate[field] || "Not provided"}</strong>
            )}
          </label>
        ))}
        <label className="field field-wide">
          <span>Description</span>
          {editing ? (
            <textarea rows="3" value={certificate.description || ""} placeholder="A short summary of this certificate" onChange={(event) => update("description", event.target.value)} />
          ) : (
            <strong className={certificate.description ? "" : "muted-value"}>{certificate.description || "No description provided"}</strong>
          )}
        </label>
        <div className="field field-wide">
          <span>Skills &amp; topics</span>
          <div className="skill-list">
            {(certificate.skills || []).map((skill) => (
              <span className="skill-chip" key={skill}>
                {skill}
                {editing && <button aria-label={`Remove ${skill}`} onClick={() => update("skills", certificate.skills.filter((item) => item !== skill))}><X size={13} /></button>}
              </span>
            ))}
            {editing && <form className="skill-add" onSubmit={addSkill}><input value={skillInput} onChange={(event) => setSkillInput(event.target.value)} placeholder="Add a skill" /><button aria-label="Add skill" type="submit"><Plus size={15} /></button></form>}
            {!editing && !certificate.skills?.length && <strong className="muted-value">No topics provided</strong>}
          </div>
        </div>
      </div>

      {(editing || saveAlways) && (
        <div className="editor-actions">
          {editing && <button className="button button-quiet" onClick={toggleEditing}>Cancel</button>}
          <button className="button button-primary" onClick={onSave} disabled={saving}>{saving ? <><LoaderCircle className="spin" size={16} /> Saving…</> : <><Check size={16} /> {savingLabel}</>}</button>
        </div>
      )}
    </section>
  );
}
