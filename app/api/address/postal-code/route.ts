import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

function normalizePostalCode(value: string | null) {
  return (value || "").replace(/\D/g, "").slice(0, 5);
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const postalCode = normalizePostalCode(searchParams.get("code"));

  if (!/^\d{5}$/.test(postalCode)) {
    return NextResponse.json({ areas: [] });
  }

  const { data, error } = await supabaseAdmin
    .from("thai_postal_areas")
    .select(
      "postal_code, province_th, district_th, subdistrict_th, province_en, district_en, subdistrict_en, province_code, district_code, subdistrict_code",
    )
    .eq("postal_code", postalCode)
    .order("province_th", { ascending: true })
    .order("district_th", { ascending: true })
    .order("subdistrict_th", { ascending: true });

  if (error) {
    return NextResponse.json({ error: `Postal lookup failed: ${error.message}` }, { status: 500 });
  }

  return NextResponse.json({
    areas: (data || []).map((area) => ({
      postalCode: area.postal_code,
      province: area.province_th,
      district: area.district_th,
      subdistrict: area.subdistrict_th,
      provinceEn: area.province_en,
      districtEn: area.district_en,
      subdistrictEn: area.subdistrict_en,
      provinceCode: area.province_code,
      districtCode: area.district_code,
      subdistrictCode: area.subdistrict_code,
    })),
  });
}
