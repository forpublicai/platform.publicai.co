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

interface ProviderConfig {
  name: string;
  baseUrl: string;
  apiKey: string;
  computeInfo: ComputeInfo;
  requiresMaxTokens?: boolean;
  transformModel?: (model: string) => string;
}

interface ModelConfig {
  name: string;
  providers: string[];
  loadBalanceStrategy?: 'random' | 'round-robin' | 'single';
}

// Provider configurations - easy to extend
const PROVIDERS: Record<string, ProviderConfig> = {
  'ai-singapore': {
    name: 'AI Singapore',
    baseUrl: 'https://api.sea-lion.ai/v1/chat/completions',
    apiKey: environment.SEALION_API_KEY,
    computeInfo: {
      location: 'Singapore',
      sponsor: 'AI Singapore',
      provider: 'AI Singapore'
    }
  },
  'openrouter': {
    name: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1/chat/completions',
    apiKey: environment.OPENROUTER_API_KEY,
    computeInfo: {
      location: 'United States',
      sponsor: 'OpenRouter',
      provider: 'OpenRouter'
    }
  },
  'together': {
    name: 'Together AI',
    baseUrl: 'https://api.together.xyz/v1/chat/completions',
    apiKey: environment.TOGETHER_API_KEY,
    requiresMaxTokens: true,
    computeInfo: {
      location: 'United States',
      sponsor: 'Together AI',
      provider: 'Together AI'
    }
  }
};

// Model routing configurations - easy to extend
const MODEL_CONFIGS: Record<string, ModelConfig> = {
  'aisingapore/Gemma-SEA-LION-v3-9B-IT': {
    name: 'aisingapore/Gemma-SEA-LION-v3-9B-IT',
    providers: ['ai-singapore'],
    loadBalanceStrategy: 'single'
  },
  'aisingapore/Gemma-SEA-LION-v4-27B-IT-quantized': {
    name: 'aisingapore/Gemma-SEA-LION-v4-27B-IT-quantized',
    providers: ['ai-singapore'],
    loadBalanceStrategy: 'single'
  },
  'openai/gpt-oss-120b': {
    name: 'openai/gpt-oss-120b',
    providers: ['openrouter', 'together'],
    loadBalanceStrategy: 'random'
  }
};

function selectProvider(modelConfig: ModelConfig): { provider: ProviderConfig; selectedKey: string } {
  const { providers, loadBalanceStrategy = 'single' } = modelConfig;
  
  let selectedProviderKey: string;
  
  switch (loadBalanceStrategy) {
    case 'random':
      selectedProviderKey = providers[Math.floor(Math.random() * providers.length)];
      break;
    case 'single':
    default:
      selectedProviderKey = providers[0];
      break;
  }
  
  const provider = PROVIDERS[selectedProviderKey];
  if (!provider) {
    throw new Error(`Provider '${selectedProviderKey}' not found in configuration`);
  }
  
  return { provider, selectedKey: selectedProviderKey };
}

function getSupportedModels(): string[] {
  return Object.keys(MODEL_CONFIGS);
}

function shouldInjectComputeInfo(messages: any[]): boolean {
  // Only inject if this appears to be the start of a conversation
  // (no previous assistant messages)
  return !messages.some(msg => msg.role === 'assistant');
}

function injectComputeInfoMessage(messages: any[], computeInfo: ComputeInfo): any[] {
  const computeInfoContent = `You are running on compute infrastructure hosted in ${computeInfo.location}, provided by ${computeInfo.provider}${computeInfo.sponsor !== computeInfo.provider ? `, sponsored by ${computeInfo.sponsor}` : ''}. Please mention this information naturally in your first response to new conversations.`;

  // If first message is already a system message, append to it
  if (messages.length > 0 && messages[0].role === "system") {
    const updatedMessages = [...messages];
    updatedMessages[0] = {
      ...updatedMessages[0],
      content: updatedMessages[0].content + "\n\n" + computeInfoContent
    };
    return updatedMessages;
  }

  // Otherwise, add as new system message
  const systemMessage = {
    role: "system",
    content: computeInfoContent
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

    // Get model configuration
    const modelConfig = MODEL_CONFIGS[modelName];
    if (!modelConfig) {
      return new Response(
        JSON.stringify({ 
          error: "Unsupported model",
          model: modelName,
          supported_models: getSupportedModels()
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Select provider based on load balancing strategy
    const { provider, selectedKey } = selectProvider(modelConfig);
    
    // Build request configuration
    const targetUrl = provider.baseUrl;
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${provider.apiKey}`
    };
    
    // Transform model name if needed
    const finalModelName = provider.transformModel ? provider.transformModel(modelName) : modelName;
    if (finalModelName !== modelName) {
      requestBody.model = finalModelName;
    }
    
    context.log.info(`Routing ${modelName} to ${provider.name} via ${selectedKey}`);
    
    // Get compute info for the selected provider
    const computeInfo = provider.computeInfo;
    
    // Inject compute info system message if this is a new conversation
    if (shouldInjectComputeInfo(requestBody.messages)) {
      requestBody.messages = injectComputeInfoMessage(requestBody.messages, computeInfo);
      context.log.info(`Injected compute info for ${provider.name} in ${computeInfo.location}`);
    }

    // Apply provider-specific modifications
    if (provider.requiresMaxTokens) {
      requestBody.max_tokens = requestBody.max_tokens || 1000;
    }

    // Forward the request
    const response = await fetch(targetUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(requestBody) // Use modified requestBody for all providers
    });

    // Log the response for debugging
    context.log.info(`Response status: ${response.status} from ${provider.name}`);
    if (!response.ok) {
      const errorText = await response.text();
      context.log.error(`Error response from ${provider.name}: ${errorText}`);
    }

    // Add tracking headers to response
    const responseHeaders = new Headers(response.headers);
    responseHeaders.set('X-Model-Requested', modelName);
    responseHeaders.set('X-Target-URL', targetUrl);
    responseHeaders.set('X-Selected-Provider', provider.name);
    responseHeaders.set('X-Load-Balancer', 'Zuplo-Configurable');
    responseHeaders.set('X-Compute-Location', computeInfo.location);
    responseHeaders.set('X-Compute-Sponsor', computeInfo.sponsor);
    responseHeaders.set('X-Load-Balanced', modelConfig.loadBalanceStrategy !== 'single' ? 'true' : 'false');
    
    if (modelConfig.loadBalanceStrategy !== 'single') {
      responseHeaders.set('X-Selected-Provider-Key', selectedKey);
      responseHeaders.set('X-Load-Balance-Strategy', modelConfig.loadBalanceStrategy || 'single');
    }

    context.log.info(`✅ Successfully routed ${modelName} to ${provider.name} in ${computeInfo.location}`);

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