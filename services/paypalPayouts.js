const axios = require('axios');

const PAYPAL_CLIENT = process.env.PAYPAL_CLIENT_ID;
const PAYPAL_SECRET = process.env.PAYPAL_CLIENT_SECRET;
const PAYPAL_API = process.env.PAYPAL_API;

const getAccessToken = async () => {
  const response = await axios.post(
    `${PAYPAL_API}/v1/oauth2/token`,
    'grant_type=client_credentials',
    {
      headers: {
        Authorization: 'Basic ' + Buffer.from(`${PAYPAL_CLIENT}:${PAYPAL_SECRET}`).toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    }
  );

  return response.data.access_token;
};

const createPayout = async ({ amount, currency, receiver, note, senderBatchId, senderItemId }) => {
  const accessToken = await getAccessToken();
  const response = await axios.post(
    `${PAYPAL_API}/v1/payments/payouts`,
    {
      sender_batch_header: {
        sender_batch_id: senderBatchId,
        email_subject: 'MatchPoint payout',
        email_message: 'You have a payout from MatchPoint.'
      },
      items: [
        {
          recipient_type: 'EMAIL',
          amount: {
            value: amount,
            currency: currency || 'SGD'
          },
          receiver,
          note: note || 'Coach payout',
          sender_item_id: senderItemId
        }
      ]
    },
    {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`
      },
      timeout: 15000
    }
  );

  return response.data;
};

const getPayoutBatch = async (batchId) => {
  const accessToken = await getAccessToken();
  const response = await axios.get(
    `${PAYPAL_API}/v1/payments/payouts/${batchId}`,
    {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`
      },
      timeout: 15000
    }
  );
  return response.data;
};

module.exports = { createPayout, getPayoutBatch };
