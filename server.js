const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Simple in-memory storage for MVP
let users = [];
let mailItems = [];

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    message: 'MailSwipe backend is running!'
  });
});

// Test endpoint
app.get('/', (req, res) => {
  res.json({
    message: '🎉 MailSwipe Backend is Live!',
    status: 'ready',
    endpoints: [
      'GET /health - Health check',
      'POST /api/user/register - Register user',
      'GET /api/mail/:userId/pending - Get pending mail',
      'POST /api/mail/:mailId/swipe - Process swipe action',
      'POST /webhook/email - USPS email webhook'
    ]
  });
});

// User registration
app.post('/api/user/register', async (req, res) => {
  try {
    const { email, deviceToken } = req.body;
    console.log(`👤 New user registration: ${email}`);
    
    // Check if user already exists
    const existingUser = users.find(u => u.email === email);
    if (existingUser) {
      return res.json({
        success: true,
        user: existingUser,
        message: 'User already exists'
      });
    }
    
    // Generate unique forwarding address
    const username = email.split('@')[0].toLowerCase().replace(/[^a-z0-9]/g, '');
    const randomId = Math.random().toString(36).substring(2, 8);
    const domain = process.env.RAILWAY_STATIC_URL || process.env.MAILSWIPE_DOMAIN || 'mailswipe.railway.app';
    const forwardingAddress = `${username}-${randomId}@${domain}`;
    
    const user = {
      id: users.length + 1,
      email,
      deviceToken,
      forwardingAddress,
      createdAt: new Date()
    };
    
    users.push(user);
    
    console.log(`✅ User created with forwarding address: ${forwardingAddress}`);
    
    res.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        forwardingAddress: user.forwardingAddress,
        setupInstructions: {
          step1: "Open Gmail and go to Settings ⚙️",
          step2: "Click 'Filters and Blocked Addresses'",
          step3: "Click 'Create a new filter'",
          step4: "In 'From' field, enter: noreply@usps.com",
          step5: "In 'Subject' field, enter: Informed Delivery",
          step6: `In 'Forward it to' field, enter: ${forwardingAddress}`,
          step7: "Check 'Also apply filter to matching conversations'",
          step8: "Click 'Create filter' and you're done! 🎉"
        }
      }
    });
    
  } catch (error) {
    console.error('User registration error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// Get pending mail for user
app.get('/api/mail/:userId/pending', (req, res) => {
  try {
    const { userId } = req.params;
    console.log(`📱 Getting pending mail for user ${userId}`);
    
    const userMailItems = mailItems.filter(item => 
      item.userId == userId && item.status === 'pending'
    );
    
    res.json({ 
      success: true, 
      mail: userMailItems,
      count: userMailItems.length
    });
  } catch (error) {
    console.error('Error fetching pending mail:', error);
    res.status(500).json({ error: 'Failed to fetch mail' });
  }
});

// Process swipe action
app.post('/api/mail/:mailId/swipe', (req, res) => {
  try {
    const { mailId } = req.params;
    const { action, userId } = req.body;
    
    console.log(`👆 User ${userId} swiped ${action} on mail ${mailId}`);
    
    const mailItem = mailItems.find(item => item.id == mailId);
    if (mailItem) {
      mailItem.status = action === 'block' ? 'blocked' : 'kept';
      mailItem.swipedAt = new Date();
      
      if (action === 'block') {
        mailItem.unsubscribeStatus = 'pending';
        console.log('🎯 Unsubscribe request queued (simulated)');
      }
    }
    
    res.json({ 
      success: true, 
      action,
      unsubscribeQueued: action === 'block'
    });
    
  } catch (error) {
    console.error('Swipe action error:', error);
    res.status(500).json({ error: 'Swipe action failed' });
  }
});

// USPS email webhook (simulated for testing)
app.post('/webhook/email', (req, res) => {
  console.log('📧 Email webhook triggered');
  
  try {
    // For testing, create some sample mail items
    const sampleMail = [
      {
        id: Date.now() + Math.random(),
        userId: 1, // First user
        senderCompany: 'Capital One',
        senderType: 'junk',
        confidence: 0.92,
        imageData: '/9j/4AAQSkZJRgABAQAAAQ...', // Sample base64
        extractedText: 'Capital One - Pre-approved credit card offer',
        status: 'pending',
        processedAt: new Date()
      },
      {
        id: Date.now() + Math.random() + 1,
        userId: 1,
        senderCompany: 'Netflix',
        senderType: 'important',
        confidence: 0.88,
        imageData: '/9j/4AAQSkZJRgABAQAAAQ...',
        extractedText: 'Netflix - Your monthly statement',
        status: 'pending',
        processedAt: new Date()
      }
    ];
    
    mailItems.push(...sampleMail);
    
    res.json({
      success: true,
      processed: sampleMail.length,
      message: 'Sample mail items created for testing'
    });
    
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

// User stats
app.get('/api/user/:userId/stats', (req, res) => {
  try {
    const { userId } = req.params;
    const userMail = mailItems.filter(item => item.userId == userId);
    
    const stats = {
      totalProcessed: userMail.length,
      totalBlocked: userMail.filter(item => item.status === 'blocked').length,
      totalKept: userMail.filter(item => item.status === 'kept').length,
      successfulUnsubscribes: userMail.filter(item => item.unsubscribeStatus === 'success').length,
    };
    
    stats.blockRate = stats.totalProcessed > 0 ? 
      Math.round((stats.totalBlocked / stats.totalProcessed) * 100) : 0;
    
    res.json({ success: true, stats });
  } catch (error) {
    console.error('Stats error:', error);
    res.status(500).json({ error: 'Failed to get stats' });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 MailSwipe MVP server running on port ${PORT}`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`📧 Ready to process mail!`);
});

module.exports = app;
