import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Plus, Trash2, FileDown, Presentation, Copy, Library, FilePlus, Palette, X,
  Package, Printer, ImageIcon, Send, Save, Languages, LogOut, Star,
} from "lucide-react";
import { toast } from "sonner";
import jsPDF from "jspdf";
import PptxGenJS from "pptxgenjs";
import html2canvas from "html2canvas-pro";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "@tanstack/react-router";

type Row = {
  id: string; itemName: string; description: string; image: string; packing: string;
  ctn: string; dozCtn: string; setCtn: string; pcsSet: string; pricePerCtn: string;
  cbm: string; weight: string;
};
type Meta = {
  company: string; address: string; phone: string; email: string;
  customer: string; date: string; title: string; notes: string; logo: string;
};
type Proforma = {
  id: string; name: string; meta: Meta; rows: Row[]; themeColor: string; sortOrder: number; isPrimary?: boolean;
};
type Lang = "ar" | "en";

const LANG_KEY = "proforma-lang";

const T = {
  ar: {
    print: "طباعة", pdf: "PDF", pptx: "PowerPoint",
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
    print: "Print", pdf: "PDF", pptx: "PowerPoint",
    newInvoice: "New Invoice", addItem: "Add Item", library: "Library",
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
const defaultMeta = (): Meta => ({
  company: "KOUJAN COMPANY",
  address: "ARABIC REPUBLIC EGYPT , sadat city svi industrial zone , plot no 6098",
  phone: "00201272883314  -  002012​1265982",
  email: "sales@koujanegypt.com  /  info@koujanegypt.com",
  customer: "", date: new Date().toISOString().slice(0,10),
  title: "Proforma Invoice", notes: "Prices are E.X work", logo: "",
});
const THEME_PRESETS = [
  { name:"Emerald", color:"2BB39B" }, { name:"Navy", color:"1E3A8A" },
  { name:"Crimson", color:"B91C1C" }, { name:"Gold", color:"B8860B" },
  { name:"Charcoal", color:"1A1A1A" }, { name:"Teal", color:"0F766E" },
];
const newProforma = (name: string, sortOrder = 0): Proforma => ({
  id: crypto.randomUUID(), name, meta: defaultMeta(), rows: [newRow()],
  themeColor: "2BB39B", sortOrder,
});

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
      const MAX = 1200; let w = img.width, h = img.height;
      if (w > MAX || h > MAX) { const r = Math.min(MAX/w, MAX/h); w = Math.round(w*r); h = Math.round(h*r); }
      const c = document.createElement("canvas"); c.width = w; c.height = h;
      const ctx = c.getContext("2d")!; ctx.imageSmoothingQuality = "high";
      ctx.fillStyle = "#FFF"; ctx.fillRect(0,0,w,h); ctx.drawImage(img,0,0,w,h);
      resolve(c.toDataURL("image/jpeg", 0.88));
    };
    img.onerror = () => resolve(raw); img.src = raw;
  });
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
  const [saveState, setSaveState] = useState<"idle"|"saving"|"saved">("idle");
  const [lang, setLang] = useState<Lang>(() => (typeof window !== "undefined" && (localStorage.getItem(LANG_KEY) as Lang)) || "ar");
  const [sendItem, setSendItem] = useState<Row | null>(null);
  const logoRef = useRef<HTMLInputElement>(null);
  const dirtyIds = useRef<Set<string>>(new Set());
  const t = T[lang];

  /* ----- load ----- */
  const loadAll = useCallback(async () => {
    const { data, error } = await supabase.from("proformas").select("id, name, data, sort_order").order("sort_order").order("created_at");
    if (error) { console.error(error); return; }
    const list: Proforma[] = (data ?? []).map((r) => {
      const d = (r.data ?? {}) as Partial<Proforma>;
      return {
        id: r.id, name: r.name, sortOrder: r.sort_order,
        meta: { ...defaultMeta(), ...(d.meta ?? {}) },
        rows: (d.rows ?? [newRow()]).map((x) => ({ ...newRow(), ...x })),
        themeColor: d.themeColor ?? "2BB39B",
      };
    });
    setProformas(list);
  }, []);

  useEffect(() => {
    (async () => {
      await loadAll();
      setLoaded(true);
    })();
  }, [loadAll]);

  // ensure at least one + pick active
  useEffect(() => {
    if (!loaded) return;
    if (proformas.length === 0) {
      const p = newProforma(lang === "ar" ? "بروفورما 1" : "Proforma 1", 0);
      supabase.from("proformas").insert({ id: p.id, name: p.name, sort_order: 0, data: { meta: p.meta, rows: p.rows, themeColor: p.themeColor } }).then(loadAll);
      return;
    }
    if (!activeId || !proformas.find((p) => p.id === activeId)) setActiveId(proformas[0].id);
  }, [loaded, proformas, activeId, lang, loadAll]);

  useEffect(() => { try { localStorage.setItem(LANG_KEY, lang); } catch {} }, [lang]);

  const active = proformas.find((p) => p.id === activeId) ?? proformas[0];
  const meta = active?.meta ?? defaultMeta();
  const rows = active?.rows ?? [];
  const themeColor = active?.themeColor ?? "2BB39B";
  const accent = `#${themeColor}`;

  /* ----- save logic ----- */
  const flushSave = useCallback(async () => {
    if (dirtyIds.current.size === 0) return;
    const ids = [...dirtyIds.current]; dirtyIds.current.clear();
    setSaveState("saving");
    const targets = proformas.filter((p) => ids.includes(p.id));
    for (const p of targets) {
      const { error } = await supabase.from("proformas").upsert({
        id: p.id, name: p.name, sort_order: p.sortOrder,
        data: { meta: p.meta, rows: p.rows, themeColor: p.themeColor },
      });
      if (error) { console.error(error); toast.error("فشل الحفظ / Save failed"); setSaveState("idle"); return; }
    }
    setSaveState("saved");
    setTimeout(() => setSaveState((s) => (s === "saved" ? "idle" : s)), 1500);
  }, [proformas]);

  const markDirty = useCallback((id: string) => {
    dirtyIds.current.add(id);
    setSaveState((s) => (s === "saving" ? s : "idle"));
  }, []);

  const updateActive = (patch: Partial<Proforma>) => {
    if (!active) return;
    setProformas((ps) => ps.map((p) => (p.id === active.id ? { ...p, ...patch } : p)));
    markDirty(active.id);
  };
  const setMeta = (m: Meta) => updateActive({ meta: m });
  const setRows = (u: Row[] | ((rs: Row[]) => Row[])) =>
    updateActive({ rows: typeof u === "function" ? (u as (r: Row[]) => Row[])(rows) : u });
  const setThemeColor = (c: string) => updateActive({ themeColor: c.replace("#","") });

  /* ----- proforma management ----- */
  const createProforma = async () => {
    const p = newProforma(lang === "ar" ? `بروفورما ${proformas.length+1}` : `Proforma ${proformas.length+1}`, proformas.length);
    if (active) { p.meta = { ...active.meta, customer: "", date: new Date().toISOString().slice(0,10) }; p.themeColor = active.themeColor; }
    const { error } = await supabase.from("proformas").insert({ id: p.id, name: p.name, sort_order: p.sortOrder, data: { meta: p.meta, rows: p.rows, themeColor: p.themeColor } });
    if (error) { toast.error("فشل الإنشاء"); return; }
    setProformas((ps) => [...ps, p]); setActiveId(p.id);
    toast.success(lang === "ar" ? "تم الإنشاء" : "Created");
  };
  const deleteProforma = async (id: string) => {
    if (proformas.length === 1) { toast.error(lang === "ar" ? "ميصحش تحذف الوحيدة" : "Can't delete the only one"); return; }
    if (!confirm(lang === "ar" ? "تأكيد الحذف؟" : "Delete this proforma?")) return;
    await supabase.from("proformas").delete().eq("id", id);
    const next = proformas.filter((p) => p.id !== id);
    setProformas(next); if (activeId === id) setActiveId(next[0]?.id ?? "");
  };
  const renameProforma = (id: string) => {
    const cur = proformas.find((p) => p.id === id); if (!cur) return;
    const n = prompt(lang === "ar" ? "اسم البروفورما" : "Proforma name", cur.name);
    if (!n) return;
    setProformas((ps) => ps.map((p) => (p.id === id ? { ...p, name: n } : p)));
    markDirty(id);
  };

  const totals = useMemo(() => {
    const tCtn = rows.reduce((s, r) => s + num(r.ctn), 0);
    const tAmount = +rows.reduce((s, r) => s + amount(r), 0).toFixed(2);
    const tCBM = +rows.reduce((s, r) => s + tCbm(r), 0).toFixed(3);
    const tWt = +rows.reduce((s, r) => s + tWeight(r), 0).toFixed(2);
    return { tCtn, tAmount, tCBM, tWt };
  }, [rows]);

  const updateRow = (id: string, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const removeRow = (id: string) => setRows((rs) => rs.filter((r) => r.id !== id));
  const addRow = () => setRows((rs) => [...rs, newRow()]);
  const duplicateRow = (id: string) =>
    setRows((rs) => { const i = rs.findIndex((r) => r.id === id); if (i < 0) return rs;
      const out = [...rs]; out.splice(i+1, 0, { ...rs[i], id: crypto.randomUUID() }); return out; });

  const sendRowToProformas = async (row: Row, targetIds: string[]) => {
    if (targetIds.length === 0) return;
    setSaveState("saving");
    for (const tid of targetIds) {
      const cur = proformas.find((p) => p.id === tid); if (!cur) continue;
      const updatedRows = [...cur.rows, { ...row, id: crypto.randomUUID() }];
      const { error } = await supabase.from("proformas").update({
        data: { meta: cur.meta, rows: updatedRows, themeColor: cur.themeColor }
      }).eq("id", tid);
      if (error) { console.error(error); toast.error("فشل الإرسال"); setSaveState("idle"); return; }
      setProformas((ps) => ps.map((p) => (p.id === tid ? { ...p, rows: updatedRows } : p)));
    }
    setSaveState("saved"); setTimeout(() => setSaveState("idle"), 1500);
    toast.success(lang === "ar" ? `تم الإرسال إلى ${targetIds.length} بروفورما` : `Sent to ${targetIds.length} proforma(s)`);
  };

  const library = useMemo(() => {
    const seen = new Set<string>(); const items: { row: Row; from: string }[] = [];
    proformas.forEach((p) => p.rows.forEach((r) => {
      if (!r.itemName && !r.image) return;
      const key = `${r.itemName}|${r.image.slice(0, 60)}`;
      if (seen.has(key)) return; seen.add(key); items.push({ row: r, from: p.name });
    }));
    return items;
  }, [proformas]);

  const copyFromLibrary = (r: Row) => { setRows((rs) => [...rs, { ...r, id: crypto.randomUUID() }]); toast.success(lang === "ar" ? "تمت الإضافة" : "Added"); };

  const onImage = async (id: string, f: File | null, field: "image" | "packing") => {
    if (!f) return;
    if (f.size > 10 * 1024 * 1024) return toast.error("الصورة كبيرة (>10MB)");
    const url = await processImage(f); updateRow(id, { [field]: url } as Partial<Row>);
  };
  const onLogo = async (f: File | null) => { if (!f) return; const url = await processImage(f); setMeta({ ...meta, logo: url }); };

  const fmtDate = (d: string) => { if (!d) return ""; const [y,m,da] = d.split("-"); return `${da}/${m}/${y}`; };

  /* ───── PDF — capture #printable so Arabic & alignment match exactly ───── */
  const exportPDF = async () => {
    const el = document.getElementById("printable");
    if (!el) return;
    toast.message(lang === "ar" ? "بنحضّر الملف…" : "Preparing PDF…");
    // Hide action column during capture
    el.classList.add("pdf-capture");
    try {
      const canvas = await html2canvas(el, {
        scale: 2, useCORS: true, backgroundColor: "#ffffff", logging: false,
      });
      const imgData = canvas.toDataURL("image/jpeg", 0.95);
      const pdf = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const margin = 18;
      const imgW = pageW - margin * 2;
      const imgH = (canvas.height * imgW) / canvas.width;
      if (imgH <= pageH - margin * 2) {
        pdf.addImage(imgData, "JPEG", margin, margin, imgW, imgH, undefined, "FAST");
      } else {
        // Multi-page slicing
        const pageContentH = pageH - margin * 2;
        const pxPerPt = canvas.width / imgW;
        const sliceHeightPx = pageContentH * pxPerPt;
        let renderedPx = 0;
        while (renderedPx < canvas.height) {
          const sliceCanvas = document.createElement("canvas");
          sliceCanvas.width = canvas.width;
          sliceCanvas.height = Math.min(sliceHeightPx, canvas.height - renderedPx);
          const ctx = sliceCanvas.getContext("2d")!;
          ctx.fillStyle = "#fff";
          ctx.fillRect(0, 0, sliceCanvas.width, sliceCanvas.height);
          ctx.drawImage(canvas, 0, renderedPx, canvas.width, sliceCanvas.height, 0, 0, canvas.width, sliceCanvas.height);
          const sliceData = sliceCanvas.toDataURL("image/jpeg", 0.95);
          const sliceImgH = (sliceCanvas.height * imgW) / sliceCanvas.width;
          if (renderedPx > 0) pdf.addPage("a4", "landscape");
          pdf.addImage(sliceData, "JPEG", margin, margin, imgW, sliceImgH, undefined, "FAST");
          renderedPx += sliceCanvas.height;
        }
      }
      pdf.save(`${meta.title || "proforma"}-${meta.customer || "customer"}.pdf`);
      toast.success("PDF ✓");
    } catch (e) {
      console.error(e);
      toast.error(lang === "ar" ? "فشل التصدير" : "Export failed");
    } finally {
      el.classList.remove("pdf-capture");
    }
  };

  const exportPPTX = async () => {
    const pptx = new PptxGenJS(); pptx.layout = "LAYOUT_WIDE"; pptx.title = meta.title;
    const ac = themeColor; const perSlide = 7;
    const pages = Math.max(1, Math.ceil(rows.length / perSlide));
    for (let p = 0; p < pages; p++) {
      const s = pptx.addSlide(); s.background = { color: "FFFFFF" };
      s.addShape("roundRect", { x: 0.3, y: 0.25, w: 12.73, h: 1.2, fill: { color: ac }, line: { color: ac }, rectRadius: 0.08 });
      s.addShape("roundRect", { x: 0.45, y: 0.4, w: 0.9, h: 0.9, fill: { color: "FFFFFF" }, line: { color: "FFFFFF" }, rectRadius: 0.05 });
      if (meta.logo) { try { s.addImage({ data: meta.logo, x: 0.5, y: 0.45, w: 0.8, h: 0.8 }); } catch {} }
      s.addText("proforma", { x: 8, y: 0.55, w: 4.6, h: 0.8, fontSize: 40, bold: true, color: "FFFFFF", align: "right" });
      s.addText("CUSTOMER", { x: 0.4, y: 1.55, w: 3, h: 0.2, fontSize: 8, color: "888888" });
      s.addText("DATE", { x: 9.6, y: 1.55, w: 3, h: 0.2, fontSize: 8, color: "888888", align: "right" });
      s.addText(meta.customer || "—", { x: 0.4, y: 1.72, w: 6, h: 0.3, fontSize: 14, bold: true, color: "222222" });
      s.addText(fmtDate(meta.date), { x: 7, y: 1.72, w: 5.6, h: 0.3, fontSize: 14, bold: true, color: "222222", align: "right" });
      const colW = [0.35,1.1,1.4,0.9,0.9,0.55,0.65,0.65,0.6,0.8,0.85,0.55,0.65,0.6,0.7];
      const head = ["No","Item Name","Description","Image","Packing","Ctn","Doz/Ctn","Set/Ctn","Pcs/Set","Price/Ctn","T.Amount","CBM","T.CBM","Weight","T.Weight"];
      const headerRow = head.map((h) => ({ text: h, options: { bold: true, color: "FFFFFF", fill: { color: ac }, align: "center", valign: "middle", fontSize: 9 } }));
      const slice = rows.slice(p*perSlide, (p+1)*perSlide);
      const tr: PptxGenJS.TableRow[] = [headerRow as unknown as PptxGenJS.TableRow];
      slice.forEach((r, idx) => {
        const gi = p*perSlide + idx + 1;
        tr.push([
          { text: String(gi), options: { align: "center", valign: "middle" } },
          { text: r.itemName, options: { valign: "middle" } },
          { text: r.description, options: { valign: "middle" } },
          { text: "" }, { text: "" },
          { text: r.ctn, options: { align: "center" } }, { text: r.dozCtn, options: { align: "center" } },
          { text: r.setCtn, options: { align: "center" } }, { text: r.pcsSet, options: { align: "center" } },
          { text: r.pricePerCtn, options: { align: "center" } },
          { text: String(amount(r) || ""), options: { align: "center", bold: true } },
          { text: r.cbm, options: { align: "center" } }, { text: String(tCbm(r) || ""), options: { align: "center" } },
          { text: r.weight, options: { align: "center" } }, { text: String(tWeight(r) || ""), options: { align: "center" } },
        ] as unknown as PptxGenJS.TableRow);
      });
      const tY = 2.25; const rowH = 0.7;
      s.addTable(tr, { x: 0.3, y: tY, w: 12.73, rowH, fontSize: 8.5, border: { type: "solid", pt: 0.5, color: "E5E7EB" }, valign: "middle", colW });
      const overlay = (oc: number, src: string, ri: number) => {
        if (!src) return; let x = 0.3; for (let i = 0; i < oc; i++) x += colW[i];
        const cw = colW[oc]; const y = tY + rowH + ri*rowH + 0.04; const size = rowH - 0.1;
        const cx = x + (cw-size)/2; try { s.addImage({ data: src, x: cx, y, w: size, h: size }); } catch {}
      };
      slice.forEach((r, idx) => { overlay(3, r.image, idx); overlay(4, r.packing, idx); });
      if (p === pages-1) {
        const cY = tY + rowH + slice.length*rowH + 0.25;
        s.addText(`• ${meta.notes}`, { x: 0.3, y: cY-0.05, w: 12.73, h: 0.3, fontSize: 11, bold: true, color: "222222", align: "right" });
        const cards = [
          { l: "T.Ctn", v: String(totals.tCtn) }, { l: "T.CBM", v: totals.tCBM.toFixed(2) },
          { l: "T.Weight", v: totals.tWt.toFixed(2) }, { l: "T.Amount", v: String(totals.tAmount) },
        ];
        const cw = 2.0, ch = 0.95, gap = 0.15; let cx = 13.03 - (cw*4 + gap*3);
        cards.forEach((c) => {
          s.addShape("roundRect", { x: cx, y: cY+0.25, w: cw, h: ch, fill: { color: "FFFFFF" }, line: { color: ac, width: 1 }, rectRadius: 0.05 });
          s.addShape("rect", { x: cx+0.02, y: cY+0.27, w: cw-0.04, h: 0.28, fill: { color: ac }, line: { color: ac } });
          s.addText(c.l, { x: cx, y: cY+0.27, w: cw, h: 0.28, fontSize: 10, bold: true, color: "FFFFFF", align: "center", valign: "middle" });
          s.addText(c.v, { x: cx, y: cY+0.55, w: cw, h: 0.6, fontSize: 18, bold: true, color: "222222", align: "center", valign: "middle" });
          cx += cw + gap;
        });
      }
      s.addShape("roundRect", { x: 0.3, y: 6.8, w: 12.73, h: 0.65, fill: { color: ac }, line: { color: ac }, rectRadius: 0.08 });
      s.addText(meta.address, { x: 0.4, y: 6.82, w: 12.5, h: 0.22, fontSize: 9, color: "FFFFFF", align: "center" });
      s.addText(`tel: ${meta.phone}`, { x: 0.4, y: 7.02, w: 12.5, h: 0.18, fontSize: 8, color: "FFFFFF", align: "center" });
      s.addText(`E-MAIL: ${meta.email}`, { x: 0.4, y: 7.2, w: 12.5, h: 0.18, fontSize: 8, color: "FFFFFF", align: "center" });
    }
    await pptx.writeFile({ fileName: `${meta.title || "proforma"}-${meta.customer || "customer"}.pptx` });
    toast.success("PPTX ✓");
  };

  const onPrint = async () => { await flushSave(); setTimeout(() => window.print(), 200); };
  const onSaveNow = async () => { await flushSave(); toast.success(lang === "ar" ? "تم الحفظ" : "Saved"); };
  const onLogout = async () => { await supabase.auth.signOut(); navigate({ to: "/auth" }); };

  const themeStyle: CSSProperties = { ["--accent" as never]: accent };
  const dir = lang === "ar" ? "rtl" : "ltr";

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
            <Button size="sm" variant="outline" onClick={onPrint}><Printer className="mr-1 h-4 w-4" /> {t.print}</Button>
            <Button size="sm" onClick={exportPDF} className="bg-sky-600 text-white hover:bg-sky-700"><FileDown className="mr-1 h-4 w-4" /> {t.pdf}</Button>
            <Button size="sm" onClick={exportPPTX} className="bg-orange-500 text-white hover:bg-orange-600"><Presentation className="mr-1 h-4 w-4" /> {t.pptx}</Button>
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
                <button onClick={() => renameProforma(p.id)} className="ms-1 text-[10px] opacity-70 hover:opacity-100" title={t.rename}>✎</button>
                <button onClick={() => deleteProforma(p.id)} className="ms-0.5 opacity-60 hover:text-red-200" title={t.delete}><Trash2 className="h-3.5 w-3.5" /></button>
              </div>
            );
          })}
        </div>
      </header>

      {/* SHEET */}
      <main className="mx-auto max-w-[1400px] px-4 py-6 print:max-w-none print:p-0">
        <div id="printable" className="overflow-hidden rounded-lg bg-white shadow-sm print:rounded-none print:shadow-none">
          {/* Banner */}
          <div className="relative flex items-center justify-between px-6 py-5" style={{ background: accent }}>
            <button type="button" onClick={() => logoRef.current?.click()} className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-md bg-white text-[10px] font-bold uppercase leading-tight shadow" style={{ color: accent }} title="Upload logo">
              {meta.logo ? <img src={meta.logo} alt="logo" className="h-full w-full object-contain p-1" /> : <span className="px-1 text-center">{meta.company.split(" ").slice(0,2).join(" ")}</span>}
            </button>
            <input ref={logoRef} type="file" accept="image/*" className="hidden" onChange={(e) => onLogo(e.target.files?.[0] ?? null)} />
            <h2 className="text-5xl font-extrabold lowercase tracking-tight text-white">{t.proforma}</h2>
          </div>
          {/* Customer / Date */}
          <div className="grid grid-cols-2 gap-8 border-b px-6 pt-5 pb-3">
            <div>
              <div className="text-[11px] tracking-wider text-muted-foreground">{t.customer}</div>
              <Input value={meta.customer} onChange={(e) => setMeta({ ...meta, customer: e.target.value })} className="mt-1 h-9 rounded-md border border-input bg-white px-2 text-base font-bold uppercase shadow-sm focus-visible:ring-2 print:border-b-2 print:border-l-0 print:border-r-0 print:border-t-0 print:rounded-none print:shadow-none print:px-0" style={{ borderColor: accent }} placeholder={t.customer} />
            </div>
            <div className="text-end">
              <div className="text-[11px] tracking-wider text-muted-foreground">{t.date}</div>
              <Input type="date" value={meta.date} onChange={(e) => setMeta({ ...meta, date: e.target.value })} className="mt-1 h-9 rounded-md border border-input bg-white px-2 text-end text-base font-bold shadow-sm focus-visible:ring-2 print:border-b-2 print:border-l-0 print:border-r-0 print:border-t-0 print:rounded-none print:shadow-none print:px-0" style={{ borderColor: accent }} />
            </div>
          </div>
          {/* TABLE */}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1300px] border-collapse text-[12px] print:min-w-0 print:text-[9px]" dir="ltr">
              <thead>
                <tr style={{ background: `${accent}15`, color: accent }}>
                  {t.cols.map((h, ci) => {
                    // 0=No, 1=Item Name (left), 2=Description (left), rest centered
                    const align = ci === 1 || ci === 2 ? "text-left" : "text-center";
                    return (
                      <th key={h} className={`px-2 py-2.5 text-xs font-semibold uppercase ${align}`}>{h}</th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <RowEditor key={r.id} index={i+1} row={r} accent={accent} lang={lang}
                    onChange={(p) => updateRow(r.id, p)}
                    onImage={(f) => onImage(r.id, f, "image")}
                    onPacking={(f) => onImage(r.id, f, "packing")}
                    onDuplicate={() => duplicateRow(r.id)}
                    onRemove={() => removeRow(r.id)}
                    onSend={() => setSendItem(r)}
                  />
                ))}
              </tbody>
            </table>
          </div>
          {/* Notes + Totals */}
          <div className="px-6 pt-3"><div className="text-end text-[13px] font-semibold">• {meta.notes}</div></div>
          <div className="flex flex-wrap justify-end gap-3 px-6 py-4">
            {[
              { l: t.totals.ctn, v: totals.tCtn },
              { l: t.totals.cbm, v: totals.tCBM.toFixed(2) },
              { l: t.totals.weight, v: totals.tWt.toFixed(2) },
              { l: t.totals.amount, v: totals.tAmount },
            ].map((c) => (
              <div key={c.l} className="min-w-[160px] overflow-hidden rounded-md border" style={{ borderColor: accent }}>
                <div className="px-3 py-1.5 text-center text-xs font-bold uppercase text-white" style={{ background: accent }}>{c.l}</div>
                <div className="px-3 py-3 text-center text-2xl font-bold">{c.v}</div>
              </div>
            ))}
          </div>
          {/* Footer */}
          <div className="px-6 pt-3 pb-1 text-center text-white" style={{ background: accent }}>
            <Input value={meta.address} onChange={(e) => setMeta({ ...meta, address: e.target.value })} className="mx-auto h-7 max-w-3xl border-0 bg-transparent text-center text-[12px] font-medium text-white placeholder:text-white/70 shadow-none focus-visible:ring-0" />
            <Input value={meta.phone} onChange={(e) => setMeta({ ...meta, phone: e.target.value })} className="mx-auto h-7 max-w-md border-0 bg-transparent text-center text-[11px] text-white shadow-none focus-visible:ring-0" />
            <Input value={meta.email} onChange={(e) => setMeta({ ...meta, email: e.target.value })} className="mx-auto h-7 max-w-xl border-0 bg-transparent text-center text-[11px] text-white shadow-none focus-visible:ring-0" />
          </div>
        </div>
        <p className="mt-4 text-center text-xs text-muted-foreground print:hidden">{t.arabicTip}</p>
      </main>

      {showLibrary && <LibraryModal items={library} accent={accent} lang={lang} onPick={(r) => { copyFromLibrary(r); }} onClose={() => setShowLibrary(false)} />}
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
        /* Hide the Actions column when generating PDF via html2canvas */
        #printable.pdf-capture th:last-child,
        #printable.pdf-capture td:last-child { display: none !important; }
        @media print {
          html, body { background: white !important; }
          body { margin: 0 !important; }
          .print\\:hidden { display: none !important; }
          #printable { box-shadow: none !important; border-radius: 0 !important; }
          #printable .overflow-x-auto { overflow: visible !important; }
          #printable table { width: 100% !important; table-layout: fixed !important; }
          #printable th:last-child, #printable td:last-child { display: none !important; }
          #printable td, #printable th { word-break: break-word; }
          #printable input { border: none !important; background: transparent !important; padding: 0 !important; box-shadow: none !important; }
          #printable, #printable * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            color-adjust: exact !important;
          }
          /* hide scrollbars */
          ::-webkit-scrollbar { display: none !important; }
        }
      `}</style>

      {showCompany && (
        <CompanyModal meta={meta} accent={accent} lang={lang}
          onSave={(m) => { setMeta(m); setShowCompany(false); toast.success(lang === "ar" ? "تم الحفظ" : "Saved"); }}
          onCancel={() => setShowCompany(false)} />
      )}
    </div>
  );
}

/* ───────────────────────────  PIECES  ─────────────────────────── */

function CellInput({ value, onChange, type = "text", align = "center" }: { value: string; onChange: (v: string) => void; type?: string; align?: "left"|"center"|"right" }) {
  return <input type={type} value={value} onChange={(e) => onChange(e.target.value)} className="w-full rounded border border-input bg-white px-1.5 py-1 text-[12px] outline-none transition focus:border-foreground focus:ring-1 focus:ring-foreground/20 print:border-transparent print:bg-transparent print:ring-0" style={{ textAlign: align }} />;
}
function ImgCell({ src, onPick, icon }: { src: string; onPick: (f: File | null) => void; icon: "img"|"pkg" }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <>
      <button type="button" onClick={() => ref.current?.click()} className="mx-auto flex h-14 w-14 items-center justify-center overflow-hidden rounded border border-dashed bg-muted/30 hover:border-foreground">
        {src ? <img src={src} alt="" className="h-full w-full object-cover" /> : icon === "img" ? <ImageIcon className="h-4 w-4 text-muted-foreground" /> : <Package className="h-4 w-4 text-muted-foreground" />}
      </button>
      <input ref={ref} type="file" accept="image/*" className="hidden" onChange={(e) => onPick(e.target.files?.[0] ?? null)} />
    </>
  );
}
function RowEditor({ index, row, accent, lang, onChange, onImage, onPacking, onDuplicate, onRemove, onSend }:
  { index: number; row: Row; accent: string; lang: Lang;
    onChange: (p: Partial<Row>) => void; onImage: (f: File | null) => void; onPacking: (f: File | null) => void;
    onDuplicate: () => void; onRemove: () => void; onSend: () => void; }) {
  const amt = amount(row); const tc = tCbm(row); const tw = tWeight(row);
  const tt = T[lang];
  return (
    <tr className="border-b align-middle hover:bg-muted/20">
      <td className="w-10 px-2 text-center text-xs font-semibold text-muted-foreground">{index}</td>
      <td className="px-2"><CellInput value={row.itemName} onChange={(v) => onChange({ itemName: v })} align="left" /></td>
      <td className="px-2"><CellInput value={row.description} onChange={(v) => onChange({ description: v })} align="left" /></td>
      <td className="w-20 px-1"><ImgCell src={row.image} onPick={onImage} icon="img" /></td>
      <td className="w-20 px-1"><ImgCell src={row.packing} onPick={onPacking} icon="pkg" /></td>
      <td className="w-14 px-1"><CellInput value={row.ctn} onChange={(v) => onChange({ ctn: v })} type="number" /></td>
      <td className="w-14 px-1"><CellInput value={row.dozCtn} onChange={(v) => onChange({ dozCtn: v })} /></td>
      <td className="w-14 px-1"><CellInput value={row.setCtn} onChange={(v) => onChange({ setCtn: v })} /></td>
      <td className="w-14 px-1"><CellInput value={row.pcsSet} onChange={(v) => onChange({ pcsSet: v })} /></td>
      <td className="w-16 px-1"><CellInput value={row.pricePerCtn} onChange={(v) => onChange({ pricePerCtn: v })} type="number" /></td>
      <td className="w-16 px-1 text-center text-[12px] font-bold" style={{ color: accent }}>{amt || ""}</td>
      <td className="w-14 px-1"><CellInput value={row.cbm} onChange={(v) => onChange({ cbm: v })} type="number" /></td>
      <td className="w-14 px-1 text-center text-[12px] font-semibold">{tc || ""}</td>
      <td className="w-14 px-1"><CellInput value={row.weight} onChange={(v) => onChange({ weight: v })} type="number" /></td>
      <td className="w-14 px-1 text-center text-[12px] font-semibold">{tw || ""}</td>
      <td className="w-24 px-1 print:hidden">
        <div className="flex justify-center gap-1">
          <button onClick={onSend} title={tt.sendTo} className="rounded p-1 hover:bg-muted" style={{ color: accent }}><Send className="h-3.5 w-3.5" /></button>
          <button onClick={onDuplicate} title={tt.duplicate} className="rounded p-1 hover:bg-muted"><Copy className="h-3.5 w-3.5" /></button>
          <button onClick={onRemove} title={tt.delete} className="rounded p-1 text-destructive hover:bg-destructive/10"><Trash2 className="h-3.5 w-3.5" /></button>
        </div>
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
                    {i.row.image ? <img src={i.row.image} alt="" className="h-full w-full object-cover" /> : <ImageIcon className="h-8 w-8 text-muted-foreground" />}
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
            {item.image ? <img src={item.image} alt="" className="h-full w-full object-cover" /> : <ImageIcon className="h-5 w-5 text-muted-foreground" />}
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

function CompanyModal({ meta, accent, lang, onSave, onCancel }:
  { meta: Meta; accent: string; lang: Lang; onSave: (m: Meta) => void; onCancel: () => void; }) {
  const [m, setM] = useState<Meta>(meta);
  const isAr = lang === "ar";
  const L = isAr
    ? { title: "بيانات الشركة", company: "اسم الشركة", address: "العنوان", phone: "الهاتف", email: "الإيميل", notes: "ملاحظة الفاتورة", invoiceTitle: "عنوان الفاتورة", save: "حفظ", cancel: "إلغاء" }
    : { title: "Company Info", company: "Company", address: "Address", phone: "Phone", email: "Email", notes: "Invoice Note", invoiceTitle: "Invoice Title", save: "Save", cancel: "Cancel" };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onCancel}>
      <div className="w-full max-w-lg overflow-hidden rounded-lg bg-white shadow-2xl" onClick={(e) => e.stopPropagation()} dir={isAr ? "rtl" : "ltr"}>
        <div className="flex items-center justify-between border-b px-5 py-3" style={{ background: `${accent}15` }}>
          <h3 className="font-semibold">{L.title}</h3>
          <button onClick={onCancel} className="text-muted-foreground hover:text-foreground"><X className="h-5 w-5" /></button>
        </div>
        <div className="space-y-3 p-5">
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