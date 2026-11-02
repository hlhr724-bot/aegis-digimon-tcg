import { useEffect, useId, useState } from "react";
import { AccountRole } from "@aegis/shared/account/AccountRole";
import type { RoleHolder } from "@aegis/shared/account/RoleHolder";
import { AccountApiError, request } from "@/account/client";
import { Alert, Field } from "@/design/primitives";
import { useTranslation } from "@/i18n/useTranslation";
import "@/account/roles/accountRoles.css";

const ROLES_PATH = "/account/admin/roles";
const SEARCH_DEBOUNCE_MS = 300;
const SEARCH_MAX_LENGTH = 32;

type ToggleRoleParams = { holder: RoleHolder; role: AccountRole; granted: boolean };

export function AccountRolesPanel() {
  const { t } = useTranslation();
  const formId = useId();
  const [query, setQuery] = useState("");
  const [holders, setHolders] = useState<RoleHolder[]>();
  const [loadFailed, setLoadFailed] = useState(false);
  const [saveError, setSaveError] = useState<string>();
  const [savingId, setSavingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      void request<{ accounts: RoleHolder[] }>(`${ROLES_PATH}?query=${encodeURIComponent(query.trim())}`)
        .then((loaded) => {
          if (!cancelled) {
            setHolders(loaded.accounts);
            setLoadFailed(false);
          }
        })
        .catch(() => {
          if (!cancelled) {
            setLoadFailed(true);
          }
        });
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  async function toggleRole({ holder, role, granted }: ToggleRoleParams) {
    const roles = granted ? [...holder.roles, role] : holder.roles.filter((current) => current !== role);
    setSavingId(holder.id);
    setSaveError(undefined);
    try {
      const { account } = await request<{ account: RoleHolder }>(`${ROLES_PATH}/${holder.id}`, {
        method: "PUT",
        body: JSON.stringify({ roles }),
      });
      setHolders((current) => current?.map((entry) => (entry.id === account.id ? account : entry)));
    } catch (failure) {
      setSaveError(
        failure instanceof AccountApiError && failure.code === "cannot_remove_own_admin"
          ? t("account.roles.ownAdmin")
          : t("account.roles.saveFailed"),
      );
    } finally {
      setSavingId(null);
    }
  }

  return (
    <section className="account-roles" aria-labelledby={`${formId}-title`}>
      <header className="account-roles__header">
        <h2 id={`${formId}-title`}>{t("account.roles.title")}</h2>
        <p>{t("account.roles.help")}</p>
      </header>
      <Field
        id={`${formId}-search`}
        label={t("account.roles.search")}
        value={query}
        maxLength={SEARCH_MAX_LENGTH}
        onChange={(event) => setQuery(event.target.value)}
      />
      {loadFailed ? <Alert tone="warning" title={t("account.roles.loadFailed")} /> : null}
      {saveError ? <Alert tone="warning" title={saveError} /> : null}
      {!holders && !loadFailed ? <p role="status">{t("common.loading")}</p> : null}
      {holders?.length === 0 ? (
        <p className="account-roles__empty">{t(query.trim() ? "account.roles.noMatches" : "account.roles.empty")}</p>
      ) : null}
      {holders?.length ? (
        <ul className="account-roles__list">
          {holders.map((holder) => (
            <li key={holder.id} className="account-roles__row">
              <span className="account-roles__name">{holder.displayName}</span>
              <fieldset className="account-roles__options" disabled={savingId !== null}>
                <legend className="aegis-sr-only">{t("account.roles.rolesFor", { name: holder.displayName })}</legend>
                {Object.values(AccountRole).map((role) => (
                  <label key={role.value} className="account-roles__option">
                    <input
                      type="checkbox"
                      checked={holder.roles.includes(role.value)}
                      onChange={(event) => void toggleRole({ holder, role: role.value, granted: event.target.checked })}
                    />
                    {t(role.labelKey)}
                  </label>
                ))}
              </fieldset>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
