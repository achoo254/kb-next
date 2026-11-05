import { type ReactNode, createContext, useContext } from 'react';

/** Who is in the admin station: an admin (every screen) or a reviewer (the review queue only, A01). */
export type StaffRole = 'admin' | 'reviewer';

const StaffRoleContext = createContext<StaffRole>('admin');

/** Set by the admin station's gate (pages/admin-gate.tsx) once /api/me answered. */
export function StaffRoleProvider({ value, children }: { value: StaffRole; children?: ReactNode }): ReactNode {
  return <StaffRoleContext value={value}>{children}</StaffRoleContext>;
}

export function useStaffRole(): StaffRole {
  return useContext(StaffRoleContext);
}
