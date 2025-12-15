import { ZuploContext, ZuploRequest, environment } from "@zuplo/runtime";

interface BillingRequest {
  requestIds: string[];
}

interface BillingRequestItem {
  requestId: string;
  costNanoUsd: number;
}

interface BillingResponse {
  requests: BillingRequestItem[];
}

// Helper function to chunk array into smaller batches
function chunkArray<T>(array: T[], chunkSize: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += chunkSize) {
    chunks.push(array.slice(i, i + chunkSize));
  }
  return chunks;
}

export async function billingHandler(
  request: ZuploRequest,
  context: ZuploContext
): Promise<Response> {
  try {
    const body = await request.json() as BillingRequest;

    if (!body.requestIds || !Array.isArray(body.requestIds)) {
      return new Response(
        JSON.stringify({ error: "requestIds array is required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    context.log.info(`Processing billing request for ${body.requestIds.length} request IDs`);

    // Add date range (past 7 days to now) - required by LiteLLM API
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 7);

    // Format as 'YYYY-MM-DD HH:MM:SS'
    const formatDate = (date: Date): string => {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      const hours = String(date.getHours()).padStart(2, '0');
      const minutes = String(date.getMinutes()).padStart(2, '0');
      const seconds = String(date.getSeconds()).padStart(2, '0');
      return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
    };

    const startDateStr = formatDate(startDate);
    const endDateStr = formatDate(endDate);

    // Batch request IDs to avoid 414 URI Too Long errors
    // Each request ID is ~40 chars, so 50 IDs = ~2KB URL (safe limit)
    const BATCH_SIZE = 50;
    const requestIdChunks = chunkArray(body.requestIds, BATCH_SIZE);

    context.log.info(`Split into ${requestIdChunks.length} batches of up to ${BATCH_SIZE} IDs`);

    // Fetch spend logs for all batches in parallel
    const fetchPromises = requestIdChunks.map(async (chunk) => {
      const spendLogsUrl = new URL("https://api-internal.publicai.co/spend/logs/v2");
      spendLogsUrl.searchParams.set("request_ids", chunk.join(","));
      spendLogsUrl.searchParams.set("start_date", startDateStr);
      spendLogsUrl.searchParams.set("end_date", endDateStr);

      const response = await fetch(spendLogsUrl.toString(), {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${environment.LITELLM_PRICING_KEY}`,
          "Content-Type": "application/json",
          "Accept-Encoding": "gzip, deflate, br"
        }
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`LiteLLM API error: Status ${response.status}, ${errorText}`);
      }

      return response.json() as Promise<{
        data: Array<{
          request_id: string;
          spend: number;
        }>;
      }>;
    });

    // Wait for all batch requests to complete
    const batchResults = await Promise.all(fetchPromises);

    // Merge all batch results into a single cost map
    const costMap = new Map<string, number>();
    batchResults.forEach(result => {
      result.data.forEach(item => {
        // Convert USD to nano-USD (multiply by 10^9)
        const costNanoUsd = Math.round(item.spend * 1_000_000_000);
        costMap.set(item.request_id, costNanoUsd);
      });
    });

    context.log.info(`Retrieved spend data for ${costMap.size} requests`);

    // Build response with costs from spend logs, defaulting to 0 if not found
    const billingResponse: BillingResponse = {
      requests: body.requestIds.map(requestId => ({
        requestId,
        costNanoUsd: costMap.get(requestId) || 0
      }))
    };

    return new Response(JSON.stringify(billingResponse), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  } catch (error) {
    context.log.error("Error in billing handler:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}