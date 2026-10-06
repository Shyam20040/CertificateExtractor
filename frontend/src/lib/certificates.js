import { requireSupabase } from "./supabase.js";

const tableName = "certificates";
const bucketName = "Documents";

export async function getCertificates() {
  const { data, error } = await requireSupabase()
    .from(tableName)
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw new Error(`Could not load certificates: ${error.message}`);
  return data.map(fromDatabase);
}

export async function saveCertificate(certificate, file = null) {
  const client = requireSupabase();
  const id = certificate.id || crypto.randomUUID();
  let filePath = certificate.filePath || null;
  let uploadedPath = null;

  if (file) {
    const safeFileName = file.name.replace(/[^\w.-]+/g, "_");
    filePath = `${crypto.randomUUID()}-${safeFileName}`;
    const { error } = await client.storage
      .from(bucketName)
      .upload(filePath, file, { contentType: file.type || mimeTypeFor(file.name), upsert: false });
    if (error) throw new Error(`Could not upload certificate file: ${error.message}`);
    uploadedPath = filePath;
  }

  const row = toDatabase({ ...certificate, id, filePath, fileName: file?.name || certificate.fileName });
  const { data, error } = await client
    .from(tableName)
    .upsert(row)
    .select("*")
    .single();

  if (error) {
    if (uploadedPath) {
      const { error: cleanupError } = await client.storage.from(bucketName).remove([uploadedPath]);
      if (cleanupError) {
        throw new Error(`Could not save certificate information (${error.message}) or clean up its uploaded file (${cleanupError.message}).`);
      }
    }
    throw new Error(`Could not save certificate information: ${error.message}`);
  }

  if (uploadedPath && certificate.filePath && certificate.filePath !== uploadedPath) {
    const { error: cleanupError } = await client.storage.from(bucketName).remove([certificate.filePath]);
    if (cleanupError) {
      console.error("Certificate was saved, but the previous file could not be removed:", cleanupError);
      return { ...fromDatabase(data), cleanupWarning: "The certificate was saved, but its previous uploaded file could not be removed." };
    }
  }

  return fromDatabase(data);
}

export async function deleteCertificate(id) {
  const client = requireSupabase();
  const { data: record, error: lookupError } = await client
    .from(tableName)
    .select("file_path")
    .eq("id", id)
    .single();
  if (lookupError) throw new Error(`Could not find certificate to delete: ${lookupError.message}`);

  const { error } = await client.from(tableName).delete().eq("id", id);
  if (error) throw new Error(`Could not delete certificate information: ${error.message}`);

  if (record.file_path) {
    const { error: storageError } = await client.storage.from(bucketName).remove([record.file_path]);
    if (storageError) {
      return { cleanupWarning: `The certificate record was deleted, but its uploaded file could not be removed: ${storageError.message}` };
    }
  }
  return {};
}

export async function getCertificateFileUrl(certificate, download = false, expiresIn = 60) {
  if (!certificate.filePath) throw new Error("No certificate file is attached to this record.");
  const { data, error } = await requireSupabase()
    .storage
    .from(bucketName)
    .createSignedUrl(certificate.filePath, expiresIn, download ? { download: certificate.fileName || true } : undefined);
  if (error) throw new Error(`Could not open certificate file: ${error.message}`);
  return data.signedUrl;
}

function toDatabase(certificate) {
  return {
    id: certificate.id,
    name: certificate.name || "",
    certification_name: certificate.certificationName || "",
    certificate_number: certificate.certificateNumber || "",
    issuing_organization: certificate.issuingOrganization || "",
    issue_date: certificate.issueDate || "",
    duration: certificate.duration || "",
    skills: Array.isArray(certificate.skills) ? certificate.skills : [],
    description: certificate.description || "",
    file_path: certificate.filePath || null,
    file_name: certificate.fileName || null,
    expiration_date: certificate.expirationDate || "",
    credential_url: certificate.credentialUrl || "",
    created_at: certificate.createdAt,
    updated_at: new Date().toISOString(),
  };
}

function fromDatabase(row) {
  return {
    id: row.id,
    name: row.name || "",
    certificationName: row.certification_name || "",
    certificateNumber: row.certificate_number || "",
    issuingOrganization: row.issuing_organization || "",
    issueDate: row.issue_date || "",
    duration: row.duration || "",
    skills: Array.isArray(row.skills) ? row.skills : [],
    description: row.description || "",
    filePath: row.file_path || "",
    fileName: row.file_name || "",
    expirationDate: row.expiration_date || "",
    credentialUrl: row.credential_url || "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mimeTypeFor(fileName) {
  const extension = fileName.split(".").pop()?.toLowerCase();
  return {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
    pdf: "application/pdf",
  }[extension] || "application/octet-stream";
}
