export interface UserDto {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  roleId: string;
  /** Mapped from tenant_memberships.status - "disabled" means suspended at THIS tenant, not a global account state (see users' own notes on why status lives on the membership, not the person). */
  status: "active" | "disabled";
  /** True when this row is the signed-in actor themself - lets the frontend show "You" and block self-disable without a separate /me call. */
  isSelf: boolean;
}

interface MembershipRow {
  id: string;
  role_id: string;
  status: string;
  user_id: string | null;
  users: {
    id: string;
    email: string;
    phone: string | null;
    first_name: string;
    last_name: string | null;
  } | null;
}

export function toUserDto(row: MembershipRow, actorUserId: string): UserDto {
  const user = row.users;
  if (!user) {
    throw new Error("Expected an active membership to have a user attached");
  }
  return {
    id: user.id,
    name: [user.first_name, user.last_name].filter(Boolean).join(" "),
    email: user.email,
    phone: user.phone,
    roleId: row.role_id,
    status: row.status === "active" ? "active" : "disabled",
    isSelf: user.id === actorUserId,
  };
}

export const MEMBERSHIP_SELECT = {
  id: true,
  role_id: true,
  status: true,
  user_id: true,
  users: { select: { id: true, email: true, phone: true, first_name: true, last_name: true } },
} as const;
