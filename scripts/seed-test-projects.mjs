import { createClient } from "@supabase/supabase-js";
import { CreateProjectEngine } from "../services/workflow/createProjectEngine.ts";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey);
const noDriveFolderCreator = async () => ({ skipped: true, reason: "testcase_seed_no_drive" });
const engine = new CreateProjectEngine(supabase, noDriveFolderCreator);

const districts = [
  ["เมืองนครพนม", "นครพนม", "48000"],
  ["เมืองขอนแก่น", "ขอนแก่น", "40000"],
  ["ศรีราชา", "ชลบุรี", "20110"],
  ["บางพลี", "สมุทรปราการ", "10540"],
  ["เมืองเชียงใหม่", "เชียงใหม่", "50000"],
  ["หาดใหญ่", "สงขลา", "90110"],
  ["เมืองอุดรธานี", "อุดรธานี", "41000"],
  ["ปากเกร็ด", "นนทบุรี", "11120"],
  ["เมืองระยอง", "ระยอง", "21000"],
  ["เมืองนครราชสีมา", "นครราชสีมา", "30000"],
];

const scenarioPlan = [
  ["LEAD", "IN_PROGRESS", "ON_TRACK", "CASH"],
  ["LEAD", "BLOCKED", "ON_TRACK", "LOAN"],
  ["SURVEY", "IN_PROGRESS", "NEAR_SLA", "CASH"],
  ["SURVEY", "BLOCKED", "OVER_SLA", "LOAN"],
  ["TSSR", "IN_PROGRESS", "ON_TRACK", "CASH"],
  ["TSSR", "IN_PROGRESS", "OVER_SLA", "LOAN"],
  ["QUOTATION", "IN_PROGRESS", "ON_TRACK", "CASH"],
  ["QUOTATION", "BLOCKED", "NEAR_SLA", "LOAN"],
  ["PAYMENT", "IN_PROGRESS", "ON_TRACK", "CASH"],
  ["PAYMENT", "BLOCKED", "OVER_SLA", "CASH"],
  ["LOAN_DOCUMENT_COLLECTION", "IN_PROGRESS", "ON_TRACK", "LOAN"],
  ["LOAN_DOCUMENT_COLLECTION", "BLOCKED", "NEAR_SLA", "LOAN"],
  ["LOAN_SUBMISSION", "IN_PROGRESS", "ON_TRACK", "LOAN"],
  ["LOAN_SUBMISSION", "IN_PROGRESS", "OVER_SLA", "LOAN"],
  ["LOAN_REVIEW", "IN_PROGRESS", "NEAR_SLA", "LOAN"],
  ["LOAN_REVIEW", "BLOCKED", "OVER_SLA", "LOAN"],
  ["LOAN_APPROVAL", "IN_PROGRESS", "ON_TRACK", "LOAN"],
  ["DOWN_PAYMENT", "IN_PROGRESS", "NEAR_SLA", "LOAN"],
  ["READY_FOR_INSTALL", "IN_PROGRESS", "ON_TRACK", "CASH"],
  ["READY_FOR_INSTALL", "BLOCKED", "OVER_SLA", "LOAN"],
  ["SCHEDULING", "IN_PROGRESS", "ON_TRACK", "CASH"],
  ["SCHEDULING", "BLOCKED", "NEAR_SLA", "LOAN"],
  ["INSTALLATION", "IN_PROGRESS", "ON_TRACK", "CASH"],
  ["INSTALLATION", "IN_PROGRESS", "OVER_SLA", "LOAN"],
  ["QA", "IN_PROGRESS", "ON_TRACK", "CASH"],
  ["QA", "BLOCKED", "OVER_SLA", "LOAN"],
  ["HANDOVER", "IN_PROGRESS", "ON_TRACK", "CASH"],
  ["HANDOVER", "IN_PROGRESS", "NEAR_SLA", "LOAN"],
  ["ตัด_MAT", "IN_PROGRESS", "ON_TRACK", "CASH"],
  ["ตัด_MAT", "BLOCKED", "NEAR_SLA", "LOAN"],
  ["MAT_CUT", "IN_PROGRESS", "ON_TRACK", "CASH"],
  ["MAT_CUT", "BLOCKED", "OVER_SLA", "LOAN"],
  ["BILLING", "IN_PROGRESS", "ON_TRACK", "CASH"],
  ["BILLING", "BLOCKED", "OVER_SLA", "LOAN"],
  ["CLOSURE", "IN_PROGRESS", "ON_TRACK", "CASH"],
  ["CLOSURE", "COMPLETED", "ON_TRACK", "LOAN"],
];

while (scenarioPlan.length < 50) {
  const base = scenarioPlan[scenarioPlan.length % 36];
  scenarioPlan.push([...base]);
}

function addHours(date, hours) {
  return new Date(date.getTime() + hours * 60 * 60 * 1000).toISOString();
}

function stageTiming(status, slaStatus, index) {
  const now = new Date();
  const started = new Date(now.getTime() - (index + 2) * 3 * 60 * 60 * 1000);
  if (status === "COMPLETED") {
    return {
      started_at: addHours(started, -24),
      completed_at: addHours(started, -2),
      due_at: addHours(started, 24),
    };
  }
  if (slaStatus === "OVER_SLA") {
    return { started_at: started.toISOString(), completed_at: null, due_at: addHours(now, -8 - index) };
  }
  if (slaStatus === "NEAR_SLA") {
    return { started_at: started.toISOString(), completed_at: null, due_at: addHours(now, 3 + (index % 4)) };
  }
  return { started_at: started.toISOString(), completed_at: null, due_at: addHours(now, 24 + (index % 5) * 6) };
}

function intakeFor(index, paymentType) {
  const [district, province, postalCode] = districts[index % districts.length];
  return {
    contactName: `ผู้ติดต่อ Test ${String(index + 1).padStart(2, "0")}`,
    contactVerified: index % 4 !== 0,
    siteAddress: `${100 + index}/${(index % 50) + 1} หมู่ ${(index % 9) + 1}`,
    postalCode,
    siteSubdistrict: "ในเมือง",
    siteDistrict: district,
    siteProvince: province,
    googleMapsUrl: `https://maps.example.test/${index + 1}`,
    interestedSystemSizeKw: `${5 + (index % 8)} kW`,
    monthlyElectricBill: `${3500 + index * 250}`,
    initialRequirement: paymentType === "LOAN" ? "ทดสอบ flow สินเชื่อ" : "ทดสอบ flow เงินสด",
    projectScope: "RES-S",
  };
}

async function getProjectByCode(customerCode) {
  const { data, error } = await supabase
    .from("projects")
    .select("id, customer_code")
    .eq("customer_code", customerCode)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function setScenario(projectId, targetCode, targetStatus, targetSlaStatus, index) {
  const { data: stages, error } = await supabase
    .from("project_stages")
    .select("id, code, order_index, status, sla_status")
    .eq("project_id", projectId)
    .order("order_index", { ascending: true });
  if (error) throw error;

  const targetStage =
    stages.find((stage) => stage.code === targetCode) ||
    stages.find((stage) => targetCode === "MAT_CUT" && stage.code === "ตัด_MAT") ||
    stages.find((stage) => targetCode === "ตัด_MAT" && stage.code === "MAT_CUT") ||
    stages[0];

  const targetOrder = targetStage.order_index;
  for (const stage of stages) {
    let next = {
      status: "PENDING",
      sla_status: "ON_TRACK",
      started_at: null,
      completed_at: null,
      due_at: null,
      metadata: {},
    };

    if (stage.status === "SKIPPED") {
      continue;
    }

    if (stage.order_index < targetOrder) {
      const timing = stageTiming("COMPLETED", "ON_TRACK", index);
      next = { ...next, status: "COMPLETED", ...timing };
    } else if (stage.id === targetStage.id) {
      const timing = stageTiming(targetStatus, targetSlaStatus, index);
      next = {
        ...next,
        status: targetStatus,
        sla_status: targetSlaStatus,
        ...timing,
        metadata: {
          testcase: true,
          scenario_index: index + 1,
          scenario_target: targetCode,
        },
      };
    }

    const { error: updateError } = await supabase.from("project_stages").update(next).eq("id", stage.id);
    if (updateError) throw updateError;
  }

  const projectStatus = targetStatus === "COMPLETED" && targetCode === "CLOSURE" ? "COMPLETED" : "IN_PROGRESS";
  const { error: projectError } = await supabase
    .from("projects")
    .update({
      current_stage_id: targetStage.id,
      status: projectStatus,
      sla_status: targetSlaStatus,
    })
    .eq("id", projectId);
  if (projectError) throw projectError;

  if (targetStatus === "BLOCKED" || targetSlaStatus === "OVER_SLA") {
    await supabase.from("project_exceptions").insert({
      project_id: projectId,
      project_stage_id: targetStage.id,
      category: targetSlaStatus === "OVER_SLA" ? "SLA" : "WORKFLOW",
      severity: targetSlaStatus === "OVER_SLA" ? "HIGH" : "WARNING",
      status: "OPEN",
      title: targetSlaStatus === "OVER_SLA" ? "Testcase SLA overdue" : "Testcase gate blocked",
      description: `Auto-generated testcase for ${targetCode}`,
      owner_role: "ops",
      metadata: { testcase: true, scenario_index: index + 1 },
    });
  }

  await supabase.from("activity_logs").insert({
    project_id: projectId,
    project_stage_id: targetStage.id,
    action: "TESTCASE_SCENARIO_APPLIED",
    reason: `Seeded testcase scenario ${index + 1}`,
    metadata: { testcase: true, targetCode, targetStatus, targetSlaStatus },
  });
}

let created = 0;
let skipped = 0;
let failed = 0;

for (let index = 0; index < 50; index += 1) {
  const [targetCode, targetStatus, targetSlaStatus, paymentType] = scenarioPlan[index];
  const customerCode = `TC-${String(index + 1).padStart(3, "0")}`;
  const customerName = `Testcase ${String(index + 1).padStart(2, "0")} ${paymentType} ${targetCode}`;
  const customerPhone = `09988${String(index + 1).padStart(5, "0")}`;

  try {
    const existing = await getProjectByCode(customerCode);
    if (existing) {
      skipped += 1;
      console.log(`skip ${customerCode}: already exists`);
      continue;
    }

    const project = await engine.execute({
      customerCode,
      customerName,
      customerPhone,
      customerIntake: intakeFor(index, paymentType),
      projectType: "RES-S",
      paymentType,
      actorUserId: null,
    });

    await setScenario(project.id, targetCode, targetStatus, targetSlaStatus, index);
    created += 1;
    console.log(`created ${customerCode}: ${targetCode} ${targetStatus} ${targetSlaStatus} ${paymentType}`);
  } catch (error) {
    failed += 1;
    console.error(`failed ${customerCode}:`, error?.message || error);
  }
}

console.log(JSON.stringify({ created, skipped, failed }, null, 2));
if (failed > 0) process.exit(1);
