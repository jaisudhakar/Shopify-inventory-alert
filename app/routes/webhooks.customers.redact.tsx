import type { ActionFunctionArgs } from "@remix-run/node";

import { authenticate } from "../shopify.server";

/**
 * Mandatory compliance webhook: a store owner has asked that a customer's data
 * be deleted.
 *
 * This app stores no customer personal data (see the customers/data_request
 * handler), so there is nothing to erase and the request is simply acknowledged.
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic } = await authenticate.webhook(request);

  console.info(
    `[inventory-alert] ${topic} for ${shop}: no customer personal data is stored by this app`,
  );

  return new Response();
};
