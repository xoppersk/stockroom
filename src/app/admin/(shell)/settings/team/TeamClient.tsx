"use client";
/* A-01 Team — people table, pending invites, permission matrix.

   Role selects are dirty-tracked LOCALLY (the Team screen draws no
   unsaved-changes header): a changed role gets the Field unsaved
   treatment on the select plus a "Changed from X · not saved" note,
   and a Discard / Save bar appears at the foot of the People panel.
   The invite form (opened by "Invite someone") adds a pending invite
   row locally; new invites run Oct 6 → Oct 13, the same 7 days as the
   drawn invite (Oct 5 → Oct 12). */

import { useMemo, useState, type FormEvent } from "react";
import { Button } from "@/components/sr/Button";
import { Stamp } from "@/components/sr/Stamp";
import { PermissionMatrix } from "@/components/sr/PermissionMatrix";
import type { TeamInvite, TeamMember } from "../admin-data";

const INVITE_ROLES = ["Fulfillment", "Customer service", "Manager", "Bookkeeper"];

export default function TeamClient({
  members,
  invites: initialInvites,
  permissions,
}: {
  members: TeamMember[];
  invites: TeamInvite[];
  permissions: { roles: string[]; rows: { capability: string; values: string[] }[] };
}) {
  const [savedRoles, setSavedRoles] = useState<Record<string, string>>(() =>
    Object.fromEntries(members.map((m) => [m.id, m.role])),
  );
  const [roles, setRoles] = useState<Record<string, string>>(savedRoles);
  const [invites, setInvites] = useState<TeamInvite[]>(initialInvites);
  const [formOpen, setFormOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("Fulfillment");

  const dirtyIds = useMemo(
    () => members.filter((m) => (roles[m.id] ?? m.role) !== (savedRoles[m.id] ?? m.role)).map((m) => m.id),
    [members, roles, savedRoles],
  );

  const sendInvite = (e: FormEvent) => {
    e.preventDefault();
    const email = inviteEmail.trim();
    if (!email) return;
    setInvites((prev) => [
      ...prev,
      {
        id: `invite-${email}`,
        email,
        role: inviteRole,
        note: "Invited Oct 6 by you · expires Oct 13",
        lastIn: "Not joined",
      },
    ]);
    setInviteEmail("");
    setInviteRole("Fulfillment");
    setFormOpen(false);
  };

  return (
    <div className="adm-settings-main">
      <div className="adm-pagehead">
        <div className="adm-headcol adm-headcol--gap8">
          <h1>Team</h1>
          <span className="adm-sub">
            {members.length} people and {invites.length}{" "}
            {invites.length === 1 ? "invite" : "invites"}. Each role sees only
            what the job needs; money and stock changes are always signed.
          </span>
        </div>
        <Button
          variant="tape"
          aria-expanded={formOpen}
          onClick={() => setFormOpen((open) => !open)}
        >
          Invite someone
        </Button>
      </div>

      {formOpen ? (
        <section className="panel" aria-label="Invite someone">
          <form className="adm-invite-form" onSubmit={sendInvite}>
            <div className="adm-invite-field">
              <label htmlFor="inv-email">Email</label>
              <input
                id="inv-email"
                className="in"
                type="email"
                required
                placeholder="name@sevynlabs.io"
                style={{ width: 260 }}
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
              />
            </div>
            <div className="adm-invite-field">
              <label htmlFor="inv-role">Role</label>
              <select
                id="inv-role"
                className="in"
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value)}
              >
                {INVITE_ROLES.map((role) => (
                  <option key={role}>{role}</option>
                ))}
              </select>
            </div>
            <Button type="submit">Send invite</Button>
            <Button type="button" onClick={() => setFormOpen(false)}>
              Cancel
            </Button>
          </form>
        </section>
      ) : null}

      <section className="panel" aria-labelledby="pp">
        <div className="ph">
          <h2 id="pp">People</h2>
        </div>
        <div className="adm-table-scroll">
          <div role="table" aria-label="People" style={{ minWidth: 620 }}>
            <div role="row" className="mr adm-mr-head">
              <span role="columnheader">Name</span>
              <span role="columnheader">Role</span>
              <span role="columnheader">Last in</span>
              <span role="columnheader"></span>
            </div>
            {members.map((member) => {
              const dirty = dirtyIds.includes(member.id);
              return (
                <div role="row" className="mr" key={member.id}>
                  <span role="cell" className="adm-person">
                    <span
                      aria-hidden="true"
                      className={`adm-avatar adm-avatar--${member.avatarTone}`}
                    >
                      {member.initials}
                    </span>
                    <span className="adm-person-text">
                      <span className="adm-person-name">
                        {member.name}
                        {member.you ? <span className="adm-you"> (you)</span> : null}
                      </span>
                      <span className="adm-person-email">{member.email}</span>
                    </span>
                  </span>
                  <span role="cell">
                    {member.roleOptions ? (
                      <span className="adm-role-cell">
                        <label htmlFor={`role-${member.id}`} className="sr-only">
                          Role for {member.name}
                        </label>
                        <select
                          id={`role-${member.id}`}
                          className={`adm-role-select${dirty ? " adm-input--unsaved" : ""}`}
                          value={roles[member.id] ?? member.role}
                          onChange={(e) =>
                            setRoles((prev) => ({ ...prev, [member.id]: e.target.value }))
                          }
                        >
                          {member.roleOptions.map((role) => (
                            <option key={role}>{role}</option>
                          ))}
                        </select>
                        {dirty ? (
                          <span className="field-note">
                            Changed from {savedRoles[member.id]} · not saved
                          </span>
                        ) : null}
                      </span>
                    ) : (
                      <Stamp tone="ink">{roles[member.id] ?? member.role}</Stamp>
                    )}
                  </span>
                  <span role="cell" className="adm-lastin">
                    {member.lastIn}
                  </span>
                  <span role="cell" className="adm-rowaction">
                    {member.you ? null : (
                      <a href="#" onClick={(e) => e.preventDefault()}>
                        Remove
                      </a>
                    )}
                  </span>
                </div>
              );
            })}
            {invites.map((invite) => (
              <div role="row" className="mr adm-mr-invite" key={invite.id}>
                <span role="cell" className="adm-person">
                  <span aria-hidden="true" className="adm-invite-icon">
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 16 16"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      aria-hidden="true"
                    >
                      <rect x="2" y="3.5" width="12" height="9" rx="1" />
                      <path d="m2.5 4.5 5.5 4 5.5-4" />
                    </svg>
                  </span>
                  <span className="adm-person-text">
                    <span className="adm-person-name adm-person-name--invite">
                      {invite.email}
                    </span>
                    <span className="adm-person-sub">{invite.note}</span>
                  </span>
                </span>
                <span role="cell">
                  <Stamp tone="muted">{invite.role}</Stamp>
                </span>
                <span role="cell" className="adm-lastin">
                  {invite.lastIn}
                </span>
                <span role="cell" className="adm-rowaction">
                  <a href="#" onClick={(e) => e.preventDefault()}>
                    Resend
                  </a>
                </span>
              </div>
            ))}
          </div>
        </div>
        {dirtyIds.length > 0 ? (
          <div className="adm-team-dirtybar">
            <span className="adm-unsaved" role="status">
              <i aria-hidden="true" className="adm-dot" />
              {dirtyIds.length} unsaved {dirtyIds.length === 1 ? "change" : "changes"}
            </span>
            <span className="adm-headactions">
              <Button size="sm" onClick={() => setRoles(savedRoles)}>
                Discard
              </Button>
              <Button
                size="sm"
                variant="tape"
                onClick={() => setSavedRoles(roles)}
              >
                Save changes
              </Button>
            </span>
          </div>
        ) : null}
      </section>

      <section className="panel" aria-labelledby="pr">
        <div className="ph">
          <h2 id="pr">What each role can do</h2>
          <span className="ph-note">Owner can do everything</span>
        </div>
        <div className="adm-table-scroll">
          <PermissionMatrix
            roles={permissions.roles}
            rows={permissions.rows}
            caption="Role permissions"
          />
        </div>
      </section>
    </div>
  );
}
