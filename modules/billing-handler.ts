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

    // Query LiteLLM's spend logs endpoint
    const spendLogsUrl = new URL("https://api-internal.publicai.co/spend/logs/v2");

    // Add request IDs as comma-separated query parameter
    spendLogsUrl.searchParams.set("request_ids", body.requestIds.join(","));

    context.log.info(`Fetching spend logs for ${body.requestIds.length} request IDs`);

    const spendLogsResponse = await fetch(spendLogsUrl.toString(), {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${environment.LITELLM_PRICING_KEY}`,
        "Content-Type": "application/json",
        "Accept-Encoding": "gzip, deflate, br"
      }
    });

    if (!spendLogsResponse.ok) {
      const errorText = await spendLogsResponse.text();
      context.log.error(`Failed to fetch spend logs: Status ${spendLogsResponse.status}, Error: ${errorText}`);
      return new Response(
        JSON.stringify({ error: "Failed to fetch billing data" }),
        { status: 502, headers: { "Content-Type": "application/json" } }
      );
    }

    const spendData = await spendLogsResponse.json() as {
      data: Array<{
        request_id: string;
        spend: number;
      }>;
    };

    context.log.info(`Retrieved spend data for ${spendData.data.length} requests`);

    // Create a map of request IDs to costs
    const costMap = new Map<string, number>();
    spendData.data.forEach(item => {
      // Convert USD to nano-USD (multiply by 10^9)
      const costNanoUsd = Math.round(item.spend * 1_000_000_000);
      costMap.set(item.request_id, costNanoUsd);
    });

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