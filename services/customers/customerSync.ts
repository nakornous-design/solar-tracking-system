type SupabaseClientLike = {
  from: (table: string) => any;
};

type SyncCustomerInput = {
  customerCode: string;
  customerName: string;
  customerPhone?: string | null;
  customerIntake?: any;
  actorUserId?: string | null;
  source?: string;
};

function cleanString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeSite(intake: any) {
  return {
    address: cleanString(intake?.siteAddress),
    postalCode: cleanString(intake?.postalCode),
    subdistrict: cleanString(intake?.siteSubdistrict),
    district: cleanString(intake?.siteDistrict),
    province: cleanString(intake?.siteProvince),
    googleMapsUrl: cleanString(intake?.googleMapsUrl),
  };
}

export async function syncCustomerMaster(
  supabase: SupabaseClientLike,
  input: SyncCustomerInput,
) {
  const customerCode = cleanString(input.customerCode);
  const customerName = cleanString(input.customerName);
  const customerPhone = cleanString(input.customerPhone);
  const intake = input.customerIntake || {};
  const now = new Date().toISOString();

  if (!customerCode || !customerName) {
    throw new Error("customerCode and customerName are required to sync customer master.");
  }

  const { data: existingCustomer, error: customerLookupError } = await supabase
    .from("customers")
    .select("id, metadata")
    .eq("customer_code", customerCode)
    .maybeSingle();

  if (customerLookupError) throw customerLookupError;

  let customer = existingCustomer;
  const customerPayload = {
    customer_code: customerCode,
    name: customerName,
    phone: customerPhone || null,
    contact_name: cleanString(intake.contactName) || null,
    contact_verified: Boolean(intake.contactVerified),
    metadata: {
      ...(existingCustomer?.metadata || {}),
      source: input.source || "customer_sync",
      updated_by: input.actorUserId || null,
    },
    updated_at: now,
  };

  if (existingCustomer?.id) {
    const { data, error } = await supabase
      .from("customers")
      .update(customerPayload)
      .eq("id", existingCustomer.id)
      .select("id")
      .single();
    if (error) throw error;
    customer = { ...existingCustomer, ...data };
  } else {
    const { data, error } = await supabase
      .from("customers")
      .insert({
        ...customerPayload,
        created_at: now,
      })
      .select("id")
      .single();
    if (error) throw error;
    customer = data;
  }

  const site = normalizeSite(intake);
  let customerSite: any = null;
  const hasSiteData = Boolean(site.address || site.postalCode || site.subdistrict || site.district || site.province || site.googleMapsUrl);

  if (hasSiteData) {
    const { data: existingSites, error: siteLookupError } = await supabase
      .from("customer_sites")
      .select("id, address, postal_code, subdistrict, district, province, metadata")
      .eq("customer_id", customer.id);

    if (siteLookupError) throw siteLookupError;
    const existingSite = (existingSites || []).find((item: any) =>
      cleanString(item.address) === site.address
      && cleanString(item.postal_code) === site.postalCode
      && cleanString(item.subdistrict) === site.subdistrict
      && cleanString(item.district) === site.district
      && cleanString(item.province) === site.province,
    );

    const sitePayload = {
      customer_id: customer.id,
      label: "Main installation site",
      address: site.address || null,
      postal_code: site.postalCode || null,
      subdistrict: site.subdistrict || null,
      district: site.district || null,
      province: site.province || null,
      google_maps_url: site.googleMapsUrl || null,
      metadata: {
        ...(existingSite?.metadata || {}),
        source: input.source || "customer_sync",
        updated_by: input.actorUserId || null,
      },
      updated_at: now,
    };

    if (existingSite?.id) {
      const { data, error } = await supabase
        .from("customer_sites")
        .update(sitePayload)
        .eq("id", existingSite.id)
        .select("id")
        .single();
      if (error) throw error;
      customerSite = { ...existingSite, ...data };
    } else {
      const { data, error } = await supabase
        .from("customer_sites")
        .insert({
          ...sitePayload,
          created_at: now,
        })
        .select("id")
        .single();
      if (error) throw error;
      customerSite = data;
    }
  }

  return {
    customerId: customer.id,
    customerSiteId: customerSite?.id || null,
  };
}
