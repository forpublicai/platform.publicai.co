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

    spendLogsUrl.searchParams.set("start_date", formatDate(startDate));
    spendLogsUrl.searchParams.set("end_date", formatDate(endDate));

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