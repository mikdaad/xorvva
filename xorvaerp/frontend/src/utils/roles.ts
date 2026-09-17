/**
 * Role utilities — mirrors backend SystemRole enum and RBAC rules.
 * Lower level = higher privilege. A user can only create users with a
 * role level strictly GREATER than their own (enforced server-side too).
 */

export const ROLE_LEVELS: Record<string, number> = {
  SystemAdmin: 0,
  SuperAdmin: 1,
  CompanyAdmin: 2,
  Manager: 3,
  Employee: 4,
};

export const ROLE_LABELS: Record<string, string> = {
  SystemAdmin: 'System Admin',
  SuperAdmin: 'Super Admin (CEO)',
  CompanyAdmin: 'Company Admin (GM)',
  Manager: 'Manager',
  Employee: 'Employee',
};

export const ROLE_COLORS: Record<string, string> = {
  SystemAdmin: 'bg-primary/15 text-glow',
  SuperAdmin: 'bg-glow/15 text-glow',
  CompanyAdmin: 'bg-success/15 text-success',
  Manager: 'bg-warning/15 text-warning',
  Employee: 'bg-frost-dim/15 text-frost-dim',
};

export function roleLevel(role: string): number {
  return ROLE_LEVELS[role] ?? ROLE_LEVELS.Employee;
}

/** CompanyAdmin (2) and above can create users — mirrors [RequireRole(CompanyAdmin)]. */
export function canCreateUsers(role: string): boolean {
  return roleLevel(role) <= ROLE_LEVELS.CompanyAdmin;
}

/** Roles the current user is allowed to assign (strictly lower privilege than their own). */
export function creatableRoles(role: string): { value: number; label: string }[] {
  const myLevel = roleLevel(role);
  return Object.entries(ROLE_LEVELS)
    .filter(([, level]) => level > myLevel)
    .map(([name, level]) => ({ value: level, label: ROLE_LABELS[name] }));
}
