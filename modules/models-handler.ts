import { ZuploRequest, ZuploContext, environment } from "@zuplo/runtime";

interface ModelInfo {
  id: string;
  object: string;
  created: number;
  owned_by: string;
  provider?: string;
  load_balanced?: boolean;
}

interface ModelsResponse {
  object: string;
  data: ModelInfo[];
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  try {
    // Define the models you support based on your chat completions handler
    const supportedModels: ModelInfo[] = [
      // SeaLion models (single endpoint)
      {
        id: "aisingapore/Gemma-SEA-LION-v3-9B-IT",
        object: "model",
        created: Math.floor(Date.now() / 1000),
        owned_by: "aisingapore",
        provider: "aisingapore",
        load_balanced: false
      },
      {
        id: "aisingapore/Gemma-SEA-LION-v4-27B-IT-quantized", 
        object: "model",
        created: Math.floor(Date.now() / 1000),
        owned_by: "aisingapore",
        provider: "aisingapore",
        load_balanced: false
      },
      // OpenAI GPT OSS 120B (load balanced across OpenRouter and Together AI)
      {
        id: "openai/gpt-oss-120b",
        object: "model", 
        created: Math.floor(Date.now() / 1000),
        owned_by: "openai",
        provider: "openrouter,together",
        load_balanced: true
      }
    ];

    const response: ModelsResponse = {
      object: "list",
      data: supportedModels
    };

    context.log.info(`📋 Returned ${supportedModels.length} available models`);

    return new Response(JSON.stringify(response, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'X-Total-Models': supportedModels.length.toString(),
        'X-Load-Balanced-Models': supportedModels.filter(m => m.load_balanced).length.toString(),
        'X-Providers': 'sealion,openrouter,together'
      }
    });

  } catch (error) {
    context.log.error(`❌ Error in models API: ${error}`);
    
    return new Response(
      JSON.stringify({ 
        error: "Failed to fetch models",
        details: error.message 
      }),
      { 
        status: 500, 
        headers: { 'Content-Type': 'application/json' } 
      }
    );
  }
}