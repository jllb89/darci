"use client";

import { useMemo, useState } from "react";
import catalog from "@/data/templates-catalog.json";

const tagStyles: Record<string, string> = {
  "notary-required": "border-amber-200 bg-amber-50 text-amber-700",
  "non-notary": "border-slate-200 bg-slate-50 text-slate-600",
  "state-specific": "border-blue-200 bg-blue-50 text-blue-700",
  general: "border-emerald-200 bg-emerald-50 text-emerald-700",
};

type TemplateItem = {
  name: string;
  tags: string[];
};

type CategoryItem = {
  name: string;
  count: number;
  templates: TemplateItem[];
};

const categories = catalog.categories as CategoryItem[];

export default function NewDocumentPage() {
  const [activeCategory, setActiveCategory] = useState(
    categories[0]?.name ?? ""
  );

  const active = useMemo(
    () => categories.find((item) => item.name === activeCategory),
    [activeCategory]
  );

  return (
    <div className="flex flex-col gap-6">
      <div>
        <div className="text-2xl font-medium">New document</div>
        <div className="text-sm text-Color-Neutral">
          Choose a template to start from.
        </div>
      </div>

      <div className="flex gap-6 min-h-0">
        <aside className="w-64 shrink-0 rounded-lg border border-Color-Scheme-1-Border/40 bg-Color-Scheme-1-Background p-4 max-h-[calc(100vh-240px)] overflow-y-auto">
          <div className="text-sm font-medium">Categories</div>
          <div className="mt-3 flex flex-col gap-1 text-sm">
            {categories.map((category) => {
              const isActive = category.name === activeCategory;
              return (
                <button
                  key={category.name}
                  type="button"
                  onClick={() => setActiveCategory(category.name)}
                  className={`flex items-center justify-between rounded px-2 py-1 text-left ${
                    isActive
                      ? "bg-Color-Neutral-Lightest font-medium"
                      : "hover:bg-Color-Neutral-Lightest"
                  }`}
                >
                  <span>{category.name}</span>
                  <span className="text-xs text-Color-Neutral">
                    {category.count}
                  </span>
                </button>
              );
            })}
          </div>
        </aside>

        <section className="flex-1">
          <div className="flex flex-col gap-1">
            <div className="text-lg font-medium">
              {active?.name ?? "Templates"}
            </div>
            <div className="text-xs uppercase text-Color-Neutral">
              {(active?.templates.length ?? 0).toString()} templates
            </div>
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {(active?.templates ?? []).map((template) => (
              <div
                key={template.name}
                className="rounded-lg border border-Color-Scheme-1-Border/40 bg-Color-Scheme-1-Background p-3"
              >
                <div className="flex h-32 items-center justify-center rounded-md border border-Color-Scheme-1-Border/40 bg-Color-Neutral-Lightest text-xs text-Color-Neutral">
                  PDF preview
                </div>
                <div className="mt-3 text-sm font-medium">
                  {template.name}
                </div>
                <div className="mt-2 flex flex-wrap gap-2 text-[10px] uppercase">
                  {template.tags.map((tag) => (
                    <span
                      key={`${template.name}-${tag}`}
                      className={`rounded-full border px-2 py-0.5 ${
                        tagStyles[tag] ??
                        "border-Color-Scheme-1-Border/40 text-Color-Neutral"
                      }`}
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
