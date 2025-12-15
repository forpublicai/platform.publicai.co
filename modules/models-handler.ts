import { ZuploContext, ZuploRequest, environment } from "@zuplo/runtime";

interface ModelInfo {
  model_name: string;
  model_info: {
    input_cost_per_token: number | string;
    output_cost_per_token: number | string;
    max_input_tokens?: number;
    max_tokens?: number;
  };
}

interface ModelListResponse {
  data: Array<{
    id: string;
    object: string;
    created: number;
    owned_by: string;
  }>;
  object: string;
}

export default async function (
  request: ZuploRequest,
  context: ZuploContext
) {
  context.log.info("Models handler called");

  try {
    // Fetch both models list and model info in parallel
    const [modelsResponse, modelInfoResponse] = await Promise.all([
      fetch("https://api-internal.publicai.co/v1/models", {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${environment.LITELLM_PRICING_KEY}`,
          "Content-Type": "application/json",
        }
      }),
      fetch("https://api-internal.publicai.co/v1/model/info", {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${environment.LITELLM_PRICING_KEY}`,
          "Content-Type": "application/json",
        }
      })
    ]);

    if (!modelsResponse.ok) {
      const errorText = await modelsResponse.text();
      context.log.error(`Failed to fetch models: Status ${modelsResponse.status}, Error: ${errorText}`);
      return new Response(
        JSON.stringify({
          error: {
            message: "Failed to fetch models",
            type: "api_error"
          }
        }),
        {
          status: modelsResponse.status,
          headers: {
            "Content-Type": "application/json"
          }
        }
      );
    }

    if (!modelInfoResponse.ok) {
      context.log.warn(`Failed to fetch model info: Status ${modelInfoResponse.status}. Returning models without pricing info.`);
      // If model info fails, return models without pricing
      const modelsData = await modelsResponse.json();
      return new Response(JSON.stringify(modelsData), {
        status: 200,
        headers: {
          "Content-Type": "application/json"
        }
      });
    }

    const modelsData: ModelListResponse = await modelsResponse.json();
    const modelInfoData: { data: ModelInfo[] } = await modelInfoResponse.json();

    // Create a map of model_name to pricing info for quick lookup
    const pricingMap = new Map<string, ModelInfo["model_info"]>();
    for (const modelInfo of modelInfoData.data) {
      pricingMap.set(modelInfo.model_name, modelInfo.model_info);
    }

    context.log.info(`Processing ${modelsData.data.length} models with pricing info for ${pricingMap.size} models`);

    // Enrich each model with pricing and context_length
    const enrichedModels = modelsData.data.map(model => {
      const pricing = pricingMap.get(model.id);

      // Extract owned_by from model ID prefix (before the first "/")
      const ownedBy = model.id.includes('/')
        ? model.id.split('/')[0]
        : model.owned_by;

      if (!pricing) {
        context.log.debug(`No pricing info found for model: ${model.id}`);
        return {
          ...model,
          owned_by: ownedBy
        };
      }

      // Convert cost per token to cost per million tokens
      const inputCostPerToken = typeof pricing.input_cost_per_token === 'string'
        ? parseFloat(pricing.input_cost_per_token)
        : pricing.input_cost_per_token;

      const outputCostPerToken = typeof pricing.output_cost_per_token === 'string'
        ? parseFloat(pricing.output_cost_per_token)
        : pricing.output_cost_per_token;

      // Determine context length (prefer max_input_tokens, fallback to max_tokens)
      const contextLength = pricing.max_input_tokens || pricing.max_tokens;

      // Round to 6 decimal places to avoid floating point precision issues
      const roundPrice = (price: number) => Math.round(price * 1_000_000) / 1_000_000;

      return {
        ...model,
        owned_by: ownedBy,
        ...(inputCostPerToken && outputCostPerToken ? {
          pricing: {
            input: roundPrice(inputCostPerToken * 1_000_000),
            output: roundPrice(outputCostPerToken * 1_000_000)
          }
        } : {}),
        ...(contextLength ? { context_length: contextLength } : {})
      };
    });

    const enrichedResponse = {
      ...modelsData,
      data: enrichedModels
    };

    context.log.info(`Successfully enriched ${enrichedModels.length} models with pricing and context info`);

    return new Response(
      JSON.stringify(enrichedResponse),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json"
        }
      }
    );
  } catch (error) {
    context.log.error(`Error in models handler: ${error}`);

    return new Response(
      JSON.stringify({
        error: {
          message: "Internal server error",
          type: "server_error"
        }
      }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json"
        }
      }
    );
  }
}
