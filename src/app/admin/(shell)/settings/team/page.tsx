import { getConsoleActor, listConsoleTeam } from "@/lib/shop/admin";
import { buildTeamView, REAL_PERMISSION_MATRIX } from "../admin-data";
import TeamClient from "./TeamClient";

/* A-01 · /admin/settings/team — people, pending invites and the
   permission matrix (Team.html). Members are the real profiles +
   user_roles rows (listConsoleTeam); the matrix is derived from the
   DB capability rules (admin-data). There is no invites table — the
   invite panel renders empty with its honest disabled state
   (ruling 12). */
export default async function TeamPage() {
  const [members, actor] = await Promise.all([
    listConsoleTeam(),
    getConsoleActor(),
  ]);
  return (
    <TeamClient
      members={buildTeamView(members)}
      invites={[]}
      permissions={REAL_PERMISSION_MATRIX}
      actorIsAdmin={actor.role === "admin"}
    />
  );
}
