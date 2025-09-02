import { ZuploContext, ZuploRequest, environment } from "@zuplo/runtime";

interface GuardrailRequest {
  source: "INPUT" | "OUTPUT";
  content: Array<{
    text: {
      text: string;
    };
  }>;
}

interface GuardrailResponse {
  action: "NONE" | "GUARDRAIL_INTERVENED";
  outputs: Array<{
    text: string;
  }>;
}

interface ChatMessage {
  role: string;
  content: string | Array<{type: string; text?: string}>;
}

interface ChatCompletionRequest {
  model: string;
  messages: ChatMessage[];
  [key: string]: any;
}

async function checkGuardrail(content: string, context: ZuploContext): Promise<boolean> {
  const guardrailId = environment.BEDROCK_GUARDRAIL_ID;
  const guardrailVersion = environment.BEDROCK_GUARDRAIL_VERSION || "DRAFT";
  
  if (!guardrailId) {
    context.log.warn("BEDROCK_GUARDRAIL_ID not configured, skipping guardrail check");
    return true;
  }

  const awsRegion = "eu-central-2";
  const awsAccessKeyId = environment.AWS_ACCESS_KEY_ID;
  const awsSecretAccessKey = environment.AWS_SECRET_ACCESS_KEY;

  if (!awsAccessKeyId || !awsSecretAccessKey) {
    context.log.error("AWS credentials not configured");
    throw new Error("AWS credentials not configured");
  }

  const requestBody: GuardrailRequest = {
    source: "INPUT",
    content: [
      {
        text: {
          text: content
        }
      }
    ]
  };

  const endpoint = `https://bedrock-runtime.${awsRegion}.amazonaws.com/guardrail/${guardrailId}/version/${guardrailVersion}/apply`;

  const now = new Date();
  const amzDate = now.toISOString().replace(/[:\-]|\.\d{3}/g, '');

  const headers = {
    "Content-Type": "application/json",
    "X-Amz-Date": amzDate,
    "Authorization": `AWS4-HMAC-SHA256 Credential=${awsAccessKeyId}/${amzDate.substr(0, 8)}/${awsRegion}/bedrock/aws4_request, SignedHeaders=content-type;host;x-amz-date, Signature=placeholder`
  };

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorText = await response.text();
      context.log.error(`Guardrail API error: ${response.status} - ${errorText}`);
      throw new Error(`Guardrail API error: ${response.status}`);
    }

    const result = await response.json() as GuardrailResponse;
    context.log.info(`Guardrail result: ${result.action}`);
    
    return result.action === "NONE";
  } catch (error) {
    context.log.error(`Error calling guardrail API: ${error}`);
    throw error;
  }
}

function extractTextFromMessages(messages: ChatMessage[]): string {
  return messages
    .map(message => {
      if (typeof message.content === 'string') {
        return message.content;
      } else if (Array.isArray(message.content)) {
        return message.content
          .filter(item => item.type === 'text' && item.text)
          .map(item => item.text)
          .join(' ');
      }
      return '';
    })
    .filter(text => text.length > 0)
    .join(' ');
}

export default async function (request: ZuploRequest, context: ZuploContext, policyName: string) {
  try {
    const body = await request.json() as ChatCompletionRequest;
    
    const messageText = extractTextFromMessages(body.messages);
    
    if (messageText.trim().length === 0) {
      context.log.info("No text content found in messages, skipping guardrail check");
      return request;
    }
    
    const isAllowed = await checkGuardrail(messageText, context);
    
    if (!isAllowed) {
      context.log.warn("Request blocked by guardrail");
      return new Response(
        JSON.stringify({
          error: {
            message: "Request blocked by content policy",
            type: "content_filter",
            code: "content_filter"
          }
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" }
        }
      );
    }
    
    const newRequest = new Request(request.url, {
      method: request.method,
      headers: request.headers,
      body: JSON.stringify(body)
    });
    
    return newRequest;
    
  } catch (error) {
    context.log.error(`Error in guardrail policy: ${error}`);
    return new Response(
      JSON.stringify({
        error: {
          message: "Internal server error",
          type: "server_error",
          code: "internal_error"
        }
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" }
      }
    );
  }
}