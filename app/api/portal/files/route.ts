import { NextRequest, NextResponse } from "next/server";

import { fileCategoryLabel, portalConfig } from "@/lib/config";
import type { PortalFile } from "@/lib/portal/types";
import { normalizeSupabaseUrl } from "@/lib/supabase/url";
import {
  storageUserRequest,
  userRest,
} from "@/lib/supabase/rest";
import { getPortalSession } from "@/lib/supabase/session";

const MAX_FILE_SIZE = 20 * 1024 * 1024;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const ALLOWED_CATEGORIES = new Set(
  portalConfig.fileCategories.map((category) => category.key),
);

type FileRow = {
  id: string;
  project_id: string;
  uploaded_by: string;
  filename: string;
  storage_path: string;
  size: number;
  content_type: string | null;
  category: string;
  version: string | null;
  created_at: string;
};

function safeFilename(value: string) {
  return (
    value
      .normalize("NFKD")
      .replace(/[^\w.\- ]+/g, "")
      .replace(/\s+/g, "-")
      .slice(0, 120) || "file"
  );
}

function storageObjectPath(storagePath: string) {
  return storagePath
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
}

export async function POST(request: NextRequest) {
  const session = await getPortalSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid upload." }, { status: 400 });
  }

  const projectId = String(form.get("projectId") ?? "");
  const category = String(form.get("category") ?? "other");
  const file = form.get("file");

  if (!UUID_RE.test(projectId) || !ALLOWED_CATEGORIES.has(category)) {
    return NextResponse.json({ error: "Invalid upload details." }, { status: 400 });
  }

  if (!(file instanceof File) || file.size <= 0 || file.size > MAX_FILE_SIZE) {
    return NextResponse.json(
      { error: "Choose a file smaller than 20 MB." },
      { status: 400 },
    );
  }

  // Check project access under the caller's token before touching Storage. RLS
  // is the authority: a project outside this user's memberships is invisible.
  const accessible = await userRest<{ id: string }[]>(
    `projects?id=eq.${encodeURIComponent(projectId)}&select=id&limit=1`,
    session.accessToken,
  ).catch(() => []);

  if (!accessible[0]) {
    return NextResponse.json({ error: "Project not found." }, { status: 404 });
  }

  const storagePath = `${projectId}/${crypto.randomUUID()}-${safeFilename(file.name)}`;
  const objectPath = storageObjectPath(storagePath);

  const upload = await storageUserRequest(
    `/object/portal-files/${objectPath}`,
    session.accessToken,
    {
      method: "POST",
      headers: {
        "Content-Type": file.type || "application/octet-stream",
        "x-upsert": "false",
      },
      body: await file.arrayBuffer(),
    },
  );

  if (!upload.ok) {
    const detail = await upload.text().catch(() => "");
    console.error("Portal file upload failed", upload.status, detail.slice(0, 400));
    return NextResponse.json(
      { error: "Could not upload that file." },
      { status: 500 },
    );
  }

  try {
    const inserted = await userRest<FileRow[]>("files", session.accessToken, {
      method: "POST",
      returnRepresentation: true,
      body: JSON.stringify({
        project_id: projectId,
        uploaded_by: session.profile.id,
        filename: file.name,
        storage_path: storagePath,
        size: file.size,
        content_type: file.type || null,
        category,
      }),
    });

    const row = inserted[0];
    if (!row) throw new Error("File metadata insert returned no row.");

    const publicFile: PortalFile = {
      id: row.id,
      filename: row.filename,
      category: row.category,
      categoryLabel: fileCategoryLabel(row.category),
      size: Number(row.size),
      version: row.version,
      uploadedByName: session.profile.name,
      createdAt: row.created_at,
    };

    return NextResponse.json({ file: publicFile });
  } catch (error) {
    console.error("Portal file metadata insert failed", error);

    // Do not leave an orphan object if the row write fails. Storage deletion is
    // still performed as this user, so the same project-access policy applies.
    await storageUserRequest(
      `/object/portal-files/${objectPath}`,
      session.accessToken,
      { method: "DELETE" },
    ).catch(() => null);

    return NextResponse.json(
      { error: "Could not save the uploaded file." },
      { status: 500 },
    );
  }
}

export async function GET(request: NextRequest) {
  const session = await getPortalSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const fileId = request.nextUrl.searchParams.get("fileId") ?? "";
  if (!UUID_RE.test(fileId)) {
    return NextResponse.json({ error: "File not found." }, { status: 404 });
  }

  // Reading the metadata under the caller's token is the authorization check.
  // Never mint a signed URL from an admin/service-role lookup on this path.
  const rows = await userRest<FileRow[]>(
    `files?id=eq.${encodeURIComponent(fileId)}&select=id,project_id,uploaded_by,filename,storage_path,size,content_type,category,version,created_at&limit=1`,
    session.accessToken,
  ).catch(() => []);

  const row = rows[0];
  if (!row) {
    return NextResponse.json({ error: "File not found." }, { status: 404 });
  }

  const sign = await storageUserRequest(
    `/object/sign/portal-files/${storageObjectPath(row.storage_path)}`,
    session.accessToken,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ expiresIn: 60 }),
    },
  );

  if (!sign.ok) {
    const detail = await sign.text().catch(() => "");
    console.error("Portal file signing failed", sign.status, detail.slice(0, 400));
    return NextResponse.json(
      { error: "Could not prepare the download." },
      { status: 500 },
    );
  }

  const payload = (await sign.json()) as {
    signedURL?: string;
    signedUrl?: string;
  };
  const signedPath = payload.signedURL ?? payload.signedUrl ?? "";

  if (!signedPath) {
    return NextResponse.json(
      { error: "Could not prepare the download." },
      { status: 500 },
    );
  }

  const base = normalizeSupabaseUrl(process.env.SUPABASE_URL)?.url ?? "";
  const url = signedPath.startsWith("http")
    ? signedPath
    : `${base}/storage/v1${signedPath.startsWith("/") ? "" : "/"}${signedPath}`;

  return NextResponse.json({ url, filename: row.filename });
}
