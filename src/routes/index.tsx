import { createFileRoute } from "@tanstack/react-router";
import ProformaApp from "@/components/ProformaApp";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Proforma Invoice Generator | منشئ فواتير بروفورما" },
      { name: "description", content: "أنشئ فواتير بروفورما احترافية بسهولة وحمّلها PDF أو PowerPoint جاهزة للإرسال للعميل." },
      { property: "og:title", content: "Proforma Invoice Generator" },
      { property: "og:description", content: "Create professional proforma invoices and export to PDF or PowerPoint in one click." },
    ],
  }),
  component: () => <ProformaApp />,
});
