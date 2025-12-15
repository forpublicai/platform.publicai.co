import { ZuploContext, ZuploRequest } from "@zuplo/runtime";

export default async function (
  response: Response,
  request: ZuploRequest,
  context: ZuploContext,
  options: any,
  policyName: string,
) {
  // Only process successful responses
  if (!response.ok) {
    return response;
  }

  const contentType = response.headers.get("content-type") || "";
  const isStreaming = contentType.includes("text/event-stream");

  if (isStreaming) {
    return handleStreamingResponse(response, context);
  } else {
    return handleNonStreamingResponse(response, context);
  }
}

async function handleNonStreamingResponse(
  response: Response,
  context: ZuploContext,
): Promise<Response> {
  try {
    // Read the response body to extract the completion ID
    const data = await response.json();

    // Extract the ID from the response (e.g., "chatcmpl-6d8f49c37598453da85cb6ea8dc6ec6e")
    const completionId = data.id;

    if (!completionId) {
      context.log.warn("No completion ID found in response body");
      return new Response(JSON.stringify(data), {
        status: response.status,
        headers: response.headers,
      });
    }

    // Create a new response with the Inference-Id header
    const newResponse = new Response(JSON.stringify(data), {
      status: response.status,
      headers: response.headers,
    });

    // Add the Inference-Id header as required by HuggingFace
    newResponse.headers.set("Inference-Id", completionId);

    context.log.info(`Added Inference-Id header: ${completionId}`);

    return newResponse;
  } catch (error) {
    context.log.error(`Error adding Inference-Id header to non-streaming response: ${error}`);
    return response;
  }
}

async function handleStreamingResponse(
  response: Response,
  context: ZuploContext,
): Promise<Response> {
  const reader = response.body?.getReader();
  if (!reader) {
    context.log.error("No response body reader available for streaming response");
    return response;
  }

  const decoder = new TextDecoder();
  let completionId: string | null = null;
  let firstChunkRead = false;
  let bufferedChunks: Uint8Array[] = [];

  try {
    // Read the first chunk to extract the completion ID
    const { done, value } = await reader.read();

    if (done || !value) {
      context.log.warn("Stream ended before reading first chunk");
      reader.releaseLock();
      return response;
    }

    bufferedChunks.push(value);
    firstChunkRead = true;

    // Decode the first chunk to extract the ID
    const text = decoder.decode(value, { stream: true });

    // SSE format: "data: {json}\n\n"
    // The first chunk should contain the ID
    const dataMatch = text.match(/data:\s*({.*?})/);
    if (dataMatch) {
      try {
        const chunk = JSON.parse(dataMatch[1]);
        completionId = chunk.id;
        context.log.info(`Extracted completion ID from streaming response: ${completionId}`);
      } catch (e) {
        context.log.warn(`Failed to parse first SSE chunk for ID extraction: ${e}`);
      }
    }

    if (!completionId) {
      context.log.warn("Could not extract completion ID from first streaming chunk");
    }

    // Create a new stream that replays the buffered chunks and continues with the rest
    const stream = new ReadableStream({
      async start(controller) {
        try {
          // First, enqueue all buffered chunks
          for (const chunk of bufferedChunks) {
            controller.enqueue(chunk);
          }

          // Then continue reading and enqueuing the rest of the stream
          while (true) {
            const { done, value } = await reader.read();
            if (done) {
              controller.close();
              break;
            }
            controller.enqueue(value);
          }
        } catch (error) {
          controller.error(error);
        } finally {
          reader.releaseLock();
        }
      },
    });

    // Create new response with the Inference-Id header
    const newResponse = new Response(stream, {
      status: response.status,
      headers: response.headers,
    });

    if (completionId) {
      newResponse.headers.set("Inference-Id", completionId);
      context.log.info(`Added Inference-Id header for streaming response: ${completionId}`);
    }

    return newResponse;
  } catch (error) {
    context.log.error(`Error handling streaming response: ${error}`);

    // Try to release the reader lock if we still have it
    try {
      reader.releaseLock();
    } catch (e) {
      // Ignore if already released
    }

    return response;
  }
}
