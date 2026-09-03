import type { ActionFunctionArgs } from "@remix-run/node";

import prisma from "../db.server";
import { authenticate } from "../shopify.server";
import { deleteShopData } from "../models/settings.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, session, topic } = await authenticate.webhook(request);
  console.info(`[inventory-alert] received ${topic} for ${shop}`);

  // The webhook can arrive after the session is already gone, so guard the
  // cleanup rather than assuming a session exists.
  if (session) {
    await prisma.session.deleteMany({ where: { shop } });
  }
  await deleteShopData(shop);

  return new Response();
};
