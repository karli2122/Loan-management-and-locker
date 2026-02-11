
# Quick Reference: kimi_v1 Fork

## What Was Fixed

### 🔴 CRITICAL (Fix Immediately)
1. **Password Security**: SHA-256 → bcrypt
2. **CORS**: Open wildcard → Restricted origins  
3. **Auto-Lock**: Broken async → Fixed scheduled tasks
4. **Device Admin**: Not activating → Fixed intent launch

### 🟡 HIGH (Fix Soon)
5. **Race Conditions**: Payment updates now atomic
6. **Rate Limiting**: Added brute force protection

### 🟢 MEDIUM (Fix When Convenient)
7. **Late Fees**: Fixed exponential accumulation
8. **Registration Codes**: Added collision detection
9. **Database**: Added performance indexes
10. **Error Messages**: No longer expose stack traces

## Files Changed

### Backend
- `backend/server.py` - Complete rewrite with security fixes
- `backend/requirements.txt` - Added bcrypt

### Frontend
- `frontend/app.config.js` - Removed hardcoded URLs, added env validation
- `frontend/modules/emi-device-admin/` - Fixed native module

## Deployment Commands

### Backend
```bash
cd backend
pip install -r requirements.txt
export ALLOWED_ORIGINS="https://yourdomain.com"
export ENVIRONMENT=production
python server.py
```

### Frontend
```bash
cd frontend
# Set environment
export EXPO_PUBLIC_BACKEND_URL="https://your-api.com/api"
export APP_MODE=client  # or admin

# Build
eas build --profile production --platform android
```

## Verification Commands

### Test bcrypt
curl -X POST /api/admin/register -d '{"username":"test","password":"password123"}'
# Check database - hash should start with $2b$

### Test CORS
curl -H "Origin: https://evil.com" /api/clients
# Should return CORS error in production

### Test Rate Limiting
for i in {1..10}; do curl /api/admin/login; done
# Should block after 5 attempts

### Test Device Admin
# On physical device, tap "Activate Device Admin"
# Should show system dialog (not crash)
