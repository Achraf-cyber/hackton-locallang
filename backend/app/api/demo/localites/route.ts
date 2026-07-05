/**
 * Backend MOCK (voir app/api/demo/parameters/route.ts) : arbre region ->
 * province -> commune -> arrondissement, fictif et statique. Query params
 * optionnels pour filtrer le niveau demande, comme le ferait un vrai
 * endpoint paginated/filtre (mais tout est servi depuis lib/demo/data.ts,
 * aucun appel externe).
 */
import { NextRequest } from "next/server";
import {
  arrondissementOptions,
  communeOptions,
  provinceOptions,
  regionOptions,
} from "@/lib/demo/data";

export async function GET(request: NextRequest) {
  await new Promise((resolve) => setTimeout(resolve, 150));

  const { searchParams } = new URL(request.url);
  const region = searchParams.get("region");
  const province = searchParams.get("province");
  const commune = searchParams.get("commune");

  if (region && province && commune) {
    return Response.json({ arrondissements: arrondissementOptions(region, province, commune) });
  }
  if (region && province) {
    return Response.json({ communes: communeOptions(region, province) });
  }
  if (region) {
    return Response.json({ provinces: provinceOptions(region) });
  }
  return Response.json({ regions: regionOptions() });
}
