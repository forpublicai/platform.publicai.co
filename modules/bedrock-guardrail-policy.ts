import { ZuploContext, ZuploRequest, environment } from "@zuplo/runtime";


interface ChatMessage {
  role: string;
  content: string | Array<{type: string; text?: string}>;
}

interface ChatCompletionRequest {
  model: string;
  messages: ChatMessage[];
  [key: string]: any;
}

async function sha256(message: string): Promise<string> {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  return Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

async function hmacSha256(key: ArrayBuffer, message: string): Promise<ArrayBuffer> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const msgBuffer = new TextEncoder().encode(message);
  return await crypto.subtle.sign('HMAC', cryptoKey, msgBuffer);
}

async function getSignatureKey(key: string, dateStamp: string, regionName: string, serviceName: string): Promise<ArrayBuffer> {
  const kDate = await hmacSha256(new TextEncoder().encode("AWS4" + key), dateStamp);
  const kRegion = await hmacSha256(kDate, regionName);
  const kService = await hmacSha256(kRegion, serviceName);
  const kSigning = await hmacSha256(kService, "aws4_request");
  return kSigning;
}

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

async function signV4(method: string, url: string, headers: Record<string, string>, payload: string, accessKeyId: string, secretAccessKey: string, region: string, service: string): Promise<Record<string, string>> {
  const urlObj = new URL(url);
  const host = urlObj.hostname;
  const uri = urlObj.pathname;
  
  const now = new Date();
  const amzdate = now.toISOString().replace(/[:\-]|\.\d{3}/g, '');
  const datestamp = amzdate.substr(0, 8);
  
  headers['Host'] = host;
  headers['X-Amz-Date'] = amzdate;
  
  const signedHeaders = Object.keys(headers)
    .map(k => k.toLowerCase())
    .sort()
    .join(';');
  
  const canonicalHeaders = Object.keys(headers)
    .sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()))
    .map(k => `${k.toLowerCase()}:${headers[k]}\n`)
    .join('');
  
  const payloadHash = await sha256(payload);
  
  const canonicalRequest = [
    method, uri, '', canonicalHeaders, signedHeaders, payloadHash
  ].join('\n');
  
  const algorithm = 'AWS4-HMAC-SHA256';
  const credentialScope = `${datestamp}/${region}/${service}/aws4_request`;
  const stringToSign = [
    algorithm, amzdate, credentialScope, await sha256(canonicalRequest)
  ].join('\n');
  
  const signingKey = await getSignatureKey(secretAccessKey, datestamp, region, service);
  const signature = toHex(await hmacSha256(signingKey, stringToSign));
  
  headers['Authorization'] = `${algorithm} Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
  
  return headers;
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

  const endpoint = `https://bedrock-runtime.${awsRegion}.amazonaws.com/guardrail/${guardrailId}/version/${guardrailVersion}/apply`;
  const payload = JSON.stringify({
    source: "INPUT",
    content: [{
      text: { text: content }
    }]
  });

  try {
    const headers = await signV4(
      'POST', endpoint, { 'Content-Type': 'application/json' }, payload,
      awsAccessKeyId, awsSecretAccessKey, awsRegion, 'bedrock'
    );

    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: payload
    });

    if (!response.ok) {
      const errorText = await response.text();
      context.log.error(`Guardrail API error: ${response.status} - ${errorText}`);
      throw new Error(`Guardrail API error: ${response.status}`);
    }

    const result = await response.json();
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

export default async function (
  request: ZuploRequest,
  context: ZuploContext,
  options: any,
  policyName: string
): Promise<ZuploRequest | Response> {
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