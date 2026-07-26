import { useState } from "react";
import { MODEL_CATALOG, type ModelEntry } from "./modelCatalogData";

function formatPricing(input: number, output: number): string {
  return `$${input.toFixed(2)} / $${output.toFixed(2)}`;
}

function hfUrl(modelId: string): string {
  return `https://huggingface.co/${modelId}`;
}

function ModelRow({ model }: { model: ModelEntry }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <>
      <tr
        className="border-b border-border cursor-pointer hover:bg-muted/50 transition-colors"
        onClick={() => setExpanded((prev) => !prev)}
        aria-expanded={expanded}
      >
        <td className="py-3 px-2">
          <span className="inline-block mr-2 text-muted-foreground select-none" aria-hidden="true">
            {expanded ? "▼" : "▶"}
          </span>
          <a
            href={hfUrl(model.id)}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline font-mono text-sm"
            onClick={(e) => e.stopPropagation()}
          >
            {model.id}
          </a>
        </td>
        <td className="py-3 px-2 text-sm text-muted-foreground whitespace-nowrap">
          {model.contextLength}
        </td>
        <td className="py-3 px-2 text-sm text-muted-foreground whitespace-nowrap">
          {formatPricing(model.inputPricePerMillion, model.outputPricePerMillion)}
          <span className="block text-xs text-muted-foreground">per 1M tokens</span>
        </td>
        <td className="py-3 px-2 text-sm text-muted-foreground">
          {model.country}
        </td>
      </tr>
      {expanded && (
        <tr className="border-b border-border bg-muted/30">
          <td colSpan={4} className="py-3 px-4 text-sm text-muted-foreground">
            {model.details}
          </td>
        </tr>
      )}
    </>
  );
}

export function ModelCatalog() {
  return (
    <div className="overflow-x-auto not-prose my-4">
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b-2 border-border">
            <th className="text-left py-3 px-2 font-semibold text-foreground">
              Model ID
            </th>
            <th className="text-left py-3 px-2 font-semibold text-foreground">
              Context Length
            </th>
            <th className="text-left py-3 px-2 font-semibold text-foreground">
              Pricing
            </th>
            <th className="text-left py-3 px-2 font-semibold text-foreground">
              Country of Origin
            </th>
          </tr>
        </thead>
        <tbody>
          {MODEL_CATALOG.map((model) => (
            <ModelRow key={model.id} model={model} />
          ))}
        </tbody>
      </table>
      <p className="text-xs text-muted-foreground mt-2">
        Click a row to expand details. Pricing is input / output per million tokens. See{" "}
        <a href="/account/billing" className="text-primary hover:underline">
          Billing
        </a>{" "}
        for live rates.
      </p>
    </div>
  );
}
