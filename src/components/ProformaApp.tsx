import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Plus,
  Trash2,
  FileDown,
  Presentation,
  Upload,
  Copy,
  Library,
  FilePlus,
  Palette,
  X,
  Package,
  Printer,
} from "lucide-react";
import { toast } from "sonner";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import PptxGenJS from "pptxgenjs";

type Row = {
  id: string;
  itemName: string;
  description: string;
  image: string;
  packing: string; // dataURL image
  ctn: string;
  dozCtn: string;
  setCtn: string;
  pcsSet: string;
  pricePerCtn: string;
  cbm: string;
  weight: string;
};

type Meta = {
  company: string;
  address: string;
  phone: string;
  email: string;
  customer: string;
  date: string;
  title: string;
  notes: string;
  logo: string; // dataURL
};

type Proforma = {
  id: string;
  name: string;
  meta: Meta;
  rows: Row[];
  themeColor: string; // hex w/o #
  updatedAt: number;
};

const STORAGE = "proforma-v3";

const newRow = (): Row => ({
  id: crypto.randomUUID(),
  itemName: "",
  description: "",
  image: "",
  packing: "",
  ctn: "",
  dozCtn: "",
  setCtn: "",
  pcsSet: "",
  pricePerCtn: "",
  cbm: "",
  weight: "",
});

const defaultMeta = (): Meta => ({
  company: "KOUJAN COMPANY",
  address: "ARABIC REPUBLIC EGYPT , sadat city svi industrial zone , plot no 6098",
  phone: "002012728831​4  -  002012​1265982",
  email: "sales@koujanegypt.com",
  customer: "",
  date: new Date().toISOString().slice(0, 10),
  title: "Proforma Invoice",
  notes: "Prices are E.X work",
  logo: "",
});

const THEME_PRESETS = [
  { name: "Emerald", color: "10B981" },
  { name: "Navy", color: "1E3A8A" },
  { name: "Crimson", color: "B91C1C" },
  { name: "Gold", color: "B8860B" },
  { name: "Charcoal", color: "1A1A1A" },
  { name: "Teal", color: "0F766E" },
];

const newProforma = (name: string): Proforma => ({
  id: crypto.randomUUID(),
  name,
  meta: defaultMeta(),
  rows: [newRow()],
  themeColor: "10B981",
  updatedAt: Date.now(),
});

function amount(r: Row): number {
  const c = parseFloat(r.ctn || "0");
  const p = parseFloat(r.pricePerCtn || "0");
  return +(c * p).toFixed(2);
}

async function fileToDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result as string);
    fr.onerror = reject;
    fr.readAsDataURL(file);
  });
}

// High-quality resize: max 1400px, JPEG q=0.92, white background
async function processImage(file: File): Promise<string> {
  const raw = await fileToDataURL(file);
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const MAX = 1400;
      let w = img.width;
      let h = img.height;
      if (w > MAX || h > MAX) {
        const ratio = Math.min(MAX / w, MAX / h);
        w = Math.round(w * ratio);
        h = Math.round(h * ratio);
      }
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d")!;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.fillStyle = "#FFFFFF";
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL("image/jpeg", 0.92));
    };
    img.onerror = () => resolve(raw);
    img.src = raw;
  });
}

function hexRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const f = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = parseInt(f, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export default function ProformaApp() {
  const [proformas, setProformas] = useState<Proforma[]>(() => [newProforma("Proforma 1")]);
  const [activeId, setActiveId] = useState<string>("");
  const [showLibrary, setShowLibrary] = useState(false);
  const [showThemes, setShowThemes] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE);
      if (raw) {
        const p = JSON.parse(raw);
        if (Array.isArray(p.proformas) && p.proformas.length) {
          setProformas(p.proformas);
          setActiveId(p.activeId && p.proformas.find((x: Proforma) => x.id === p.activeId) ? p.activeId : p.proformas[0].id);
          return;
        }
      }
    } catch {}
    setActiveId((cur) => cur || proformas[0]?.id || "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!activeId) return;
    try {
      localStorage.setItem(STORAGE, JSON.stringify({ proformas, activeId }));
    } catch (e) {
      console.warn("storage failed", e);
    }
  }, [proformas, activeId]);

  const active = proformas.find((p) => p.id === activeId) ?? proformas[0];
  const meta = active?.meta ?? defaultMeta();
  const rows = active?.rows ?? [];
  const themeColor = active?.themeColor ?? "10B981";

  const updateActive = (patch: Partial<Proforma>) =>
    setProformas((ps) =>
      ps.map((p) => (p.id === active?.id ? { ...p, ...patch, updatedAt: Date.now() } : p)),
    );
  const setMeta = (m: Meta) => updateActive({ meta: m });
  const setRows = (updater: Row[] | ((rs: Row[]) => Row[])) =>
    updateActive({ rows: typeof updater === "function" ? (updater as (r: Row[]) => Row[])(rows) : updater });
  const setThemeColor = (c: string) => updateActive({ themeColor: c.replace("#", "") });

  const createProforma = () => {
    const p = newProforma(`Proforma ${proformas.length + 1}`);
    setProformas((ps) => [...ps, p]);
    setActiveId(p.id);
    toast.success("بروفورما جديدة / New proforma");
  };
  const deleteProforma = (id: string) => {
    if (proformas.length === 1) {
      toast.error("لا يمكن حذف الوحيدة / Can't delete only one");
      return;
    }
    if (!confirm("حذف هذه البروفورما؟ / Delete this proforma?")) return;
    const next = proformas.filter((p) => p.id !== id);
    setProformas(next);
    if (activeId === id) setActiveId(next[0].id);
  };
  const renameProforma = (id: string, name: string) =>
    setProformas((ps) => ps.map((p) => (p.id === id ? { ...p, name } : p)));

  const totals = useMemo(() => {
    const tCtn = rows.reduce((s, r) => s + (parseFloat(r.ctn || "0") || 0), 0);
    const tAmount = rows.reduce((s, r) => s + amount(r), 0);
    return { tCtn, tAmount: +tAmount.toFixed(2) };
  }, [rows]);

  const updateRow = (id: string, patch: Partial<Row>) =>
    setRows((rs: Row[]) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  const removeRow = (id: string) => setRows((rs: Row[]) => rs.filter((r) => r.id !== id));
  const addRow = () => setRows((rs: Row[]) => [...rs, newRow()]);
  const duplicateRow = (id: string) =>
    setRows((rs: Row[]) => {
      const i = rs.findIndex((r) => r.id === id);
      if (i < 0) return rs;
      const copy: Row = { ...rs[i], id: crypto.randomUUID() };
      const out = [...rs];
      out.splice(i + 1, 0, copy);
      return out;
    });

  // Product library: all rows across all proformas (with content)
  const library = useMemo(() => {
    const seen = new Set<string>();
    const items: { row: Row; from: string }[] = [];
    proformas.forEach((p) =>
      p.rows.forEach((r) => {
        if (!r.itemName && !r.image) return;
        const key = `${r.itemName}|${r.image.slice(0, 60)}`;
        if (seen.has(key)) return;
        seen.add(key);
        items.push({ row: r, from: p.name });
      }),
    );
    return items;
  }, [proformas]);

  const copyFromLibrary = (r: Row) => {
    setRows((rs: Row[]) => [...rs, { ...r, id: crypto.randomUUID() }]);
    toast.success("تمت الإضافة / Added");
  };

  const clearActive = () => {
    if (!confirm("مسح هذه البروفورما؟ / Clear current proforma?")) return;
    updateActive({ meta: defaultMeta(), rows: [newRow()] });
    toast.success("تم المسح / Cleared");
  };

  const onImage = async (id: string, f: File | null, field: "image" | "packing") => {
    if (!f) return;
    if (f.size > 10 * 1024 * 1024) {
      toast.error("الصورة كبيرة (>10MB) / Image too large");
      return;
    }
    const url = await processImage(f);
    updateRow(id, { [field]: url } as Partial<Row>);
  };

  const exportPDF = async () => {
    const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
    const pageW = doc.internal.pageSize.getWidth();
    const [tr, tg, tb] = hexRgb(themeColor);

    doc.setFillColor(tr, tg, tb);
    doc.rect(0, 0, pageW, 60, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(20);
    doc.text(meta.title || "Proforma Invoice", 40, 38);
    doc.setFontSize(11);
    doc.setFont("helvetica", "normal");
    doc.text(meta.company, pageW - 40, 32, { align: "right" });
    doc.setFontSize(9);
    doc.text(meta.phone, pageW - 40, 48, { align: "right" });

    doc.setTextColor(30, 30, 30);
    doc.setFontSize(11);
    doc.text(`Customer: ${meta.customer || "-"}`, 40, 90);
    doc.text(`Date: ${meta.date}`, pageW - 40, 90, { align: "right" });

    const head = [["No", "Item", "Description", "Image", "Packing", "Ctn", "Doz/Ctn", "Set/Ctn", "Pcs/Set", "Price/Ctn", "T.Amount"]];
    const body = rows.map((r, i) => [
      i + 1,
      r.itemName,
      r.description,
      "",
      "",
      r.ctn,
      r.dozCtn,
      r.setCtn,
      r.pcsSet,
      r.pricePerCtn,
      amount(r).toString(),
    ]);

    autoTable(doc, {
      head,
      body,
      startY: 105,
      styles: { fontSize: 9, cellPadding: 4, valign: "middle", halign: "center", minCellHeight: 80 },
      headStyles: { fillColor: [tr, tg, tb], textColor: 255 },
      columnStyles: {
        1: { halign: "left", cellWidth: 90 },
        2: { halign: "left" },
        3: { cellWidth: 90 },
        4: { cellWidth: 90 },
      },
      didDrawCell: (data) => {
        if (data.section !== "body") return;
        const r = rows[data.row.index];
        if (!r) return;
        const drawImg = (src: string) => {
          if (!src) return;
          try {
            const pad = 3;
            const size = Math.min(data.cell.width, data.cell.height) - pad * 2;
            const x = data.cell.x + (data.cell.width - size) / 2;
            const y = data.cell.y + (data.cell.height - size) / 2;
            doc.addImage(src, "JPEG", x, y, size, size, undefined, "FAST");
          } catch {}
        };
        if (data.column.index === 3) drawImg(r.image);
        if (data.column.index === 4) drawImg(r.packing);
      },
    });

    const finalY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 20;
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text(`Total Ctn: ${totals.tCtn}`, 40, finalY);
    doc.text(`Total Amount: ${totals.tAmount}`, pageW - 40, finalY, { align: "right" });
    if (meta.notes) {
      doc.setFont("helvetica", "italic");
      doc.setFontSize(9);
      doc.text(`* ${meta.notes}`, 40, finalY + 18);
    }

    doc.setFontSize(8);
    doc.setTextColor(120);
    doc.text(`${meta.address}  •  ${meta.email}`, pageW / 2, doc.internal.pageSize.getHeight() - 16, { align: "center" });

    doc.save(`${meta.title || "proforma"}-${meta.customer || "customer"}.pdf`);
    toast.success("تم تصدير PDF");
  };

  const exportPPTX = async () => {
    const pptx = new PptxGenJS();
    pptx.layout = "LAYOUT_WIDE";
    pptx.title = meta.title;
    const accent = themeColor;

    const cover = pptx.addSlide();
    cover.background = { color: "FFFFFF" };
    cover.addShape("rect", { x: 0, y: 0, w: 13.33, h: 1.4, fill: { color: accent } });
    cover.addText(meta.title || "Proforma Invoice", { x: 0.5, y: 0.35, w: 12, h: 0.7, fontSize: 32, bold: true, color: "FFFFFF", fontFace: "Calibri" });
    cover.addText(meta.company, { x: 0.5, y: 1.7, w: 12, h: 0.5, fontSize: 22, bold: true, color: "1A1A1A" });
    cover.addText(`Customer: ${meta.customer || "-"}`, { x: 0.5, y: 2.4, w: 12, h: 0.4, fontSize: 18, color: "333333" });
    cover.addText(`Date: ${meta.date}`, { x: 0.5, y: 2.8, w: 12, h: 0.4, fontSize: 18, color: "333333" });
    cover.addText(`${meta.address}\n${meta.phone}\n${meta.email}`, { x: 0.5, y: 5.5, w: 12, h: 1.5, fontSize: 12, color: "666666" });

    const perSlide = 8;
    const mkHeader = (text: string, align: "center" | "left" = "center") => ({
      text,
      options: { bold: true, color: "FFFFFF", fill: { color: accent }, align, valign: "middle" },
    });
    const headerRow = [
      mkHeader("No"),
      mkHeader("Item", "left"),
      mkHeader("Description", "left"),
      mkHeader("Image"),
      mkHeader("Packing"),
      mkHeader("Ctn"),
      mkHeader("Doz/Ctn"),
      mkHeader("Set/Ctn"),
      mkHeader("Pcs/Set"),
      mkHeader("Price/Ctn"),
      mkHeader("T.Amount"),
    ];

    for (let p = 0; p < Math.max(1, Math.ceil(rows.length / perSlide)); p++) {
      const slide = pptx.addSlide();
      slide.addShape("rect", { x: 0, y: 0, w: 13.33, h: 0.6, fill: { color: accent } });
      slide.addText(`${meta.title} — ${meta.customer || ""}`, { x: 0.3, y: 0.1, w: 9, h: 0.4, fontSize: 16, bold: true, color: "FFFFFF" });
      slide.addText(`Date: ${meta.date}`, { x: 9.5, y: 0.1, w: 3.5, h: 0.4, fontSize: 12, color: "FFFFFF", align: "right" });

      const slice = rows.slice(p * perSlide, (p + 1) * perSlide);
      const tableRows: PptxGenJS.TableRow[] = [headerRow as unknown as PptxGenJS.TableRow];
      slice.forEach((r, idx) => {
        const globalIdx = p * perSlide + idx + 1;
        tableRows.push([
          { text: String(globalIdx), options: { align: "center", valign: "middle" } },
          { text: r.itemName, options: { valign: "middle" } },
          { text: r.description, options: { valign: "middle" } },
          { text: "" },
          { text: "" },
          { text: r.ctn, options: { align: "center", valign: "middle" } },
          { text: r.dozCtn, options: { align: "center", valign: "middle" } },
          { text: r.setCtn, options: { align: "center", valign: "middle" } },
          { text: r.pcsSet, options: { align: "center", valign: "middle" } },
          { text: r.pricePerCtn, options: { align: "center", valign: "middle" } },
          { text: amount(r).toString(), options: { align: "center", bold: true, valign: "middle" } },
        ] as unknown as PptxGenJS.TableRow);
      });

      const tableY = 0.85;
      const rowH = 0.72;
      const colW = [0.45, 1.3, 1.7, 1.0, 1.0, 0.75, 0.85, 0.85, 0.85, 1.1, 1.18];
      slide.addTable(tableRows, {
        x: 0.2,
        y: tableY,
        w: 12.93,
        rowH,
        fontSize: 11,
        border: { type: "solid", pt: 0.5, color: "DDDDDD" },
        valign: "middle",
        colW,
      });

      // Image overlays for image & packing columns
      const overlay = (offsetCols: number, src: string, rowIdx: number) => {
        if (!src) return;
        let x = 0.2;
        for (let i = 0; i < offsetCols; i++) x += colW[i];
        const colWidth = colW[offsetCols];
        const y = tableY + (rowIdx + 1) * rowH + 0.04;
        const size = rowH - 0.08;
        const cx = x + (colWidth - size) / 2;
        try {
          slide.addImage({ data: src, x: cx, y, w: size, h: size });
        } catch {}
      };
      slice.forEach((r, idx) => {
        overlay(3, r.image, idx);
        overlay(4, r.packing, idx);
      });

      slide.addText(`Total Ctn: ${totals.tCtn}    |    Total Amount: ${totals.tAmount}`, {
        x: 0.3, y: 7.0, w: 12.7, h: 0.4, fontSize: 14, bold: true, color: "1A1A1A", align: "right",
      });
    }

    await pptx.writeFile({ fileName: `${meta.title || "proforma"}-${meta.customer || "customer"}.pptx` });
    toast.success("تم تصدير PowerPoint");
  };

  const themeStyle: CSSProperties = { ["--accent" as never]: `#${themeColor}` };

  return (
    <div className="min-h-screen bg-[#f7f8f7]" style={themeStyle}>
      {/* Header */}
      <header className="sticky top-0 z-20 border-b bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-center justify-between gap-3 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg text-white" style={{ background: `#${themeColor}` }}>
              <FileText className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-lg font-bold leading-tight">Proforma Invoice Generator</h1>
              <p className="text-xs text-muted-foreground">منشئ فواتير بروفورما — متعدد العملاء، مع مكتبة منتجات</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Button variant="outline" size="sm" onClick={() => setShowThemes((v) => !v)}>
                <Palette className="mr-1 h-4 w-4" /> Theme
              </Button>
              {showThemes && (
                <div className="absolute right-0 z-30 mt-2 w-56 rounded-md border bg-white p-3 shadow-lg">
                  <div className="mb-2 grid grid-cols-3 gap-2">
                    {THEME_PRESETS.map((t) => (
                      <button
                        key={t.color}
                        type="button"
                        title={t.name}
                        onClick={() => { setThemeColor(t.color); setShowThemes(false); }}
                        className="h-9 rounded-md border transition hover:scale-105"
                        style={{ background: `#${t.color}` }}
                      />
                    ))}
                  </div>
                  <Label className="mb-1 block text-[11px] text-muted-foreground">Custom</Label>
                  <input
                    type="color"
                    value={`#${themeColor}`}
                    onChange={(e) => setThemeColor(e.target.value)}
                    className="h-9 w-full cursor-pointer rounded-md border"
                  />
                </div>
              )}
            </div>
            <Button variant="outline" size="sm" onClick={() => setShowLibrary(true)}>
              <Library className="mr-1 h-4 w-4" /> مكتبة / Library
            </Button>
            <Button variant="outline" size="sm" onClick={createProforma}>
              <FilePlus className="mr-1 h-4 w-4" /> جديد / New
            </Button>
            <Button variant="outline" onClick={clearActive} size="sm">مسح / Clear</Button>
            <Button onClick={exportPDF} size="sm" className="text-white hover:opacity-90" style={{ background: `#${themeColor}` }}>
              <FileDown className="mr-1 h-4 w-4" /> PDF
            </Button>
            <Button onClick={exportPPTX} size="sm" className="text-white hover:opacity-90" style={{ background: `#${themeColor}` }}>
              <Presentation className="mr-1 h-4 w-4" /> PowerPoint
            </Button>
          </div>
        </div>

        {/* Proforma tabs */}
        <div className="mx-auto flex max-w-[1400px] items-center gap-2 overflow-x-auto px-6 pb-3">
          {proformas.map((p) => {
            const isActive = p.id === active?.id;
            return (
              <div
                key={p.id}
                className={`group flex shrink-0 items-center gap-1 rounded-md border px-3 py-1.5 text-sm transition ${
                  isActive ? "border-transparent text-white shadow" : "border-border bg-white hover:bg-muted"
                }`}
                style={isActive ? { background: `#${themeColor}` } : undefined}
              >
                <button onClick={() => setActiveId(p.id)} className="font-medium">
                  {p.name}
                </button>
                <button
                  onClick={() => {
                    const n = prompt("اسم البروفورما / Proforma name", p.name);
                    if (n) renameProforma(p.id, n);
                  }}
                  className="ml-1 text-[10px] opacity-70 hover:opacity-100"
                  title="Rename"
                >
                  ✎
                </button>
                <button
                  onClick={() => deleteProforma(p.id)}
                  className="ml-0.5 opacity-50 hover:opacity-100"
                  title="Delete"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            );
          })}
        </div>
      </header>

      <main className="mx-auto max-w-[1400px] space-y-6 px-6 py-8">
        {/* Meta */}
        <Card className="p-6">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            بيانات الفاتورة / Invoice Info
          </h2>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Field label="Title / العنوان" value={meta.title} onChange={(v) => setMeta({ ...meta, title: v })} />
            <Field label="Company / الشركة" value={meta.company} onChange={(v) => setMeta({ ...meta, company: v })} />
            <Field label="Customer / العميل" value={meta.customer} onChange={(v) => setMeta({ ...meta, customer: v })} />
            <Field label="Date / التاريخ" type="date" value={meta.date} onChange={(v) => setMeta({ ...meta, date: v })} />
            <Field label="Phone / الهاتف" value={meta.phone} onChange={(v) => setMeta({ ...meta, phone: v })} />
            <Field label="Email / البريد" value={meta.email} onChange={(v) => setMeta({ ...meta, email: v })} />
            <div className="md:col-span-2">
              <Label className="mb-1.5 block text-xs">Address / العنوان</Label>
              <Input value={meta.address} onChange={(e) => setMeta({ ...meta, address: e.target.value })} />
            </div>
          </div>
        </Card>

        {/* Items */}
        <Card className="p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              الأصناف / Items ({rows.length})
            </h2>
            <div className="flex gap-2">
              <Button onClick={() => setShowLibrary(true)} size="sm" variant="outline">
                <Library className="mr-1 h-4 w-4" /> من المكتبة / From Library
              </Button>
              <Button onClick={addRow} size="sm" className="text-white hover:opacity-90" style={{ background: `#${themeColor}` }}>
                <Plus className="mr-1 h-4 w-4" /> صنف جديد / Add Item
              </Button>
            </div>
          </div>

          <div className="space-y-3">
            {rows.map((r, idx) => (
              <RowEditor
                key={r.id}
                index={idx + 1}
                row={r}
                themeColor={themeColor}
                onChange={(patch) => updateRow(r.id, patch)}
                onImage={(f) => onImage(r.id, f, "image")}
                onPacking={(f) => onImage(r.id, f, "packing")}
                onRemove={() => removeRow(r.id)}
                onDuplicate={() => duplicateRow(r.id)}
                amount={amount(r)}
              />
            ))}
          </div>

          <div className="mt-6 flex flex-wrap items-center justify-end gap-8 border-t pt-4 text-sm">
            <div>
              <span className="text-muted-foreground">Total Ctn / إجمالي الكراتين: </span>
              <span className="text-base font-bold">{totals.tCtn}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Total Amount / الإجمالي: </span>
              <span className="text-base font-bold" style={{ color: `#${themeColor}` }}>{totals.tAmount}</span>
            </div>
          </div>
        </Card>

        {/* Notes — separate card so it doesn't sit over the totals */}
        <Card className="p-6">
          <Label className="mb-1.5 block text-xs">Notes / ملاحظات</Label>
          <Textarea
            rows={2}
            value={meta.notes}
            onChange={(e) => setMeta({ ...meta, notes: e.target.value })}
            placeholder="Prices are E.X work"
          />
        </Card>

        <p className="text-center text-xs text-muted-foreground">
          يتم الحفظ تلقائياً في المتصفح • Auto-saved (multiple proformas)
        </p>
      </main>

      {showLibrary && (
        <LibraryModal
          items={library}
          themeColor={themeColor}
          onPick={copyFromLibrary}
          onClose={() => setShowLibrary(false)}
        />
      )}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <div>
      <Label className="mb-1.5 block text-xs">{label}</Label>
      <Input type={type} value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

function RowEditor({
  index,
  row,
  themeColor,
  onChange,
  onImage,
  onPacking,
  onRemove,
  onDuplicate,
  amount,
}: {
  index: number;
  row: Row;
  themeColor: string;
  onChange: (p: Partial<Row>) => void;
  onImage: (f: File | null) => void;
  onPacking: (f: File | null) => void;
  onRemove: () => void;
  onDuplicate: () => void;
  amount: number;
}) {
  const imgRef = useRef<HTMLInputElement>(null);
  const pkgRef = useRef<HTMLInputElement>(null);

  return (
    <div className="rounded-lg border bg-white p-4">
      <div className="grid grid-cols-12 gap-3">
        {/* Number + product image + packing image */}
        <div className="col-span-12 flex items-start gap-3 md:col-span-3">
          <div
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-sm font-semibold text-white"
            style={{ background: `#${themeColor}` }}
          >
            {index}
          </div>

          <div className="flex flex-col items-center gap-1">
            <button
              type="button"
              onClick={() => imgRef.current?.click()}
              className="relative flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-md border border-dashed bg-muted/40 text-muted-foreground transition hover:border-foreground"
            >
              {row.image ? (
                <img src={row.image} alt="" className="h-full w-full object-cover" />
              ) : (
                <Upload className="h-5 w-5" />
              )}
            </button>
            <span className="text-[10px] text-muted-foreground">Item</span>
            <input ref={imgRef} type="file" accept="image/*" className="hidden" onChange={(e) => onImage(e.target.files?.[0] ?? null)} />
          </div>

          <div className="flex flex-col items-center gap-1">
            <button
              type="button"
              onClick={() => pkgRef.current?.click()}
              className="relative flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-md border border-dashed bg-muted/40 text-muted-foreground transition hover:border-foreground"
            >
              {row.packing ? (
                <img src={row.packing} alt="" className="h-full w-full object-cover" />
              ) : (
                <Package className="h-5 w-5" />
              )}
            </button>
            <span className="text-[10px] text-muted-foreground">Packing</span>
            <input ref={pkgRef} type="file" accept="image/*" className="hidden" onChange={(e) => onPacking(e.target.files?.[0] ?? null)} />
          </div>
        </div>

        <div className="col-span-12 grid grid-cols-2 gap-3 md:col-span-9 md:grid-cols-6">
          <SmallField label="Item / الصنف" value={row.itemName} onChange={(v) => onChange({ itemName: v })} />
          <SmallField label="Desc / الوصف" value={row.description} onChange={(v) => onChange({ description: v })} />
          <SmallField label="Ctn / كراتين" value={row.ctn} onChange={(v) => onChange({ ctn: v })} type="number" />
          <SmallField label="Doz/Ctn" value={row.dozCtn} onChange={(v) => onChange({ dozCtn: v })} />
          <SmallField label="Set/Ctn" value={row.setCtn} onChange={(v) => onChange({ setCtn: v })} />
          <SmallField label="Pcs/Set" value={row.pcsSet} onChange={(v) => onChange({ pcsSet: v })} />
          <SmallField label="Price/Ctn" value={row.pricePerCtn} onChange={(v) => onChange({ pricePerCtn: v })} type="number" />
          <div>
            <Label className="mb-1.5 block text-[11px] text-muted-foreground">T.Amount</Label>
            <div className="flex h-9 items-center rounded-md border px-3 text-sm font-semibold" style={{ borderColor: `#${themeColor}55`, color: `#${themeColor}`, background: `#${themeColor}10` }}>
              {amount}
            </div>
          </div>
          <div className="col-span-2 flex items-end justify-end gap-1 md:col-span-3">
            <Button variant="ghost" size="sm" onClick={onDuplicate} title="Duplicate / نسخ">
              <Copy className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="sm" onClick={onRemove} className="text-destructive hover:text-destructive">
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function SmallField({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <div>
      <Label className="mb-1.5 block text-[11px] text-muted-foreground">{label}</Label>
      <Input type={type} value={value} onChange={(e) => onChange(e.target.value)} className="h-9" />
    </div>
  );
}

function LibraryModal({
  items,
  themeColor,
  onPick,
  onClose,
}: {
  items: { row: Row; from: string }[];
  themeColor: string;
  onPick: (r: Row) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const filtered = items.filter(
    (i) => !q || i.row.itemName.toLowerCase().includes(q.toLowerCase()) || i.from.toLowerCase().includes(q.toLowerCase()),
  );
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="max-h-[85vh] w-full max-w-4xl overflow-hidden rounded-lg bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b px-5 py-3" style={{ background: `#${themeColor}10` }}>
          <h3 className="font-semibold">مكتبة المنتجات / Product Library ({items.length})</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="h-5 w-5" /></button>
        </div>
        <div className="border-b p-3">
          <Input placeholder="بحث / Search…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="max-h-[60vh] overflow-y-auto p-4">
          {filtered.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">لا توجد منتجات بعد / No products yet</p>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
              {filtered.map((i, idx) => (
                <button
                  key={idx}
                  onClick={() => { onPick(i.row); }}
                  className="group flex flex-col overflow-hidden rounded-lg border bg-white text-left transition hover:shadow-md"
                >
                  <div className="flex aspect-square items-center justify-center bg-muted/40">
                    {i.row.image ? (
                      <img src={i.row.image} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <FileText className="h-8 w-8 text-muted-foreground" />
                    )}
                  </div>
                  <div className="p-2">
                    <div className="truncate text-sm font-medium">{i.row.itemName || "—"}</div>
                    <div className="truncate text-[11px] text-muted-foreground">من {i.from} • {i.row.pricePerCtn || "0"} /ctn</div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="border-t px-5 py-3 text-xs text-muted-foreground">
          اضغط على أي منتج لإضافته للبروفورما الحالية / Click any item to add it to the current proforma
        </div>
      </div>
    </div>
  );
}