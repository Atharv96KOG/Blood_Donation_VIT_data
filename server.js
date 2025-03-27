require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const nodemailer = require('nodemailer');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// MongoDB Connection
mongoose.connect(process.env.MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
})
.then(() => console.log('Connected to MongoDB'))
.catch(err => console.error('MongoDB connection error:', err));

// Multer configuration for file uploads
const storage = multer.memoryStorage();
const upload = multer({
    storage: storage,
    limits: {
        fileSize: 5 * 1024 * 1024 // 5MB limit
    },
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Only image files are allowed!'));
        }
    }
});

// User Schema
const userSchema = new mongoose.Schema({
    fullName: String,
    email: { type: String, unique: true },
    password: String,
    phoneNumber: String,
    bloodGroup: String,
    profileImage: {
        data: Buffer,
        contentType: String
    },
    location: {
        type: { type: String, default: 'Point' },
        coordinates: [Number]
    }
});

const User = mongoose.model('User', userSchema);

// Email configuration
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

// Registration endpoint
app.post('/api/register', upload.single('profileImage'), async (req, res) => {
    try {
        console.log('Registration request received:', req.body);
        console.log('Uploaded file:', req.file);

        // Check if user already exists
        const existingUser = await User.findOne({ email: req.body.email });
        if (existingUser) {
            return res.status(400).json({ message: 'Email already registered' });
        }

        // Create new user
        const user = new User({
            fullName: req.body.fullName,
            email: req.body.email,
            password: await bcrypt.hash(req.body.password, 10),
            phoneNumber: req.body.phoneNumber,
            bloodGroup: req.body.bloodGroup,
            profileImage: req.file ? {
                data: req.file.buffer,
                contentType: req.file.mimetype
            } : null
        });

        // Handle location if provided
        if (req.body.location) {
            try {
                const location = JSON.parse(req.body.location);
                user.location = {
                    type: 'Point',
                    coordinates: [location.longitude, location.latitude]
                };
            } catch (err) {
                console.error('Error parsing location:', err);
            }
        }

        // Save user
        await user.save();

        // Generate JWT token
        const token = jwt.sign(
            { userId: user._id },
            process.env.JWT_SECRET,
            { expiresIn: '24h' }
        );

        // Send welcome email
        try {
            await transporter.sendMail({
                from: process.env.EMAIL_USER,
                to: user.email,
                subject: 'Welcome to Medical Portal',
                html: `
                    <h1>Welcome ${user.fullName}!</h1>
                    <p>Thank you for registering with our Medical Portal.</p>
                    <p>Your account has been created successfully.</p>
                `
            });
        } catch (emailErr) {
            console.error('Error sending welcome email:', emailErr);
        }

        // Return success response
        res.status(201).json({
            message: 'Registration successful',
            user: {
                id: user._id,
                fullName: user.fullName,
                email: user.email,
                phoneNumber: user.phoneNumber,
                bloodGroup: user.bloodGroup,
                profileImage: user.profileImage ? `data:${user.profileImage.contentType};base64,${user.profileImage.data.toString('base64')}` : null
            },
            token
        });

    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ message: 'Registration failed', error: error.message });
    }
});

// Profile endpoint
app.get('/api/profile', async (req, res) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        if (!token) {
            return res.status(401).json({ message: 'No token provided' });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findById(decoded.userId).select('-password');

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        res.json({
            id: user._id,
            fullName: user.fullName,
            email: user.email,
            phoneNumber: user.phoneNumber,
            bloodGroup: user.bloodGroup,
            profileImage: user.profileImage ? `data:${user.profileImage.contentType};base64,${user.profileImage.data.toString('base64')}` : null
        });
    } catch (error) {
        console.error('Profile error:', error);
        res.status(401).json({ message: 'Invalid token' });
    }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
