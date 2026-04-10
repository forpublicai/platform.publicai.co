import { ZuploContext, ZuploRequest, environment } from "@zuplo/runtime";

export default async function (
  request: ZuploRequest,
  context: ZuploContext
) {
  context.log.info("Pricing handler called");

  try {
    // Fetch pricing data from the internal API
    const pricingResponse = await fetch(
      "https://api-internal.publicai.co/v1/model/info",
      {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${environment.LITELLM_PRICING_KEY}`,
          "Content-Type": "application/json",
        }
      }
    );

    if (!pricingResponse.ok) {
      const errorText = await pricingResponse.text();
      context.log.error(`Failed to fetch pricing data: Status ${pricingResponse.status}, Error: ${errorText}`);

      return new Response(
        JSON.stringify({
          error: {
            message: "Failed to fetch pricing information",
            type: "api_error"
          }
        }),
        {
          status: 500,
          headers: {
            "Content-Type": "application/json"
          }
        }
      );
    }

    const pricingData = await pricingResponse.json();
    context.log.info(`Pricing data retrieved successfully`);

    // Return the pricing data
    return new Response(
      JSON.stringify(pricingData),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json"
        }
      }
    );
  } catch (error) {
    context.log.error(`Error fetching pricing data: ${error}`);

    return new Response(
      JSON.stringify({
        error: {
          message: "Internal server error",
          type: "server_error"
        }
      }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json"
        }
      }
    );
  }
}
