import { useState, useEffect } from "react";
import { MODEL_CATALOG, type ModelEntry } from "./modelCatalogData";

interface RawModelInfo {
  input_cost_per_token?: string | number | null;
  output_cost_per_token?: string | number | null;
  max_input_tokens?: number | null;
  max_output_tokens?: number | null;
  [key: string]: unknown;
}

interface RawLitellmParams {
  model?: string;
  max_tokens?: number;
  [key: string]: unknown;
}

interface RawModelItem {
  model_name: string;
  model_info?: RawModelInfo;
  litellm_params?: RawLitellmParams;
  [key: string]: unknown;
}

interface ModelsApiResponse {
  data?: RawModelItem[];
}

function parseCostPerMillion(val: unknown, fallback: number = 0): number {
  if (val !== undefined && val !== null) {
    const parsed = typeof val === "string" ? parseFloat(val) : Number(val);
    if (!isNaN(parsed) && isFinite(parsed)) {
      return parsed * 1_000_000;
    }
  }
  return fallback;
}

function transformModels(apiItems: RawModelItem[], staticCatalog: ModelEntry[]): ModelEntry[] {
  const staticMap = new Map<string, ModelEntry>(
    staticCatalog.map((item) => [item.id.toLowerCase().trim(), item])
  );

  const seen = new Set<string>();
  const results: ModelEntry[] = [];

  for (const item of apiItems) {
    const modelId = item.model_name?.trim();
    if (!modelId || seen.has(modelId)) {
      continue;
    }
    seen.add(modelId);

    const staticMatch = staticMap.get(modelId.toLowerCase());

    const inputPricePerMillion = parseCostPerMillion(
      item.model_info?.input_cost_per_token,
      staticMatch?.inputPricePerMillion ?? 0
    );

    const outputPricePerMillion = parseCostPerMillion(
      item.model_info?.output_cost_per_token,
      staticMatch?.outputPricePerMillion ?? 0
    );

    const contextLength =
      staticMatch?.contextLength ||
      (item.model_info?.max_input_tokens
        ? `${item.model_info.max_input_tokens}`
        : item.litellm_params?.max_tokens
        ? `${item.litellm_params.max_tokens}`
        : "-");

    const country = staticMatch?.country || "-";
    const details = staticMatch?.details || "";

    results.push({
      id: modelId,
      contextLength,
      inputPricePerMillion,
      outputPricePerMillion,
      country,
      details,
    });
  }

  return results;
}

function formatPricing(input: number, output: number): string {
  return `$${input.toFixed(2)} / $${output.toFixed(2)}`;
}

function hfUrl(modelId: string): string {
  return `https://huggingface.co/${modelId}`;
}

function ModelRow({ model }: { model: ModelEntry }) {
  const [expanded, setExpanded] = useState(false);
  const hasDetails = Boolean(model.details && model.details.trim());

  return (
    <>
      <tr
        className={`border-b border-border transition-colors ${
          hasDetails ? "cursor-pointer hover:bg-muted/50" : ""
        }`}
        onClick={() => hasDetails && setExpanded((prev) => !prev)}
        aria-expanded={hasDetails ? expanded : undefined}
      >
        <td className="py-3 px-2">
          {hasDetails ? (
            <span
              className="inline-block mr-2 text-muted-foreground select-none text-xs"
              aria-hidden="true"
            >
              {expanded ? "▼" : "▶"}
            </span>
          ) : (
            <span className="inline-block mr-2 w-3" aria-hidden="true" />
          )}
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
      {hasDetails && expanded && (
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
  const [models, setModels] = useState<ModelEntry[]>(MODEL_CATALOG);

  useEffect(() => {
    let isMounted = true;

    async function fetchModels() {
      try {
        const response = await fetch("https://models.publicai.co/info");
        if (!response.ok) {
          throw new Error(`Failed to fetch models: ${response.statusText}`);
        }

        const data: ModelsApiResponse | RawModelItem[] = await response.json();
        const rawList = Array.isArray(data) ? data : data.data || [];

        if (rawList.length > 0) {
          const transformed = transformModels(rawList, MODEL_CATALOG);
          if (isMounted && transformed.length > 0) {
            setModels(transformed);
          }
        }
      } catch (err) {
        console.error("Failed to load models from https://models.publicai.co/info:", err);
      }
    }

    fetchModels();

    return () => {
      isMounted = false;
    };
  }, []);

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
          {models.map((model) => (
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
