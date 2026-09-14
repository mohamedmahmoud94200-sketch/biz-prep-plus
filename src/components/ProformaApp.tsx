import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Plus, Trash2, FileDown, Presentation, Copy, Library, FilePlus, Palette, X,
  Package, Printer, ImageIcon, Send, Save, Languages, LogOut, Star, FileText,
  Lock, LockOpen, Sliders, Sheet,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "@tanstack/react-router";

type Row = {
  id: string; itemName: string; description: string; image: string; packing: string;
  ctn: string; dozCtn: string; setCtn: string; pcsSet: string; pricePerCtn: string;
  cbm: string; weight: string;
};
type TextFormat = { fontSize?: number; bold?: boolean };
type LayoutCfg = {
  fontSize: number;
  bold: boolean;
  widths: number[];
  zoom: number;
  rowHeights: Record<string, number>;
  columnStyles: TextFormat[];
  cellStyles: Record<string, TextFormat>;
};
type Meta = {
  company: string; address: string; phone: string; email: string;
  customer: string; date: string; title: string; notes: string; logo: string;
  layout?: LayoutCfg;
};
type Proforma = {
  id: string; name: string; meta: Meta; rows: Row[]; themeColor: string; sortOrder: number; isPrimary?: boolean;
  rowsLoaded?: boolean;
};
type Lang = "ar" | "en";

const LANG_KEY = "proforma-lang";
const CACHE_KEY = "proforma-cache-lite-v6";
const DELETED_CACHE_KEY = "proforma-deleted-v1";
const OLD_CACHE_KEYS = ["proforma-cache-full-v4", "proforma-cache-full-v3"];
const DEFAULT_WIDTHS = [38, 130, 140, 183, 183, 55, 60, 60, 58, 68, 74, 52, 60, 52, 60];
const DEFAULT_LAYOUT: LayoutCfg = { fontSize: 12, bold: false, widths: DEFAULT_WIDTHS, zoom: 100, rowHeights: {}, columnStyles: Array.from({ length: 15 }, () => ({})), cellStyles: {} };
const normalizeLayout = (raw: unknown): LayoutCfg => {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ...DEFAULT_LAYOUT, widths: [...DEFAULT_WIDTHS], columnStyles: Array.from({ length: 15 }, () => ({})) };
  const value = raw as Partial<LayoutCfg>;
  const widths = Array.isArray(value.widths) && value.widths.length === 15 ? value.widths : DEFAULT_WIDTHS;
  const columnStyles = Array.isArray(value.columnStyles) && value.columnStyles.length === 15 ? value.columnStyles : Array.from({ length: 15 }, () => ({}));
  return {
    fontSize: Math.max(8, Math.min(22, Number(value.fontSize) || 12)), bold: !!value.bold,
    widths: widths.map((w) => Math.max(24, Math.min(420, Number(w) || 60))),
    zoom: Math.max(55, Math.min(120, Number(value.zoom) || 100)),
    rowHeights: value.rowHeights && typeof value.rowHeights === "object" ? value.rowHeights : {},
    columnStyles, cellStyles: value.cellStyles && typeof value.cellStyles === "object" ? value.cellStyles : {},
  };
};

const T = {
  ar: {
    print: "طباعة", pdf: "PDF", pptx: "PowerPoint", createInvoice: "Create Invoice",
    newInvoice: "بروفورما جديدة", addItem: "إضافة منتج", library: "مكتبة المنتجات",
    theme: "اللون", save: "حفظ الآن", saved: "محفوظ ☁", saving: "جارى الحفظ…",
    lang: "EN", customer: "العميل", date: "التاريخ",
    cols: ["م","اسم المنتج","الوصف","صورة","التغليف","كراتين","دزينة/كرتون","سيت/كرتون","قطع/سيت","سعر السيت","الإجمالى","CBM","إجمالى CBM","الوزن","إجمالى الوزن","إجراءات"],
    totals: { ctn:"إجمالى الكراتين", cbm:"إجمالى CBM", weight:"إجمالى الوزن", amount:"الإجمالى" },
    sendTo: "إرسال لبروفورمات", pickTargets: "اختار البروفورمات اللى عايز تبعت لها المنتج",
    sendNow: "إرسال", cancel: "إلغاء", rename: "تغيير الاسم", delete: "حذف", duplicate: "نسخ",
    productLib: "مكتبة المنتجات", addFromLib: "اضغط على المنتج لإضافته للبروفورما الحالية",
    search: "بحث…", noProducts: "مفيش منتجات لسه",
    arabicTip: "للطباعة بالعربى استخدم زر «طباعة / PDF» — هيظهر زى البروفورما بالظبط",
    proforma: "بروفورما",
  },
  en: {
    print: "Print", pdf: "PDF", pptx: "PowerPoint", createInvoice: "Create Invoice",
    newInvoice: "New Proforma", addItem: "Add Item", library: "Library",
    theme: "Theme", save: "Save Now", saved: "Saved ☁", saving: "Saving…",
    lang: "ع", customer: "CUSTOMER", date: "DATE",
    cols: ["No","Item Name","Description","Image","Packing","Ctn","Doz/Ctn","Set/Ctn","Pcs/Set","Price/Set","T.Amount","CBM","T.CBM","Weight","T.Weight","Actions"],
    totals: { ctn:"T.Ctn", cbm:"T.CBM", weight:"T.Weight", amount:"T.Amount" },
    sendTo: "Send to proformas", pickTargets: "Pick the proformas to copy this item to",
    sendNow: "Send", cancel: "Cancel", rename: "Rename", delete: "Delete", duplicate: "Duplicate",
    productLib: "Product Library", addFromLib: "Click any item to add it to the current proforma",
    search: "Search…", noProducts: "No products yet",
    arabicTip: "For Arabic printing use the Print / PDF button",
    proforma: "proforma",
  },
} as const;

const newRow = (): Row => ({
  id: crypto.randomUUID(), itemName: "", description: "", image: "", packing: "",
  ctn: "", dozCtn: "", setCtn: "", pcsSet: "", pricePerCtn: "", cbm: "", weight: "",
});
const DEFAULT_LOGO_KEY = "proforma_default_logo";
const getDefaultLogo = () => { try { return localStorage.getItem(DEFAULT_LOGO_KEY) || ""; } catch { return ""; } };
const setDefaultLogo = (url: string) => { try { localStorage.setItem(DEFAULT_LOGO_KEY, url); } catch { /* ignore */ } };
const defaultMeta = (): Meta => ({
  company: "KOUJAN COMPANY",
  address: "ARABIC REPUBLIC EGYPT , sadat city svi industrial zone , plot no 6098",
  phone: "00201272883314  -  002012​1265982",
  email: "sales@koujanegypt.com  /  info@koujanegypt.com",
  customer: "", date: new Date().toISOString().slice(0,10),
  title: "Proforma Invoice", notes: "Prices are E.X work", logo: getDefaultLogo(), layout: normalizeLayout(null),
});
const THEME_PRESETS = [
  { name:"Emerald", color:"2BB39B" }, { name:"Navy", color:"1E3A8A" },
  { name:"Crimson", color:"B91C1C" }, { name:"Gold", color:"B8860B" },
  { name:"Charcoal", color:"1A1A1A" }, { name:"Teal", color:"0F766E" },
];
const newProforma = (name: string, sortOrder = 0): Proforma => ({
  id: crypto.randomUUID(), name, meta: defaultMeta(), rows: [newRow()],
  themeColor: "2BB39B", sortOrder, rowsLoaded: true,
});

type ProformaHeadRow = {
  id: string;
  name: string;
  sort_order: number;
  is_primary: boolean | null;
  meta: unknown;
  theme_color: string | null;
};

type ProformaItemLiteRow = {
  id: string;
  proforma_id: string;
  row_order: number;
  item_name: string;
  description: string;
  ctn: string;
  doz_ctn: string;
  set_ctn: string;
  pcs_set: string;
  price_per_ctn: string;
  cbm: string;
  weight: string;
};

type ProformaItemImageRow = {
  id: string;
  proforma_id: string;
  image: string;
  packing: string;
};

const normalizeMeta = (value: unknown): Meta => {
  const base = defaultMeta();
  if (!value || typeof value !== "object" || Array.isArray(value)) return base;
  const src = value as Partial<Record<keyof Meta, unknown>>;
  return {
    company: typeof src.company === "string" ? src.company : base.company,
    address: typeof src.address === "string" ? src.address : base.address,
    phone: typeof src.phone === "string" ? src.phone : base.phone,
    email: typeof src.email === "string" ? src.email : base.email,
    customer: typeof src.customer === "string" ? src.customer : base.customer,
    date: typeof src.date === "string" ? src.date : base.date,
    title: typeof src.title === "string" ? src.title : base.title,
    notes: typeof src.notes === "string" ? src.notes : base.notes,
    logo: typeof src.logo === "string" ? src.logo : base.logo,
    layout: normalizeLayout(src.layout),
  };
};

const itemToRow = (item: ProformaItemLiteRow, images?: Partial<ProformaItemImageRow>): Row => ({
  id: item.id,
  itemName: item.item_name ?? "",
  description: item.description ?? "",
  image: images?.image ?? "",
  packing: images?.packing ?? "",
  ctn: item.ctn ?? "",
  dozCtn: item.doz_ctn ?? "",
  setCtn: item.set_ctn ?? "",
  pcsSet: item.pcs_set ?? "",
  pricePerCtn: item.price_per_ctn ?? "",
  cbm: item.cbm ?? "",
  weight: item.weight ?? "",
});

const rowToItem = (row: Row, proformaId: string, rowOrder: number) => ({
  id: row.id,
  proforma_id: proformaId,
  row_order: rowOrder,
  item_name: row.itemName,
  description: row.description,
  image: row.image,
  packing: row.packing,
  ctn: row.ctn,
  doz_ctn: row.dozCtn,
  set_ctn: row.setCtn,
  pcs_set: row.pcsSet,
  price_per_ctn: row.pricePerCtn,
  cbm: row.cbm,
  weight: row.weight,
});

const rowToItemUpdate = (row: Row, proformaId: string, rowOrder: number, includeImages: boolean) => ({
  id: row.id,
  proforma_id: proformaId,
  row_order: rowOrder,
  item_name: row.itemName,
  description: row.description,
  ...(includeImages ? { image: row.image, packing: row.packing } : {}),
  ctn: row.ctn,
  doz_ctn: row.dozCtn,
  set_ctn: row.setCtn,
  pcs_set: row.pcsSet,
  price_per_ctn: row.pricePerCtn,
  cbm: row.cbm,
  weight: row.weight,
});

const isDataUrl = (s: string) => typeof s === "string" && s.startsWith("data:");
// keep light-weight storage URLs in cache, drop heavy base64 blobs
const cacheImg = (s: string) => (!s || isDataUrl(s) ? "" : s);
const cacheSafe = (list: Proforma[]) => list.map((p) => ({
  ...p,
  rowsLoaded: true,
  rows: p.rows.map((r) => ({ ...r, image: cacheImg(r.image), packing: cacheImg(r.packing) })),
}));

const saveCache = (list: Proforma[]) => {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(cacheSafe(list))); } catch {}
};

const getDeletedIds = () => {
  if (typeof window === "undefined") return new Set<string>();
  try {
    const parsed = JSON.parse(localStorage.getItem(DELETED_CACHE_KEY) || "[]");
    return new Set(Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : []);
  } catch {
    return new Set<string>();
  }
};

const saveDeletedIds = (ids: Set<string>) => {
  try { localStorage.setItem(DELETED_CACHE_KEY, JSON.stringify([...ids])); } catch {}
};

const rememberDeletedId = (id: string) => {
  const ids = getDeletedIds();
  ids.add(id);
  saveDeletedIds(ids);
};

const forgetDeletedId = (id: string) => {
  const ids = getDeletedIds();
  ids.delete(id);
  saveDeletedIds(ids);
};

const num = (s: string) => parseFloat(s || "0") || 0;
// T.Amount = Ctn × Set/Ctn × Price/Set
const amount = (r: Row) => +(num(r.ctn) * num(r.setCtn) * num(r.pricePerCtn)).toFixed(2);
const tCbm = (r: Row) => +(num(r.ctn) * num(r.cbm)).toFixed(3);
const tWeight = (r: Row) => +(num(r.ctn) * num(r.weight)).toFixed(2);

async function fileToDataURL(file: File): Promise<string> {
  return new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result as string); fr.onerror = rej; fr.readAsDataURL(file); });
}
async function processImage(file: File): Promise<string> {
  const raw = await fileToDataURL(file);
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const MAX = 900; let w = img.width, h = img.height;
      if (w > MAX || h > MAX) { const r = Math.min(MAX/w, MAX/h); w = Math.round(w*r); h = Math.round(h*r); }
      const c = document.createElement("canvas"); c.width = w; c.height = h;
      const ctx = c.getContext("2d")!; ctx.imageSmoothingQuality = "high";
      ctx.fillStyle = "#FFF"; ctx.fillRect(0,0,w,h); ctx.drawImage(img,0,0,w,h);
      resolve(c.toDataURL("image/jpeg", 0.78));
    };
    img.onerror = () => resolve(raw); img.src = raw;
  });
}

/* ───── image storage (files live in the bucket, DB only keeps the URL) ───── */
const IMG_BUCKET = "proforma-images";

async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const res = await fetch(dataUrl);
  return res.blob();
}

async function uploadDataUrl(dataUrl: string): Promise<string> {
  const blob = await dataUrlToBlob(dataUrl);
  const type = blob.type || "image/jpeg";
  const ext = type.includes("png") ? "png" : type.includes("webp") ? "webp" : "jpg";
  const path = `${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from(IMG_BUCKET).upload(path, blob, { contentType: type, upsert: false });
  if (error) throw error;
  return supabase.storage.from(IMG_BUCKET).getPublicUrl(path).data.publicUrl;
}

async function storeImage(file: File): Promise<string> {
  const dataUrl = await processImage(file);
  return uploadDataUrl(dataUrl);
}

const dataUrlCache = new Map<string, string>();
async function toDataUrl(src: string): Promise<string> {
  if (!src || isDataUrl(src)) return src;
  const hit = dataUrlCache.get(src);
  if (hit) return hit;
  try {
    const blob = await (await fetch(src, { mode: "cors" })).blob();
    const out = await new Promise<string>((res, rej) => {
      const fr = new FileReader();
      fr.onload = () => res(fr.result as string);
      fr.onerror = rej;
      fr.readAsDataURL(blob);
    });
    dataUrlCache.set(src, out);
    return out;
  } catch { return src; }
}

/* ───────────────────────────  COMPONENT  ─────────────────────────── */

export default function ProformaApp() {
  const navigate = useNavigate();
  const [proformas, setProformas] = useState<Proforma[]>([]);
  const [activeId, setActiveId] = useState<string>("");
  const [loaded, setLoaded] = useState(false);
  const [showLibrary, setShowLibrary] = useState(false);
  const [showThemes, setShowThemes] = useState(false);
  const [showCompany, setShowCompany] = useState(false);
  const [showInvoice, setShowInvoice] = useState(false);
  const [invoiceTransport, setInvoiceTransport] = useState<number | null>(null);
  const [saveState, setSaveState] = useState<"idle"|"saving"|"saved">("idle");
  const [loadFailed, setLoadFailed] = useState(false);
  const [lang, setLang] = useState<Lang>(() => (typeof window !== "undefined" && (localStorage.getItem(LANG_KEY) as Lang)) || "ar");
  const [sendItem, setSendItem] = useState<Row | null>(null);
  const [lockCW, setLockCW] = useState<boolean>(() => (typeof window !== "undefined" && localStorage.getItem("proforma_lock_cw") === "1"));
  const [showLayout, setShowLayout] = useState(false);
  const [selectedCell, setSelectedCell] = useState<{ rowId: string; col: number } | null>(null);
  const [selectedColumn, setSelectedColumn] = useState<number | null>(null);
  const logoRef = useRef<HTMLInputElement>(null);
  const dirtyIds = useRef<Set<string>>(new Set());
  const dirtyRowIds = useRef<Map<string, Set<string>>>(new Map());
  const dirtyImageRowIds = useRef<Map<string, Set<string>>>(new Map());
  const deletedRowIds = useRef<Map<string, Set<string>>>(new Map());
  const savingRef = useRef(false);
  const t = T[lang];

  /* ----- load ----- */
  const loadAll = useCallback(async () => {
    const { data: heads, error } = await supabase
      .from("proformas")
      .select("id, name, sort_order, is_primary, meta, theme_color")
      .order("sort_order")
      .order("created_at");
    if (error) { console.error(error); setLoadFailed(true); return false; }
    const deletedIds = getDeletedIds();
    const safeHeads = ((heads ?? []) as ProformaHeadRow[]).filter((r) => !deletedIds.has(r.id));

    let cached: Proforma[] = [];
    try { cached = JSON.parse(localStorage.getItem(CACHE_KEY) || "[]") as Proforma[]; } catch {}
    const cacheMap = new Map(cached.map((p) => [p.id, p]));

    const list: Proforma[] = safeHeads.map((r) => {
      const c = cacheMap.get(r.id);
      return {
        id: r.id,
        name: r.name,
        sortOrder: r.sort_order,
        isPrimary: r.is_primary ?? false,
        meta: normalizeMeta(r.meta ?? c?.meta),
        rows: c?.rows ?? [newRow()],
        themeColor: r.theme_color ?? c?.themeColor ?? "2BB39B",
        rowsLoaded: true,
      };
    });

    const ids = safeHeads.map((h) => h.id);
    if (ids.length > 0) {
      const { data: items, error: itemErr } = await supabase
        .from("proforma_items")
        .select("id, proforma_id, row_order, item_name, description, image, packing, ctn, doz_ctn, set_ctn, pcs_set, price_per_ctn, cbm, weight")
        .in("proforma_id", ids)
        .order("row_order");
      if (itemErr) { console.error(itemErr); setLoadFailed(true); return false; }

      const rowsByProforma = new Map<string, Row[]>();
      ((items ?? []) as (ProformaItemLiteRow & ProformaItemImageRow)[]).forEach((item) => {
        const proformaRows = rowsByProforma.get(item.proforma_id) ?? [];
        proformaRows.push(itemToRow(item, item));
        rowsByProforma.set(item.proforma_id, proformaRows);
      });

      list.forEach((p) => { p.rows = rowsByProforma.get(p.id) ?? [newRow()]; });
    }

    setProformas(list);
    saveCache(list);
    setLoadFailed(false);
    OLD_CACHE_KEYS.forEach((key) => { try { localStorage.removeItem(key); } catch {} });
    return true;
  }, []);

  const readCachedList = useCallback(() => {
    try {
      const cached = localStorage.getItem(CACHE_KEY);
      if (!cached) return [] as Proforma[];
      const deletedIds = getDeletedIds();
      const list = (JSON.parse(cached) as Proforma[]).filter((p) => p.rowsLoaded === true && !deletedIds.has(p.id));
      return Array.isArray(list) ? list : [];
    } catch {
      return [] as Proforma[];
    }
  }, []);

  useEffect(() => {
    (async () => {
      const cachedList = readCachedList();
      if (cachedList.length > 0) {
        setProformas(cachedList.map((p) => ({ ...p, rowsLoaded: true })));
        setLoaded(true);
      }
      const ok = await loadAll();
      if (ok) setLoaded(true);
    })();
  }, [loadAll, readCachedList]);

  useEffect(() => {
    if (!loaded || proformas.length === 0) return;
    saveCache(proformas);
  }, [loaded, proformas]);

  // ensure at least one + pick active
  useEffect(() => {
    if (!loaded || loadFailed) return;
    if (proformas.length === 0) {
      const p = newProforma("New Proforma", 0);
      supabase.from("proformas").insert({ id: p.id, name: p.name, sort_order: 0, is_primary: false, meta: p.meta, theme_color: p.themeColor, data: {} }).then(loadAll);
      return;
    }
    if (!activeId || !proformas.find((p) => p.id === activeId)) setActiveId((proformas.find((p) => p.isPrimary) ?? proformas[0]).id);
  }, [loaded, loadFailed, proformas, activeId, lang, loadAll]);

  useEffect(() => { try { localStorage.setItem(LANG_KEY, lang); } catch {} }, [lang]);
  useEffect(() => { try { localStorage.setItem("proforma_lock_cw", lockCW ? "1" : "0"); } catch {} }, [lockCW]);
  const active = proformas.find((p) => p.id === activeId) ?? proformas[0];
  const meta = active?.meta ?? defaultMeta();
  const rows = active?.rows ?? [];
  const layout = normalizeLayout(meta.layout);
  const themeColor = active?.themeColor ?? "2BB39B";
  const accent = `#${themeColor}`;
  const setLayout = (next: LayoutCfg | ((current: LayoutCfg) => LayoutCfg)) => {
    const updated = typeof next === "function" ? next(layout) : next;
    setMeta({ ...meta, layout: normalizeLayout(updated) });
  };

  /* ----- save logic ----- */
  const flushSave = useCallback(async () => {
    if (savingRef.current) return;
    const ids = [...dirtyIds.current];
    const rowEntries = [...dirtyRowIds.current.entries()].map(([proformaId, rowIds]) => [proformaId, [...rowIds]] as const);
    const imageEntries = [...dirtyImageRowIds.current.entries()].map(([proformaId, rowIds]) => [proformaId, [...rowIds]] as const);
    const deleteEntries = [...deletedRowIds.current.entries()].map(([proformaId, rowIds]) => [proformaId, [...rowIds]] as const);
    if (ids.length === 0 && rowEntries.length === 0 && imageEntries.length === 0 && deleteEntries.length === 0) return;

    savingRef.current = true;
    dirtyIds.current.clear();
    dirtyRowIds.current.clear();
    dirtyImageRowIds.current.clear();
    deletedRowIds.current.clear();
    setSaveState("saving");
    try {
      const currentById = new Map(proformas.map((p) => [p.id, p]));
      const metaTargets = proformas.filter((p) => ids.includes(p.id));
      const rowPayload = rowEntries.flatMap(([proformaId, rowIds]) => {
        const p = currentById.get(proformaId);
        if (!p) return [];
        const wanted = new Set(rowIds);
        const imageWanted = new Set(imageEntries.find(([id]) => id === proformaId)?.[1] ?? []);
        return p.rows.flatMap((r, idx) => wanted.has(r.id) ? [rowToItemUpdate(r, p.id, idx, imageWanted.has(r.id))] : []);
      });

      const requests: PromiseLike<{ error: unknown }>[] = [];
      if (metaTargets.length > 0) {
        requests.push(supabase.from("proformas").upsert(metaTargets.map((p) => ({
          id: p.id, name: p.name, sort_order: p.sortOrder, is_primary: !!p.isPrimary,
          meta: p.meta, theme_color: p.themeColor, data: {},
        }))));
      }
      if (rowPayload.length > 0) requests.push(supabase.from("proforma_items").upsert(rowPayload));
      deleteEntries.forEach(([, rowIds]) => {
        if (rowIds.length > 0) requests.push(supabase.from("proforma_items").delete().in("id", rowIds));
      });

      const results = await Promise.all(requests);
      const failed = results.find((r) => r.error);
      if (failed?.error) throw failed.error;
      setSaveState("saved");
      setTimeout(() => setSaveState((s) => (s === "saved" ? "idle" : s)), 1500);
    } catch (error) {
      console.error(error);
      ids.forEach((id) => dirtyIds.current.add(id));
      rowEntries.forEach(([proformaId, rowIds]) => dirtyRowIds.current.set(proformaId, new Set(rowIds)));
      imageEntries.forEach(([proformaId, rowIds]) => dirtyImageRowIds.current.set(proformaId, new Set(rowIds)));
      deleteEntries.forEach(([proformaId, rowIds]) => deletedRowIds.current.set(proformaId, new Set(rowIds)));
      toast.error("فشل الحفظ / Save failed");
      setSaveState("idle");
    } finally {
      savingRef.current = false;
    }
  }, [proformas]);

  const markDirty = useCallback((id: string) => {
    dirtyIds.current.add(id);
    setSaveState((s) => (s === "saving" ? s : "idle"));
  }, []);

  const markRowsDirty = useCallback((proformaId: string, rowIds: string[], includeImages = false) => {
    const rows = dirtyRowIds.current.get(proformaId) ?? new Set<string>();
    rowIds.forEach((rowId) => rows.add(rowId));
    dirtyRowIds.current.set(proformaId, rows);
    if (includeImages) {
      const imageRows = dirtyImageRowIds.current.get(proformaId) ?? new Set<string>();
      rowIds.forEach((rowId) => imageRows.add(rowId));
      dirtyImageRowIds.current.set(proformaId, imageRows);
    }
    setSaveState((s) => (s === "saving" ? s : "idle"));
  }, []);

  const markRowsDeleted = useCallback((proformaId: string, rowIds: string[]) => {
    const deleted = deletedRowIds.current.get(proformaId) ?? new Set<string>();
    const dirty = dirtyRowIds.current.get(proformaId) ?? new Set<string>();
    const dirtyImages = dirtyImageRowIds.current.get(proformaId) ?? new Set<string>();
    rowIds.forEach((rowId) => { deleted.add(rowId); dirty.delete(rowId); dirtyImages.delete(rowId); });
    deletedRowIds.current.set(proformaId, deleted);
    dirtyRowIds.current.set(proformaId, dirty);
    dirtyImageRowIds.current.set(proformaId, dirtyImages);
    setSaveState((s) => (s === "saving" ? s : "idle"));
  }, []);

  const updateActive = (patch: Partial<Proforma>) => {
    const targetId = activeId || active?.id;
    if (!targetId) return;
    setProformas((ps) => ps.map((p) => (p.id === targetId ? { ...p, ...patch } : p)));
    markDirty(targetId);
  };
  const setMeta = (m: Meta) => updateActive({ meta: m });
  const setRows = (u: Row[] | ((rs: Row[]) => Row[])) => {
    const targetId = activeId || active?.id;
    if (!targetId) return;
    setProformas((ps) => ps.map((p) => {
      if (p.id !== targetId) return p;
      const beforeIds = new Set(p.rows.map((r) => r.id));
      const nextRows = typeof u === "function" ? (u as (r: Row[]) => Row[])(p.rows) : u;
      const afterIds = new Set(nextRows.map((r) => r.id));
      const changed = nextRows.map((r) => r.id);
      const removed = p.rows.filter((r) => !afterIds.has(r.id)).map((r) => r.id);
      markRowsDirty(targetId, changed, nextRows.some((r) => !beforeIds.has(r.id) && (!!r.image || !!r.packing)));
      if (removed.length > 0) markRowsDeleted(targetId, removed);
      return { ...p, rows: nextRows };
    }));
  };
  const setThemeColor = (c: string) => updateActive({ themeColor: c.replace("#","") });

  /* ----- proforma management ----- */
  const createProforma = async () => {
    const p = newProforma("New Proforma", proformas.length);
    if (active) { p.meta = { ...active.meta, customer: "", date: new Date().toISOString().slice(0,10) }; p.themeColor = active.themeColor; }
    const { error } = await supabase.from("proformas").insert({ id: p.id, name: p.name, sort_order: p.sortOrder, is_primary: false, meta: p.meta, theme_color: p.themeColor, data: {} });
    if (error) { toast.error("فشل الإنشاء"); return; }
    const { error: itemError } = await supabase.from("proforma_items").insert(p.rows.map((row, idx) => rowToItem(row, p.id, idx)));
    if (itemError) { console.error(itemError); toast.error("فشل إنشاء المنتجات"); return; }
    const next = [...proformas, p];
    setProformas(next); setActiveId(p.id);
    saveCache(next);
    toast.success(lang === "ar" ? "تم الإنشاء" : "Created");
  };
  const deleteProforma = async (id: string) => {
    if (proformas.length === 1) { toast.error(lang === "ar" ? "ميصحش تحذف الوحيدة" : "Can't delete the only one"); return; }
    if (!confirm(lang === "ar" ? "تأكيد الحذف؟" : "Delete this proforma?")) return;
    const before = proformas;
    const next = proformas.filter((p) => p.id !== id);
    rememberDeletedId(id);
    dirtyIds.current.delete(id);
    saveCache(next);
    setProformas(next); if (activeId === id) setActiveId(next[0]?.id ?? "");
    const { error } = await supabase.from("proformas").delete().eq("id", id);
    if (error) {
      console.error(error);
      forgetDeletedId(id);
      setProformas(before);
      saveCache(before);
      toast.error(lang === "ar" ? "فشل الحذف" : "Delete failed");
      return;
    }
    toast.success(lang === "ar" ? "تم الحذف" : "Deleted");
  };
  const renameProforma = (id: string) => {
    const cur = proformas.find((p) => p.id === id); if (!cur) return;
    const n = prompt(lang === "ar" ? "اسم البروفورما" : "Proforma name", cur.name);
    if (!n) return;
    setProformas((ps) => ps.map((p) => (p.id === id ? { ...p, name: n } : p)));
    markDirty(id);
  };

  const togglePrimary = async (id: string) => {
    const next = proformas.map((p) => (p.id === id ? { ...p, isPrimary: !p.isPrimary } : p));
    setProformas(next);
    saveCache(next);
    const target = next.find((p) => p.id === id);
    if (!target) return;
    toast.success(lang === "ar" ? "اتحدثت المكتبة فوراً" : "Library updated instantly");
    void supabase.from("proformas").update({ is_primary: !!target.isPrimary }).eq("id", id).then((res) => {
      if (res.error) { console.error(res.error); markDirty(id); toast.error("اتحدثت محلياً — اضغط Save Now للحفظ"); }
    });
  };

  const totals = useMemo(() => {
    const tCtn = rows.reduce((s, r) => s + num(r.ctn), 0);
    const tAmount = +rows.reduce((s, r) => s + amount(r), 0).toFixed(2);
    const tCBM = +rows.reduce((s, r) => s + tCbm(r), 0).toFixed(3);
    const tWt = +rows.reduce((s, r) => s + tWeight(r), 0).toFixed(2);
    return { tCtn, tAmount, tCBM, tWt };
  }, [rows]);
  const pageRows = useMemo(() => {
    const pages: Row[][] = [];
    let page: Row[] = [];
    let used = 0;
    const available = 430;
    rows.forEach((row) => {
      const height = layout.rowHeights[row.id] ?? 112;
      if (page.length > 0 && used + height > available) { pages.push(page); page = []; used = 0; }
      page.push(row); used += height;
    });
    if (page.length > 0 || pages.length === 0) pages.push(page);
    return pages;
  }, [rows, layout.rowHeights]);

  const updateRow = (id: string, patch: Partial<Row>) => {
    const targetId = activeId || active?.id;
    if (!targetId) return;
    setProformas((ps) => ps.map((p) => p.id === targetId ? { ...p, rows: p.rows.map((r) => (r.id === id ? { ...r, ...patch } : r)) } : p));
    markRowsDirty(targetId, [id], "image" in patch || "packing" in patch);
  };
  const changeColumnWidth = (index: number, delta: number) => {
    setLayout((current) => {
      const widths = [...current.widths];
      widths[index] = Math.max(24, Math.min(420, widths[index] + delta));
      return { ...current, widths };
    });
  };
  const setRowHeight = (rowId: string, height: number) => setLayout((current) => ({
    ...current, rowHeights: { ...current.rowHeights, [rowId]: Math.max(72, Math.min(260, height)) },
  }));
  const setSelectionFormat = (patch: TextFormat) => setLayout((current) => {
    if (selectedCell) {
      const key = `${selectedCell.rowId}:${selectedCell.col}`;
      return { ...current, cellStyles: { ...current.cellStyles, [key]: { ...current.cellStyles[key], ...patch } } };
    }
    if (selectedColumn !== null) {
      const columnStyles = current.columnStyles.map((style, index) => index === selectedColumn ? { ...style, ...patch } : style);
      return { ...current, columnStyles };
    }
    return { ...current, ...patch };
  });
  const removeRow = (id: string) => {
    const row = rows.find((r) => r.id === id);
    if (!confirm(lang === "ar" ? `تأكيد حذف المنتج ${row?.itemName || ""}؟` : `Delete ${row?.itemName || "this item"}?`)) return;
    setRows((rs) => rs.filter((r) => r.id !== id));
  };
  // create the row in the database right away so an image upload / refresh never loses it
  const persistNewRow = (row: Row, order: number) => {
    const targetId = activeId || active?.id;
    if (!targetId) return;
    void supabase.from("proforma_items").insert(rowToItem(row, targetId, order)).then((res) => {
      if (res.error) { console.error(res.error); markRowsDirty(targetId, [row.id], true); }
    });
  };
  const addRow = () => {
    const row = newRow();
    const order = rows.length;
    setRows((rs) => [...rs, row]);
    persistNewRow(row, order);
  };
  const duplicateRow = (id: string) => {
    const i = rows.findIndex((r) => r.id === id);
    if (i < 0) return;
    const copy = { ...rows[i], id: crypto.randomUUID() };
    setRows((rs) => { const out = [...rs]; out.splice(i + 1, 0, copy); return out; });
    persistNewRow(copy, i + 1);
  };

  const sendRowToProformas = (row: Row, targetIds: string[]) => {
    if (targetIds.length === 0) return;
    const rowsByTarget = new Map(targetIds.map((id) => [id, { ...row, id: crypto.randomUUID() }]));
    const updated = proformas.map((p) => {
      const nextRow = rowsByTarget.get(p.id);
      if (!nextRow) return p;
      return p.rowsLoaded ? { ...p, rows: [...p.rows, nextRow] } : p;
    });
    setProformas(updated);
    saveCache(updated);
    toast.success(lang === "ar" ? `تم الإرسال إلى ${targetIds.length} بروفورما` : `Sent to ${targetIds.length} proforma(s)`);
    void Promise.all(targetIds.map((targetId) => supabase.rpc("append_proforma_row", {
      target_id: targetId,
      new_row: rowsByTarget.get(targetId)!,
    }))).then((results) => {
      const failed = results.find((r) => r.error);
      if (failed?.error) {
        console.error(failed.error);
        toast.error("اتضاف محلياً — اضغط Save Now للحفظ");
      }
    });
  };

  const library = useMemo(() => {
    const items: { row: Row; from: string }[] = [];
    const primaries = proformas.filter((p) => p.isPrimary);
    const sources = primaries.length > 0 ? primaries : proformas;
    sources.forEach((p) => p.rows.forEach((r) => {
      if (!r.itemName && !r.image) return;
      items.push({ row: r, from: p.name });
    }));
    return items;
  }, [proformas]);

  const copyFromLibrary = (r: Row) => {
    const copy = { ...r, id: crypto.randomUUID() };
    const order = rows.length;
    setRows((rs) => [...rs, copy]);
    persistNewRow(copy, order);
    toast.success(lang === "ar" ? "تمت الإضافة" : "Added");
  };

  const onImage = async (id: string, f: File | null, field: "image" | "packing") => {
    if (!f) return;
    if (f.size > 10 * 1024 * 1024) return toast.error("الصورة كبيرة (>10MB)");
    try {
      const url = await storeImage(f);
      updateRow(id, { [field]: url } as Partial<Row>);
      const targetId = activeId || active?.id;
      const idx = rows.findIndex((r) => r.id === id);
      const current = idx >= 0 ? rows[idx] : null;
      if (!targetId || !current) return;
      // upsert (not update) so the row is created if it was only added locally
      const { error } = await supabase
        .from("proforma_items")
        .upsert(rowToItem({ ...current, [field]: url } as Row, targetId, idx));
      if (error) throw error;
    } catch (error) {
      console.error(error);
      toast.error(lang === "ar" ? "فشل رفع الصورة — حاول مرة أخرى" : "Image upload failed — try again");
    }
  };
  const onLogo = async (f: File | null) => {
    if (!f) return;
    try {
      const url = await storeImage(f);
      setMeta({ ...meta, logo: url });
      const targetId = activeId || active?.id;
      if (targetId) {
        const { error } = await supabase.from("proformas").update({ meta: { ...meta, logo: url } }).eq("id", targetId);
        if (error) throw error;
      }
    } catch (error) {
      console.error(error);
      toast.error(lang === "ar" ? "فشل رفع الشعار — حاول مرة أخرى" : "Logo upload failed — try again");
    }
  };

  const fmtDate = (d: string) => { if (!d) return ""; const [y,m,da] = d.split("-"); return `${da}/${m}/${y}`; };

  const capturePages = async (invoiceOnly = false, transport = 0) => {
    const printable = document.getElementById("printable");
    if (!printable) return [];
    printable.classList.add("export-capture");
    if (invoiceOnly) { printable.classList.add("invoice-capture"); setInvoiceTransport(transport); }
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const { default: html2canvas } = await import("html2canvas-pro");
    const pages = Array.from(printable.querySelectorAll<HTMLElement>(".proforma-page"));
    const canvases = [];
    for (const page of pages) canvases.push(await html2canvas(page, { scale: 2, useCORS: true, backgroundColor: "#ffffff", logging: false }));
    printable.classList.remove("export-capture", "invoice-capture");
    if (invoiceOnly) setInvoiceTransport(null);
    return canvases;
  };

  /* ───── PDF and PowerPoint use the exact same rendered preview pages ───── */
  const exportPDF = async (invoiceOnly = false, transport = 0) => {
    toast.message(lang === "ar" ? "بنحضّر الملف…" : "Preparing PDF…");
    try {
      const [{ default: jsPDF }, canvases] = await Promise.all([import("jspdf"), capturePages(invoiceOnly, transport)]);
      const pdf = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      canvases.forEach((canvas, index) => {
        if (index > 0) pdf.addPage("a4", "landscape");
        pdf.addImage(canvas.toDataURL("image/jpeg", 0.96), "JPEG", 0, 0, pageW, pageH, undefined, "FAST");
      });
      pdf.save(`${invoiceOnly ? "Invoice" : (meta.title || "proforma")}-${meta.customer || "customer"}.pdf`);
      toast.success("PDF ✓");
    } catch (e) {
      console.error(e);
      toast.error(lang === "ar" ? "فشل التصدير" : "Export failed");
    } finally { document.getElementById("printable")?.classList.remove("export-capture", "invoice-capture"); if (invoiceOnly) setInvoiceTransport(null); }
  };

  const exportPPTX = async (invoiceOnly = false, transport = 0) => {
    const { default: PptxGenJS } = await import("pptxgenjs");
    const pptx = new PptxGenJS(); pptx.layout = "LAYOUT_WIDE"; pptx.title = meta.title;
    const canvases = await capturePages(invoiceOnly, transport);
    canvases.forEach((canvas) => {
      const slide = pptx.addSlide();
      slide.addImage({ data: canvas.toDataURL("image/jpeg", 0.96), x: 0, y: 0, w: 13.333, h: 7.5 });
    });
    await pptx.writeFile({ fileName: `${invoiceOnly ? "Invoice" : (meta.title || "proforma")}-${meta.customer || "customer"}.pptx` });
    toast.success("PPTX ✓");
  };

  const exportExcel = async () => {
    toast.message(lang === "ar" ? "بنحضّر ملف إكسل…" : "Preparing Excel…");
    try {
      const { default: ExcelJS } = await import("exceljs");
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet((active.name || "Proforma").slice(0, 31), { pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1 } });
      const heads = T.en.cols.slice(0, 15);
      sheet.addRow(heads);
      sheet.getRow(1).height = 30;
      sheet.getRow(1).eachCell((cell) => { cell.font = { bold: true, color: { argb: "FFFFFFFF" } }; cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${themeColor}` } }; cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true }; });
      sheet.columns = layout.widths.map((width) => ({ width: Math.max(5, width / 7) }));
      for (let index = 0; index < rows.length; index++) {
        const row = rows[index];
        const excelRow = sheet.addRow([index + 1, row.itemName, row.description, "", "", row.ctn, row.dozCtn, row.setCtn, row.pcsSet, row.pricePerCtn, amount(row) || "", row.cbm, tCbm(row) || "", row.weight, tWeight(row) || ""]);
        excelRow.height = Math.max(55, (layout.rowHeights[row.id] ?? 112) * 0.75);
        excelRow.eachCell((cell, column) => {
          const style = { ...layout.columnStyles[column - 1], ...layout.cellStyles[`${row.id}:${column - 1}`] };
          cell.font = { name: "Arial", size: style.fontSize ?? layout.fontSize, bold: style.bold ?? layout.bold };
          cell.alignment = { horizontal: column === 2 || column === 3 ? "left" : "center", vertical: "middle", wrapText: true };
          cell.border = { top: { style: "thin", color: { argb: "FFE5E7EB" } }, left: { style: "thin", color: { argb: "FFE5E7EB" } }, bottom: { style: "thin", color: { argb: "FFE5E7EB" } }, right: { style: "thin", color: { argb: "FFE5E7EB" } } };
        });
        for (const [column, src] of [[4, row.image], [5, row.packing]] as const) {
          if (!src) continue;
          const data = await toDataUrl(src);
          const comma = data.indexOf(",");
          if (comma < 0) continue;
          const extension = data.slice(0, comma).includes("png") ? "png" : "jpeg";
          const imageId = workbook.addImage({ base64: data.slice(comma + 1), extension });
          sheet.addImage(imageId, { tl: { col: column - 1 + 0.08, row: index + 1 + 0.08 }, br: { col: column - 0.08, row: index + 1.92 }, editAs: "oneCell" });
        }
      }
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a"); anchor.href = url; anchor.download = `${meta.title || "proforma"}-${meta.customer || "customer"}.xlsx`; anchor.click(); URL.revokeObjectURL(url);
      toast.success("Excel ✓");
    } catch (error) { console.error(error); toast.error(lang === "ar" ? "فشل تنزيل إكسل" : "Excel export failed"); }
  };

  const onPrint = () => { setTimeout(() => window.print(), 100); };
  const onSaveNow = async () => { await flushSave(); toast.success(lang === "ar" ? "تم الحفظ" : "Saved"); };
  const onLogout = async () => { await supabase.auth.signOut(); navigate({ to: "/auth" }); };

  const themeStyle: CSSProperties = { ["--accent" as never]: accent };
  const dir = lang === "ar" ? "rtl" : "ltr";

  if (loadFailed && proformas.length === 0) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">تعذر تحميل البيانات — حاول تحديث الصفحة</div>;
  }

  if (!loaded || !active) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">Loading…</div>;
  }

  return (
    <div className="min-h-screen bg-[#f4f6f5] print:bg-white" style={themeStyle} dir={dir}>
      {/* TOOLBAR */}
      <header className="sticky top-0 z-20 border-b bg-white/95 backdrop-blur print:hidden">
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-3">
            <div>
              <h1 className="text-lg font-bold leading-tight">{meta.title}</h1>
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{meta.company}</p>
            </div>
            <span className="rounded-full px-2 py-0.5 text-[11px]" style={{ background: `${accent}22`, color: accent }}>
              {saveState === "saving" ? t.saving : saveState === "saved" ? t.saved : (lang === "ar" ? "جاهز" : "Ready")}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => setLang((l) => (l === "ar" ? "en" : "ar"))} title="Language">
              <Languages className="mr-1 h-4 w-4" /> {t.lang}
            </Button>
            <Button size="sm" variant="outline" onClick={onSaveNow}><Save className="mr-1 h-4 w-4" /> {t.save}</Button>
            <Button size="sm" variant={lockCW ? "default" : "outline"} onClick={() => { setLockCW((v) => !v); toast.success(lockCW ? (lang === "ar" ? "تم فتح CBM / Weight" : "CBM / Weight unlocked") : (lang === "ar" ? "تم قفل CBM / Weight" : "CBM / Weight locked")); }}
              title="CBM / Weight" className={lockCW ? "bg-rose-600 text-white hover:bg-rose-700" : ""}>
              {lockCW ? <Lock className="mr-1 h-4 w-4" /> : <LockOpen className="mr-1 h-4 w-4" />} CBM / Weight
            </Button>
            <Button size="sm" variant="outline" onClick={onPrint}><Printer className="mr-1 h-4 w-4" /> {t.print}</Button>
            <div className="relative">
              <Button size="sm" variant={showLayout ? "default" : "outline"} onClick={() => setShowLayout((v) => !v)} title="Layout">
                <Sliders className="mr-1 h-4 w-4" /> {lang === "ar" ? "التنسيق" : "Layout"}
              </Button>
              {showLayout && (
                <div className="absolute end-0 z-30 mt-2 max-h-[70vh] w-80 overflow-y-auto rounded-md border bg-white p-3 shadow-lg" dir={dir}>
                  <div className="mb-3 flex items-center gap-2">
                    <span className="w-20 text-xs font-semibold">{lang === "ar" ? "حجم الخط" : "Font size"}</span>
                    <input type="range" min={8} max={22} step={0.5} value={layout.fontSize}
                      onChange={(e) => setLayout((l) => ({ ...l, fontSize: parseFloat(e.target.value) }))} className="flex-1" />
                    <span className="w-10 text-end text-xs">{layout.fontSize}px</span>
                  </div>
                  <div className="mb-3 flex items-center gap-2">
                    <span className="w-20 text-xs font-semibold">{lang === "ar" ? "حجم المعاينة" : "Preview size"}</span>
                    <input type="range" min={55} max={120} step={5} value={layout.zoom}
                      onChange={(e) => setLayout((l) => ({ ...l, zoom: Number(e.target.value) }))} className="flex-1" />
                    <span className="w-10 text-end text-xs">{layout.zoom}%</span>
                  </div>
                  <label className="mb-3 flex cursor-pointer items-center gap-2 text-xs font-semibold">
                    <input type="checkbox" checked={layout.bold} onChange={(e) => setLayout((l) => ({ ...l, bold: e.target.checked }))} style={{ accentColor: accent }} />
                    {lang === "ar" ? "خط عريض (Bold)" : "Bold text"}
                  </label>
                  <div className="mb-1 text-xs font-semibold">{lang === "ar" ? "عرض الأعمدة" : "Column widths"}</div>
                  <div className="space-y-1.5">
                    {layout.widths.map((w, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <span className="w-20 truncate text-[11px] text-muted-foreground">{t.cols[i]}</span>
                        <input type="range" min={20} max={320} step={2} value={w}
                          onChange={(e) => setLayout((l) => { const ws = [...l.widths]; ws[i] = parseInt(e.target.value, 10); return { ...l, widths: ws }; })}
                          className="flex-1" />
                        <span className="w-8 text-end text-[11px]">{w}</span>
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 border-t pt-3">
                    <div className="mb-2 text-xs font-semibold">
                      {selectedCell ? (lang === "ar" ? "تنسيق الخلية المحددة" : "Selected cell") : selectedColumn !== null ? `${lang === "ar" ? "تنسيق عمود" : "Column"} ${t.cols[selectedColumn]}` : (lang === "ar" ? "التنسيق العام" : "General format")}
                    </div>
                    <div className="flex items-center gap-2">
                      <input type="number" min={8} max={22} className="h-8 w-20 rounded border px-2 text-xs" placeholder={String(layout.fontSize)}
                        onChange={(e) => { const value = Number(e.target.value); if (value) setSelectionFormat({ fontSize: value }); }} />
                      <Button size="sm" variant="outline" onClick={() => {
                        const key = selectedCell ? `${selectedCell.rowId}:${selectedCell.col}` : "";
                        const current = selectedCell ? layout.cellStyles[key]?.bold : selectedColumn !== null ? layout.columnStyles[selectedColumn]?.bold : layout.bold;
                        setSelectionFormat({ bold: !current });
                      }}>B</Button>
                      <Button size="sm" variant="ghost" onClick={() => { setSelectedCell(null); setSelectedColumn(null); }}>{lang === "ar" ? "إلغاء التحديد" : "Clear"}</Button>
                    </div>
                  </div>
                  <div className="mt-3 flex justify-between gap-2">
                    <Button size="sm" variant="ghost" onClick={() => setLayout(DEFAULT_LAYOUT)}>{lang === "ar" ? "إعادة ضبط" : "Reset"}</Button>
                    <Button size="sm" onClick={() => { setShowLayout(false); toast.success(lang === "ar" ? "تم حفظ التنسيق" : "Layout saved"); }}>{lang === "ar" ? "حفظ" : "Save"}</Button>
                  </div>
                </div>
              )}
            </div>
            <Button size="sm" onClick={() => exportPDF()} className="bg-sky-600 text-white hover:bg-sky-700"><FileDown className="mr-1 h-4 w-4" /> {t.pdf}</Button>
            <Button size="sm" onClick={() => exportPPTX()} className="bg-orange-500 text-white hover:bg-orange-600"><Presentation className="mr-1 h-4 w-4" /> {t.pptx}</Button>
            <Button size="sm" onClick={exportExcel} className="bg-emerald-700 text-white hover:bg-emerald-800"><Sheet className="mr-1 h-4 w-4" /> Excel</Button>
            <Button size="sm" variant="outline" onClick={() => setShowInvoice(true)}><FileText className="mr-1 h-4 w-4" /> {t.createInvoice}</Button>
            <Button size="sm" onClick={createProforma} className="bg-purple-600 text-white hover:bg-purple-700"><FilePlus className="mr-1 h-4 w-4" /> {t.newInvoice}</Button>
            <Button size="sm" onClick={addRow} className="text-white hover:opacity-90" style={{ background: accent }}><Plus className="mr-1 h-4 w-4" /> {t.addItem}</Button>
            <Button size="sm" variant="outline" onClick={() => setShowLibrary(true)}><Library className="mr-1 h-4 w-4" /> {t.library}</Button>
            <Button size="sm" variant="outline" onClick={() => setShowCompany(true)}>{lang === "ar" ? "بيانات الشركة" : "Company"}</Button>
            <div className="relative">
              <Button size="sm" variant="outline" onClick={() => setShowThemes((v) => !v)}><Palette className="mr-1 h-4 w-4" /> {t.theme}</Button>
              {showThemes && (
                <div className="absolute end-0 z-30 mt-2 w-56 rounded-md border bg-white p-3 shadow-lg">
                  <div className="mb-2 grid grid-cols-3 gap-2">
                    {THEME_PRESETS.map((tp) => (
                      <button key={tp.color} onClick={() => { setThemeColor(tp.color); setShowThemes(false); }} className="h-9 rounded-md border transition hover:scale-105" style={{ background: `#${tp.color}` }} title={tp.name} />
                    ))}
                  </div>
                  <input type="color" value={`#${themeColor}`} onChange={(e) => setThemeColor(e.target.value)} className="h-9 w-full cursor-pointer rounded-md border" />
                </div>
              )}
            </div>
            <Button size="sm" variant="outline" onClick={onLogout} title="Logout"><LogOut className="h-4 w-4" /></Button>
          </div>
        </div>
        <div className="mx-auto flex max-w-[1400px] items-center gap-2 overflow-x-auto px-4 pb-3">
          {proformas.map((p) => {
            const isActive = p.id === active.id;
            return (
              <div key={p.id} className={`flex shrink-0 items-center gap-1 rounded-md px-3 py-1.5 text-sm transition ${isActive ? "text-white shadow" : "border bg-white hover:bg-muted"}`} style={isActive ? { background: accent } : undefined}>
                <button onClick={() => setActiveId(p.id)} className="font-medium">{p.name} ({p.rows.length})</button>
                <button onClick={() => togglePrimary(p.id)} className="ms-1" title={lang === "ar" ? "بروفورما أساسية (مصدر مكتبة المنتجات)" : "Primary (Library source)"}>
                  <Star className={`h-3.5 w-3.5 ${p.isPrimary ? "fill-yellow-400 text-yellow-400" : "opacity-50"}`} />
                </button>
                <button onClick={() => renameProforma(p.id)} className="ms-1 text-[10px] opacity-70 hover:opacity-100" title={t.rename}>✎</button>
                <button onClick={() => deleteProforma(p.id)} className="ms-0.5 opacity-60 hover:text-red-200" title={t.delete}><Trash2 className="h-3.5 w-3.5" /></button>
              </div>
            );
          })}
        </div>
      </header>

      {/* SHEET */}
      <main className="overflow-x-auto px-4 py-6 print:p-0">
        <div id="printable" className="mx-auto flex w-fit flex-col gap-6 print:gap-0" style={{ zoom: `${layout.zoom}%` }}>
          {pageRows.map((page, pageIndex) => (
          <section key={pageIndex} className="proforma-page relative flex h-[794px] w-[1123px] shrink-0 flex-col overflow-hidden bg-white shadow-lg print:shadow-none">
          {/* Banner */}
          <div className="relative flex items-center justify-between px-6 py-3" style={{ background: accent }}>
            <button type="button" onClick={() => logoRef.current?.click()} className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-md bg-white text-[10px] font-bold uppercase leading-tight shadow" style={{ color: accent }} title="Upload logo">
              {meta.logo ? <img src={meta.logo} crossOrigin="anonymous" alt="logo" className="h-full w-full object-contain p-1" /> : <span className="px-1 text-center">{meta.company.split(" ").slice(0,2).join(" ")}</span>}
            </button>
            <input ref={logoRef} type="file" accept="image/*" className="hidden" onChange={(e) => onLogo(e.target.files?.[0] ?? null)} />
            <h2 className="text-5xl font-extrabold lowercase tracking-tight text-white">{t.proforma}</h2>
          </div>
          {/* Customer / Date */}
          <div className="grid grid-cols-2 gap-8 border-b px-6 pt-5 pb-3">
            <div>
              <div className="text-[11px] tracking-wider text-muted-foreground">{t.customer}</div>
              <Input value={meta.customer} onChange={(e) => setMeta({ ...meta, customer: e.target.value })} className="meta-input mt-1 h-9 rounded-md border border-input bg-white px-2 text-base font-bold shadow-sm focus-visible:ring-2 print:border-b-2 print:border-l-0 print:border-r-0 print:border-t-0 print:rounded-none print:shadow-none print:px-0" style={{ borderColor: accent }} placeholder={t.customer} />
              <div className="meta-text hidden mt-1 px-2 text-base font-bold leading-9" style={{ color: "#111" }}>{meta.customer || "\u00A0"}</div>
            </div>
            <div className="text-end">
              <div className="text-[11px] tracking-wider text-muted-foreground">{t.date}</div>
              <Input type="date" value={meta.date} onChange={(e) => setMeta({ ...meta, date: e.target.value })} className="meta-input mt-1 h-9 rounded-md border border-input bg-white px-2 text-end text-base font-bold shadow-sm focus-visible:ring-2 print:border-b-2 print:border-l-0 print:border-r-0 print:border-t-0 print:rounded-none print:shadow-none print:px-0" style={{ borderColor: accent }} />
              <div className="meta-text hidden mt-1 px-2 text-end text-base font-bold leading-9" style={{ color: "#111" }}>{fmtDate(meta.date) || "\u00A0"}</div>
            </div>
          </div>
          {/* TABLE */}
          <div className="min-h-0 flex-1 overflow-hidden">
            <table className="w-full border-collapse" dir="ltr"
              style={{ tableLayout: "fixed", fontSize: `${layout.fontSize}px`, fontWeight: layout.bold ? 700 : undefined }}>
              <colgroup>
                {layout.widths.map((w, i) => (
                  <col key={i} style={{ width: `${(w / layout.widths.reduce((a, b) => a + b, 0)) * 100}%` }} />
                ))}
                <col className="actions-col" style={{ width: "70px" }} />
              </colgroup>
              <thead>
                <tr style={{ background: `${accent}15`, color: accent }}>
                  {t.cols.map((h, ci) => {
                    // 0=No, 1=Item Name (left), 2=Description (left), rest centered
                    const align = ci === 1 || ci === 2 ? "text-left" : "text-center";
                    const parts = h.includes("/") ? h.split("/") : null;
                    return (
                      <th key={h} onClick={() => { if (ci < 15) { setSelectedColumn(ci); setSelectedCell(null); } }} className={`relative px-1 py-2.5 text-xs font-semibold uppercase leading-tight ${align} ${selectedColumn === ci ? "ring-2 ring-inset ring-foreground/40" : ""}`}>
                        {parts ? (
                          <span className="block">
                            <span className="block whitespace-nowrap">{parts[0]}/</span>
                            <span className="block whitespace-nowrap">{parts.slice(1).join("/")}</span>
                          </span>
                        ) : h}
                        {ci < 15 && <span className="column-resizer absolute -right-1 top-0 z-10 h-full w-2 cursor-col-resize" onPointerDown={(event) => {
                          event.preventDefault(); let last = event.clientX;
                          const move = (e: PointerEvent) => { changeColumnWidth(ci, e.clientX - last); last = e.clientX; };
                          const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
                          window.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
                        }} />}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {page.map((r) => {
                  const i = rows.findIndex((item) => item.id === r.id);
                  return <RowEditor key={r.id} index={i+1} row={r} accent={accent} lang={lang} lockCW={lockCW}
                    height={layout.rowHeights[r.id] ?? 112} columnStyles={layout.columnStyles} cellStyles={layout.cellStyles}
                    selectedCell={selectedCell} onSelectCell={(col) => { setSelectedCell({ rowId: r.id, col }); setSelectedColumn(null); }}
                    onHeightChange={(height) => setRowHeight(r.id, height)}
                    onChange={(p) => updateRow(r.id, p)}
                    onImage={(f) => onImage(r.id, f, "image")}
                    onPacking={(f) => onImage(r.id, f, "packing")}
                    onDuplicate={() => duplicateRow(r.id)}
                    onRemove={() => removeRow(r.id)}
                    onSend={() => setSendItem(r)}
                  />;
                })}
              </tbody>
            </table>
          </div>
          {/* Notes + Totals */}
          {pageIndex === pageRows.length - 1 && <><div className="px-6 pt-2"><div className="text-end text-[13px] font-semibold">• {meta.notes}</div></div>
          <div className="totals-row flex justify-end gap-2 px-6 py-2">
            {[
              { l: t.totals.ctn, v: String(totals.tCtn) },
              { l: t.totals.cbm, v: totals.tCBM.toFixed(2) },
              { l: t.totals.weight, v: totals.tWt.toFixed(2) },
              { l: t.totals.amount, v: String(totals.tAmount) },
              ...(invoiceTransport !== null ? [
                { l: "Transport", v: String(invoiceTransport) },
                { l: "Total", v: String(+(totals.tAmount + invoiceTransport).toFixed(2)) },
              ] : []),
            ].map((c) => (
              <div key={c.l} className="min-w-[130px] overflow-hidden rounded-md border" style={{ borderColor: accent }}>
                <div className="px-2 py-1 text-center text-[10px] font-bold uppercase text-white" style={{ background: accent }}>{c.l}</div>
                <div className="px-2 py-1.5 text-center text-lg font-bold">{c.v}</div>
              </div>
            ))}
          </div></>}
          {/* Footer */}
          <div className="footer-block px-6 py-3 text-center text-white" style={{ background: accent }}>
            <Input value={meta.address} onChange={(e) => setMeta({ ...meta, address: e.target.value })} className="footer-input mx-auto h-7 max-w-3xl border-0 bg-transparent text-center text-[12px] font-medium text-white placeholder:text-white/70 shadow-none focus-visible:ring-0" />
            <div className="footer-text hidden text-[12px] font-medium leading-5">{meta.address || "\u00A0"}</div>
            <Input value={meta.phone} onChange={(e) => setMeta({ ...meta, phone: e.target.value })} className="footer-input mx-auto h-7 max-w-md border-0 bg-transparent text-center text-[11px] text-white shadow-none focus-visible:ring-0" />
            <div className="footer-text hidden text-[11px] leading-5">{meta.phone || "\u00A0"}</div>
            <Input value={meta.email} onChange={(e) => setMeta({ ...meta, email: e.target.value })} className="footer-input mx-auto h-7 max-w-xl border-0 bg-transparent text-center text-[11px] text-white shadow-none focus-visible:ring-0" />
            <div className="footer-text hidden text-[11px] leading-5">{meta.email || "\u00A0"}</div>
          </div>
          <div className="absolute bottom-1 end-2 text-[9px] text-white/80">{pageIndex + 1} / {pageRows.length}</div>
          </section>
          ))}
        </div>
        <p className="mt-4 text-center text-xs text-muted-foreground print:hidden">{t.arabicTip}</p>
      </main>

      {showLibrary && <LibraryModal items={library} accent={accent} lang={lang} onPick={(r) => { copyFromLibrary(r); }} onClose={() => setShowLibrary(false)} />}
      {showInvoice && <InvoiceModal accent={accent} lang={lang}
        onCancel={() => setShowInvoice(false)}
        onPdf={async (transport) => { setShowInvoice(false); await exportPDF(true, transport); }}
        onPptx={async (transport) => { setShowInvoice(false); await exportPPTX(true, transport); }} />}
      {sendItem && (
        <SendToModal
          item={sendItem} accent={accent} lang={lang}
          targets={proformas.filter((p) => p.id !== active.id)}
          onCancel={() => setSendItem(null)}
          onSend={async (ids) => { await sendRowToProformas(sendItem, ids); setSendItem(null); }}
        />
      )}

      {/* PRINT CSS */}
      <style>{`
        @page { size: A4 landscape; margin: 6mm; }
        /* Client-only Actions are never included in exported files */
        #printable.export-capture .actions-col { display: none !important; }
        /* When capturing for PDF, swap inputs -> plain text, drop borders */
        #printable.export-capture { zoom: 100% !important; gap: 0 !important; }
        #printable.export-capture .proforma-page { box-shadow: none !important; }
        #printable.export-capture .cell-input { display: none !important; }
        #printable.export-capture .cell-text { display: block !important; }
        #printable.export-capture .img-cell-btn { border-color: transparent !important; background: transparent !important; }
        #printable.export-capture input { border: none !important; background: transparent !important; box-shadow: none !important; }
        #printable.export-capture td { word-break: break-word; white-space: normal !important; vertical-align: middle !important; padding: 4px 3px !important; }
        #printable.export-capture th { white-space: normal !important; padding: 6px 2px !important; font-size: 10px !important; line-height: 1.1 !important; }
        /* Narrow numeric columns: Ctn, Doz/Ctn, Set/Ctn, Pcs/Set, Price/Set */
        #printable.export-capture th:nth-child(6), #printable.export-capture td:nth-child(6) { width: 52px !important; max-width: 52px !important; }
        #printable.export-capture th:nth-child(7), #printable.export-capture td:nth-child(7),
        #printable.export-capture th:nth-child(8), #printable.export-capture td:nth-child(8),
        #printable.export-capture th:nth-child(9), #printable.export-capture td:nth-child(9),
        #printable.export-capture th:nth-child(10), #printable.export-capture td:nth-child(10) { width: 58px !important; max-width: 58px !important; }
        /* T.Amount slightly smaller */
        #printable.export-capture th:nth-child(11) { font-size: 9px !important; }
        #printable.export-capture th:nth-child(11), #printable.export-capture td:nth-child(11) { width: 78px !important; max-width: 78px !important; }
        /* CBM / T.CBM / Weight / T.Weight — only as wide as the text */
        #printable.export-capture th:nth-child(12), #printable.export-capture td:nth-child(12),
        #printable.export-capture th:nth-child(13), #printable.export-capture td:nth-child(13),
        #printable.export-capture th:nth-child(14), #printable.export-capture td:nth-child(14),
        #printable.export-capture th:nth-child(15), #printable.export-capture td:nth-child(15) { width: 54px !important; max-width: 54px !important; font-size: 9px !important; }
        /* Numbers: bold + slightly larger so the exported file reads clearly */
        #printable.export-capture td:nth-child(n+6) .cell-text,
        #printable.export-capture td:nth-child(n+6) { font-weight: 700 !important; font-size: 11px !important; }
        #printable.export-capture td:nth-child(2) { font-weight: 600 !important; }
        /* Images: keep the adjusted framing, just bigger */
        #printable.export-capture .img-cell-btn { width: 120px !important; height: 120px !important; }
        #printable.export-capture .img-cell-btn img { width: 100% !important; height: 100% !important; object-fit: contain !important; }
        /* Cap Item Name / Description so they don't dominate */
        #printable.export-capture th:nth-child(2), #printable.export-capture td:nth-child(2) { max-width: 180px !important; width: 180px !important; }
        #printable.export-capture th:nth-child(3), #printable.export-capture td:nth-child(3) { max-width: 220px !important; width: 220px !important; }
        #printable.export-capture .cell-text { font-size: 11px !important; line-height: 1.25 !important; }
        #printable.export-capture .img-cell-btn { width: 120px !important; height: 120px !important; }
        #printable.export-capture .img-cell-btn img { object-fit: contain !important; }
        #printable.export-capture .meta-input { display: none !important; }
        #printable.export-capture .meta-text { display: block !important; }
        #printable.export-capture .footer-input { display: none !important; }
        #printable.export-capture .footer-text { display: block !important; color: #ffffff !important; }
        #printable.export-capture.invoice-capture th:nth-child(n+12),
        #printable.export-capture.invoice-capture td:nth-child(n+12) { display: none !important; }
        #printable.export-capture.invoice-capture table { table-layout: fixed !important; }
        #printable.export-capture.invoice-capture th:nth-child(1), #printable.export-capture.invoice-capture td:nth-child(1) { width: 55px !important; }
        #printable.export-capture.invoice-capture th:nth-child(2), #printable.export-capture.invoice-capture td:nth-child(2) { width: 170px !important; max-width: 170px !important; }
        #printable.export-capture.invoice-capture th:nth-child(3), #printable.export-capture.invoice-capture td:nth-child(3) { width: 220px !important; max-width: 220px !important; }
        #printable.export-capture.invoice-capture th:nth-child(4), #printable.export-capture.invoice-capture td:nth-child(4),
        #printable.export-capture.invoice-capture th:nth-child(5), #printable.export-capture.invoice-capture td:nth-child(5) { width: 135px !important; }
        #printable.export-capture.invoice-capture th:nth-child(6), #printable.export-capture.invoice-capture td:nth-child(6) { width: 80px !important; }
        #printable.export-capture.invoice-capture th:nth-child(7), #printable.export-capture.invoice-capture td:nth-child(7),
        #printable.export-capture.invoice-capture th:nth-child(8), #printable.export-capture.invoice-capture td:nth-child(8),
        #printable.export-capture.invoice-capture th:nth-child(9), #printable.export-capture.invoice-capture td:nth-child(9) { width: 95px !important; }
        #printable.export-capture.invoice-capture th:nth-child(10), #printable.export-capture.invoice-capture td:nth-child(10),
        #printable.export-capture.invoice-capture th:nth-child(11), #printable.export-capture.invoice-capture td:nth-child(11) { width: 120px !important; }
        #printable.export-capture.invoice-capture .totals-row > div:nth-child(2),
        #printable.export-capture.invoice-capture .totals-row > div:nth-child(3) { display: none !important; }
        input[type="number"]::-webkit-outer-spin-button,
        input[type="number"]::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
        input[type="number"] { -moz-appearance: textfield; }
        @media print {
          html, body { background: white !important; }
          body { margin: 0 !important; }
          .print\\:hidden { display: none !important; }
          #printable { box-shadow: none !important; border-radius: 0 !important; }
          #printable .overflow-x-auto { overflow: visible !important; }
          #printable table { width: 100% !important; table-layout: auto !important; }
          #printable table { min-width: 0 !important; }
          #printable td, #printable th { white-space: normal !important; word-break: break-word; vertical-align: middle; }
          #printable .img-cell-btn { border-color: transparent !important; background: transparent !important; }
          #printable .actions-col { display: none !important; }
          #printable input { border: none !important; background: transparent !important; padding: 0 !important; box-shadow: none !important; }
          #printable .footer-input { display: none !important; }
          #printable .footer-text { display: block !important; color: #ffffff !important; }
          #printable, #printable * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            color-adjust: exact !important;
          }
          /* hide scrollbars */
          ::-webkit-scrollbar { display: none !important; }
        }
      `}</style>

      {/* DYNAMIC LAYOUT CSS */}
      <style>{(() => {
        const total = layout.widths.reduce((a, b) => a + b, 0) || 1;
        const px = layout.widths.map((w) => Math.round((w / total) * 1053));
        const fs = layout.fontSize;
        const bold = layout.bold ? 700 : 500;
        const cols = px.map((w, i) => `#printable.export-capture th:nth-child(${i + 1}), #printable.export-capture td:nth-child(${i + 1}) { width: ${w}px !important; max-width: ${w}px !important; }
        @media print { #printable th:nth-child(${i + 1}), #printable td:nth-child(${i + 1}) { width: ${(w / 1053 * 100).toFixed(2)}% !important; max-width: none !important; } }`).join("\n");
        return `
        #printable.export-capture table { table-layout: fixed !important; }
        #printable.export-capture td, #printable.export-capture td .cell-text { font-size: ${fs}px !important; font-weight: ${bold} !important; }
        #printable.export-capture th { font-size: ${Math.max(7, fs - 2)}px !important; }
        #printable.export-capture td:nth-child(n+6), #printable.export-capture td:nth-child(n+6) .cell-text { font-weight: 700 !important; font-size: ${fs}px !important; }
        ${cols}
        @media print {
          #printable table { table-layout: fixed !important; }
          #printable td, #printable td .cell-text, #printable td input { font-size: ${fs}px !important; font-weight: ${bold} !important; }
          #printable th { font-size: ${Math.max(7, fs - 2)}px !important; }
          #printable td:nth-child(n+6), #printable td:nth-child(n+6) .cell-text, #printable td:nth-child(n+6) input { font-weight: 700 !important; }
        }
        `;
      })()}</style>

      {showCompany && (
        <CompanyModal meta={meta} accent={accent} lang={lang}
          onSave={(m) => { setMeta(m); setShowCompany(false); toast.success(lang === "ar" ? "تم الحفظ" : "Saved"); }}
          onCancel={() => setShowCompany(false)} />
      )}
    </div>
  );
}

/* ───────────────────────────  PIECES  ─────────────────────────── */

function CellInput({ value, onChange, type = "text", align = "center", readOnly = false }: { value: string; onChange: (v: string) => void; type?: string; align?: "left"|"center"|"right"; readOnly?: boolean }) {
  const inputType = type === "number" ? "text" : type;
  return (
    <>
      <input
        type={inputType}
        inputMode={type === "number" ? "decimal" : undefined}
        value={value}
        readOnly={readOnly}
        onChange={(e) => onChange(e.target.value)}
        className={`cell-input w-full rounded border border-input px-1.5 py-1 text-[12px] outline-none transition focus:border-foreground focus:ring-1 focus:ring-foreground/20 print:hidden ${readOnly ? "cursor-not-allowed bg-muted/50 text-muted-foreground" : "bg-white"}`}
        style={{ textAlign: align }}
      />
      <div
        className="cell-text hidden whitespace-pre-wrap break-words px-1 py-1 text-[12px] leading-tight print:block"
        style={{ textAlign: align }}
      >
        {value || "\u00A0"}
      </div>
    </>
  );
}
function ImgCell({ src, onPick, icon }: { src: string; onPick: (f: File | null) => void; icon: "img"|"pkg" }) {
  const ref = useRef<HTMLInputElement>(null);
  const [editSrc, setEditSrc] = useState<string | null>(null);
  return (
    <>
      <button type="button" onClick={() => (src ? setEditSrc(src) : ref.current?.click())} className={`img-cell-btn mx-auto flex h-24 w-24 items-center justify-center overflow-hidden rounded border ${src ? "" : "border-dashed bg-muted/30"} hover:border-foreground`}>
        {src ? <img src={src} crossOrigin="anonymous" alt="" className="h-full w-full object-contain" /> : icon === "img" ? <ImageIcon className="h-4 w-4 text-muted-foreground" /> : <Package className="h-4 w-4 text-muted-foreground" />}
      </button>
      <input
        ref={ref}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (!f) return;
          setEditSrc(await fileToDataURL(f));
        }}
      />
      {editSrc && (
        <ImageAdjuster
          src={editSrc}
          onPickFile={() => ref.current?.click()}
          onCancel={() => setEditSrc(null)}
          onDone={(file) => { setEditSrc(null); onPick(file); }}
        />
      )}
    </>
  );
}

function ImageAdjuster({ src, onDone, onCancel, onPickFile }: { src: string; onDone: (f: File) => void; onCancel: () => void; onPickFile: () => void }) {
  const BOX = 260;
  const OUT = 900;
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [scale, setScale] = useState(1);
  const [off, setOff] = useState({ x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);

  useEffect(() => {
    const i = new Image();
    i.crossOrigin = "anonymous";
    i.onload = () => { setImg(i); setScale(1); setOff({ x: 0, y: 0 }); };
    i.src = src;
  }, [src]);

  const base = img ? Math.min(BOX / img.width, BOX / img.height) : 1;
  const dw = img ? img.width * base * scale : 0;
  const dh = img ? img.height * base * scale : 0;

  const apply = () => {
    if (!img) return;
    const k = OUT / BOX;
    const c = document.createElement("canvas");
    c.width = OUT; c.height = OUT;
    const ctx = c.getContext("2d")!;
    ctx.imageSmoothingQuality = "high";
    ctx.fillStyle = "#FFF"; ctx.fillRect(0, 0, OUT, OUT);
    const w = dw * k, h = dh * k;
    ctx.drawImage(img, (OUT - w) / 2 + off.x * k, (OUT - h) / 2 + off.y * k, w, h);
    c.toBlob((b) => { if (b) onDone(new File([b], "image.jpg", { type: "image/jpeg" })); }, "image/jpeg", 0.85);
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4" onClick={onCancel}>
      <div className="w-full max-w-sm rounded-lg bg-background p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-2 text-sm font-semibold">تحكم في الصورة / Adjust image</div>
        <div
          className="relative mx-auto overflow-hidden rounded border bg-white"
          style={{ width: BOX, height: BOX, touchAction: "none", cursor: "grab" }}
          onPointerDown={(e) => { (e.target as HTMLElement).setPointerCapture(e.pointerId); drag.current = { x: e.clientX, y: e.clientY, ox: off.x, oy: off.y }; }}
          onPointerMove={(e) => { if (drag.current) setOff({ x: drag.current.ox + (e.clientX - drag.current.x), y: drag.current.oy + (e.clientY - drag.current.y) }); }}
          onPointerUp={() => { drag.current = null; }}
        >
          {img && (
            <img
              src={src}
              alt=""
              draggable={false}
              style={{ position: "absolute", left: (BOX - dw) / 2 + off.x, top: (BOX - dh) / 2 + off.y, width: dw, height: dh, maxWidth: "none" }}
            />
          )}
        </div>
        <div className="mt-3 flex items-center gap-2">
          <span className="text-xs text-muted-foreground">تكبير</span>
          <input type="range" min={0.3} max={3} step={0.01} value={scale} onChange={(e) => setScale(parseFloat(e.target.value))} className="flex-1" />
        </div>
        <div className="mt-3 flex flex-wrap justify-end gap-2">
          <Button size="sm" variant="ghost" onClick={() => { setScale(1); setOff({ x: 0, y: 0 }); }}>إعادة ضبط</Button>
          <Button size="sm" variant="outline" onClick={onPickFile}>تغيير الصورة</Button>
          <Button size="sm" variant="outline" onClick={onCancel}>إلغاء</Button>
          <Button size="sm" onClick={apply} disabled={!img}>حفظ</Button>
        </div>
      </div>
    </div>
  );
}
function RowEditor({ index, row, accent, lang, lockCW = false, height, columnStyles, cellStyles, selectedCell, onSelectCell, onHeightChange, onChange, onImage, onPacking, onDuplicate, onRemove, onSend }:
  { index: number; row: Row; accent: string; lang: Lang; lockCW?: boolean;
    height: number; columnStyles: TextFormat[]; cellStyles: Record<string, TextFormat>; selectedCell: { rowId: string; col: number } | null;
    onSelectCell: (col: number) => void; onHeightChange: (height: number) => void;
    onChange: (p: Partial<Row>) => void; onImage: (f: File | null) => void; onPacking: (f: File | null) => void;
    onDuplicate: () => void; onRemove: () => void; onSend: () => void; }) {
  const amt = amount(row); const tc = tCbm(row); const tw = tWeight(row);
  const tt = T[lang];
  const styleFor = (col: number): CSSProperties => {
    const style = { ...columnStyles[col], ...cellStyles[`${row.id}:${col}`] };
    return { fontSize: style.fontSize ? `${style.fontSize}px` : undefined, fontWeight: style.bold === true ? 700 : style.bold === false ? 400 : undefined };
  };
  const cellClass = (col: number) => selectedCell?.rowId === row.id && selectedCell.col === col ? "ring-2 ring-inset ring-foreground/40" : "";
  return (
    <tr className="relative border-b align-middle hover:bg-muted/20" style={{ height }}>
      <td onClick={() => onSelectCell(0)} className={`px-1 text-center text-xs font-semibold text-muted-foreground ${cellClass(0)}`} style={styleFor(0)}>{index}</td>
      <td onClick={() => onSelectCell(1)} className={`px-1 ${cellClass(1)}`} style={styleFor(1)}><CellInput value={row.itemName} onChange={(v) => onChange({ itemName: v })} align="left" /></td>
      <td onClick={() => onSelectCell(2)} className={`px-1 ${cellClass(2)}`} style={styleFor(2)}><CellInput value={row.description} onChange={(v) => onChange({ description: v })} align="left" /></td>
      <td onClick={() => onSelectCell(3)} className={`px-1 ${cellClass(3)}`} style={styleFor(3)}><ImgCell src={row.image} onPick={onImage} icon="img" /></td>
      <td onClick={() => onSelectCell(4)} className={`px-1 ${cellClass(4)}`} style={styleFor(4)}><ImgCell src={row.packing} onPick={onPacking} icon="pkg" /></td>
      <td onClick={() => onSelectCell(5)} className={`px-1 ${cellClass(5)}`} style={styleFor(5)}><CellInput value={row.ctn} onChange={(v) => onChange({ ctn: v })} type="number" /></td>
      <td onClick={() => onSelectCell(6)} className={`px-1 ${cellClass(6)}`} style={styleFor(6)}><CellInput value={row.dozCtn} onChange={(v) => onChange({ dozCtn: v })} /></td>
      <td onClick={() => onSelectCell(7)} className={`px-1 ${cellClass(7)}`} style={styleFor(7)}><CellInput value={row.setCtn} onChange={(v) => onChange({ setCtn: v })} /></td>
      <td onClick={() => onSelectCell(8)} className={`px-1 ${cellClass(8)}`} style={styleFor(8)}><CellInput value={row.pcsSet} onChange={(v) => onChange({ pcsSet: v })} /></td>
      <td onClick={() => onSelectCell(9)} className={`px-1 ${cellClass(9)}`} style={styleFor(9)}><CellInput value={row.pricePerCtn} onChange={(v) => onChange({ pricePerCtn: v })} type="number" /></td>
      <td onClick={() => onSelectCell(10)} className={`px-1 text-center font-bold ${cellClass(10)}`} style={{ ...styleFor(10), color: accent }}>{amt || ""}</td>
      <td onClick={() => onSelectCell(11)} className={`px-1 ${cellClass(11)}`} style={styleFor(11)}><CellInput value={row.cbm} onChange={(v) => onChange({ cbm: v })} type="number" readOnly={lockCW} /></td>
      <td onClick={() => onSelectCell(12)} className={`px-1 text-center font-semibold ${cellClass(12)}`} style={styleFor(12)}>{tc || ""}</td>
      <td onClick={() => onSelectCell(13)} className={`px-1 ${cellClass(13)}`} style={styleFor(13)}><CellInput value={row.weight} onChange={(v) => onChange({ weight: v })} type="number" readOnly={lockCW} /></td>
      <td onClick={() => onSelectCell(14)} className={`px-1 text-center font-semibold ${cellClass(14)}`} style={styleFor(14)}>{tw || ""}</td>
      <td className="actions-col px-1 print:hidden">
        <div className="flex justify-center gap-1">
          <button onClick={onSend} title={tt.sendTo} className="rounded p-1 hover:bg-muted" style={{ color: accent }}><Send className="h-3.5 w-3.5" /></button>
          <button onClick={onDuplicate} title={tt.duplicate} className="rounded p-1 hover:bg-muted"><Copy className="h-3.5 w-3.5" /></button>
          <button onClick={onRemove} title={tt.delete} className="rounded p-1 text-destructive hover:bg-destructive/10"><Trash2 className="h-3.5 w-3.5" /></button>
        </div>
        <span className="row-resizer absolute bottom-0 left-0 h-2 w-full cursor-row-resize" onPointerDown={(event) => {
          event.preventDefault(); const start = event.clientY; const initial = height;
          const move = (e: PointerEvent) => onHeightChange(initial + e.clientY - start);
          const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
          window.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
        }} />
      </td>
    </tr>
  );
}
function LibraryModal({ items, accent, lang, onPick, onClose }:
  { items: { row: Row; from: string }[]; accent: string; lang: Lang; onPick: (r: Row) => void; onClose: () => void; }) {
  const [q, setQ] = useState(""); const tt = T[lang];
  const filtered = items.filter((i) => !q || i.row.itemName.toLowerCase().includes(q.toLowerCase()) || i.from.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="max-h-[85vh] w-full max-w-4xl overflow-hidden rounded-lg bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b px-5 py-3" style={{ background: `${accent}15` }}>
          <h3 className="font-semibold">{tt.productLib} ({items.length})</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="h-5 w-5" /></button>
        </div>
        <div className="border-b p-3"><Input placeholder={tt.search} value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <div className="max-h-[60vh] overflow-y-auto p-4">
          {filtered.length === 0 ? <p className="py-10 text-center text-sm text-muted-foreground">{tt.noProducts}</p> : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
              {filtered.map((i, idx) => (
                <button key={idx} onClick={() => onPick(i.row)} className="group flex flex-col overflow-hidden rounded-lg border bg-white text-left transition hover:shadow-md">
                  <div className="flex aspect-square items-center justify-center bg-muted/40">
                    {i.row.image ? <img src={i.row.image} alt="" className="h-full w-full object-contain" /> : <ImageIcon className="h-8 w-8 text-muted-foreground" />}
                  </div>
                  <div className="p-2">
                    <div className="truncate text-sm font-medium">{i.row.itemName || "—"}</div>
                    <div className="truncate text-[11px] text-muted-foreground">{i.from} • {i.row.pricePerCtn || "0"}/ctn</div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="border-t px-5 py-3 text-xs text-muted-foreground">{tt.addFromLib}</div>
      </div>
    </div>
  );
}
function SendToModal({ item, targets, accent, lang, onCancel, onSend }:
  { item: Row; targets: Proforma[]; accent: string; lang: Lang; onCancel: () => void; onSend: (ids: string[]) => void; }) {
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const tt = T[lang];
  const toggle = (id: string) => setPicked((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onCancel}>
      <div className="w-full max-w-lg overflow-hidden rounded-lg bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b px-5 py-3" style={{ background: `${accent}15` }}>
          <div>
            <h3 className="font-semibold">{tt.sendTo}</h3>
            <p className="text-xs text-muted-foreground">{tt.pickTargets}</p>
          </div>
          <button onClick={onCancel} className="text-muted-foreground hover:text-foreground"><X className="h-5 w-5" /></button>
        </div>
        <div className="flex items-center gap-3 border-b p-4">
          <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded border bg-muted/30">
            {item.image ? <img src={item.image} alt="" className="h-full w-full object-contain" /> : <ImageIcon className="h-5 w-5 text-muted-foreground" />}
          </div>
          <div className="flex-1">
            <div className="font-medium">{item.itemName || "—"}</div>
            <div className="text-xs text-muted-foreground truncate">{item.description}</div>
          </div>
        </div>
        <div className="max-h-[50vh] overflow-y-auto p-3">
          {targets.length === 0 ? <p className="py-8 text-center text-sm text-muted-foreground">{lang === "ar" ? "مفيش بروفورمات تانية" : "No other proformas"}</p> :
            targets.map((p) => (
              <label key={p.id} className="flex cursor-pointer items-center gap-3 rounded p-2 hover:bg-muted/40">
                <input type="checkbox" checked={picked.has(p.id)} onChange={() => toggle(p.id)} className="h-4 w-4" style={{ accentColor: accent }} />
                <span className="flex-1 text-sm font-medium">{p.name}</span>
                <span className="text-xs text-muted-foreground">{p.rows.length} {lang === "ar" ? "منتج" : "items"}</span>
              </label>
            ))
          }
        </div>
        <div className="flex justify-end gap-2 border-t p-3">
          <Button variant="outline" size="sm" onClick={onCancel}>{tt.cancel}</Button>
          <Button size="sm" onClick={() => onSend([...picked])} disabled={picked.size === 0} style={{ background: accent }} className="text-white">
            <Send className="me-1 h-4 w-4" /> {tt.sendNow} ({picked.size})
          </Button>
        </div>
      </div>
    </div>
  );
}

function InvoiceModal({ accent, lang, onCancel, onPdf, onPptx }:
  { accent: string; lang: Lang; onCancel: () => void; onPdf: (transport: number) => void; onPptx: (transport: number) => void; }) {
  const [transport, setTransport] = useState<string>("");
  const value = Number(transport) || 0;
  const isAr = lang === "ar";
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onCancel}>
      <div className="w-full max-w-sm overflow-hidden rounded-lg bg-white shadow-2xl" onClick={(e) => e.stopPropagation()} dir={isAr ? "rtl" : "ltr"}>
        <div className="flex items-center justify-between border-b px-5 py-3" style={{ background: `${accent}15` }}>
          <div>
            <h3 className="font-semibold">Create Invoice</h3>
            <p className="text-xs text-muted-foreground">{isAr ? "التصدير لحد عمود T.Amount فقط" : "Exports columns up to T.Amount only"}</p>
          </div>
          <button onClick={onCancel} className="text-muted-foreground hover:text-foreground"><X className="h-5 w-5" /></button>
        </div>
        <div className="space-y-3 p-5">
          <div>
            <label className="text-xs font-medium text-muted-foreground">Transport</label>
            <Input
              type="number"
              inputMode="decimal"
              value={transport}
              onChange={(e) => setTransport(e.target.value)}
              placeholder="0"
              className="mt-1 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Button onClick={() => onPdf(value)} className="bg-sky-600 text-white hover:bg-sky-700"><FileDown className="me-1 h-4 w-4" /> PDF</Button>
            <Button onClick={() => onPptx(value)} className="bg-orange-500 text-white hover:bg-orange-600"><Presentation className="me-1 h-4 w-4" /> PowerPoint</Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function CompanyModal({ meta, accent, lang, onSave, onCancel }:
  { meta: Meta; accent: string; lang: Lang; onSave: (m: Meta) => void; onCancel: () => void; }) {
  const [m, setM] = useState<Meta>(meta);
  const fileRef = useRef<HTMLInputElement>(null);
  const isAr = lang === "ar";
  const L = isAr
    ? { title: "بيانات الشركة", company: "اسم الشركة", address: "العنوان", phone: "الهاتف", email: "الإيميل", notes: "ملاحظة الفاتورة", invoiceTitle: "عنوان الفاتورة", save: "حفظ", cancel: "إلغاء", logo: "اللوجو (يتحط تلقائيًا في أي بروفورما جديدة)", upload: "ارفع اللوجو", remove: "حذف" }
    : { title: "Company Info", company: "Company", address: "Address", phone: "Phone", email: "Email", notes: "Invoice Note", invoiceTitle: "Invoice Title", save: "Save", cancel: "Cancel", logo: "Logo (auto-applied to every new proforma)", upload: "Upload logo", remove: "Remove" };
  const pickLogo = async (f: File | null) => {
    if (!f) return;
    try {
      const url = await storeImage(f);
      setDefaultLogo(url);
      setM((prev) => ({ ...prev, logo: url }));
    } catch (e) { console.error(e); toast.error(isAr ? "فشل رفع الشعار" : "Logo upload failed"); }
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onCancel}>
      <div className="w-full max-w-lg overflow-hidden rounded-lg bg-white shadow-2xl" onClick={(e) => e.stopPropagation()} dir={isAr ? "rtl" : "ltr"}>
        <div className="flex items-center justify-between border-b px-5 py-3" style={{ background: `${accent}15` }}>
          <h3 className="font-semibold">{L.title}</h3>
          <button onClick={onCancel} className="text-muted-foreground hover:text-foreground"><X className="h-5 w-5" /></button>
        </div>
        <div className="space-y-3 p-5">
          <div>
            <label className="text-xs font-medium text-muted-foreground">{L.logo}</label>
            <div className="mt-1 flex items-center gap-3">
              <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-md border bg-white">
                {m.logo ? <img src={m.logo} alt="logo" className="h-full w-full object-contain p-1" /> : <span className="text-[10px] text-muted-foreground">LOGO</span>}
              </div>
              <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()}>{L.upload}</Button>
              {m.logo && <Button type="button" variant="ghost" size="sm" onClick={() => { setDefaultLogo(""); setM((p) => ({ ...p, logo: "" })); }}>{L.remove}</Button>}
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => pickLogo(e.target.files?.[0] ?? null)} />
            </div>
          </div>
          {([
            ["company", L.company], ["address", L.address], ["phone", L.phone],
            ["email", L.email], ["title", L.invoiceTitle], ["notes", L.notes],
          ] as const).map(([k, label]) => (
            <div key={k}>
              <label className="text-xs font-medium text-muted-foreground">{label}</label>
              <Input value={m[k]} onChange={(e) => setM({ ...m, [k]: e.target.value })} className="mt-1" />
            </div>
          ))}
        </div>
        <div className="flex justify-end gap-2 border-t p-3">
          <Button variant="outline" size="sm" onClick={onCancel}>{L.cancel}</Button>
          <Button size="sm" onClick={() => onSave(m)} style={{ background: accent }} className="text-white">{L.save}</Button>
        </div>
      </div>
    </div>
  );
}