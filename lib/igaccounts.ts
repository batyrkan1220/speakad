import "server-only";
import { readJson, writeJson } from "./db";

/** Instagram accounts the user connected. Tokens stay on the server; the client gets `publicAccount()`. */
export interface IgAcc {
  id: string;
  handle: string;              // without @
  igUserId?: string;
  picture?: string;
  followers?: number;
  status: "connected" | "pending" | "expired";
  token?: string;
  tokenExpiresAt?: string;
  actorIds: string[];          // actors that post on this account
  connectedAt: string;
}
const PATH = "ig/accounts.json";
export const loadAccounts = () => readJson<IgAcc[]>(PATH, []);
export const saveAccounts = (xs: IgAcc[]) => writeJson(PATH, xs);
export const publicAccount = ({ token, ...a }: IgAcc) => ({ ...a, status: a.status === "connected" && a.tokenExpiresAt && Date.parse(a.tokenExpiresAt) < Date.now() ? "expired" : a.status });
export const oauthReady = () => !!(process.env.META_APP_ID && process.env.META_APP_SECRET);
export const cleanHandle = (h: string) => h.trim().replace(/^@+/, "").replace(/^https?:\/\/(www\.)?instagram\.com\//, "").replace(/[/?#].*$/, "").toLowerCase().slice(0, 30);

/** Public origin behind Render's proxy (for the OAuth redirect URI). */
export function origin(req: Request) {
  if (process.env.PUBLIC_URL) return process.env.PUBLIC_URL.replace(/\/$/, "");
  const h = req.headers;
  const host = h.get("x-forwarded-host") || h.get("host") || "localhost:3000";
  const proto = h.get("x-forwarded-proto") || (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}
export const IG_SCOPES = ["instagram_business_basic", "instagram_business_content_publish", "instagram_business_manage_insights"];
