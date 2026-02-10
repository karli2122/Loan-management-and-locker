# API Quick Reference Guide

## 🔗 API Base URL

### Configuration Files
- **Environment**: `frontend/.env.local`
- **Config**: `frontend/app.config.js` (line 77)

### URLs

| Environment | URL |
|------------|-----|
| **Development** | `http://localhost:5000/api` |
| **Production (Default)** | `https://apkdebug.preview.emergentagent.com` |
| **Your Backend** | `https://your-backend-url.com/api` |

### Quick Setup

```bash
# 1. Copy template
cd frontend
cp .env.template .env.local

# 2. Edit .env.local
EXPO_PUBLIC_BACKEND_URL=https://your-api-url.com/api

# 3. Rebuild app (for native changes)
npm run android  # or npm run ios
```

---

## 🔑 Authentication

### Get Admin Token
```bash
curl -X POST https://your-api.com/api/admin/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"password"}'
```

### Use Token in Requests
```bash
curl https://your-api.com/api/clients?admin_token=YOUR_TOKEN
```

---

## 📱 Common Endpoints

### Admin

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/admin/register` | Register new admin |
| POST | `/api/admin/login` | Login admin |
| GET | `/api/admin/verify/{token}` | Verify token |
| GET | `/api/admin/list?admin_token=` | List all admins |

### Clients

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/clients?admin_token=` | Create client |
| GET | `/api/clients` | Get all clients |
| GET | `/api/clients/{id}` | Get single client |
| PUT | `/api/clients/{id}?admin_token=` | Update client |
| DELETE | `/api/clients/{id}?admin_token=` | Delete client |
| POST | `/api/clients/{id}/lock?admin_token=` | Lock device |
| POST | `/api/clients/{id}/unlock?admin_token=` | Unlock device |
| POST | `/api/clients/{id}/warning?admin_token=` | Send warning |

### Device

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/device/register` | Register device |
| GET | `/api/device/status/{client_id}` | Get device status |
| POST | `/api/device/location` | Update location |
| POST | `/api/device/push-token` | Update push token |

### Loans

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/loans/{id}/setup` | Setup loan |
| GET | `/api/loans/{id}/schedule` | Payment schedule |
| POST | `/api/loans/{id}/payments?admin_token=` | Record payment |
| GET | `/api/loans/{id}/payments` | Payment history |

### Reports

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/reports/collection` | Collection report |
| GET | `/api/reports/clients` | Client statistics |
| GET | `/api/reports/financial` | Financial report |
| GET | `/api/stats` | Quick stats |

### Utility

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | Health check |
| GET | `/api/calculator/compare` | Compare EMI methods |

---

## 🧪 Testing API

### Test with cURL

```bash
# Health check
curl https://your-api.com/api/health

# Get statistics
curl https://your-api.com/api/stats

# Login admin
curl -X POST https://your-api.com/api/admin/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"password"}'

# Get clients (with token)
curl "https://your-api.com/api/clients?admin_token=YOUR_TOKEN"
```

### Test from Frontend

```typescript
// In your React Native app
import Constants from 'expo-constants';

const API_URL = Constants.expoConfig?.extra?.backendUrl || 
  'https://apkdebug.preview.emergentagent.com';

// Example API call
const response = await fetch(`${API_URL}/api/stats`);
const data = await response.json();
```

---

## 🐛 Troubleshooting

### "Network request failed"
- Check if backend is running
- Verify API URL in `.env.local`
- Check device has internet connection
- For Android emulator, use `http://10.0.2.2:5000/api` instead of `localhost`

### "401 Unauthorized"
- Check admin_token is correct
- Token may have expired (re-login)
- Ensure token is in query parameter: `?admin_token=...`

### "404 Not Found"
- Verify endpoint path is correct
- Ensure `/api` prefix is included
- Check backend is running on correct port

### "CORS Error" (Web only)
- Backend CORS is configured for `*` (all origins)
- Should not affect React Native mobile apps

### Backend Not Running
```bash
cd backend
pip install -r requirements.txt
python server.py

# Should see: "Uvicorn running on http://0.0.0.0:5000"
```

---

## 📦 Environment Variables

### Frontend (.env.local)

```bash
# Required
EXPO_PUBLIC_BACKEND_URL=https://your-api.com/api

# Optional
EXPO_PUBLIC_API_TIMEOUT=30000
EXPO_PUBLIC_DEBUG=false
```

### Backend (.env)

```bash
# MongoDB
MONGO_URL=mongodb://localhost:27017
DB_NAME=emi_lock_db

# Optional
PORT=5000
```

---

## 🚀 Production Deployment

### 1. Backend
```bash
# Deploy backend to cloud
# Update URL
```

### 2. Update Frontend
```bash
cd frontend

# Set production URL
eas secret:create --scope project \
  --name EXPO_PUBLIC_BACKEND_URL \
  --value "https://your-production-api.com/api"

# Build apps
./build.sh
```

### 3. Test Connection
```bash
# Health check
curl https://your-production-api.com/api/health

# Should return: {"status":"healthy"}
```

---

## 📚 Full Documentation

For complete API documentation with request/response examples, see:
- **[API_DOCUMENTATION.md](./API_DOCUMENTATION.md)** - Complete API reference
- **[README.md](./README.md)** - Project overview
- **[DEPLOYMENT.md](./DEPLOYMENT.md)** - Deployment guide

---

## 💡 Tips

1. **Save your admin token** - Store it securely, don't commit to git
2. **Use health check** - Verify backend is running: `GET /api/health`
3. **Check stats endpoint** - Quick overview: `GET /api/stats`
4. **Enable logging** - Add `console.log` to debug API calls
5. **Test locally first** - Use `localhost` before deploying
6. **Use HTTPS in production** - Never use `http://` for production

---

## ⚡ Quick Commands

```bash
# Start backend
cd backend && python server.py

# Start frontend (dev)
cd frontend && npm start

# Test API
curl http://localhost:5000/api/health

# Build production apps
./build.sh
```

---

For issues or questions, check the troubleshooting section or open an issue on GitHub.
