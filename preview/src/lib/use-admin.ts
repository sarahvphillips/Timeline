import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ADMIN_EVENT,
  canUseFeature,
  isBlocked,
  isOwnerEmail,
  isStaff,
  loadAdmin,
  roleOf,
  saveAdmin,
  type AdminState,
  type FeatureKey,
  type Role,
} from "./admin";

export function useAdmin() {
  const [state, setState] = useState<AdminState>(loadAdmin);

  useEffect(() => {
    const refresh = () => setState(loadAdmin());
    refresh();
    window.addEventListener(ADMIN_EVENT, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(ADMIN_EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  const commit = useCallback((next: AdminState) => {
    saveAdmin(next);
    setState(next);
  }, []);

  const role: Role = useMemo(() => roleOf(state.signedInEmail, state), [state]);
  const owner = isOwnerEmail(state.signedInEmail);
  const staff = isStaff(role);
  const blocked = isBlocked(state.signedInEmail, state);

  const can = useCallback((key: FeatureKey) => canUseFeature(key, state), [state]);

  return { state, commit, role, owner, staff, blocked, can };
}
