import { ZuploContext, environment } from "@zuplo/runtime";

export interface Auth0UserInfo {
  email?: string;
  name?: string;
  given_name?: string;
  family_name?: string;
  picture?: string;
  sub: string;
}

interface Auth0TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

/**
 * Gets a fresh Auth0 Management API token
 * Fetches a new token on every call for better security
 *
 * @param context - Zuplo context for logging
 * @returns Promise with the access token
 */
async function getAuth0ManagementToken(context: ZuploContext): Promise<string | null> {
  try {
    context.log.info("Fetching Auth0 Management API token");
    const response = await fetch(
      `${environment.AUTH0_DOMAIN}/oauth/token`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          client_id: environment.AUTH0_CLIENT_ID,
          client_secret: environment.AUTH0_CLIENT_SECRET,
          audience: `${environment.AUTH0_DOMAIN}/api/v2/`,
          grant_type: "client_credentials"
        })
      }
    );

    if (!response.ok) {
      const error = await response.text();
      context.log.error(`Failed to fetch Auth0 token: ${response.status}, ${error}`);
      return null;
    }

    const tokenData: Auth0TokenResponse = await response.json();
    context.log.info("Successfully fetched Auth0 Management API token");
    return tokenData.access_token;
  } catch (error) {
    context.log.error(`Error fetching Auth0 Management API token: ${error}`);
    return null;
  }
}

/**
 * Fetches user information from Auth0 Management API using a user's sub
 * This requires Auth0 client credentials configured in environment
 *
 * @param userSub - The Auth0 user sub (e.g., "google-oauth2|123456")
 * @param context - Zuplo context for logging
 * @returns Promise with user info from Auth0
 */
export async function getAuth0UserBySub(
  userSub: string,
  context: ZuploContext
): Promise<Auth0UserInfo | null> {
  try {
    // Get a valid Management API token (from cache or fetch new)
    const token = await getAuth0ManagementToken(context);
    if (!token) {
      context.log.error("Failed to get Auth0 Management API token");
      return null;
    }

    // Encode the user sub for URL (e.g., google-oauth2|123 -> google-oauth2%7C123)
    const encodedSub = encodeURIComponent(userSub);

    const response = await fetch(
      `${environment.AUTH0_DOMAIN}/api/v2/users/${encodedSub}`,
      {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json"
        }
      }
    );

    if (!response.ok) {
      const error = await response.text();
      context.log.error(`Failed to fetch Auth0 user by sub: ${response.status}, ${error}`);
      return null;
    }

    const userInfo = await response.json();
    context.log.info(`Retrieved Auth0 user info for sub: ${userInfo.sub}`);
    return userInfo;
  } catch (error) {
    context.log.error(`Error fetching Auth0 user by sub: ${error}`);
    return null;
  }
}
