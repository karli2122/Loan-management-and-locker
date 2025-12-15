# Release Checklist

Use this checklist before each production release of the EMI Phone Lock System.

## Version: _____ | Date: _____ | Release Type: [ ] Major [ ] Minor [ ] Patch

---

## Pre-Build Checks

### Code & Configuration
- [ ] All tests pass
- [ ] Code reviewed and approved
- [ ] Merged to main/release branch
- [ ] Version number updated in `frontend/app.config.js`
  - [ ] Version string (e.g., "1.0.1")
  - [ ] Android versionCode incremented
- [ ] CHANGELOG.md updated with release notes
- [ ] Environment variables reviewed and documented

### Backend Verification
- [ ] Backend deployed to production
- [ ] Backend API is accessible and responsive
- [ ] Database migrations completed (if any)
- [ ] Backend version compatible with app version

### Asset Verification
- [ ] App icons reviewed (Admin & Client)
- [ ] Splash screens tested
- [ ] All images and assets optimized

---

## Build Process

### Admin App
- [ ] Set `APP_MODE=admin`
- [ ] Built using production profile (`admin-production`)
- [ ] Build completed without errors
- [ ] APK size is reasonable (check for bloat)
- [ ] APK file saved with version naming: `emi-admin-v1.0.0.apk`

### Client App
- [ ] Set `APP_MODE=client`
- [ ] Built using production profile (`client-production`)
- [ ] Build completed without errors
- [ ] APK size is reasonable
- [ ] APK file saved with version naming: `emi-client-v1.0.0.apk`

### Signing
- [ ] APKs signed with production keystore
- [ ] Keystore password documented (securely)
- [ ] Keystore backed up to secure location
- [ ] Signing verified using: `jarsigner -verify -verbose -certs your-app.apk`

---

## Testing

### Admin App Testing
- [ ] Install on clean test device
- [ ] Login works with valid credentials
- [ ] Can view client list
- [ ] Can register new client
- [ ] Location tracking works
- [ ] Lock device command works
- [ ] Unlock device command works
- [ ] Warning message sends successfully
- [ ] Dashboard displays correctly
- [ ] Logout works

### Client App Testing
- [ ] Install on factory-reset device
- [ ] Device Owner mode setup successful (if applicable)
- [ ] Registration flow works
- [ ] EMI status displays correctly
- [ ] Receives lock commands from admin
- [ ] Device locks properly when commanded
- [ ] Lock screen displays correctly
- [ ] Unlock works after admin command
- [ ] Location sharing works
- [ ] Warning notifications received
- [ ] Boot protection tested (survives restart)
- [ ] Uninstall protection verified (cannot uninstall)

### Cross-App Testing
- [ ] Admin can see client device status
- [ ] Real-time location updates work
- [ ] Lock/unlock is immediate (< 10 seconds)
- [ ] Warning messages appear on client device

### Device Compatibility
- [ ] Tested on Android 8.0 (minimum supported)
- [ ] Tested on Android 12+
- [ ] Tested on Android 14+ (latest)
- [ ] Tested on various screen sizes
- [ ] Tested on low-end device (minimum specs)
- [ ] Tested on high-end device

### Performance Testing
- [ ] App startup time acceptable (< 3 seconds)
- [ ] No memory leaks during extended use
- [ ] Battery usage is reasonable
- [ ] Network usage is reasonable
- [ ] No ANR (Application Not Responding) errors

---

## Security Review

### Admin App
- [ ] No hardcoded credentials
- [ ] API keys not exposed in APK
- [ ] HTTPS enforced for all API calls
- [ ] Session management secure
- [ ] No sensitive data in logs

### Client App
- [ ] Device Owner permissions justified
- [ ] No security vulnerabilities in lock mechanism
- [ ] Location data transmitted securely
- [ ] Cannot be bypassed via safe mode
- [ ] Tamper detection working
- [ ] Boot protection cannot be circumvented

### General
- [ ] Dependencies reviewed for vulnerabilities
- [ ] Security scan passed
- [ ] Privacy policy reviewed
- [ ] GDPR compliance checked (if applicable)

---

## Documentation

- [ ] User guide updated (if needed)
- [ ] API documentation current
- [ ] DEPLOYMENT.md reviewed
- [ ] DEVICE_OWNER_SETUP.md verified
- [ ] BUILD_INSTRUCTIONS.md accurate
- [ ] README.md updated
- [ ] Known issues documented
- [ ] Migration guide (if breaking changes)

---

## Distribution

### File Management
- [ ] APKs moved to release folder
- [ ] Files renamed with version: `emi-admin-v1.0.0.apk`, `emi-client-v1.0.0.apk`
- [ ] SHA256 checksums generated
- [ ] Release notes prepared

### Upload & Deploy
- [ ] APKs uploaded to distribution platform
- [ ] Download links tested
- [ ] Access permissions configured
- [ ] Old versions archived (not deleted)

### Communication
- [ ] Release notes sent to stakeholders
- [ ] Deployment team notified
- [ ] Field technicians informed
- [ ] Installation guide provided
- [ ] Support team briefed on changes

---

## Post-Deployment

### Monitoring
- [ ] Backend logs monitored for errors
- [ ] App crash reports checked
- [ ] User feedback collected
- [ ] Performance metrics reviewed

### Rollback Plan
- [ ] Previous version APKs available
- [ ] Rollback procedure documented
- [ ] Backend rollback plan ready (if needed)

### Follow-up
- [ ] Check for critical bugs (first 24-48 hours)
- [ ] Address urgent user reports
- [ ] Plan next release if needed

---

## Sign-off

**Build Engineer**: _________________ Date: _______

**QA Tester**: _________________ Date: _______

**Product Owner**: _________________ Date: _______

**Release Manager**: _________________ Date: _______

---

## Notes

Add any special notes, issues encountered, or deviations from standard process:

```
[Notes here]
```

---

## Post-Release Issues

Track any issues found after release:

| Issue | Severity | Status | Resolution |
|-------|----------|--------|------------|
|       |          |        |            |

