import { ZuploRequest, ZuploContext, environment } from "@zuplo/runtime";

interface ChatCompletionRequest {
  model: string;
  messages: any[];
  [key: string]: any;
}

interface ComputeInfo {
  location: string;
  sponsor: string;
  provider: string;
}

function getComputeInfo(provider: string, targetUrl: string): ComputeInfo {
  // Map your providers to their compute locations and sponsors
  switch (provider) {
    case "AI Singapore":
      return {
        location: "Singapore",
        sponsor: "AI Singapore",
        provider: "AI Singapore"
      };
    case "OpenRouter":
      return {
        location: "United States", // Update with actual location
        sponsor: "OpenRouter",
        provider: "OpenRouter"
      };
    case "Together":
      return {
        location: "United States", // Update with actual location  
        sponsor: "Together AI",
        provider: "Together AI"
      };
    default:
      return {
        location: "Unknown",
        sponsor: "Unknown",
        provider: provider
      };
  }
}

function shouldInjectComputeInfo(messages: any[]): boolean {
  // Only inject if this appears to be the start of a conversation
  // (no previous assistant messages)
  return !messages.some(msg => msg.role === 'assistant');
}

function injectComputeInfoMessage(messages: any[], computeInfo: ComputeInfo): any[] {
  const systemMessage = {
    role: "system",
    content: `You are running on compute infrastructure hosted in ${computeInfo.location}, provided by ${computeInfo.provider}${computeInfo.sponsor !== computeInfo.provider ? `, sponsored by ${computeInfo.sponsor}` : ''}. Please mention this information naturally in your first response to new conversations.`
  };

  return [systemMessage, ...messages];
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  try {
    // Parse request body to get the model
    const requestBody: ChatCompletionRequest = await request.json();
    const modelName = requestBody.model;

    if (!modelName) {
      return new Response(
        JSON.stringify({ error: "Model not specified" }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    let targetUrl: string;
    let headers: Record<string, string>;
    let selectedProvider: string;
    let randomChoiceResult: string | undefined; // Track random choice for headers

    // Route based on model
    switch (modelName) {
      // SeaLion models - single endpoint
      case "aisingapore/Gemma-SEA-LION-v3-9B-IT":
      case "aisingapore/Llama-SEA-LION-v3-8B-IT":
        targetUrl = "https://api.sea-lion.ai/v1/chat/completions";
        headers = {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${environment.SEALION_API_KEY}`
        };
        selectedProvider = "AI Singapore";
        context.log.info(`Routing ${modelName} to AI Singapore`);
        break;

      // OpenAI GPT OSS 120B - random 50/50 between OpenRouter and Together AI
      case "openai/gpt-oss-120b":
        const randomChoice = Math.random() < 0.5;
        
        if (randomChoice) {
          targetUrl = "https://openrouter.ai/api/v1/chat/completions";
          headers = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${environment.OPENROUTER_API_KEY}`
          };
          selectedProvider = "OpenRouter";
          randomChoiceResult = "OpenRouter";
          // Keep original model name for OpenRouter
          context.log.info(`Random load balancing ${modelName} to OpenRouter`);
        } else {
          targetUrl = "https://api.together.xyz/v1/chat/completions";
          headers = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${environment.TOGETHER_API_KEY}`
          };
          selectedProvider = "Together AI";
          randomChoiceResult = "Together";
          // Keep original model name for Together AI
          context.log.info(`Random load balancing ${modelName} to Together`);
        }
        break;

      default:
        return new Response(
          JSON.stringify({ 
            error: "Unsupported model",
            model: modelName,
            supported_models: [
              "aisingapore/Gemma-SEA-LION-v3-9B-IT",
              "aisingapore/Llama-SEA-LION-v3-8B-IT", 
              "openai/gpt-oss-120b"
            ]
          }),
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        );
    }

    // Get compute info for the selected provider
    const computeInfo = getComputeInfo(selectedProvider, targetUrl);
    
    // Inject compute info system message if this is a new conversation
    if (shouldInjectComputeInfo(requestBody.messages)) {
      requestBody.messages = injectComputeInfoMessage(requestBody.messages, computeInfo);
      context.log.info(`Injected compute info for ${selectedProvider} in ${computeInfo.location}`);
    }

    // For Together AI, ensure max_tokens is set
    if (targetUrl.includes('together.xyz')) {
      requestBody.max_tokens = requestBody.max_tokens || 1000;
    }

    // Forward the request
    const response = await fetch(targetUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(requestBody) // Use modified requestBody for all providers
    });

    // Log the response for debugging
    context.log.info(`Response status: ${response.status} from ${selectedProvider}`);
    if (!response.ok) {
      const errorText = await response.text();
      context.log.error(`Error response from ${selectedProvider}: ${errorText}`);
    }

    // Add tracking headers to response
    const responseHeaders = new Headers(response.headers);
    responseHeaders.set('X-Model-Requested', modelName);
    responseHeaders.set('X-Target-URL', targetUrl);
    responseHeaders.set('X-Selected-Provider', selectedProvider);
    responseHeaders.set('X-Load-Balancer', 'Zuplo-Random');
    responseHeaders.set('X-Compute-Location', computeInfo.location);
    responseHeaders.set('X-Compute-Sponsor', computeInfo.sponsor);

    if (modelName === "openai/gpt-oss-120b") {
      responseHeaders.set('X-Load-Balanced', 'true');
      responseHeaders.set('X-Random-Choice', randomChoiceResult || 'unknown');
    } else {
      responseHeaders.set('X-Load-Balanced', 'false');
    }

    context.log.info(`✅ Successfully routed ${modelName} to ${selectedProvider} in ${computeInfo.location}`);

    return new Response(await response.text(), {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders
    });

  } catch (error) {
    context.log.error(`❌ Error in load balancer: ${error}`);
    
    if (error instanceof SyntaxError) {
      return new Response(
        JSON.stringify({ error: "Invalid JSON in request body" }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}