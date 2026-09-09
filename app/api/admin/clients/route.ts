import { NextRequest, NextResponse } from "next/server";

import { adminRest } from "@/lib/supabase/rest";
import { getAdminSession } from "@/lib/supabase/session";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function GET() {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  const clients = await adminRest<
    {
      id: string;
      business_name: string;
      contact_name: string;
      contact_email: string | null;
      phone: string | null;
      invited_at: string | null;
      created_at: string;
    }[]
  >("clients?select=id,business_name,contact_name,contact_email,phone,invited_at,created_at&order=created_at.desc");

  return NextResponse.json({ clients });
}

export async function POST(request: NextRequest) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as
    | {
        businessName?: string;
        contactName?: string;
        contactEmail?: string;
        phone?: string;
        notes?: string;
      }
    | null;

  const businessName = body?.businessName?.trim() ?? "";
  const contactName = body?.contactName?.trim() ?? "";
  const contactEmail = body?.contactEmail?.trim().toLowerCase() ?? "";

  if (!businessName || !contactName || (contactEmail && !EMAIL_RE.test(contactEmail))) {
    return NextResponse.json(
      { error: "Business and contact name are required, and email must be valid." },
      { status: 400 },
    );
  }

  try {
    const inserted = await adminRest("clients", {
      method: "POST",
      returnRepresentation: true,
      body: JSON.stringify({
        business_name: businessName,
        contact_name: contactName,
        contact_email: contactEmail || null,
        phone: body?.phone?.trim() || null,
        notes: body?.notes?.trim() || null,
      }),
    });

    return NextResponse.json({ client: Array.isArray(inserted) ? inserted[0] : inserted });
  } catch (error) {
    console.error("Admin client create failed", error);
    return NextResponse.json({ error: "Could not create that client." }, { status: 500 });
  }
}
