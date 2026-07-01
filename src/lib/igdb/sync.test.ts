import { CompanyRole } from "@prisma/client";
import { describe, expect, it } from "vitest";
import type { IgdbGame } from "@/lib/igdb/client";
import { rolesForInvolvedCompany } from "@/lib/igdb/sync";

type Involved = NonNullable<IgdbGame["involved_companies"]>[number];

function buildCompanyRows(
  involvedCompanies: Involved[],
  companyId: string,
  gameId = "game-1",
) {
  const companySeen = new Set<string>();
  const rows: Array<{ gameId: string; companyId: string; role: CompanyRole }> = [];
  for (const involved of involvedCompanies) {
    for (const role of rolesForInvolvedCompany(involved)) {
      const key = `${companyId}:${role}`;
      if (companySeen.has(key)) continue;
      companySeen.add(key);
      rows.push({ gameId, companyId, role });
    }
  }
  return rows;
}

describe("game company relation deduplication", () => {
  it("dedupes duplicate involved company entries with the same role", () => {
    const involved: Involved[] = [
      { company: 1, developer: true },
      { company: 1, developer: true },
    ];

    const rows = buildCompanyRows(involved, "company-1");
    expect(rows).toEqual([{ gameId: "game-1", companyId: "company-1", role: CompanyRole.DEVELOPER }]);
  });

  it("creates multiple roles when one entry has several flags", () => {
    const involved: Involved[] = [{ company: 1, developer: true, publisher: true }];

    const rows = buildCompanyRows(involved, "company-1");
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.role).sort()).toEqual([
      CompanyRole.DEVELOPER,
      CompanyRole.PUBLISHER,
    ]);
  });
});
