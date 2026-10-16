import { getPermissionMatrix, getTeam } from "@/lib/api";
import { normalizePermissions, normalizeTeam } from "../admin-data";
import TeamClient from "./TeamClient";

/* A-01 · /admin/settings/team — people, pending invites and the
   permission matrix (Team.html). Data: @/lib/api getTeam() +
   getPermissionMatrix(). */
export default async function TeamPage() {
  let teamRaw: unknown = null;
  let permRaw: unknown = null;
  try {
    teamRaw = await getTeam();
  } catch {
    teamRaw = null;
  }
  try {
    permRaw = await getPermissionMatrix();
  } catch {
    permRaw = null;
  }
  const team = normalizeTeam(teamRaw);
  const permissions = normalizePermissions(permRaw);
  return (
    <TeamClient
      members={team.members}
      invites={team.invites}
      permissions={permissions}
    />
  );
}
