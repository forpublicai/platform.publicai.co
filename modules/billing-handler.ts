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

// Fetch with timeout
async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

// Retry with exponential backoff
async function fetchWithRetry(
  url: string,
  options: RequestInit,
  maxRetries: number = 3,
  timeoutMs: number = 45000
): Promise<Response> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await fetchWithTimeout(url, options, timeoutMs);

      // Retry on 5xx errors
      if (response.status >= 500 && attempt < maxRetries - 1) {
        const backoffMs = Math.pow(2, attempt) * 500; // 500ms, 1s, 2s
        await new Promise(resolve => setTimeout(resolve, backoffMs));
        continue;
      }

      return response;
    } catch (error) {
      lastError = error as Error;

      // Don't retry on abort (timeout)
      if ((error as Error).name === 'AbortError') {
        throw new Error(`Request timeout after ${timeoutMs}ms`);
      }

      if (attempt < maxRetries - 1) {
        const backoffMs = Math.pow(2, attempt) * 500;
        await new Promise(resolve => setTimeout(resolve, backoffMs));
      }
    }
  }

  throw lastError || new Error('Max retries exceeded');
}

// Process batches with limited concurrency
async function processWithConcurrencyLimit<T, R>(
  items: T[],
  processor: (item: T, index: number) => Promise<R>,
  concurrencyLimit: number
): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = new Array(items.length);
  let currentIndex = 0;

  async function processNext(): Promise<void> {
    while (currentIndex < items.length) {
      const index = currentIndex++;
      try {
        const value = await processor(items[index], index);
        results[index] = { status: 'fulfilled', value };
      } catch (reason) {
        results[index] = { status: 'rejected', reason };
      }
    }
  }

  // Start concurrent workers
  const workers = Array(Math.min(concurrencyLimit, items.length))
    .fill(null)
    .map(() => processNext());

  await Promise.all(workers);
  return results;
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

    const totalIds = body.requestIds.length;
    context.log.info(`Processing billing request for ${totalIds} request IDs`);

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

    // Larger batch size to reduce number of requests
    // 500 IDs × ~40 chars = ~20KB, well within URL limits
    const BATCH_SIZE = 500;
    // Limit concurrent requests to avoid overwhelming LiteLLM
    const MAX_CONCURRENCY = 10;

    const requestIdChunks = chunkArray(body.requestIds, BATCH_SIZE);
    context.log.info(`Split into ${requestIdChunks.length} batches of up to ${BATCH_SIZE} IDs (max ${MAX_CONCURRENCY} concurrent)`);

    const fetchBatch = async (chunk: string[], index: number) => {
      const spendLogsUrl = new URL("https://api-internal.publicai.co/spend/logs/v2");
      spendLogsUrl.searchParams.set("request_ids", chunk.join(","));
      spendLogsUrl.searchParams.set("start_date", startDateStr);
      spendLogsUrl.searchParams.set("end_date", endDateStr);

      const response = await fetchWithRetry(
        spendLogsUrl.toString(),
        {
          method: "GET",
          headers: {
            "Authorization": `Bearer ${environment.LITELLM_PRICING_KEY}`,
            "Content-Type": "application/json",
            "Accept-Encoding": "gzip, deflate, br"
          }
        },
        3,    // maxRetries
        45000 // timeoutMs (45s)
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Batch ${index}: Status ${response.status}, ${errorText}`);
      }

      return response.json() as Promise<{
        data: Array<{ request_id: string; spend: number }>;
      }>;
    };

    // Process batches with concurrency limit and partial failure tolerance
    const batchResults = await processWithConcurrencyLimit(
      requestIdChunks,
      fetchBatch,
      MAX_CONCURRENCY
    );

    // Merge results and track failures
    const costMap = new Map<string, number>();
    let failedBatches = 0;
    let successfulIds = 0;

    batchResults.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        result.value.data.forEach(item => {
          // Convert USD to nano-USD (multiply by 10^9)
          const costNanoUsd = Math.round(item.spend * 1_000_000_000);
          costMap.set(item.request_id, costNanoUsd);
          successfulIds++;
        });
      } else {
        failedBatches++;
        context.log.error(`Batch ${index} failed: ${result.reason}`);
      }
    });

    if (failedBatches > 0) {
      context.log.warn(`${failedBatches}/${requestIdChunks.length} batches failed, retrieved ${successfulIds}/${totalIds} IDs`);
    }

    // If ALL batches failed, return 502 to indicate upstream issue
    if (failedBatches === requestIdChunks.length && requestIdChunks.length > 0) {
      return new Response(
        JSON.stringify({ error: "Failed to fetch billing data from upstream service" }),
        { status: 502, headers: { "Content-Type": "application/json" } }
      );
    }

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
    const errorMessage = error instanceof Error ? error.message : String(error);
    context.log.error(`Billing handler error: ${errorMessage}`);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}