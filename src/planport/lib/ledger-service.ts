import {
  collection,
  getDocs,
  limit,
  orderBy,
  query,
  startAt,
  endAt,
  type QuerySnapshot,
  type DocumentData
} from "firebase/firestore";
import { getLedgerFirestore } from "@/firebase/ledger-app";
import {
  getLedgerClientOrderField,
  getLedgerClientsCollection,
  getLedgerContractorOrderField,
  getLedgerContractorsCollection
} from "@/firebase/ledger-config";

export type LedgerDocHit = { id: string; data: Record<string, unknown> };

function getFirstString(obj: Record<string, unknown>, keys: string[]): string {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "";
}

const DEFAULT_CLIENT_NAME_KEYS = [
  "name",
  "clientName",
  "fullName",
  "displayName",
  "husbandName",
  "primaryName",
  "firstName"
];
const DEFAULT_CLIENT_SECONDARY_KEYS = ["wifeName", "spouseName", "secondaryName", "partnerName"];

function clientNameFieldKeys(): string[] {
  const raw = process.env.NEXT_PUBLIC_LEDGER_CLIENT_NAME_FIELDS;
  if (raw?.trim()) {
    return raw.split(",").map((s) => s.trim()).filter(Boolean);
  }
  return DEFAULT_CLIENT_NAME_KEYS;
}

function clientSecondaryFieldKeys(): string[] {
  const raw = process.env.NEXT_PUBLIC_LEDGER_CLIENT_SECONDARY_NAME_FIELDS;
  if (raw?.trim()) {
    return raw.split(",").map((s) => s.trim()).filter(Boolean);
  }
  return DEFAULT_CLIENT_SECONDARY_KEYS;
}

const DEFAULT_GC_NAME_KEYS = ["name", "companyName", "company", "gcName", "builderName"];

function contractorNameFieldKeys(): string[] {
  const raw = process.env.NEXT_PUBLIC_LEDGER_CONTRACTOR_NAME_FIELDS;
  if (raw?.trim()) {
    return raw.split(",").map((s) => s.trim()).filter(Boolean);
  }
  return DEFAULT_GC_NAME_KEYS;
}

function emailKeys(kind: "client" | "contractor"): string[] {
  const raw =
    kind === "client"
      ? process.env.NEXT_PUBLIC_LEDGER_CLIENT_EMAIL_FIELDS
      : process.env.NEXT_PUBLIC_LEDGER_CONTRACTOR_EMAIL_FIELDS;
  if (raw?.trim()) {
    return raw.split(",").map((s) => s.trim()).filter(Boolean);
  }
  return ["email", "emailAddress", "primaryEmail", "contactEmail"];
}

function phoneKeys(kind: "client" | "contractor"): string[] {
  const raw =
    kind === "client"
      ? process.env.NEXT_PUBLIC_LEDGER_CLIENT_PHONE_FIELDS
      : process.env.NEXT_PUBLIC_LEDGER_CONTRACTOR_PHONE_FIELDS;
  if (raw?.trim()) {
    return raw.split(",").map((s) => s.trim()).filter(Boolean);
  }
  return ["phone", "phoneNumber", "mobile", "cell", "officePhone"];
}

function addressKeys(kind: "client" | "contractor"): string[] {
  const raw =
    kind === "client"
      ? process.env.NEXT_PUBLIC_LEDGER_CLIENT_ADDRESS_FIELDS
      : process.env.NEXT_PUBLIC_LEDGER_CONTRACTOR_ADDRESS_FIELDS;
  if (raw?.trim()) {
    return raw.split(",").map((s) => s.trim()).filter(Boolean);
  }
  return ["address", "street", "fullAddress", "mailingAddress"];
}

export function mapLedgerDocToPlanPortClient(data: Record<string, unknown>): {
  husbandName: string;
  wifeName: string;
  email: string;
  phone: string;
  address: string;
} {
  const primaryKeys = clientNameFieldKeys();
  const secondaryKeys = clientSecondaryFieldKeys();
  let husbandName = getFirstString(data, primaryKeys);
  const wifeName = getFirstString(data, secondaryKeys);
  if (!husbandName && typeof data.firstName === "string" && typeof data.lastName === "string") {
    husbandName = `${data.firstName} ${data.lastName}`.trim();
  }
  return {
    husbandName: husbandName || "Client",
    wifeName,
    email: getFirstString(data, emailKeys("client")),
    phone: getFirstString(data, phoneKeys("client")),
    address: getFirstString(data, addressKeys("client"))
  };
}

export function mapLedgerDocToPlanPortContractor(data: Record<string, unknown>): {
  name: string;
  email: string;
  phone: string;
  logoUrl: string;
} {
  const name = getFirstString(data, contractorNameFieldKeys()) || "Contractor";
  const logo = getFirstString(data, ["logoUrl", "logo", "brandLogo", "imageUrl"]);
  return {
    name,
    email: getFirstString(data, emailKeys("contractor")),
    phone: getFirstString(data, phoneKeys("contractor")),
    logoUrl: logo
  };
}

function snapToHits(snap: QuerySnapshot<DocumentData>): LedgerDocHit[] {
  return snap.docs.map((d) => ({ id: d.id, data: d.data() as Record<string, unknown> }));
}

/**
 * Prefix search on a single string field (efficient). Requires field present on searchable docs.
 */
export async function searchLedgerClients(searchTerm: string, max = 20): Promise<LedgerDocHit[]> {
  const db = getLedgerFirestore();
  if (!db) return [];
  const term = searchTerm.trim();
  if (term.length < 2) return [];

  const collName = getLedgerClientsCollection();
  const orderField = getLedgerClientOrderField();

  const coll = collection(db, collName);
  const q = query(
    coll,
    orderBy(orderField),
    startAt(term),
    endAt(`${term}\uf8ff`),
    limit(max)
  );
  const snap = await getDocs(q);
  return snapToHits(snap);
}

export async function searchLedgerContractors(searchTerm: string, max = 20): Promise<LedgerDocHit[]> {
  const db = getLedgerFirestore();
  if (!db) return [];
  const term = searchTerm.trim();
  if (term.length < 2) return [];

  const collName = getLedgerContractorsCollection();
  const orderField = getLedgerContractorOrderField();

  const coll = collection(db, collName);
  const q = query(
    coll,
    orderBy(orderField),
    startAt(term),
    endAt(`${term}\uf8ff`),
    limit(max)
  );
  const snap = await getDocs(q);
  return snapToHits(snap);
}
