import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Plus, Trash2, FileDown, Presentation, Upload, FileText } from "lucide-react";
import { toast } from "sonner";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import PptxGenJS from "pptxgenjs";

type Row = {
  id: string;
  itemName: string;
  description: string;
  image: string; // dataURL
  packing: string;
  ctn: string;
  dozCtn: string;
  setCtn: string;
  pcsSet: string;
  pricePerCtn: string;
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
};

const STORAGE = "proforma-v1";

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
});

const defaultMeta: Meta = {
  company: "KOUJAN EGYPT",
  address: "Arab Republic Egypt, Sadat City, 6th Industrial Zone, Plot No 6098",
  phone: "00201127388316 / 00201113269982",
  email: "sales@koujanegypt.com",
  customer: "",
  date: new Date().toISOString().slice(0, 10),
  title: "Proforma Invoice",
  notes: "Prices are E.X work",
};

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

export default function ProformaApp() {
  const [meta, setMeta] = useState<Meta>(defaultMeta);
  const [rows, setRows] = useState<Row[]>([newRow()]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE);
      if (raw) {
        const p = JSON.parse(raw);
        if (p.meta) setMeta(p.meta);
        if (Array.isArray(p.rows) && p.rows.length) setRows(p.rows);
      }
    } catch {}
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE, JSON.stringify({ meta, rows }));
  }, [meta, rows]);

  const totals = useMemo(() => {
    const tCtn = rows.reduce((s, r) => s + (parseFloat(r.ctn || "0") || 0), 0);
    const tAmount = rows.reduce((s, r) => s + amount(r), 0);
    return { tCtn, tAmount: +tAmount.toFixed(2) };
  }, [rows]);

  const updateRow = (id: string, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  const removeRow = (id: string) => setRows((rs) => rs.filter((r) => r.id !== id));
  const addRow = () => setRows((rs) => [...rs, newRow()]);

  const clearAll = () => {
    if (!confirm("هل تريد مسح كل البيانات؟ / Clear all data?")) return;
    setMeta(defaultMeta);
    setRows([newRow()]);
    toast.success("تم المسح / Cleared");
  };

  const onImage = async (id: string, f: File | null) => {
    if (!f) return;
    if (f.size > 4 * 1024 * 1024) {
      toast.error("الصورة كبيرة (>4MB) / Image too large");
      return;
    }
    const url = await fileToDataURL(f);
    updateRow(id, { image: url });
  };

  const exportPDF = async () => {
    const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
    const pageW = doc.internal.pageSize.getWidth();

    // Header
    doc.setFillColor(16, 185, 129);
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
      "", // image placeholder
      r.packing,
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
      styles: { fontSize: 9, cellPadding: 4, valign: "middle", halign: "center", minCellHeight: 44 },
      headStyles: { fillColor: [26, 26, 26], textColor: 255 },
      columnStyles: {
        1: { halign: "left" },
        2: { halign: "left" },
        3: { cellWidth: 60 },
      },
      didDrawCell: (data) => {
        if (data.section === "body" && data.column.index === 3) {
          const r = rows[data.row.index];
          if (r?.image) {
            try {
              const pad = 2;
              const size = Math.min(data.cell.width, data.cell.height) - pad * 2;
              const x = data.cell.x + (data.cell.width - size) / 2;
              const y = data.cell.y + (data.cell.height - size) / 2;
              doc.addImage(r.image, "JPEG", x, y, size, size);
            } catch {}
          }
        }
      },
    });

    const finalY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 16;
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
    pptx.layout = "LAYOUT_WIDE"; // 13.33 x 7.5
    pptx.title = meta.title;

    // Cover
    const cover = pptx.addSlide();
    cover.background = { color: "FFFFFF" };
    cover.addShape("rect", { x: 0, y: 0, w: 13.33, h: 1.4, fill: { color: "10B981" } });
    cover.addText(meta.title || "Proforma Invoice", { x: 0.5, y: 0.35, w: 12, h: 0.7, fontSize: 32, bold: true, color: "FFFFFF", fontFace: "Calibri" });
    cover.addText(meta.company, { x: 0.5, y: 1.7, w: 12, h: 0.5, fontSize: 22, bold: true, color: "1A1A1A" });
    cover.addText(`Customer: ${meta.customer || "-"}`, { x: 0.5, y: 2.4, w: 12, h: 0.4, fontSize: 18, color: "333333" });
    cover.addText(`Date: ${meta.date}`, { x: 0.5, y: 2.8, w: 12, h: 0.4, fontSize: 18, color: "333333" });
    cover.addText(`${meta.address}\n${meta.phone}\n${meta.email}`, { x: 0.5, y: 5.5, w: 12, h: 1.5, fontSize: 12, color: "666666" });

    // Table slide(s) — paginate ~12 rows per slide
    const perSlide = 12;
    const headerRow = [
      { text: "No", options: { bold: true, color: "FFFFFF", fill: { color: "1A1A1A" }, align: "center" } },
      { text: "Item", options: { bold: true, color: "FFFFFF", fill: { color: "1A1A1A" } } },
      { text: "Description", options: { bold: true, color: "FFFFFF", fill: { color: "1A1A1A" } } },
      { text: "Image", options: { bold: true, color: "FFFFFF", fill: { color: "1A1A1A" }, align: "center" } },
      { text: "Packing", options: { bold: true, color: "FFFFFF", fill: { color: "1A1A1A" }, align: "center" } },
      { text: "Ctn", options: { bold: true, color: "FFFFFF", fill: { color: "1A1A1A" }, align: "center" } },
      { text: "Doz/Ctn", options: { bold: true, color: "FFFFFF", fill: { color: "1A1A1A" }, align: "center" } },
      { text: "Set/Ctn", options: { bold: true, color: "FFFFFF", fill: { color: "1A1A1A" }, align: "center" } },
      { text: "Pcs/Set", options: { bold: true, color: "FFFFFF", fill: { color: "1A1A1A" }, align: "center" } },
      { text: "Price/Ctn", options: { bold: true, color: "FFFFFF", fill: { color: "1A1A1A" }, align: "center" } },
      { text: "T.Amount", options: { bold: true, color: "FFFFFF", fill: { color: "1A1A1A" }, align: "center" } },
    ];

    for (let p = 0; p < Math.max(1, Math.ceil(rows.length / perSlide)); p++) {
      const slide = pptx.addSlide();
      slide.addShape("rect", { x: 0, y: 0, w: 13.33, h: 0.6, fill: { color: "10B981" } });
      slide.addText(`${meta.title} — ${meta.customer || ""}`, { x: 0.3, y: 0.1, w: 9, h: 0.4, fontSize: 16, bold: true, color: "FFFFFF" });
      slide.addText(`Date: ${meta.date}`, { x: 9.5, y: 0.1, w: 3.5, h: 0.4, fontSize: 12, color: "FFFFFF", align: "right" });

      const slice = rows.slice(p * perSlide, (p + 1) * perSlide);
      const tableRows: PptxGenJS.TableRow[] = [headerRow as unknown as PptxGenJS.TableRow];
      slice.forEach((r, idx) => {
        const globalIdx = p * perSlide + idx + 1;
        tableRows.push([
          { text: String(globalIdx), options: { align: "center" } },
          { text: r.itemName },
          { text: r.description },
          { text: "" }, // image overlay added separately
          { text: r.packing, options: { align: "center" } },
          { text: r.ctn, options: { align: "center" } },
          { text: r.dozCtn, options: { align: "center" } },
          { text: r.setCtn, options: { align: "center" } },
          { text: r.pcsSet, options: { align: "center" } },
          { text: r.pricePerCtn, options: { align: "center" } },
          { text: amount(r).toString(), options: { align: "center", bold: true } },
        ] as unknown as PptxGenJS.TableRow);
      });

      const tableY = 0.9;
      const rowH = 0.45;
      slide.addTable(tableRows, {
        x: 0.2,
        y: tableY,
        w: 12.93,
        rowH,
        fontSize: 10,
        border: { type: "solid", pt: 0.5, color: "DDDDDD" },
        valign: "middle",
        colW: [0.5, 1.3, 1.5, 0.9, 1.0, 0.8, 0.9, 0.9, 0.9, 1.1, 1.2],
      });

      // Overlay images on Image column
      slice.forEach((r, idx) => {
        if (!r.image) return;
        const colXOffsets = [0.5, 1.3, 1.5, 0.9];
        let x = 0.2;
        for (let i = 0; i < 3; i++) x += colXOffsets[i];
        const y = tableY + (idx + 1) * rowH + 0.03;
        const size = rowH - 0.06;
        const cx = x + (colXOffsets[3] - size) / 2;
        try {
          slide.addImage({ data: r.image, x: cx, y, w: size, h: size });
        } catch {}
      });

      slide.addText(`Total Ctn: ${totals.tCtn}    |    Total Amount: ${totals.tAmount}`, {
        x: 0.3, y: 7.0, w: 12.7, h: 0.4, fontSize: 14, bold: true, color: "1A1A1A", align: "right",
      });
    }

    await pptx.writeFile({ fileName: `${meta.title || "proforma"}-${meta.customer || "customer"}.pptx` });
    toast.success("تم تصدير PowerPoint");
  };

  return (
    <div className="min-h-screen bg-[#f7f8f7]">
      {/* Header */}
      <header className="sticky top-0 z-20 border-b bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-[1400px] items-center justify-between gap-4 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500 text-white">
              <FileText className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-lg font-bold leading-tight">Proforma Invoice Generator</h1>
              <p className="text-xs text-muted-foreground">منشئ فواتير بروفورما — اعمل، حمّل PDF أو PowerPoint</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={clearAll} size="sm">مسح / Clear</Button>
            <Button onClick={exportPDF} size="sm" className="bg-emerald-600 hover:bg-emerald-700">
              <FileDown className="mr-1 h-4 w-4" /> PDF
            </Button>
            <Button onClick={exportPPTX} size="sm" className="bg-emerald-600 hover:bg-emerald-700">
              <Presentation className="mr-1 h-4 w-4" /> PowerPoint
            </Button>
          </div>
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
            <div className="md:col-span-2 lg:col-span-4">
              <Label className="mb-1.5 block text-xs">Notes / ملاحظات</Label>
              <Textarea rows={2} value={meta.notes} onChange={(e) => setMeta({ ...meta, notes: e.target.value })} />
            </div>
          </div>
        </Card>

        {/* Items */}
        <Card className="p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              الأصناف / Items ({rows.length})
            </h2>
            <Button onClick={addRow} size="sm" className="bg-emerald-600 hover:bg-emerald-700">
              <Plus className="mr-1 h-4 w-4" /> صنف جديد / Add Item
            </Button>
          </div>

          <div className="space-y-3">
            {rows.map((r, idx) => (
              <RowEditor
                key={r.id}
                index={idx + 1}
                row={r}
                onChange={(patch) => updateRow(r.id, patch)}
                onImage={(f) => onImage(r.id, f)}
                onRemove={() => removeRow(r.id)}
                amount={amount(r)}
              />
            ))}
          </div>

          <div className="mt-6 flex items-center justify-end gap-8 border-t pt-4 text-sm">
            <div>
              <span className="text-muted-foreground">Total Ctn / إجمالي الكراتين: </span>
              <span className="text-base font-bold">{totals.tCtn}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Total Amount / الإجمالي: </span>
              <span className="text-base font-bold text-emerald-600">{totals.tAmount}</span>
            </div>
          </div>
        </Card>

        <p className="text-center text-xs text-muted-foreground">
          يتم الحفظ تلقائياً في المتصفح • Auto-saved in your browser
        </p>
      </main>
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
  onChange,
  onImage,
  onRemove,
  amount,
}: {
  index: number;
  row: Row;
  onChange: (p: Partial<Row>) => void;
  onImage: (f: File | null) => void;
  onRemove: () => void;
  amount: number;
}) {
  const fileRef = useRef<HTMLInputElement>(null);

  return (
    <div className="rounded-lg border bg-white p-4">
      <div className="grid grid-cols-12 gap-3">
        {/* Number + image */}
        <div className="col-span-12 flex items-start gap-3 md:col-span-2">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-emerald-50 text-sm font-semibold text-emerald-700">
            {index}
          </div>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="relative flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-md border border-dashed bg-muted/40 text-muted-foreground transition hover:border-emerald-500 hover:text-emerald-600"
          >
            {row.image ? (
              <img src={row.image} alt="" className="h-full w-full object-cover" />
            ) : (
              <Upload className="h-5 w-5" />
            )}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => onImage(e.target.files?.[0] ?? null)}
          />
        </div>

        <div className="col-span-12 grid grid-cols-2 gap-3 md:col-span-10 md:grid-cols-6">
          <SmallField label="Item / الصنف" value={row.itemName} onChange={(v) => onChange({ itemName: v })} />
          <SmallField label="Desc / الوصف" value={row.description} onChange={(v) => onChange({ description: v })} />
          <SmallField label="Packing / التعبئة" value={row.packing} onChange={(v) => onChange({ packing: v })} />
          <SmallField label="Ctn / كراتين" value={row.ctn} onChange={(v) => onChange({ ctn: v })} type="number" />
          <SmallField label="Doz/Ctn" value={row.dozCtn} onChange={(v) => onChange({ dozCtn: v })} />
          <SmallField label="Set/Ctn" value={row.setCtn} onChange={(v) => onChange({ setCtn: v })} />
          <SmallField label="Pcs/Set" value={row.pcsSet} onChange={(v) => onChange({ pcsSet: v })} />
          <SmallField label="Price/Ctn" value={row.pricePerCtn} onChange={(v) => onChange({ pricePerCtn: v })} type="number" />
          <div>
            <Label className="mb-1.5 block text-[11px] text-muted-foreground">T.Amount</Label>
            <div className="flex h-9 items-center rounded-md border bg-emerald-50 px-3 text-sm font-semibold text-emerald-700">
              {amount}
            </div>
          </div>
          <div className="flex items-end justify-end">
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