import type { Express, NextFunction, Request, Response } from "express";
import { AccountRole } from "@aegis/shared/account/AccountRole";
import { hasAccountCapability } from "@aegis/shared/account/hasAccountCapability";
import { isAccountRole } from "@aegis/shared/account/isAccountRole";
import type { AuthSession } from "#api/accounts/AccountStore";
import type { AccountRoleStore } from "#api/accounts/roles/AccountRoleStore";
import { isUuid } from "#api/community/CommunityDeckStore";

type AccountRoleRouteDeps = {
  app: Express;
  store: AccountRoleStore;
  session: (req: Request) => Promise<AuthSession | undefined>;
};

type Handler = (req: Request, res: Response, auth: AuthSession) => Promise<void>;

const SEARCH_MAX_LENGTH = 32;

export function installAccountRoleRoutes({ app, store, session }: AccountRoleRouteDeps): void {
  const adminRoute =
    (handler: Handler) =>
    (req: Request, res: Response, next: NextFunction): void => {
      res.set("Cache-Control", "no-store");
      void (async () => {
        const auth = await session(req);
        if (!auth) {
          res.status(401).json({ error: "authentication_required" });
          return;
        }
        if (!hasAccountCapability({ roles: auth.account.roles, capability: "canAdminister" })) {
          res.status(403).json({ error: "admin_required" });
          return;
        }
        await handler(req, res, auth);
      })().catch(next);
    };

  app.get(
    "/account/admin/roles",
    adminRoute(async (req, res) => {
      const query = typeof req.query.query === "string" ? req.query.query : "";
      if (query.length > SEARCH_MAX_LENGTH) {
        res.status(400).json({ error: "invalid_role_search" });
        return;
      }
      res.json({ accounts: await store.findRoleHolders(query) });
    }),
  );

  app.put(
    "/account/admin/roles/:accountId",
    adminRoute(async (req, res, auth) => {
      const accountId = String(req.params.accountId);
      const roles: unknown = req.body?.roles;
      if (!isUuid(accountId) || !Array.isArray(roles) || !roles.every(isAccountRole)) {
        res.status(400).json({ error: "invalid_roles" });
        return;
      }
      if (accountId === auth.account.id && !roles.includes(AccountRole.ADMIN.value)) {
        res.status(409).json({ error: "cannot_remove_own_admin" });
        return;
      }
      const updated = await store.setRoles({ accountId, roles });
      if (!updated) {
        res.status(404).json({ error: "account_not_found" });
        return;
      }
      res.json({ account: updated });
    }),
  );
}
