import { ZuploContext, ZuploRequest, environment } from "@zuplo/runtime";

export default async function (request: ZuploRequest, context: ZuploContext) {
  // 0: Print out everything in the request
  context.log.info("=== Request Details ===");
  context.log.info("URL:", request.url);
  context.log.info("Method:", request.method);
  context.log.info("Headers:", Object.fromEntries(request.headers.entries()));
  context.log.info("Query params:", request.query);

  // Clone the request to read the body (since body can only be read once)
  const requestClone = request.clone();
  const requestBody = await requestClone.text();
  context.log.info("Request body:", requestBody);

  context.log.info("=== Full ZuploContext ===");
  context.log.info(JSON.stringify(context, null, 2));

  // Example request: https://api.publicai.co/v1/developer/upgrade-plan?secret=SOME_SECRET
  // 1: Get the "secret" query param in the request. Check that it equals to environment.OPENCOLLECTIVE_WEBHOOK_SECRET. Else return unauthorized.
  const secret = request.query.secret;
  if (!secret || secret !== environment.OPENCOLLECTIVE_WEBHOOK_SECRET) {
    context.log.error("❌ Secret validation failed");
    return new Response("Unauthorized", { status: 401 });
  }
  context.log.info("✅ Secret validation passed");


  // Sample payload:
// {
//   "createdAt": "2022-07-18T10:30:44.479Z",
//   "id": 309906,
//   "CollectiveId": 16658,
//   "type": "collective.member.created",
//   "data": {
//     "member": {
//       "role": "BACKER",
//       "description": null,
//       "since": "2022-07-18T10:30:14.985Z",
//       "tier": {
//         "id": 1212,
//         "name": "backer",
//         "amount": 2000,
//         "currency": "USD",
//         "description": "Backers are individuals who support us",
//         "maxQuantity": 10
//       },
//       "memberCollective": {
//         "id": 4469,
//         "type": "USER",
//         "slug": "betree",
//         "name": "Ben",
//         "company": "@CaptainFact_io @opencollective",
//         "website": "https://benjamin.piouffle.com",
//         "twitterHandle": "Betree83",
//         "githubHandle": "Betree",
//         "repositoryUrl": "https://github.com/Betree",
//         "description": "Developer and civic tech enthusiast !",
//         "previewImage": "https://res.cloudinary.com/opencollective/image/fetch/c_thumb,g_face,h_48,r_max,w_48,bo_3px_solid_white/c_thumb,h_48,r_max,w_48,bo_2px_solid_rgb:66C71A/e_trim/f_jpg/https%3A%2F%2Fopencollective-staging.s3.us-west-1.amazonaws.com%2F550ac070-e0f8-11e9-9d4c-e9c71c24ba70.jpg"
//       }
//     },
//     "order": {
//       "id": 50684,
//       "totalAmount": 4198,
//       "currency": "EUR",
//       "description": "Monthly financial contribution to CaptainFact (Fixed recurring)",
//       "interval": "month",
//       "createdAt": "2022-07-18T10:30:09.855Z",
//       "quantity": 1,
//       "formattedAmount": "€41.98",
//       "formattedAmountWithInterval": "€41.98 / month"
//     }
//   }
// }
  // 2. Parse the request body to get the member slug
  const body = await request.json();
  context.log.info("✅ Request body parsed successfully");

  const memberSlug = body.data?.member?.memberCollective?.slug;
  context.log.info("Member slug extracted:", memberSlug);

  if (!memberSlug) {
    context.log.error("❌ Missing member slug in request body");
    return new Response("Missing member slug in request body", { status: 400 });
  }
  context.log.info("✅ Member slug validation passed");

  
  // 3. Query Opencollective API to get the users email using the member slug
  // https://api.opencollective.com/graphql/v2
  // Pass the Personal Token As an HTTP header: Personal-Token: environment.OPENCOLLECTIVE_PERSONAL_TOKEN
  const ocQuery = `
    query GetAccount($slug: String!) {
      account(slug: $slug) {
        emails
      }
    }
  `;

  const ocResponse = await fetch("https://api.opencollective.com/graphql/v2", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Personal-Token": environment.OPENCOLLECTIVE_PERSONAL_TOKEN,
    },
    body: JSON.stringify({
      query: ocQuery,
      variables: { slug: memberSlug },
    }),
  });

  if (!ocResponse.ok) {
    context.log.error("❌ Failed to query OpenCollective API", ocResponse.status, ocResponse.statusText);
    return new Response("Failed to query OpenCollective API", { status: 500 });
  }
  context.log.info("✅ OpenCollective API query successful");

  const ocData = await ocResponse.json();
  context.log.info("OpenCollective response:", JSON.stringify(ocData, null, 2));

  const emails = ocData.data?.account?.emails;
  const userEmail = emails && emails.length > 0 ? emails[0] : null;
  context.log.info("User email extracted:", userEmail);

  if (!userEmail) {
    context.log.error("❌ User email not found in OpenCollective response");
    return new Response("User email not found", { status: 404 });
  }
  context.log.info("✅ User email validation passed");

  // 4. GET the consumer ID from the Zuplo API. Authenticate with environment.ZP_DEVELOPER_API_KEY
  // https://dev.zuplo.com/v1/accounts/environment.ZP_ACCOUNT_NAME/key-buckets/environment.ZP_API_KEY_SERVICE_BUCKET_NAME/consumers?manager-email={user_email}
  const consumersResponse = await fetch(
    `https://dev.zuplo.com/v1/accounts/${environment.ZP_ACCOUNT_NAME}/key-buckets/${environment.ZP_API_KEY_SERVICE_BUCKET_NAME}/consumers?manager-email=${encodeURIComponent(userEmail)}`,
    {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${environment.ZP_DEVELOPER_API_KEY}`,
        "Content-Type": "application/json",
      },
    }
  );

  if (!consumersResponse.ok) {
    context.log.error("❌ Failed to get consumer from Zuplo API", consumersResponse.status, consumersResponse.statusText);
    return new Response("Failed to get consumer from Zuplo API", { status: 500 });
  }
  context.log.info("✅ Zuplo consumers API query successful");

  const consumersData = await consumersResponse.json();
  context.log.info("Zuplo consumers response:", JSON.stringify(consumersData, null, 2));

  const consumers = consumersData.data || [];
  context.log.info("Number of consumers found:", consumers.length);

  if (consumers.length === 0) {
    context.log.error("❌ No consumer found for email:", userEmail);
    return new Response("No consumer found for this email", { status: 404 });
  }

  const consumerName = consumers[0].name;
  context.log.info("✅ Consumer found:", consumerName);

  // 5. PATCH request to Zuplo API.
  // PATCH https://dev.zuplo.com/v1/accounts/{accountName}/key-buckets/{bucketName}/consumers/{consumerName}
  const updateResponse = await fetch(
    `https://dev.zuplo.com/v1/accounts/${environment.ZP_ACCOUNT_NAME}/key-buckets/${environment.ZP_API_KEY_SERVICE_BUCKET_NAME}/consumers/${consumerName}`,
    {
      method: "PATCH",
      headers: {
        "Authorization": `Bearer ${environment.ZP_DEVELOPER_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        metadata: {
          plan: "plus"
        }
      }),
    }
  );

  if (!updateResponse.ok) {
    context.log.error("❌ Failed to update consumer plan", updateResponse.status, updateResponse.statusText);
    return new Response("Failed to update consumer plan", { status: 500 });
  }
  context.log.info("✅ Consumer plan update successful");

  const updateData = await updateResponse.json();
  context.log.info("Update response:", JSON.stringify(updateData, null, 2));

  // 6. Return success
  context.log.info("🎉 Upgrade plan handler completed successfully");
  return new Response("Plan updated successfully", { status: 200 });
}