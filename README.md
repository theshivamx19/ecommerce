<!-- https://claude.ai/public/artifacts/f41baf0b-95d3-4d4e-af14-624c9a3e42e2 -->

# Authentication System - Quick Start Guide

## 🚀 Quick Setup (3 Steps)

### Step 1: Configure Environment Variables

Copy `.env.example` to `.env` and update the values:

```bash
cp .env.example .env
```

Edit `.env`:
```env
PORT=8000
NODE_ENV=development
MONGODB_URI=mongodb://localhost:27017/auth-db
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
JWT_EXPIRES_IN=7d
```

### Step 2: Start MongoDB

**Option A - Local MongoDB:**
```bash
mongod
```

**Option B - MongoDB Atlas (Cloud):**
1. Create account at [mongodb.com/cloud/atlas](https://www.mongodb.com/cloud/atlas)
2. Create a cluster
3. Get connection string
4. Update `MONGODB_URI` in `.env`

### Step 3: Start the Server

```bash
node index.js
```

You should see:
```
Server is running on port 8000
MongoDB Connected: localhost
```

---

## 📁 Project Structure

```
d:\Nodejs Project Setup\
├── config/
│   └── db.js                    # MongoDB connection
├── controllers/
│   └── authController.js        # Signup & Login handlers
├── middlewares/
│   ├── auth.js                  # JWT authentication middleware
│   └── errorHandler.js          # Global error handler
├── models/
│   └── User.js                  # User schema & methods
├── routes/
│   └── authRoutes.js            # Auth endpoints
├── services/
│   └── AuthService.js           # Business logic
├── utils/
│   └── AppError.js              # Custom error class
├── .env                         # Environment variables (create this)
├── .env.example                 # Environment template
├── index.js                     # Main application file
├── package.json                 # Dependencies
└── API_TESTING_GUIDE.md         # Detailed testing guide
```

---

## 🔌 API Endpoints

### 1. Register User
```bash
POST /api/auth/signup
Content-Type: application/json

{
  "name": "John Doe",
  "email": "john@example.com",
  "password": "password123"
}
```

### 2. Login User
```bash
POST /api/auth/login
Content-Type: application/json

{
  "email": "john@example.com",
  "password": "password123"
}
```

### 3. Access Protected Route
```bash
GET /api/protected
Authorization: Bearer <your-jwt-token>
```

---

## 🧪 Quick Test

```bash
# 1. Register a user
curl -X POST http://localhost:8000/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"name":"Test User","email":"test@example.com","password":"test123"}'

# 2. Login (copy the token from response)
curl -X POST http://localhost:8000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"test123"}'

# 3. Access protected route (replace <TOKEN> with actual token)
curl -X GET http://localhost:8000/api/protected \
  -H "Authorization: Bearer <TOKEN>"
```

---

## 🔐 Security Features

✅ **Bcrypt password hashing** (10 salt rounds)  
✅ **JWT token authentication** (configurable expiration)  
✅ **Email uniqueness validation**  
✅ **Input validation** (name, email, password)  
✅ **Password exclusion** from API responses  
✅ **Token expiration handling**  
✅ **Comprehensive error messages**

---

## 📖 Documentation

- **[API_TESTING_GUIDE.md](file:///d:/Nodejs%20Project%20Setup/API_TESTING_GUIDE.md)** - Complete API testing guide
- **[walkthrough.md](file:///C:/Users/pc/.gemini/antigravity/brain/8aecdaf1-e363-454a-a894-0b5d65df2343/walkthrough.md)** - Detailed implementation walkthrough

---

## 🎯 What's Included

| Component | File | Purpose |
|-----------|------|---------|
| Database Config | `config/db.js` | MongoDB connection |
| User Model | `models/User.js` | User schema with validation |
| Auth Service | `services/AuthService.js` | Business logic (signup, login, JWT) |
| Auth Controller | `controllers/authController.js` | Request handlers |
| Auth Routes | `routes/authRoutes.js` | Endpoint definitions |
| Auth Middleware | `middlewares/auth.js` | JWT verification |
| Error Handler | `middlewares/errorHandler.js` | Global error handling |
| Main App | `index.js` | Express app setup |

---

## 💡 Usage in Your Code

### Protect Any Route

```javascript
import { auth } from './middlewares/auth.js';

// Any route can be protected
app.get('/api/user/profile', auth, (req, res) => {
    // req.userId contains the authenticated user's ID
    res.json({ userId: req.userId });
});

app.post('/api/posts', auth, async (req, res) => {
    const post = await Post.create({
        ...req.body,
        author: req.userId  // Authenticated user
    });
    res.json({ post });
});
```

---

## 🐛 Troubleshooting

### Server won't start
- Check if MongoDB is running
- Verify `.env` file exists with correct values
- Ensure `MONGODB_URI` is valid

### "Email already registered" error
- Email must be unique
- Use a different email or login with existing account

### "Invalid token" error
- Token may be expired (default: 7 days)
- Login again to get a new token
- Ensure token is sent as `Bearer <token>`

### MongoDB connection error
- Start MongoDB: `mongod`
- Check connection string in `.env`
- For Atlas, ensure IP is whitelisted

---

## 🎉 You're All Set!

Your authentication system is ready to use. Start building your application with secure user authentication!

**Need help?** Check the detailed guides:
- [API Testing Guide](file:///d:/Nodejs%20Project%20Setup/API_TESTING_GUIDE.md)
- [Implementation Walkthrough](file:///C:/Users/pc/.gemini/antigravity/brain/8aecdaf1-e363-454a-a894-0b5d65df2343/walkthrough.md)
