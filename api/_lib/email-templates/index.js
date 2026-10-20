import * as earlyAccessV1 from './early-access-v1.js';
import * as paidAccessV1 from './paid-access-v1.js';

const templates = Object.freeze({
  'early-access-v1': earlyAccessV1,
  'paid-access-v1': paidAccessV1
});

export function getEmailTemplates() {
  const customerName = process.env.INTEREST_CUSTOMER_TEMPLATE || 'early-access-v1';
  const adminName = process.env.INTEREST_ADMIN_TEMPLATE || customerName;
  const customer = templates[customerName]?.customer;
  const admin = templates[adminName]?.admin;
  if (!customer) throw new Error(`Unknown customer email template: ${customerName}`);
  if (!admin) throw new Error(`Unknown admin email template: ${adminName}`);
  return { customer, admin };
}

export function getPaidAccessTemplate() {
  const name = process.env.PAID_ACCESS_TEMPLATE || 'paid-access-v1';
  const customer = templates[name]?.customer;
  if (!customer) throw new Error(`Unknown paid access email template: ${name}`);
  return customer;
}
