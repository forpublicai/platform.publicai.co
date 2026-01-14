import { ZuploContext, ZuploRequest, environment } from "@zuplo/runtime";

export default async function (
  request: ZuploRequest,
  context: ZuploContext
) {
  context.log.info("Delete payment method handler called");
  context.log.info(`Request URL: ${request.url}`);

  // Check if user is authenticated via JWT
  if (!request.user?.sub) {
    context.log.warn("No user.sub found in request - authentication failed");
    return new Response(
      JSON.stringify({
        error: {
          message: "Authentication required",
          type: "unauthorized"
        }
      }),
      {
        status: 401,
        headers: {
          "Content-Type": "application/json"
        }
      }
    );
  }

  const authSub = request.user.sub;
  context.log.info(`Authenticated user sub: ${authSub}`);

  // Extract payment method ID from path parameter
  const paymentMethodId = request.params.paymentMethodId;

  if (!paymentMethodId) {
    return new Response(
      JSON.stringify({
        error: {
          message: "Payment method ID is required",
          type: "invalid_request"
        }
      }),
      {
        status: 400,
        headers: {
          "Content-Type": "application/json"
        }
      }
    );
  }

  context.log.info(`Payment method ID to delete: ${paymentMethodId}`);

  // Look up the Zuplo consumer by querying the tag.sub
  const checkConsumerResponse = await fetch(
    `https://dev.zuplo.com/v1/accounts/${environment.ZP_ACCOUNT_NAME}/key-buckets/${environment.ZP_API_KEY_SERVICE_BUCKET_NAME}/consumers?tag.sub=${encodeURIComponent(authSub)}`,
    {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${environment.ZP_DEVELOPER_API_KEY}`,
      },
    }
  );

  if (!checkConsumerResponse.ok) {
    context.log.error("Failed to look up consumer from Zuplo");
    return new Response(
      JSON.stringify({
        error: {
          message: "Failed to look up user account",
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

  const consumersData = await checkConsumerResponse.json();

  if (!consumersData.data || consumersData.data.length === 0) {
    context.log.warn(`No consumer found with tag.sub = ${authSub}`);
    return new Response(
      JSON.stringify({
        error: {
          message: "User account not found",
          type: "not_found"
        }
      }),
      {
        status: 404,
        headers: {
          "Content-Type": "application/json"
        }
      }
    );
  }

  const consumer = consumersData.data[0];
  const userId = consumer.name;
  context.log.info(`Found consumer: ${consumer.id}, name: ${userId}`);

  try {
    // Get Stripe customer ID from Lago
    const customerResponse = await fetch(
      `${environment.LAGO_API_BASE}/api/v1/customers/${userId}`,
      {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${environment.LAGO_API_KEY}`,
          "Content-Type": "application/json"
        }
      }
    );

    if (!customerResponse.ok) {
      const errorText = await customerResponse.text();
      context.log.error(`Failed to fetch customer from Lago: ${errorText}`);
      return new Response(
        JSON.stringify({
          error: {
            message: "Failed to find customer",
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

    const customerData = await customerResponse.json();
    const stripeCustomerId = customerData.customer?.billing_configuration?.provider_customer_id;

    if (!stripeCustomerId) {
      context.log.warn(`No Stripe customer ID found in Lago for user: ${userId}`);
      return new Response(
        JSON.stringify({
          error: {
            message: "Customer not found in payment system",
            type: "not_found"
          }
        }),
        {
          status: 404,
          headers: {
            "Content-Type": "application/json"
          }
        }
      );
    }

    context.log.info(`Found Stripe customer ID from Lago: ${stripeCustomerId}`);

    // Verify the payment method belongs to this customer
    const paymentMethodResponse = await fetch(
      `https://api.stripe.com/v1/payment_methods/${paymentMethodId}`,
      {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${environment.STRIPE_API_KEY}`,
        }
      }
    );

    if (!paymentMethodResponse.ok) {
      const errorText = await paymentMethodResponse.text();
      context.log.error(`Failed to retrieve payment method: ${errorText}`);
      return new Response(
        JSON.stringify({
          error: {
            message: "Payment method not found",
            type: "not_found"
          }
        }),
        {
          status: 404,
          headers: {
            "Content-Type": "application/json"
          }
        }
      );
    }

    const paymentMethodData = await paymentMethodResponse.json();

    // Check if the payment method belongs to this customer
    if (paymentMethodData.customer !== stripeCustomerId) {
      context.log.warn(`Payment method ${paymentMethodId} does not belong to customer ${stripeCustomerId}`);
      return new Response(
        JSON.stringify({
          error: {
            message: "Payment method does not belong to this customer",
            type: "unauthorized"
          }
        }),
        {
          status: 403,
          headers: {
            "Content-Type": "application/json"
          }
        }
      );
    }

    // Detach the payment method from the customer
    const detachResponse = await fetch(
      `https://api.stripe.com/v1/payment_methods/${paymentMethodId}/detach`,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${environment.STRIPE_API_KEY}`,
        }
      }
    );

    if (!detachResponse.ok) {
      const errorText = await detachResponse.text();
      context.log.error(`Failed to detach payment method: ${errorText}`);
      return new Response(
        JSON.stringify({
          error: {
            message: "Failed to delete payment method",
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

    const detachedPaymentMethod = await detachResponse.json();
    context.log.info(`Successfully detached payment method: ${paymentMethodId}`);

    return new Response(
      JSON.stringify({
        success: true,
        payment_method: detachedPaymentMethod
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json"
        }
      }
    );
  } catch (error) {
    context.log.error(`Error deleting payment method: ${error}`);

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
