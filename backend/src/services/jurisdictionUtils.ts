const jurisdictionAliases: Record<string, string> = {
  ALABAMA: "US-AL",
  ALASKA: "US-AK",
  ARIZONA: "US-AZ",
  ARKANSAS: "US-AR",
  CALIFORNIA: "US-CA",
  COLORADO: "US-CO",
  CONNECTICUT: "US-CT",
  DELAWARE: "US-DE",
  "DISTRICT OF COLUMBIA": "US-DC",
  FLORIDA: "US-FL",
  GEORGIA: "US-GA",
  HAWAII: "US-HI",
  IDAHO: "US-ID",
  ILLINOIS: "US-IL",
  INDIANA: "US-IN",
  IOWA: "US-IA",
  KANSAS: "US-KS",
  KENTUCKY: "US-KY",
  LOUISIANA: "US-LA",
  MAINE: "US-ME",
  MARYLAND: "US-MD",
  MASSACHUSETTS: "US-MA",
  MICHIGAN: "US-MI",
  MINNESOTA: "US-MN",
  MISSISSIPPI: "US-MS",
  MISSOURI: "US-MO",
  MONTANA: "US-MT",
  NEBRASKA: "US-NE",
  NEVADA: "US-NV",
  "NEW HAMPSHIRE": "US-NH",
  "NEW JERSEY": "US-NJ",
  "NEW MEXICO": "US-NM",
  "NEW YORK": "US-NY",
  "NORTH CAROLINA": "US-NC",
  "NORTH DAKOTA": "US-ND",
  OHIO: "US-OH",
  OKLAHOMA: "US-OK",
  OREGON: "US-OR",
  PENNSYLVANIA: "US-PA",
  "PUERTO RICO": "US-PR",
  "RHODE ISLAND": "US-RI",
  "SOUTH CAROLINA": "US-SC",
  "SOUTH DAKOTA": "US-SD",
  TENNESSEE: "US-TN",
  TEXAS: "US-TX",
  UTAH: "US-UT",
  VERMONT: "US-VT",
  VIRGINIA: "US-VA",
  WASHINGTON: "US-WA",
  "WEST VIRGINIA": "US-WV",
  WISCONSIN: "US-WI",
  WYOMING: "US-WY",
};

const jurisdictionLabels: Record<string, string> = Object.fromEntries(
  Object.entries(jurisdictionAliases).map(([label, code]) => [code, label]),
);

export const getJurisdictionLabel = (jurisdiction: string) => {
  return jurisdictionLabels[jurisdiction] ?? jurisdiction;
};

export const normalizeJurisdiction = (input: string) => {
  const trimmed = input.trim();
  if (!trimmed) {
    return trimmed;
  }

  const upper = trimmed.toUpperCase();
  if (upper.startsWith("US-")) {
    return upper;
  }

  if (upper.length === 2) {
    return `US-${upper}`;
  }

  return jurisdictionAliases[upper] ?? upper;
};