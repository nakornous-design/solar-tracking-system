import { SupabaseClient } from '@supabase/supabase-js';
import { createProjectFolders } from '../drive/folderEngine.ts';
import { syncCustomerMaster } from '../customers/customerSync.ts';
import { notifyStageOwner } from './notificationEngine.ts';
import {
  createProjectInputError,
  initialFinanceState,
  lockedPaymentType,
  lockedProjectType,
  standardLookup,
} from './createProjectRules.ts';

interface CreateProjectData {
  customerCode: string;
  customerName: string;
  customerPhone?: string;
  customerIntake?: {
    contactName?: string;
    contactVerified?: boolean;
    siteAddress?: string;
    postalCode?: string;
    siteSubdistrict?: string;
    siteDistrict?: string;
    siteProvince?: string;
    googleMapsUrl?: string;
    interestedSystemSizeKw?: string;
    monthlyElectricBill?: string;
    initialRequirement?: string;
    projectScope?: string;
  };
  templateId?: string;
  standardId?: string;
  projectType?: string;
  paymentType?: string;
  actorUserId?: string | null;
}

type FolderCreator = (supabase: SupabaseClient, customerCode: string, projectId?: string) => Promise<unknown>;

function dueAtFromNow(slaHours: number | null) {
  if (slaHours === null || slaHours === undefined) return null;
  return new Date(Date.now() + slaHours * 60 * 60 * 1000).toISOString();
}

const LOAN_STAGE_CODES = new Set([
  "LOAN_DOCUMENT_COLLECTION",
  "LOAN_SUBMISSION",
  "LOAN_REVIEW",
  "LOAN_APPROVAL",
  "DOWN_PAYMENT",
]);

function inactiveFinanceStageReason(stageCode: string, paymentType: string) {
  if (paymentType === "CASH" && LOAN_STAGE_CODES.has(stageCode)) {
    return "Inactive for CASH finance path.";
  }
  if (paymentType === "LOAN" && stageCode === "PAYMENT") {
    return "Inactive for LOAN finance path.";
  }
  return null;
}

function cleanIntakeValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeCustomerIntake(intake: CreateProjectData["customerIntake"] | undefined, projectType: string, customerName: string, customerPhone?: string) {
  const normalized = {
    contactName: cleanIntakeValue(intake?.contactName) || "",
    contactVerified: Boolean(intake?.contactVerified),
    siteAddress: cleanIntakeValue(intake?.siteAddress) || "",
    postalCode: cleanIntakeValue(intake?.postalCode) || "",
    siteSubdistrict: cleanIntakeValue(intake?.siteSubdistrict) || "",
    siteDistrict: cleanIntakeValue(intake?.siteDistrict) || "",
    siteProvince: cleanIntakeValue(intake?.siteProvince) || "",
    googleMapsUrl: cleanIntakeValue(intake?.googleMapsUrl) || "",
    interestedSystemSizeKw: cleanIntakeValue(intake?.interestedSystemSizeKw) || "",
    monthlyElectricBill: cleanIntakeValue(intake?.monthlyElectricBill) || "",
    initialRequirement: cleanIntakeValue(intake?.initialRequirement) || "",
    projectScope: cleanIntakeValue(intake?.projectScope) || projectType,
  };

  return {
    ...normalized,
    customerName,
    customerPhone: customerPhone || "",
  };
}

function leadChecklistSeed(code: string, customerIntake: ReturnType<typeof normalizeCustomerIntake>, projectType: string, customerCode: string) {
  const notesByCode: Record<string, string> = {
    CUSTOMER_PROFILE_CAPTURED: [
      `ลูกค้า/บริษัท: ${customerIntake.customerName}`,
      customerIntake.contactName ? `ผู้ติดต่อ: ${customerIntake.contactName}` : "",
      customerIntake.customerPhone ? `เบอร์โทร: ${customerIntake.customerPhone}` : "",
    ].filter(Boolean).join("\n"),
    CONTACT_VERIFIED: [
      customerIntake.contactVerified ? "ยืนยันเบอร์ติดต่อแล้ว" : "",
      customerIntake.customerPhone ? `เบอร์โทร: ${customerIntake.customerPhone}` : "",
    ].filter(Boolean).join("\n"),
    SITE_ADDRESS_CAPTURED: [
      customerIntake.siteAddress ? `ที่อยู่ติดตั้ง: ${customerIntake.siteAddress}` : "",
      customerIntake.siteSubdistrict ? `ตำบล/แขวง: ${customerIntake.siteSubdistrict}` : "",
      customerIntake.siteDistrict ? `อำเภอ/เขต: ${customerIntake.siteDistrict}` : "",
      customerIntake.siteProvince ? `จังหวัด/พื้นที่: ${customerIntake.siteProvince}` : "",
      customerIntake.postalCode ? `รหัสไปรษณีย์: ${customerIntake.postalCode}` : "",
      customerIntake.googleMapsUrl ? `Google Maps: ${customerIntake.googleMapsUrl}` : "",
    ].filter(Boolean).join("\n"),
    PROJECT_TYPE_CONFIRMED: `ประเภทโครงการ: ${projectType}\nขอบเขตงาน: ${customerIntake.projectScope || projectType}`,
    DUPLICATE_CHECKED: `ตรวจไม่พบ customer code/เบอร์โทรซ้ำก่อนสร้างโครงการ\nCustomer code: ${customerCode}`,
    INITIAL_REQUIREMENT_CAPTURED: [
      customerIntake.interestedSystemSizeKw ? `ขนาดที่สนใจ: ${customerIntake.interestedSystemSizeKw}` : "",
      customerIntake.monthlyElectricBill ? `ค่าไฟโดยประมาณ: ${customerIntake.monthlyElectricBill}` : "",
      customerIntake.initialRequirement ? `Requirement: ${customerIntake.initialRequirement}` : "",
    ].filter(Boolean).join("\n"),
  };

  const note = notesByCode[code] || "";
  const shouldPassByCode: Record<string, boolean> = {
    CUSTOMER_PROFILE_CAPTURED: Boolean(customerIntake.customerName && customerIntake.customerPhone),
    CONTACT_VERIFIED: Boolean(customerIntake.contactVerified && customerIntake.customerPhone),
    SITE_ADDRESS_CAPTURED: Boolean(
      customerIntake.siteAddress &&
        customerIntake.postalCode &&
        customerIntake.siteSubdistrict &&
        customerIntake.siteDistrict &&
        customerIntake.siteProvince,
    ),
    PROJECT_TYPE_CONFIRMED: Boolean(projectType),
    DUPLICATE_CHECKED: true,
    INITIAL_REQUIREMENT_CAPTURED: Boolean(customerIntake.initialRequirement || customerIntake.interestedSystemSizeKw || customerIntake.monthlyElectricBill),
  };

  return {
    notes: note || null,
    status: shouldPassByCode[code] ? "PASSED" : "PENDING",
  };
}

export class CreateProjectEngine {
  private supabase: SupabaseClient;
  private folderCreator: FolderCreator;

  constructor(
    supabase: SupabaseClient,
    folderCreator: FolderCreator = createProjectFolders,
  ) {
    this.supabase = supabase;
    this.folderCreator = folderCreator;
  }

  async execute(data: CreateProjectData) {
    const {
      customerCode: rawCustomerCode,
      customerName: rawCustomerName,
      customerPhone: rawCustomerPhone,
      customerIntake: rawCustomerIntake,
      templateId,
      standardId,
      projectType = "RES-S",
      paymentType = "CASH",
      actorUserId,
    } = data;
    const customerCode = String(rawCustomerCode || "").trim().toUpperCase();
    const customerName = String(rawCustomerName || "").trim();
    const customerPhone = String(rawCustomerPhone || "").trim();

    // 1. Validate Input
    const inputError = createProjectInputError({ customerCode, customerName });
    if (inputError) throw new Error(inputError);

    // 2. Detect duplicate customer code
    const { data: existingProject, error: duplicateCheckError } = await this.supabase
      .from("projects")
      .select("id")
      .eq("customer_code", customerCode)
      .limit(1)
      .single();

    if (duplicateCheckError && duplicateCheckError.code !== "PGRST116") {
      throw duplicateCheckError;
    }
    if (existingProject) {
      throw new Error(`Project with customer code ${customerCode} already exists.`);
    }

    // 2.5 Detect duplicate phone when needed
    if (customerPhone) {
      const { data: existingPhone, error: phoneError } = await this.supabase
        .from("projects")
        .select("id, customer_code")
        .eq("customer_phone", customerPhone)
        .neq("status", "CANCELLED")
        .limit(1)
        .single();
        
      if (phoneError && phoneError.code !== "PGRST116") {
        throw phoneError;
      }
      if (existingPhone) {
        throw new Error(`Customer phone ${customerPhone} is already in use by active project ${existingPhone.customer_code}.`);
      }
    }

    // 3. Select active workflow version
    const workflowVersionBaseQuery = () =>
      this.supabase
        .from("workflow_versions")
        .select("id, workflow_template_id, workflow_templates!inner(code, project_type, payment_type)")
        .eq("status", "PUBLISHED")
        .eq("is_active", true)
        .limit(1);

    const workflowVersionResult = templateId
      ? await workflowVersionBaseQuery().eq("workflow_template_id", templateId).single()
      : await workflowVersionBaseQuery().eq("workflow_templates.code", "RES-S-STANDARD").single();

    let workflowVersion = workflowVersionResult.data;
    let workflowVersionError = workflowVersionResult.error;

    if (!templateId && (workflowVersionError || !workflowVersion)) {
      const fallbackResult = await workflowVersionBaseQuery()
        .eq("workflow_templates.project_type", projectType)
        .eq("workflow_templates.payment_type", paymentType)
        .single();
      workflowVersion = fallbackResult.data;
      workflowVersionError = fallbackResult.error;
    }

    if (workflowVersionError || !workflowVersion) {
      throw new Error("No active published workflow version found for this project.");
    }

    const lockedProjectTypeValue = lockedProjectType(workflowVersion, projectType);
    const lockedPaymentTypeValue = lockedPaymentType(workflowVersion, paymentType);
    const customerIntake = normalizeCustomerIntake(rawCustomerIntake, lockedProjectTypeValue, customerName, customerPhone);
    const customerRefs = await syncCustomerMaster(this.supabase, {
      customerCode,
      customerName,
      customerPhone,
      customerIntake,
      actorUserId,
      source: "create_project_engine",
    });

    // 4. Select active installation standard
    let standardQuery = this.supabase
      .from("installation_standards")
      .select("id")
      .eq("status", "PUBLISHED")
      .eq("is_active", true)
      .limit(1);

    const standardFilter = standardLookup(standardId);
    standardQuery = standardQuery.eq(standardFilter.column, standardFilter.value);

    const { data: standard, error: standardError } = await standardQuery.single();

    if (standardError || !standard) {
      throw new Error("No active published installation standard found.");
    }

    // 5. Fetch workflow stages
    const { data: workflowStages, error: stagesError } = await this.supabase
      .from("workflow_stages")
      .select("id, code, name, order_index, owner_role, sla_hours, is_start")
      .eq("workflow_version_id", workflowVersion.id)
      .eq("is_active", true)
      .order("order_index", { ascending: true });

    if (stagesError || !workflowStages?.length) {
      throw stagesError || new Error("Workflow version has no active stages.");
    }

    const firstStage = workflowStages.find((stage) => stage.is_start) || workflowStages[0];

    // 6. Create Project
    const { data: project, error: projectError } = await this.supabase
      .from("projects")
      .insert({
        customer_code: customerCode,
        customer_name: customerName,
        customer_phone: customerPhone || null,
        customer_intake: customerIntake,
        customer_id: customerRefs.customerId,
        customer_site_id: customerRefs.customerSiteId,
        project_type: lockedProjectTypeValue,
        payment_type: lockedPaymentTypeValue,
        finance_state: initialFinanceState(lockedPaymentTypeValue),
        payment_path_history: [{
          payment_type: lockedPaymentTypeValue,
          finance_state: initialFinanceState(lockedPaymentTypeValue),
          changed_at: new Date().toISOString(),
          reason: "Project created",
        }],
        workflow_version_id: workflowVersion.id,
        applied_standard_id: standard.id,
        status: "IN_PROGRESS",
        sla_status: "ON_TRACK",
      })
      .select()
      .single();

    if (projectError) throw projectError;

    // 7. Generate runtime project_stages
    const stageRows = workflowStages.map((stage) => {
      const inactiveFinanceReason = inactiveFinanceStageReason(stage.code, lockedPaymentTypeValue);

      return {
        project_id: project.id,
        workflow_stage_id: stage.id,
        order_index: stage.order_index,
        code: stage.code,
        name: stage.name,
        owner_role: stage.owner_role,
        status: inactiveFinanceReason ? "SKIPPED" : stage.id === firstStage.id ? "IN_PROGRESS" : "PENDING",
        sla_status: "ON_TRACK",
        started_at: stage.id === firstStage.id && !inactiveFinanceReason ? new Date().toISOString() : null,
        due_at: stage.id === firstStage.id && !inactiveFinanceReason ? dueAtFromNow(stage.sla_hours) : null,
        metadata: inactiveFinanceReason
          ? {
              skipped_reason: inactiveFinanceReason,
              skipped_source: "INITIAL_FINANCE_PATH",
              payment_type: lockedPaymentTypeValue,
            }
          : {},
      };
    });

    const { data: projectStages, error: projectStagesError } = await this.supabase
      .from("project_stages")
      .insert(stageRows)
      .select("id, workflow_stage_id, order_index");

    if (projectStagesError) throw projectStagesError;

    const projectStageByWorkflowStageId = new Map(
      projectStages.map((stage) => [stage.workflow_stage_id, stage]),
    );
    const currentStage = projectStageByWorkflowStageId.get(firstStage.id);

    // Update current_stage_id
    if (currentStage) {
      const { error: updateProjectError } = await this.supabase
        .from("projects")
        .update({ current_stage_id: currentStage.id })
        .eq("id", project.id);

      if (updateProjectError) throw updateProjectError;
    }

    // 8. Generate project_checklists & 9. Generate project_documents
    const workflowStageIds = workflowStages.map((stage) => stage.id);
    const [{ data: checklists, error: checklistsError }, { data: documents, error: documentsError }] =
      await Promise.all([
        this.supabase
          .from("workflow_checklists")
          .select("id, workflow_stage_id, code, label, is_required, gate_severity")
          .in("workflow_stage_id", workflowStageIds),
        this.supabase
          .from("workflow_required_documents")
          .select("id, workflow_stage_id, code, name, is_required, requires_verification, gate_severity, drive_folder_key")
          .in("workflow_stage_id", workflowStageIds),
      ]);

    if (checklistsError) throw checklistsError;
    if (documentsError) throw documentsError;

    if (checklists?.length) {
      const { error: runtimeChecklistError } = await this.supabase
        .from("project_checklists")
        .insert(
          checklists.map((checklist) => {
            const projectStage = projectStageByWorkflowStageId.get(checklist.workflow_stage_id);
            const workflowStage = workflowStages.find((stage) => stage.id === checklist.workflow_stage_id);
            const leadSeed = workflowStage?.code === "LEAD"
              ? leadChecklistSeed(checklist.code, customerIntake, lockedProjectTypeValue, customerCode)
              : null;
            const isPassed = leadSeed?.status === "PASSED";
            const now = new Date().toISOString();

            return {
              project_id: project.id,
              project_stage_id: projectStage?.id,
              workflow_checklist_id: checklist.id,
              code: checklist.code,
              label: checklist.label,
              is_required: checklist.is_required,
              gate_severity: checklist.gate_severity,
              status: leadSeed?.status || "PENDING",
              notes: leadSeed?.notes || null,
              completed_at: isPassed ? now : null,
              completed_by: isPassed ? actorUserId || null : null,
              metadata: leadSeed
                ? {
                    source: "create_project_intake",
                    auto_evaluated_at: now,
                  }
                : {},
            };
          }),
        );

      if (runtimeChecklistError) throw runtimeChecklistError;
    }

    if (documents?.length) {
      const { error: runtimeDocumentError } = await this.supabase
        .from("project_documents")
        .insert(
          documents.map((document) => ({
            project_id: project.id,
            project_stage_id: projectStageByWorkflowStageId.get(document.workflow_stage_id)?.id,
            workflow_required_document_id: document.id,
            code: document.code,
            name: document.name,
            is_required: document.is_required,
            requires_verification: document.requires_verification,
            gate_severity: document.gate_severity,
            status: "REQUIRED",
            metadata: { drive_folder_key: document.drive_folder_key },
          })),
        );

      if (runtimeDocumentError) throw runtimeDocumentError;
    }

    // 10. Prepare Google Drive folder integration layer
    try {
      await this.folderCreator(this.supabase, customerCode, project.id);
    } catch (driveError: any) {
      console.warn("Google Drive Folder Creation Failed: ", driveError.message);
      await Promise.all([
        this.supabase.from("project_exceptions").insert({
          project_id: project.id,
          project_stage_id: currentStage?.id || null,
          category: "SYSTEM",
          severity: "HIGH",
          status: "OPEN",
          title: "Google Drive folder setup failed",
          description: driveError.message || "Drive folder creation failed during project creation.",
          owner_role: "ops",
          metadata: {
            customer_code: customerCode,
            source: "create_project_engine",
          },
        }),
        this.supabase.from("activity_logs").insert({
          project_id: project.id,
          project_stage_id: currentStage?.id || null,
          actor_id: actorUserId || null,
          action: "GOOGLE_DRIVE_FOLDER_SETUP_FAILED",
          reason: driveError.message || "Drive folder creation failed during project creation.",
          metadata: {
            customer_code: customerCode,
          },
        }),
      ]);
    }

    // 11. Create activity log
    await this.supabase.from("activity_logs").insert({
      project_id: project.id,
      project_stage_id: currentStage?.id || null,
      actor_id: actorUserId || null,
      action: "PROJECT_CREATED",
      after_state: {
        workflow_version_id: workflowVersion.id,
        applied_standard_id: standard.id,
        current_stage_id: currentStage?.id || null,
        customer_intake: customerIntake,
      },
    });

    // 12. Notify project/stage owner
    if (currentStage) {
      try {
        await notifyStageOwner(this.supabase, {
          projectId: project.id,
          projectStageId: currentStage.id,
          ownerRole: firstStage.owner_role,
          severity: "INFO",
          title: `New project started: ${customerCode}`,
          message: `${customerName} is ready in ${firstStage.name}.`,
          metadata: {
            event: "PROJECT_CREATED",
            workflow_version_id: workflowVersion.id,
            applied_standard_id: standard.id,
          },
        });
      } catch (notificationError: any) {
        console.warn("Notification creation failed:", notificationError.message);
      }
    }

    return { ...project, current_stage_id: currentStage?.id || null };
  }
}
