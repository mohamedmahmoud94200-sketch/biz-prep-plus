import { createFileRoute } from "@tanstack/react-router";
import ProformaApp from "@/components/ProformaApp";

export const Route = createFileRoute("/_authenticated/")({
  head: () => ({
    meta: [
      { title: "Proforma Invoice Generator" },
      { name: "description", content: "إنشاء بروفورما احترافية وتصدير PDF أو PowerPoint." },
      { property: "og:title", content: "Proforma Invoice Generator" },
      { property: "og:description", content: "إنشاء بروفورما احترافية وتصدير PDF أو PowerPoint." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => <ProformaApp />,
});