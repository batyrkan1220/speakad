/**
 * Which actors a visitor sees first, by the visitor's country (from the IP).
 * A Kazakh visitor gets Central Asian faces first, an American one a US-like mix, and so on.
 * Nobody is hidden: everything else follows, and filters still work on the whole library.
 */

export type Market = "global" | "central-asia";

export const ETHNICITIES = [
  "White", "Hispanic", "Black", "East Asian", "South Asian", "Southeast Asian", "Middle Eastern", "Central Asian", "mixed-race",
] as const;

/** Share of each look per region (higher = shown earlier). */
const REGION: Record<string, Record<string, number>> = {
  centralAsia: { "Central Asian": 10, "East Asian": 5, White: 4, "mixed-race": 3, "Middle Eastern": 2 },
  cis: { White: 10, "Central Asian": 5, "mixed-race": 3, "Middle Eastern": 2, "East Asian": 1 },
  eastAsia: { "East Asian": 10, "Southeast Asian": 4, "mixed-race": 2, White: 2 },
  southeastAsia: { "Southeast Asian": 10, "East Asian": 5, "South Asian": 2, "mixed-race": 2, White: 1 },
  southAsia: { "South Asian": 10, "Middle Eastern": 3, "Southeast Asian": 2, White: 1 },
  mena: { "Middle Eastern": 10, "South Asian": 3, White: 3, "mixed-race": 2, Black: 1 },
  turkey: { "Middle Eastern": 8, White: 8, "Central Asian": 3, "mixed-race": 2 },
  africa: { Black: 10, "mixed-race": 3, "Middle Eastern": 1, White: 1 },
  latam: { Hispanic: 10, "mixed-race": 5, White: 3, Black: 2 },
  europe: { White: 10, "mixed-race": 3, Black: 2, "Middle Eastern": 2, "South Asian": 1, Hispanic: 1 },
  usUk: { White: 7, Hispanic: 4, Black: 4, "East Asian": 3, "South Asian": 3, "mixed-race": 3, "Southeast Asian": 2, "Middle Eastern": 2 },
};

const COUNTRY_REGION: Record<string, keyof typeof REGION> = {};
const put = (r: keyof typeof REGION, cs: string) => cs.split(" ").forEach((c) => (COUNTRY_REGION[c] = r));
put("centralAsia", "KZ KG UZ TJ TM MN");
put("cis", "RU BY UA MD AM GE AZ");
put("eastAsia", "CN JP KR TW HK MO");
put("southeastAsia", "VN TH ID MY PH SG KH LA MM BN");
put("southAsia", "IN PK BD LK NP");
put("mena", "AE SA QA KW BH OM EG MA DZ TN JO LB IQ IR IL PS SY YE LY");
put("turkey", "TR CY");
put("africa", "NG KE GH ZA ET TZ UG SN CI CM");
put("latam", "MX BR AR CO CL PE VE EC GT CU DO BO HN PY SV NI CR PA UY PR");
put("europe", "DE FR IT ES PT NL BE AT CH PL CZ SK HU RO BG GR SE NO DK FI IE IS EE LV LT SI HR RS BA ME MK AL LU MT");
put("usUk", "US GB CA AU NZ");

export function regionOf(country?: string | null) {
  return (country && COUNTRY_REGION[country.toUpperCase()]) || "usUk";
}

/** Relevance of an actor's look for this country's audience (0 = not a typical local face). */
export function audienceScore(ethnicity: string | undefined, country?: string | null) {
  if (!ethnicity) return 0.5; // older actors without passport data stay in the middle
  return REGION[regionOf(country)][ethnicity] || 0;
}

/** Stable sort: most local-looking actors first, original order kept within the same score. */
export function sortForAudience<T extends { ethnicity?: string }>(list: T[], country?: string | null) {
  return list
    .map((a, i) => ({ a, i, s: audienceScore(a.ethnicity, country) }))
    .sort((x, y) => y.s - x.s || x.i - y.i)
    .map((x) => x.a);
}
