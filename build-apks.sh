#!/bin/bash

# Set up Android environment
export ANDROID_HOME=/opt/android-sdk
export ANDROID_SDK_ROOT=/opt/android-sdk
export PATH=$PATH:$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:$ANDROID_HOME/build-tools/34.0.0

echo "========================================="
echo "Building APKs Locally"
echo "========================================="
echo ""

cd /app/frontend

# Build Admin APK
echo "Step 1/2: Building Admin APK..."
echo "This may take 15-20 minutes..."
echo ""
APP_MODE=admin npx eas-cli build --profile admin-preview --platform android --local --non-interactive

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Admin APK built successfully!"
    echo ""
else
    echo ""
    echo "❌ Admin APK build failed"
    exit 1
fi

# Build Client APK
echo "Step 2/2: Building Client APK (production)..."
echo "This may take 15-20 minutes..."
echo ""
APP_MODE=client npx eas-cli build --profile client-production --platform android --local --non-interactive

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Client APK built successfully!"
    echo ""
else
    echo ""
    echo "❌ Client APK build failed"
    exit 1
fi

echo "========================================="
echo "✅ Both APKs built successfully!"
echo "========================================="
echo ""
echo "APK files are located in:"
find /app/frontend -name "*.apk" -type f
