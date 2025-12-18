const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { body, validationResult } = require('express-validator');
const path = require('path');

// Payment Mode Configuration
const PAYMENT_MODE = process.env.PAYMENT_MODE || 'HDFC'; // Options: 'RAZORPAY', 'BANK_TRANSFER', 'HDFC'

// Initialize HDFC Payment Handler
let hdfcPaymentHandler = null;
if (PAYMENT_MODE === 'HDFC') {
  try {
    const { PaymentHandler, validateHMAC_SHA256 } = require('../services/PaymentHandler');
    
    // Create config from environment variables (works on Vercel)
    const hdfcConfig = {
      API_KEY: process.env.HDFC_API_KEY,
      MERCHANT_ID: process.env.HDFC_MERCHANT_ID,
      PAYMENT_PAGE_CLIENT_ID: process.env.HDFC_PAYMENT_PAGE_CLIENT_ID,
      BASE_URL: process.env.HDFC_BASE_URL,
      RESPONSE_KEY: process.env.HDFC_RESPONSE_KEY,
      ENABLE_LOGGING: process.env.HDFC_ENABLE_LOGGING === 'true',
      LOGGING_PATH: './logs/PaymentHandler.log'
    };
    
    // Initialize with config object instead of file path
    hdfcPaymentHandler = PaymentHandler.getInstanceFromConfig(hdfcConfig);
    console.log('✅ HDFC Payment Gateway initialized from environment variables');
    
    // Export validator for use in verify route
    router.hdfcValidator = validateHMAC_SHA256;
  } catch (error) {
    console.error('❌ Error initializing HDFC Payment Handler:', error.message);
    console.error('Stack trace:', error.stack);
    console.log('ℹ️  Falling back to Bank Transfer mode');
  }
}

// Initialize Razorpay only if configured
let razorpay = null;
if (PAYMENT_MODE === 'RAZORPAY' && process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET) {
  const Razorpay = require('razorpay');
  razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET
  });
  console.log('✅ Razorpay payment gateway initialized');
}

if (!hdfcPaymentHandler && !razorpay) {
  console.log('ℹ️  Using Bank Transfer/Manual payment mode');
}

/**
 * POST /api/payments/create-order
 * Create payment order (supports HDFC, Razorpay, or Bank Transfer)
 */
router.post('/create-order', [
  body('amount').isFloat({ min: 1 }).withMessage('Valid amount is required'),
  body('currency').optional().isString(),
  body('receipt').optional().isString(),
  body('bookingId').optional().isString(),
  body('customerEmail').optional().isString(),
  body('customerPhone').optional().isString()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }

    const { amount, currency = 'INR', receipt, notes, bookingId, customerEmail, customerPhone } = req.body;
    const orderId = `order_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // HDFC Payment Gateway
    if (PAYMENT_MODE === 'HDFC' && hdfcPaymentHandler) {
      try {
        const returnUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/payment-response`;
        
        const orderSessionResp = await hdfcPaymentHandler.orderSession({
          order_id: orderId,
          amount: parseFloat(amount),
          currency: currency,
          return_url: returnUrl,
          customer_id: customerEmail || `customer_${Date.now()}`,
          customer_email: customerEmail,
          customer_phone: customerPhone
        });

        console.log('✅ HDFC Order Session created:', orderId);

        return res.json({
          success: true,
          paymentMode: 'HDFC',
          order: {
            id: orderId,
            amount: amount,
            currency: currency,
            receipt: receipt || `receipt_${Date.now()}`
          },
          paymentLink: orderSessionResp.payment_links.web,
          redirectUrl: orderSessionResp.payment_links.web,
          merchantId: hdfcPaymentHandler.getMerchantId(),
          paymentPageClientId: hdfcPaymentHandler.getPaymentPageClientId()
        });
      } catch (error) {
        console.error('❌ HDFC Payment Error:', error.message);
        return res.status(500).json({
          success: false,
          error: 'Failed to create HDFC payment session',
          details: error.message
        });
      }
    }

    // Razorpay Gateway
    if (PAYMENT_MODE === 'RAZORPAY' && razorpay) {
      const options = {
        amount: Math.round(amount * 100), // Amount in paise
        currency,
        receipt: receipt || `receipt_${Date.now()}`,
        notes: notes || {}
      };

      const order = await razorpay.orders.create(options);

      return res.json({
        success: true,
        paymentMode: 'RAZORPAY',
        order: {
          id: order.id,
          amount: order.amount,
          currency: order.currency,
          receipt: order.receipt
        },
        key: process.env.RAZORPAY_KEY_ID
      });
    }

    // Bank Transfer (Manual Payment)
    return res.json({
      success: true,
      paymentMode: 'BANK_TRANSFER',
      order: {
        id: orderId,
        amount: amount,
        currency: currency,
        receipt: receipt || `receipt_${Date.now()}`
      },
      bankDetails: {
        accountName: process.env.BANK_ACCOUNT_NAME || 'Immersive Trips',
        accountNumber: process.env.BANK_ACCOUNT_NUMBER || 'Will be provided',
        ifscCode: process.env.BANK_IFSC_CODE || 'Will be provided',
        bankName: process.env.BANK_NAME || 'Will be provided',
        upiId: process.env.UPI_ID || 'Will be provided'
      },
      message: 'Please complete the bank transfer and share payment proof'
    });
  } catch (error) {
    console.error('Error creating payment order:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/payments/verify
 * Verify payment (HDFC, Razorpay signature, or Bank Transfer proof)
 */
router.post('/verify', async (req, res) => {
  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      bank_order_id,
      payment_proof,
      transaction_id,
      order_id,
      orderId
    } = req.body;

    const orderIdToCheck = order_id || orderId;

    // HDFC Payment Verification
    if (PAYMENT_MODE === 'HDFC' && orderIdToCheck && hdfcPaymentHandler) {
      try {
        const orderStatusResp = await hdfcPaymentHandler.orderStatus(orderIdToCheck);
        
        // Validate HMAC signature from HDFC response
        const { validateHMAC_SHA256 } = require('../services/PaymentHandler');
        const isValidSignature = validateHMAC_SHA256(req.body, hdfcPaymentHandler.getResponseKey());
        
        if (!isValidSignature) {
          console.warn('⚠️  HDFC HMAC validation failed for order:', orderIdToCheck);
          return res.status(400).json({
            success: false,
            error: 'Invalid payment signature',
            paymentMode: 'HDFC'
          });
        }

        const orderStatus = orderStatusResp.status;
        let status = 'PENDING';
        let message = 'Payment status unknown';

        switch (orderStatus) {
          case 'CHARGED':
            status = 'SUCCESS';
            message = 'Payment completed successfully';
            break;
          case 'PENDING_VBV':
          case 'PENDING':
            status = 'PENDING';
            message = 'Payment is pending';
            break;
          case 'AUTHORIZATION_FAILED':
          case 'AUTHENTICATION_FAILED':
          case 'JUSPAY_DECLINED':
            status = 'FAILED';
            message = 'Payment failed';
            break;
          default:
            status = 'UNKNOWN';
            message = `Payment status: ${orderStatus}`;
        }

        console.log(`✅ HDFC Payment verified: ${orderIdToCheck} - Status: ${status}`);

        return res.json({
          success: status === 'SUCCESS',
          message: message,
          orderId: orderIdToCheck,
          paymentMode: 'HDFC',
          status: status,
          paymentStatus: orderStatus,
          details: orderStatusResp
        });
      } catch (error) {
        console.error('❌ HDFC Payment verification error:', error.message);
        return res.status(500).json({
          success: false,
          error: 'Failed to verify HDFC payment',
          details: error.message
        });
      }
    }

    // Razorpay verification
    if (PAYMENT_MODE === 'RAZORPAY' && razorpay_order_id && razorpay_payment_id && razorpay_signature) {
      if (!razorpay) {
        return res.status(400).json({
          success: false,
          error: 'Razorpay not configured'
        });
      }

      // Verify signature
      const sign = razorpay_order_id + '|' + razorpay_payment_id;
      const expectedSign = crypto
        .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
        .update(sign.toString())
        .digest('hex');

      if (razorpay_signature === expectedSign) {
        return res.json({
          success: true,
          message: 'Payment verified successfully',
          paymentId: razorpay_payment_id,
          orderId: razorpay_order_id,
          paymentMode: 'RAZORPAY'
        });
      } else {
        return res.status(400).json({
          success: false,
          error: 'Invalid payment signature'
        });
      }
    }

    // Bank Transfer verification (manual/pending approval)
    if (bank_order_id) {
      return res.json({
        success: true,
        message: 'Payment details received. Verification pending.',
        orderId: bank_order_id,
        transactionId: transaction_id,
        paymentMode: 'BANK_TRANSFER',
        status: 'PENDING_VERIFICATION',
        note: 'Your booking is confirmed. Payment will be verified by admin within 24 hours.'
      });
    } else {
      res.status(400).json({
        success: false,
        error: 'Invalid payment signature'
      });
    }
  } catch (error) {
    console.error('Error verifying payment:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/payments/:paymentId
 * Get payment details from Razorpay
 */
router.get('/:paymentId', async (req, res) => {
  try {
    const { paymentId } = req.params;
    const payment = await razorpay.payments.fetch(paymentId);

    res.json({
      success: true,
      payment
    });
  } catch (error) {
    console.error('Error fetching payment:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/payments/refund
 * Create refund for a payment
 */
router.post('/refund', [
  body('paymentId').notEmpty().withMessage('Payment ID is required'),
  body('amount').optional().isFloat({ min: 1 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }

    const { paymentId, amount, notes } = req.body;

    const refundOptions = {
      ...(amount && { amount: Math.round(amount * 100) }),
      ...(notes && { notes })
    };

    const refund = await razorpay.payments.refund(paymentId, refundOptions);

    res.json({
      success: true,
      refund
    });
  } catch (error) {
    console.error('Error creating refund:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/payments/status/:orderId
 * Get payment status by order ID (for HDFC)
 */
router.get('/status/:orderId', async (req, res) => {
  try {
    const { orderId } = req.params;

    if (PAYMENT_MODE === 'HDFC' && hdfcPaymentHandler) {
      const orderStatusResp = await hdfcPaymentHandler.orderStatus(orderId);
      
      return res.json({
        success: true,
        orderId: orderId,
        status: orderStatusResp.status,
        details: orderStatusResp
      });
    }

    return res.status(400).json({
      success: false,
      error: 'Payment mode not supported for status check'
    });
  } catch (error) {
    console.error('Error fetching payment status:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
