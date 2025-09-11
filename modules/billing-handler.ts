import { ZuploContext, ZuploRequest } from "@zuplo/runtime";

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

    // Return 0 cost for all requests (free tier)
    const billingResponse: BillingResponse = {
      requests: body.requestIds.map(requestId => ({
        requestId,
        costNanoUsd: 0
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