const axios = require("axios");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const Wallet = require("../models/Wallet");

const SERVICE_FEE = 2.5;

exports.generateQrCode = async (req, res) => {
  const { cartTotal } = req.body;
  const serviceFee = SERVICE_FEE;
  const sessionTotal = Number.parseFloat(req.session.pendingPayment?.total);
  const baseTotal = Number.isFinite(sessionTotal) && sessionTotal > 0
    ? sessionTotal + serviceFee
    : Number.parseFloat(cartTotal);
  const userId = req.session?.user?.id;
  let walletBalance = Number(req.session.pendingPayment?.walletBalance || 0);
  if (userId) {
    try {
      const walletRow = await new Promise((resolve, reject) => {
        Wallet.getWalletByUserId(userId, (err, row) => (err ? reject(err) : resolve(row)));
      });
      walletBalance = walletRow && Number.isFinite(Number(walletRow.balance)) ? Number(walletRow.balance) : walletBalance;
    } catch (err) {
      console.error('Failed to load wallet for NETS:', err.message);
    }
  }
  const requestedWallet = Number(req.body?.walletDeduction || 0);
  const walletDeduction = Math.max(0, Math.min(requestedWallet, walletBalance, baseTotal));
  const amount = Number((baseTotal - walletDeduction).toFixed(2));
  if (!amount || amount <= 0) {
    req.flash('error', 'Wallet covers the full amount. No NETS payment required.');
    return res.redirect('/payment');
  }
  try {
    const txnId = process.env.NETS_TXN_ID
      || "sandbox_nets|m|8ff8e5b6-d43e-4786-8ac5-7accf8c5bd9b";
    const requestBody = {
      txn_id: txnId,
      amt_in_dollars: Number(amount.toFixed(2)),
      notify_mobile: 0,
    };

    const requestUrl = "https://sandbox.nets.openapipaas.com/api/v1/common/payments/nets-qr/request";
    const apiKey = process.env.API_KEY;
    const projectId = process.env.PROJECT_ID;
    const maskValue = (value) => {
      if (!value || value.length < 8) return "missing";
      return `${value.slice(0, 4)}...${value.slice(-4)}`;
    };
    console.log("NETS request headers:", {
      "api-key": maskValue(apiKey),
      "project-id": maskValue(projectId),
    });
    console.log("NETS request body:", requestBody);
    const response = await axios.post(
      requestUrl,
      requestBody,
      {
        headers: {
          "api-key": apiKey,
          "project-id": projectId,
          "Content-Type": "application/json",
        },
      }
    );

    const getCourseInitIdParam = () => {
      try {
        const courseInitPath = path.join(__dirname, "..", "course_init_id.js");
        if (!fs.existsSync(courseInitPath)) return "";
        const content = fs.readFileSync(courseInitPath, "utf8");
        const match = content.match(/courseInitId\s*=\s*['"]([^'"]+)['"]/);
        return match ? match[1] : "";
      } catch (error) {
        return "";
      }
    };

    const qrData = response.data.result.data;
    console.log({ qrData });

    if (
      qrData.response_code === "00" &&
      qrData.txn_status === 1 &&
      qrData.qr_code
    ) {
      console.log("QR code generated successfully");

      // Store transaction retrieval reference for later use
      const txnRetrievalRef = qrData.txn_retrieval_ref;
      const courseInitId = getCourseInitIdParam();

      const webhookUrl = `https://sandbox.nets.openapipaas.com/api/v1/common/payments/nets/webhook?txn_retrieval_ref=${txnRetrievalRef}&course_init_id=${courseInitId}`;

      console.log("Transaction retrieval ref:" + txnRetrievalRef);
      console.log("courseInitId:" + courseInitId);
      console.log("webhookUrl:" + webhookUrl);

      
      // Render the QR code page with required data
      const cart = req.session.pendingPayment?.cart || [];
      const deliveryAddress = req.session.pendingPayment?.deliveryAddress || '';
      const total = req.session.pendingPayment?.total || 0;
      const paypalAmount = Number(Math.max(0, (Number(total || 0) + serviceFee) - walletDeduction).toFixed(2));

      req.session.pendingPayment = {
        ...(req.session.pendingPayment || {}),
        walletDeduction,
        walletBalance,
        nets: {
          txnRetrievalRef,
          startedAt: Date.now()
        }
      };

      return res.render("payment", {
        cart,
        user: req.session.user,
        deliveryAddress,
        total,
        serviceFee,
        amountDue: paypalAmount,
        orderId: req.body.orderId || 'pending',
        qrCodeUrl: `data:image/png;base64,${qrData.qr_code}`,
        txnRetrievalRef,
        courseInitId,
        networkCode: qrData.network_status,
        timer: 300,
        webhookUrl,
        fullNetsResponse: response.data,
        paypalClientId: process.env.PAYPAL_CLIENT_ID || '',
        stripePublishableKey: process.env.STRIPE_PUBLISHABLE_KEY || '',
        paypalCurrency: 'SGD',
        paypalAmount,
        walletBalance,
        walletDeduction,
        messages: req.flash()
      });
    } else {
      // Handle partial or failed responses
      let errorMsg = "An error occurred while generating the QR code.";
      if (qrData.network_status !== 0) {
        errorMsg =
          qrData.error_message || "Transaction failed. Please try again.";
      }
      req.flash('error', errorMsg);
      return res.redirect('/payment');

    }
  } catch (error) {
    const status = error.response?.status;
    const data = error.response?.data;
    console.error("Error in generateQrCode:", error.message);
    if (status) {
      console.error("NETS request failed:", status);
    }
    if (data) {
      console.error("NETS response body:", JSON.stringify(data));
    }
    res.redirect("/nets-qr/fail");
  }
};
