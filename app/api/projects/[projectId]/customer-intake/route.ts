import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { authorizeRequest } from "@/lib/api-permissions";
import { syncCustomerMaster } from "@/services/customers/customerSync";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

function cleanString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function cleanCustomerCode(value: unknown) {
  return cleanString(value).toUpperCase();
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  try {
    const permission = await authorizeRequest(supabaseAdmin, request, ["admin", "supervisor", "sales", "ops", "sbc"]);
    if (!permission.ok) return permission.response;

    const { projectId } = await params;
    const body = await request.json();
    const intake = body.customerIntake || {};
    const nextCustomerCode = cleanCustomerCode(body.customerCode);
    const nextCustomerName = cleanString(body.customerName);
    const nextCustomerPhone = cleanString(body.customerPhone);

    const { data: existingProject, error: existingProjectError } = await supabaseAdmin
      .from("projects")
      .select("id, customer_code, customer_name, customer_phone, customer_intake, customer_id, customer_site_id")
      .eq("id", projectId)
      .single();

    if (existingProjectError || !existingProject) {
      return NextResponse.json({ error: "Project not found." }, { status: 404 });
    }

    if (!nextCustomerCode || !nextCustomerName) {
      return NextResponse.json({ error: "customerCode and customerName are required." }, { status: 400 });
    }

    if (nextCustomerCode !== existingProject.customer_code) {
      const { data: duplicateProject, error: duplicateError } = await supabaseAdmin
        .from("projects")
        .select("id")
        .eq("customer_code", nextCustomerCode)
        .neq("id", projectId)
        .maybeSingle();

      if (duplicateError) {
        return NextResponse.json({ error: duplicateError.message }, { status: 400 });
      }
      if (duplicateProject) {
        return NextResponse.json({ error: "Customer code is already used by another project." }, { status: 409 });
      }
    }

    const nextCustomerIntake = {
      ...(existingProject.customer_intake || {}),
      contactName: cleanString(intake.contactName),
      contactVerified: Boolean(intake.contactVerified),
      siteAddress: cleanString(intake.siteAddress),
      postalCode: cleanString(intake.postalCode),
      siteSubdistrict: cleanString(intake.siteSubdistrict),
      siteDistrict: cleanString(intake.siteDistrict),
      siteProvince: cleanString(intake.siteProvince),
      googleMapsUrl: cleanString(intake.googleMapsUrl),
      interestedSystemSizeKw: cleanString(intake.interestedSystemSizeKw),
      monthlyElectricBill: cleanString(intake.monthlyElectricBill),
      initialRequirement: cleanString(intake.initialRequirement),
      projectScope: cleanString(intake.projectScope) || "RES-S rooftop solar",
    };
    const customerRefs = await syncCustomerMaster(supabaseAdmin, {
      customerCode: nextCustomerCode,
      customerName: nextCustomerName,
      customerPhone: nextCustomerPhone,
      customerIntake: nextCustomerIntake,
      actorUserId: permission.userId,
      source: "customer_intake_api",
    });

    const { data: project, error: updateError } = await supabaseAdmin
      .from("projects")
      .update({
        customer_code: nextCustomerCode,
        customer_name: nextCustomerName,
        customer_phone: nextCustomerPhone || null,
        customer_intake: nextCustomerIntake,
        customer_id: customerRefs.customerId,
        customer_site_id: customerRefs.customerSiteId,
      })
      .eq("id", projectId)
      .select("*")
      .single();

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 400 });
    }

    await supabaseAdmin.from("activity_logs").insert({
      project_id: projectId,
      action: "CUSTOMER_INTAKE_AUDITED",
      actor_id: permission.userId,
      before_state: {
        customer_code: existingProject.customer_code,
        customer_name: existingProject.customer_name,
        customer_phone: existingProject.customer_phone,
        customer_intake: existingProject.customer_intake || {},
      },
      after_state: {
        customer_code: nextCustomerCode,
        customer_name: nextCustomerName,
        customer_phone: nextCustomerPhone || null,
        customer_intake: nextCustomerIntake,
      },
      metadata: {
        source: "checklist_review_modal",
      },
    });

    return NextResponse.json({ ok: true, project });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: `Customer intake update failed: ${message}` }, { status: 500 });
  }
}
