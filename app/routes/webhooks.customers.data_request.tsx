import type { ActionFunctionArgs } from "@remix-run/node";

import { authenticate } from "../shopify.server";

/**
 * Mandatory compliance webhook: a customer has asked a store owner for the
 * personal data this app holds about them.
 *
 * This app stores no customer personal data. It reads product and inventory
 * records only, and the rows it keeps (alert settings and a digest audit trail)
 * are per shop, never per customer. There is therefore nothing to return, and
 * the correct response is a 200 acknowledging the request.
 *
 * If this app is ever extended to store customer data, this handler has to
 * start returning it to the merchant within 30 days of the request.
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  // Verifies the HMAC signature; an unsigned or forged request throws here.
  const { shop, topic } = await authenticate.webhook(request);

  console.info(
    `[inventory-alert] ${topic} for ${shop}: no customer personal data is stored by this app`,
  );

  return new Response();
};
