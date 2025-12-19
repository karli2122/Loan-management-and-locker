# Admin Mode Blinking Issue - Test Plan

## Overview
This document provides a comprehensive test plan to verify that the admin mode blinking issue has been fixed.

## Prerequisites
- Android device or emulator (Android 8.0+)
- Client app APK built from the current codebase
- Device Admin permissions NOT granted initially
- Ability to view Android logcat for console messages

## Test Cases

### Test Case 1: Throttling Mechanism
**Objective**: Verify the 30-second cooldown prevents repeated prompts

**Steps**:
1. Install the client app without Device Admin permissions
2. Launch the app
3. Observe the "Device Protection Required" dialog appears
4. Click "Later" to dismiss
5. Immediately press the home button
6. Within 30 seconds, return to the app
7. Repeat steps 5-6 multiple times within the 30-second window

**Expected Result**:
- The prompt should appear only once initially
- Subsequent returns to the app within 30 seconds should NOT show the prompt
- Check logcat for: "Admin prompt shown recently, skipping..."

**Actual Result**: ✅ PASS / ❌ FAIL

---

### Test Case 2: "Later" Button Functionality
**Objective**: Verify users can postpone admin setup without immediate re-prompting

**Steps**:
1. Launch the app without admin permissions
2. Observe the "Device Protection Required" dialog
3. Click the "Later" button

**Expected Result**:
- Dialog dismisses immediately
- App continues to function normally
- No immediate re-prompt of the dialog
- Check logcat for: "User postponed admin setup"

**Actual Result**: ✅ PASS / ❌ FAIL

---

### Test Case 3: "Enable Now" Button Functionality
**Objective**: Verify admin permission flow works correctly

**Steps**:
1. Launch the app without admin permissions
2. Observe the "Device Protection Required" dialog
3. Click "Enable Now"
4. Grant Device Admin permissions in Android settings
5. Return to the app

**Expected Result**:
- Android's Device Admin request screen appears
- After granting permissions, app continues normally
- No re-prompt of the dialog
- Check logcat for: "Device Admin confirmed active on attempt X, uninstall protection enabled"

**Actual Result**: ✅ PASS / ❌ FAIL

---

### Test Case 4: Concurrent Request Prevention
**Objective**: Verify multiple concurrent checks don't create multiple prompts

**Steps**:
1. Install the app without admin permissions
2. Launch the app
3. Observe the dialog appears
4. While dialog is still showing, background and foreground the app rapidly
5. Repeat step 4 several times

**Expected Result**:
- Only one dialog should be visible at a time
- No multiple overlapping dialogs
- Check logcat for: "Admin request already in progress, skipping..."

**Actual Result**: ✅ PASS / ❌ FAIL

---

### Test Case 5: Post-Throttle Re-Prompt
**Objective**: Verify prompt reappears after throttle period expires

**Steps**:
1. Launch the app without admin permissions
2. Observe the dialog and click "Later"
3. Background the app
4. Wait for 35 seconds (5 seconds beyond the 30-second throttle)
5. Return to the app (foreground)

**Expected Result**:
- The dialog should appear again since the throttle period has expired
- This ensures users are still prompted if they haven't enabled admin mode

**Actual Result**: ✅ PASS / ❌ FAIL

---

### Test Case 6: Bilingual Support
**Objective**: Verify dialog works in both English and Estonian

**Steps**:
1. Launch the app with device language set to English
2. Observe the dialog text: "Device Protection Required"
3. Close app and change device language to Estonian
4. Clear app data or wait for throttle period
5. Launch the app again
6. Observe the dialog text: "Seadme kaitse vajalik"

**Expected Result**:
- Dialog shows proper translations in both languages
- Button labels change accordingly ("Later" / "Hiljem", "Enable Now" / "Luba kohe")

**Actual Result**: ✅ PASS / ❌ FAIL

---

### Test Case 7: Already Active Admin
**Objective**: Verify no prompt when admin is already active

**Steps**:
1. Ensure Device Admin permissions are already granted
2. Launch the app
3. Background and foreground the app multiple times

**Expected Result**:
- No dialog appears at any time
- Check logcat for: "Device Admin active - uninstall protection enabled"
- `isAdminActive` state should be true

**Actual Result**: ✅ PASS / ❌ FAIL

---

## Logcat Commands

To view relevant logs during testing:

```bash
# View all app logs
adb logcat | grep -i "admin"

# View specific log messages
adb logcat | grep -E "(Admin prompt shown recently|Admin request already in progress|User postponed|Device Admin)"
```

## Success Criteria

All test cases should PASS for the fix to be considered successful. Specifically:

- ✅ No "blinking" or rapid re-appearing of dialogs
- ✅ Throttling prevents prompts within 30 seconds
- ✅ "Later" button provides user control
- ✅ No concurrent permission requests
- ✅ Proper re-prompting after throttle expires
- ✅ Bilingual support works correctly
- ✅ No prompts when admin already active

## Known Limitations

1. The 30-second throttle is hardcoded and not configurable
2. There's no way to manually reset the throttle timer without waiting
3. The prompt will reappear after every 30-second window if admin is not granted

## Related Documentation

- [Admin Mode Blinking Fix Documentation](./ADMIN_MODE_BLINKING_FIX.md)
- Implementation file: `frontend/app/client/home.tsx`
- Related commit: `3dbeca4`

## Test Results Summary

| Test Case | Status | Date Tested | Tester | Notes |
|-----------|--------|-------------|--------|-------|
| TC1: Throttling | ⬜ | - | - | - |
| TC2: Later Button | ⬜ | - | - | - |
| TC3: Enable Now | ⬜ | - | - | - |
| TC4: Concurrent Prevention | ⬜ | - | - | - |
| TC5: Post-Throttle Re-Prompt | ⬜ | - | - | - |
| TC6: Bilingual Support | ⬜ | - | - | - |
| TC7: Already Active Admin | ⬜ | - | - | - |

Legend: ⬜ Not Tested | ✅ Pass | ❌ Fail | ⚠️ Needs Review
